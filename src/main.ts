import {
  Plugin,
  Notice,
  QueryController,
  TFile,
  TFolder,
  TAbstractFile,
  moment,
} from "obsidian";
import { KanbanView } from "./kanban-view";
import { sanitizeFilename } from "./constants";
import { CreateBoardModal, BoardConfig } from "./modals";
import { updateBaseFolderReferences } from "./folder-rename";
import { DateFormatter, resolveFolderTemplate } from "./date-tokens";
import {
  promoteAllCheckboxTasks,
  promoteCheckboxTask,
  promoteTaskExtension,
} from "./promote-task";
import { hasCheckboxTask, TASK_LINE_DETECT_RE } from "./task-line";
import { BaseBoardSettingTab } from "./settings";

/** Per-base column configuration */
export interface ColumnConfig {
  columns: string[];
}

export interface PluginData {
  columnConfigs: Record<string, ColumnConfig>;
  /** Daily-note style folder template for new task notes (e.g. `Tasks/YYYY/MM`). */
  taskFolder: string;
}

const DEFAULT_DATA: PluginData = {
  columnConfigs: {},
  taskFolder: "",
};

// ---------------------------------------------------------------------------
//  Plugin
// ---------------------------------------------------------------------------

export default class BaseBoardPlugin extends Plugin {
  data_: PluginData = DEFAULT_DATA;

  /** Folder rename mappings collected during one rename burst, pending flush. */
  private pendingFolderRenames: Array<{ oldPath: string; newPath: string }> =
    [];
  /** Debounce timer that flushes pendingFolderRenames once the burst settles. */
  private folderRenameFlushTimer: number | null = null;

  async onload() {
    await this.loadPluginData();

    this.registerBasesView("kanban", {
      name: "Kanban",
      icon: "lucide-kanban",
      factory: (controller: QueryController, containerEl: HTMLElement) =>
        new KanbanView(controller, containerEl, this),
      options: () => KanbanView.getViewOptions(),
    });

    this.addSettingTab(new BaseBoardSettingTab(this.app, this));

    // Icon at the end of checkbox lines → promote the task to a task note.
    this.registerEditorExtension(promoteTaskExtension(this));

    // -- Command: Create new board --------------------------------------------
    this.addCommand({
      id: "create-board",
      name: "Create new board",
      callback: () => {
        new CreateBoardModal(this.app, (config) => {
          void this.createBoard(config);
        }).open();
      },
    });

    // -- Command: Promote checkbox task on the current line ------------------
    this.addCommand({
      id: "promote-checkbox-task",
      name: "Promote checkbox task on current line",
      editorCheckCallback: (checking, editor, ctx) => {
        const file = ctx.file;
        if (!file) return false;
        const lineIndex = editor.getCursor().line;
        if (!TASK_LINE_DETECT_RE.test(editor.getLine(lineIndex))) return false;
        if (!checking) {
          void promoteCheckboxTask(this, editor, file, lineIndex);
        }
        return true;
      },
    });

    // -- Command: Promote every checkbox task in the note -------------------
    this.addCommand({
      id: "promote-all-checkbox-tasks",
      name: "Promote all checkbox tasks in note",
      editorCheckCallback: (checking, editor, ctx) => {
        const file = ctx.file;
        if (!file || !hasCheckboxTask(editor.getValue())) return false;
        if (!checking) {
          void promoteAllCheckboxTasks(this, editor, file);
        }
        return true;
      },
    });

    // -- Keep board filters in sync when their folder is renamed/moved --------
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.handleFolderRename(file, oldPath);
      }),
    );
  }

  onunload() {
    if (this.folderRenameFlushTimer !== null) {
      window.clearTimeout(this.folderRenameFlushTimer);
    }
  }

  // -- Folder rename sync -----------------------------------------------------

  /**
   * When a folder is renamed or moved, rewrite any .base board filter that
   * pointed at the old path so the board keeps working without a manual edit.
   *
   * To avoid race condition, burst of renaming events are collected, and once
   * a timeout is reached we flush and modify the path mappings in .base
   */
  private handleFolderRename(file: TAbstractFile, oldPath: string): void {
    const timeOut = 250;

    // Only folder moves change the folder a filter targets; ignore file renames.
    if (!(file instanceof TFolder)) return;

    const newPath = file.path;
    if (newPath === oldPath) return;

    this.pendingFolderRenames.push({ oldPath, newPath });

    // Debounce: reset the timer on every event so the flush runs only after
    // the rename burst has settled and Obsidian has finished moving files.
    if (this.folderRenameFlushTimer !== null) {
      window.clearTimeout(this.folderRenameFlushTimer);
    }
    this.folderRenameFlushTimer = window.setTimeout(() => {
      this.folderRenameFlushTimer = null;
      void this.flushFolderRenames();
    }, timeOut);
  }

  /** Apply all pending folder-rename mappings to every .base file. */
  private async flushFolderRenames(): Promise<void> {
    const renames = this.pendingFolderRenames;
    this.pendingFolderRenames = [];
    if (renames.length === 0) return;

    const baseFiles = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "base");

    for (const baseFile of baseFiles) {
      try {
        let content = await this.app.vault.read(baseFile);
        let changed = false;
        for (const { oldPath, newPath } of renames) {
          const updated = updateBaseFolderReferences(content, oldPath, newPath);
          if (updated !== null) {
            content = updated;
            changed = true;
          }
        }
        if (changed) {
          await this.app.vault.modify(baseFile, content);
        }
      } catch (err) {
        console.error(
          `Base Board: failed to update folder references in "${baseFile.path}"`,
          err,
        );
      }
    }
  }

  // -- Board scaffolding ------------------------------------------------------

  private async createBoard(config: BoardConfig): Promise<void> {
    const { name, folder, groupBy } = config;
    const vault = this.app.vault;

    // Sanitize folder path
    const safeFolder = folder.replace(/[\\:*?"<>|]/g, "");
    const tasksFolder = `${safeFolder}/Tasks`;

    // 1. Create folder structure
    if (!vault.getAbstractFileByPath(safeFolder)) {
      await vault.createFolder(safeFolder);
    }
    if (!vault.getAbstractFileByPath(tasksFolder)) {
      await vault.createFolder(tasksFolder);
    }

    // 2. Create the .base file
    const basePath = `${safeFolder}/${name}.base`;
    if (vault.getAbstractFileByPath(basePath)) {
      new Notice(`A board already exists at "${basePath}".`);
      return;
    }

    const baseContent = [
      `filters:`,
      `  and:`,
      `    - file.inFolder("${tasksFolder}")`,
      `views:`,
      `  - type: kanban`,
      `    name: ${name}`,
      `    groupBy:`,
      `      property: note.${groupBy}`,
      `      direction: DESC`,
      `    order:`,
      `      - file.name`,
      `      - note.${groupBy}`,
      ``,
    ].join("\n");

    await vault.create(basePath, baseContent);

    // 3. Create sample task files so the board isn't empty on first open
    const sampleTasks = [
      {
        title: "Plan project",
        value: "To Do",
        order: 0,
        tags: ["planning"],
      },
      {
        title: "Research and discovery",
        value: "To Do",
        order: 1,
        tags: ["research"],
      },
      {
        title: "Build first feature",
        value: "In Progress",
        order: 0,
        tags: ["feature"],
      },
      {
        title: "Fix onboarding bug",
        value: "In Progress",
        order: 1,
        tags: ["bug"],
      },
      {
        title: "Write documentation",
        value: "Done",
        order: 0,
        tags: ["docs"],
      },
    ];

    for (const task of sampleTasks) {
      const safeName = sanitizeFilename(task.title);
      const taskPath = `${tasksFolder}/${safeName}.md`;
      if (!vault.getAbstractFileByPath(taskPath)) {
        const tagsLine =
          task.tags.length > 0
            ? `tags:\n${task.tags.map((t) => `  - ${t}`).join("\n")}`
            : "";
        const content = [
          "---",
          `${groupBy}: ${task.value}`,
          `kanban_order: ${task.order}`,
          tagsLine,
          "---",
          "",
          `# ${task.title}`,
          "",
        ]
          .filter((line) => line !== "")
          .join("\n");
        await vault.create(taskPath, content);
      }
    }

    // 4. Open the board
    const file = vault.getAbstractFileByPath(basePath);
    if (file instanceof TFile) {
      void this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Board "${name}" created!`);
    }
  }

  // -- Task folder ----------------------------------------------------------

  /** Resolve a daily-note style folder template against the current date. */
  resolveFolderPath(template: string | undefined): string {
    const raw = template?.trim();
    if (!raw) return "";
    const now = (moment as unknown as () => DateFormatter)();
    return resolveFolderTemplate(raw, now);
  }

  /** The configured task folder for this moment, or "" when unset. */
  resolveTaskFolder(): string {
    return this.resolveFolderPath(this.data_.taskFolder);
  }

  // -- Column config helpers --------------------------------------------------

  getColumnConfig(baseId: string): ColumnConfig | null {
    return this.data_.columnConfigs[baseId] ?? null;
  }

  async saveColumnConfig(baseId: string, config: ColumnConfig): Promise<void> {
    this.data_.columnConfigs[baseId] = config;
    await this.savePluginData();
  }

  // -- Persistence ------------------------------------------------------------

  async loadPluginData(): Promise<void> {
    const saved = (await this.loadData()) as PluginData | null | undefined;
    this.data_ = Object.assign({}, DEFAULT_DATA, saved ?? {});
    if (!this.data_.columnConfigs) this.data_.columnConfigs = {};
    if (typeof this.data_.taskFolder !== "string") this.data_.taskFolder = "";
  }

  async savePluginData(): Promise<void> {
    await this.saveData(this.data_);
  }
}

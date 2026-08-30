import {
  RangeSetBuilder,
  StateEffect,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  debounce,
  type Debouncer,
  Editor,
  editorInfoField,
  type EventRef,
  Notice,
  setIcon,
  TFile,
} from "obsidian";
import type BaseBoardPlugin from "./main";
import { sanitizeFilename } from "./constants";
import {
  checkboxStatus,
  parsePromotedTaskLine,
  parseTaskLine,
  statusIcon,
  TASK_LINE_DETECT_RE,
  taskContentToTitle,
} from "./task-line";

interface PromoteOptions {
  /** Suppress the per-task success / "nothing to promote" notices (batch mode). */
  silent?: boolean;
}

/**
 * Promote the checkbox task on `lineIndex` to a standalone task note:
 *
 *  - creates `<task folder>/<title>.md` with `type: Task` and a `status` derived
 *    from the checkbox marker,
 *  - rewrites the source line as a plain bullet linking to the new note.
 *
 * Returns the created note, or null when the line isn't a promotable task or
 * creation failed.
 */
export async function promoteCheckboxTask(
  plugin: BaseBoardPlugin,
  editor: Editor,
  sourceFile: TFile,
  lineIndex: number,
  options: PromoteOptions = {},
): Promise<TFile | null> {
  const originalLine = editor.getLine(lineIndex);
  const parsed = parseTaskLine(originalLine);
  if (!parsed) return null;

  const title = taskContentToTitle(parsed.content);
  if (!title) {
    if (!options.silent) new Notice("Nothing to promote on this line.");
    return null;
  }

  const { app } = plugin;
  const folder = plugin.resolveTaskFolder();
  if (folder && !app.vault.getAbstractFileByPath(folder)) {
    try {
      await app.vault.createFolder(folder);
    } catch {
      // Tolerate a concurrent create.
    }
  }

  const stem = sanitizeFilename(title).trim() || "Task";
  const dir = folder ? `${folder}/` : "";
  let path = `${dir}${stem}.md`;
  for (let i = 1; app.vault.getAbstractFileByPath(path); i++) {
    path = `${dir}${stem} ${i}.md`;
  }

  let file: TFile;
  try {
    file = await app.vault.create(path, "");
  } catch (err) {
    new Notice(`Failed to create task note — ${String(err)}`);
    return null;
  }

  await app.fileManager.processFrontMatter(
    file,
    (fm: Record<string, unknown>) => {
      fm.type = "Task";
      fm.status = checkboxStatus(parsed.mark);
    },
  );

  // The document may have been edited during the awaits above; only rewrite the
  // line if it still holds the task we parsed.
  if (editor.getLine(lineIndex) !== originalLine) {
    await app.fileManager.trashFile(file).catch(() => undefined);
    if (!options.silent) {
      new Notice("The task line changed while the note was being created.");
    }
    return null;
  }

  const alias = title === file.basename ? undefined : title;
  const link = app.fileManager.generateMarkdownLink(
    file,
    sourceFile.path,
    undefined,
    alias,
  );
  editor.setLine(lineIndex, `${parsed.prefix}${link}`);

  if (!options.silent) {
    new Notice(`Promoted to task note "${file.basename}".`);
  }
  return file;
}

/** Promote every checkbox task line in the note; reports a single summary. */
export async function promoteAllCheckboxTasks(
  plugin: BaseBoardPlugin,
  editor: Editor,
  sourceFile: TFile,
): Promise<void> {
  // Promoting rewrites a line in place (line count is unchanged), so indices
  // stay valid for the whole pass.
  const lineCount = editor.lineCount();
  let promoted = 0;
  for (let i = 0; i < lineCount; i++) {
    if (!TASK_LINE_DETECT_RE.test(editor.getLine(i))) continue;
    const file = await promoteCheckboxTask(plugin, editor, sourceFile, i, {
      silent: true,
    });
    if (file) promoted++;
  }

  new Notice(
    promoted === 0
      ? "No checkbox tasks to promote."
      : `Promoted ${promoted} task${promoted === 1 ? "" : "s"} to notes.`,
  );
}

/** Small icon shown at the end of a checkbox line. */
class PromoteTaskWidget extends WidgetType {
  constructor(private readonly plugin: BaseBoardPlugin) {
    super();
  }

  // Every instance behaves identically; the decoration's position carries the
  // line identity, so CodeMirror can safely reuse the DOM node.
  eq(): boolean {
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = createSpan({ cls: "base-board-promote-task" });
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Promote to task note");
    setIcon(el, "lucide-file-plus");

    el.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      const info = view.state.field(editorInfoField, false);
      if (!info?.editor || !info.file) return;
      const pos = view.posAtDOM(el);
      const lineIndex = view.state.doc.lineAt(pos).number - 1;
      void promoteCheckboxTask(this.plugin, info.editor, info.file, lineIndex);
    });

    return el;
  }

  // Keep the editor from moving the cursor when the icon is clicked; the DOM
  // listener above still fires.
  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Icon reflecting the `status` frontmatter of the task note a promoted line
 * links to. Purely decorative — it mirrors the note, it doesn't edit it.
 */
class TaskStatusWidget extends WidgetType {
  constructor(
    private readonly icon: string,
    private readonly status: string,
  ) {
    super();
  }

  eq(other: TaskStatusWidget): boolean {
    return other.icon === this.icon && other.status === this.status;
  }

  toDOM(): HTMLElement {
    const el = createSpan({ cls: "base-board-task-status" });
    el.setAttribute("aria-label", `Status: ${this.status}`);
    el.dataset.status = this.status;
    setIcon(el, this.icon);
    return el;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** Marker effect used to force a decoration rebuild when frontmatter changes. */
const refreshTaskStatuses = StateEffect.define<null>();

/**
 * Resolve the status icon for a promoted-task line, or null when the link
 * doesn't point at a `type: Task` note with a non-empty `status`.
 */
function promotedLineStatus(
  plugin: BaseBoardPlugin,
  target: string,
  sourcePath: string,
): { icon: string; status: string } | null {
  const dest = plugin.app.metadataCache.getFirstLinkpathDest(
    target,
    sourcePath,
  );
  if (!(dest instanceof TFile)) return null;
  const fm: Record<string, unknown> | undefined =
    plugin.app.metadataCache.getFileCache(dest)?.frontmatter;
  if (!fm) return null;
  const type = fm.type;
  if (typeof type !== "string" || type.toLowerCase() !== "task") return null;
  const status = fm.status;
  if (typeof status !== "string" && typeof status !== "number") return null;
  const statusStr = String(status).trim();
  if (!statusStr) return null;
  return { icon: statusIcon(statusStr), status: statusStr };
}

function buildDecorations(
  view: EditorView,
  plugin: BaseBoardPlugin,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;
  const sourcePath =
    view.state.field(editorInfoField, false)?.file?.path ?? "";

  for (const { from, to } of view.visibleRanges) {
    const firstLine = doc.lineAt(from).number;
    const lastLine = doc.lineAt(Math.min(to, doc.length)).number;
    for (let n = firstLine; n <= lastLine; n++) {
      const line = doc.line(n);
      if (TASK_LINE_DETECT_RE.test(line.text)) {
        builder.add(
          line.to,
          line.to,
          Decoration.widget({
            widget: new PromoteTaskWidget(plugin),
            side: 1,
          }),
        );
        continue;
      }
      const promoted = parsePromotedTaskLine(line.text);
      if (!promoted) continue;
      const status = promotedLineStatus(plugin, promoted.target, sourcePath);
      if (!status) continue;
      const pos = line.from + promoted.prefix.length;
      builder.add(
        pos,
        pos,
        Decoration.widget({
          widget: new TaskStatusWidget(status.icon, status.status),
          side: -1,
        }),
      );
    }
  }

  return builder.finish();
}

/** Editor extension that renders the promote icon in Live Preview / Source mode. */
export function promoteTaskExtension(plugin: BaseBoardPlugin): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private readonly metaRef: EventRef;
      private readonly refresh: Debouncer<[], void>;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, plugin);
        this.refresh = debounce(
          () => view.dispatch({ effects: refreshTaskStatuses.of(null) }),
          200,
          true,
        );
        this.metaRef = plugin.app.metadataCache.on("changed", () =>
          this.refresh(),
        );
      }

      update(update: ViewUpdate): void {
        const forced = update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshTaskStatuses)),
        );
        if (update.docChanged || update.viewportChanged || forced) {
          this.decorations = buildDecorations(update.view, plugin);
        }
      }

      destroy(): void {
        this.refresh.cancel();
        plugin.app.metadataCache.offref(this.metaRef);
      }
    },
    { decorations: (value) => value.decorations },
  );
}

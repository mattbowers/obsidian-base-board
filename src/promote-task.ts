import { RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { editorInfoField, Notice, setIcon, TFile } from "obsidian";
import type BaseBoardPlugin from "./main";
import { sanitizeFilename } from "./constants";
import {
  checkboxStatus,
  parseTaskLine,
  TASK_LINE_DETECT_RE,
  taskContentToTitle,
} from "./task-line";

/**
 * Promote the checkbox task on `lineIndex` to a standalone task note:
 *
 *  - creates `<task folder>/<title>.md` with `type: Task` and a `status` derived
 *    from the checkbox marker,
 *  - rewrites the source line as a plain bullet linking to the new note.
 */
export async function promoteCheckboxTask(
  plugin: BaseBoardPlugin,
  view: EditorView,
  lineIndex: number,
): Promise<void> {
  const info = view.state.field(editorInfoField, false);
  const sourceFile = info?.file;
  const editor = info?.editor;
  if (!sourceFile || !editor) return;

  const originalLine = editor.getLine(lineIndex);
  const parsed = parseTaskLine(originalLine);
  if (!parsed) return;

  const title = taskContentToTitle(parsed.content);
  if (!title) {
    new Notice("Nothing to promote on this line.");
    return;
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
    return;
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
    new Notice("The task line changed while the note was being created.");
    return;
  }

  const alias = title === file.basename ? undefined : title;
  const link = app.fileManager.generateMarkdownLink(
    file,
    sourceFile.path,
    undefined,
    alias,
  );
  editor.setLine(lineIndex, `${parsed.prefix}${link}`);

  new Notice(`Promoted to task note "${file.basename}".`);
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
      const pos = view.posAtDOM(el);
      const lineIndex = view.state.doc.lineAt(pos).number - 1;
      void promoteCheckboxTask(this.plugin, view, lineIndex);
    });

    return el;
  }

  // Keep the editor from moving the cursor when the icon is clicked; the DOM
  // listener above still fires.
  ignoreEvent(): boolean {
    return true;
  }
}

function buildDecorations(
  view: EditorView,
  plugin: BaseBoardPlugin,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { doc } = view.state;

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
      }
    }
  }

  return builder.finish();
}

/** Editor extension that renders the promote icon in Live Preview / Source mode. */
export function promoteTaskExtension(plugin: BaseBoardPlugin): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, plugin);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, plugin);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );
}

/**
 * Pure helpers for recognising and rewriting Markdown checkbox task lines when
 * promoting them to standalone task notes. Kept free of Obsidian imports so it
 * can be unit tested.
 */

/**
 * A checkbox task line: optional indentation / blockquote markers, a list
 * bullet, a `[x]` marker and the trailing text.
 *
 * Group 1 (`prefix`) keeps the indentation, any `>` blockquote markers and the
 * list bullet with its trailing space, so it can be reused verbatim when the
 * line is rewritten as a plain bullet.
 */
const TASK_LINE_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[(.)\]\s+(.*)$/;

/** Lighter test used to decide whether to show the "promote" icon on a line. */
export const TASK_LINE_DETECT_RE =
  /^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[.\]\s+\S/;

const TASK_LINE_DETECT_RE_MULTILINE = new RegExp(
  TASK_LINE_DETECT_RE.source,
  "m",
);

/** Whether `text` (a whole document) contains at least one checkbox task line. */
export function hasCheckboxTask(text: string): boolean {
  return TASK_LINE_DETECT_RE_MULTILINE.test(text);
}

export interface ParsedTaskLine {
  /** Indentation + blockquote markers + list bullet + trailing space. */
  prefix: string;
  /** The single character between the brackets (`" "`, `x`, `-`, `>`, …). */
  mark: string;
  /** Everything after the checkbox. */
  content: string;
}

export function parseTaskLine(line: string): ParsedTaskLine | null {
  const match = TASK_LINE_RE.exec(line);
  if (!match) return null;
  return { prefix: match[1], mark: match[2], content: match[3] };
}

/**
 * Turn the text after a checkbox into a plain-text note title.
 *
 * Link syntax embedded in the task is a hazard: it would leak `[`, `]` and `|`
 * into the new note's filename and break the generated wikilink's alias (a `]]`
 * or `|` inside the alias terminates the link early). So `[[target|alias]]`,
 * `[[target#heading]]`, `[text](url)` and `![[embed]]` are reduced to their
 * display text, any stray `[` / `]` / `|` is dropped, and a trailing `^block-id`
 * is removed.
 */
export function taskContentToTitle(content: string): string {
  return content
    .replace(/\s*\^[A-Za-z0-9-]+\s*$/, "")
    .replace(
      /!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,
      (_match, target: string, alias?: string) =>
        alias ?? target.split("/").pop()?.replace(/\.md$/i, "") ?? target,
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[[\]|]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Map a checkbox marker character to a task-note `status` value.
 * `" "` → Todo, `x`/`X` → Done, `-` → Cancelled, `>` → Waiting, `/` → Doing;
 * anything else is treated as an open task (`Todo`).
 */
const CHECKBOX_STATUS: Record<string, string> = {
  " ": "Todo",
  x: "Done",
  X: "Done",
  "-": "Cancelled",
  ">": "Waiting",
  "/": "Doing",
};

export function checkboxStatus(mark: string): string {
  return CHECKBOX_STATUS[mark] ?? "Todo";
}

/**
 * A line this plugin produces when promoting a checkbox: a list bullet whose
 * entire content is a single wikilink (optionally with a `#heading` and/or
 * `|alias`). Embeds (`![[…]]`) are deliberately excluded.
 *
 * `prefix` is the indentation + blockquote markers + list bullet (so a caller
 * can offset a decoration past it); `target` is the link path with any subpath
 * and alias stripped.
 */
const PROMOTED_TASK_LINE_RE =
  /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]\s*$/;

export interface PromotedTaskLine {
  prefix: string;
  target: string;
}

export function parsePromotedTaskLine(line: string): PromotedTaskLine | null {
  const match = PROMOTED_TASK_LINE_RE.exec(line);
  if (!match) return null;
  const target = match[2].trim();
  return target ? { prefix: match[1], target } : null;
}

/**
 * Lucide icon name representing a task-note `status` frontmatter value, chosen
 * to line up with how the Minimal theme renders the equivalent checkbox marker
 * (`[ ]`, `[x]`, `[-]`, `[>]`, `[/]`, `[<]`, `[?]`, `[!]`, `[*]`). The match is
 * case-insensitive; an unrecognised status falls back to the empty checkbox.
 */
const STATUS_ICON: Record<string, string> = {
  // [ ] — open task
  todo: "lucide-square",
  "to do": "lucide-square",
  "to-do": "lucide-square",
  backlog: "lucide-square",
  // [x] — done
  done: "lucide-check-square",
  complete: "lucide-check-square",
  completed: "lucide-check-square",
  // [-] — cancelled (Minimal draws a minus, faint + struck through)
  cancelled: "lucide-minus-square",
  canceled: "lucide-minus-square",
  // [>] — forwarded / deferred (Minimal draws a paper plane, faint)
  waiting: "lucide-send",
  forwarded: "lucide-send",
  deferred: "lucide-send",
  rescheduled: "lucide-send",
  // [/] — in progress (Minimal draws a half-filled box)
  "in progress": "lucide-square-slash",
  "in-progress": "lucide-square-slash",
  doing: "lucide-square-slash",
  started: "lucide-square-slash",
  // [<] — scheduled
  scheduled: "lucide-calendar-clock",
  // [?] — question
  question: "lucide-help-circle",
  // [!] — important / blocked
  important: "lucide-alert-triangle",
  urgent: "lucide-alert-triangle",
  blocked: "lucide-alert-triangle",
  // [*] — starred
  star: "lucide-star",
  starred: "lucide-star",
};

export function statusIcon(status: string): string {
  return STATUS_ICON[status.trim().toLowerCase()] ?? "lucide-square";
}

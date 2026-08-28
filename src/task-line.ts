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

/** Turn the text after a checkbox into a note title (drops a trailing block id). */
export function taskContentToTitle(content: string): string {
  return content.replace(/\s*\^[A-Za-z0-9-]+\s*$/, "").trim();
}

/**
 * Map a checkbox marker character to a task-note `status` value.
 * `" "` → Todo, `x`/`X` → Done, `-` → Cancelled, `>` → Waiting; anything else
 * is treated as an open task (`Todo`).
 */
const CHECKBOX_STATUS: Record<string, string> = {
  " ": "Todo",
  x: "Done",
  X: "Done",
  "-": "Cancelled",
  ">": "Waiting",
};

export function checkboxStatus(mark: string): string {
  return CHECKBOX_STATUS[mark] ?? "Todo";
}

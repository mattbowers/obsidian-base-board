import { UNSAFE_FILENAME_CHARS } from "./constants";

/** Minimal shape we need from a `moment()` instance (see Obsidian's `moment` export). */
export interface DateFormatter {
  format(pattern?: string): string;
}

/**
 * Letters moment.js treats as formatting tokens (`YYYY`, `MM`, `DD`, `HH`, …).
 * Any other letter in a path segment marks it as a plain literal rather than a
 * date format.
 */
const MOMENT_TOKEN_LETTERS = new Set("MQDdEewWYygGAaHhkmsSzZXxNo".split(""));

/**
 * Decide whether a path segment should be run through `moment().format()` —
 * i.e. it looks like a daily-note style date format such as `YYYY`, `MM`,
 * `gggg-[W]ww` — or kept as a plain literal folder name.
 *
 * A segment is treated as a format when it contains a `[…]` escape, or when
 * every letter it contains is a moment token letter and at least one is present.
 */
function segmentIsDateFormat(segment: string): boolean {
  if (segment.includes("[")) return true;
  let sawTokenLetter = false;
  for (const ch of segment) {
    if (!/[a-z]/i.test(ch)) continue;
    if (!MOMENT_TOKEN_LETTERS.has(ch)) return false;
    sawTokenLetter = true;
  }
  return sawTokenLetter;
}

/**
 * Resolve a user-supplied folder path template into a concrete, vault-safe
 * folder path using daily-note style bare moment formats: a path segment made
 * only of moment token letters (`Tasks/YYYY/MM`) is formatted with `now` and
 * anything else is treated as a literal. Wrap literal text in `[…]` to force it
 * (`[Archive]/YYYY`).
 *
 * `/` separators are preserved so date formats nest into subfolders, and each
 * resulting segment is sanitised. Returns an empty string when nothing usable
 * remains (i.e. the vault root).
 */
export function resolveFolderTemplate(
  template: string,
  now: DateFormatter,
): string {
  return template
    .split("/")
    .map((segment) => {
      const resolved = segmentIsDateFormat(segment)
        ? now.format(segment)
        : segment;
      return resolved.replace(UNSAFE_FILENAME_CHARS, "").trim();
    })
    .filter((segment) => segment.length > 0)
    .join("/");
}

import { describe, expect, it } from "vitest";
import moment from "moment";
import { resolveFolderTemplate } from "../src/date-tokens";

// A fixed point in time so format output is deterministic: 2026-03-07 09:04.
const NOW = moment("2026-03-07T09:04:00");

describe("resolveFolderTemplate", () => {
  it("formats a segment made only of moment token letters", () => {
    expect(resolveFolderTemplate("YYYY/MM", NOW)).toBe("2026/03");
  });

  it("mixes literal folders with bare format segments", () => {
    expect(resolveFolderTemplate("Tasks/YYYY/MM", NOW)).toBe("Tasks/2026/03");
  });

  it("formats a single date-format segment", () => {
    expect(resolveFolderTemplate("Journal/YYYY-MM-DD", NOW)).toBe(
      "Journal/2026-03-07",
    );
  });

  it("keeps a plain-word segment as a literal folder name", () => {
    expect(resolveFolderTemplate("Tasks/Inbox", NOW)).toBe("Tasks/Inbox");
    expect(resolveFolderTemplate("Projects/Active", NOW)).toBe(
      "Projects/Active",
    );
  });

  it("honours [...] escaping to force a literal or mix within a segment", () => {
    expect(resolveFolderTemplate("[Archive]/YYYY", NOW)).toBe("Archive/2026");
    expect(resolveFolderTemplate("gggg-[W]ww", NOW)).toBe("2026-W10");
  });

  it("strips characters that are illegal in folder names, per segment", () => {
    expect(resolveFolderTemplate("Tasks/a*b?/c<d>", NOW)).toBe("Tasks/ab/cd");
  });

  it("drops empty segments and trims whitespace", () => {
    expect(resolveFolderTemplate("Tasks//  Inbox  /", NOW)).toBe("Tasks/Inbox");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(resolveFolderTemplate("  /  ", NOW)).toBe("");
    expect(resolveFolderTemplate("??", NOW)).toBe("");
  });
});

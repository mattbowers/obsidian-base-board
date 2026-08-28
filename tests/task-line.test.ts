import { describe, expect, it } from "vitest";
import {
  checkboxStatus,
  parseTaskLine,
  TASK_LINE_DETECT_RE,
  taskContentToTitle,
} from "../src/task-line";

describe("parseTaskLine", () => {
  it("splits a simple task line into prefix / mark / content", () => {
    expect(parseTaskLine("- [ ] Buy milk")).toEqual({
      prefix: "- ",
      mark: " ",
      content: "Buy milk",
    });
  });

  it("keeps indentation and the list marker in the prefix", () => {
    expect(parseTaskLine("    * [x] Nested done")).toEqual({
      prefix: "    * ",
      mark: "x",
      content: "Nested done",
    });
    expect(parseTaskLine("1. [>] Ordered")).toEqual({
      prefix: "1. ",
      mark: ">",
      content: "Ordered",
    });
  });

  it("keeps blockquote markers in the prefix", () => {
    expect(parseTaskLine("> - [-] Quoted cancelled")).toEqual({
      prefix: "> - ",
      mark: "-",
      content: "Quoted cancelled",
    });
  });

  it("returns null for non-task lines", () => {
    expect(parseTaskLine("- a plain bullet")).toBeNull();
    expect(parseTaskLine("Just text")).toBeNull();
    expect(parseTaskLine("- [] no marker char")).toBeNull();
  });
});

describe("checkboxStatus", () => {
  it("maps the documented markers", () => {
    expect(checkboxStatus(" ")).toBe("Todo");
    expect(checkboxStatus("x")).toBe("Done");
    expect(checkboxStatus("X")).toBe("Done");
    expect(checkboxStatus("-")).toBe("Cancelled");
    expect(checkboxStatus(">")).toBe("Waiting");
  });

  it("treats any other marker as an open task", () => {
    expect(checkboxStatus("/")).toBe("Todo");
    expect(checkboxStatus("?")).toBe("Todo");
  });
});

describe("taskContentToTitle", () => {
  it("trims whitespace", () => {
    expect(taskContentToTitle("  Buy milk  ")).toBe("Buy milk");
  });

  it("drops a trailing block id", () => {
    expect(taskContentToTitle("Buy milk ^abc123")).toBe("Buy milk");
  });
});

describe("TASK_LINE_DETECT_RE", () => {
  it("matches task lines with content", () => {
    expect(TASK_LINE_DETECT_RE.test("- [ ] something")).toBe(true);
    expect(TASK_LINE_DETECT_RE.test("  - [x] done")).toBe(true);
    expect(TASK_LINE_DETECT_RE.test("> 2. [>] waiting")).toBe(true);
  });

  it("does not match empty checkboxes or plain bullets", () => {
    expect(TASK_LINE_DETECT_RE.test("- [ ] ")).toBe(false);
    expect(TASK_LINE_DETECT_RE.test("- plain")).toBe(false);
  });
});

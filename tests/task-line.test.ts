import { describe, expect, it } from "vitest";
import {
  checkboxStatus,
  hasCheckboxTask,
  parsePromotedTaskLine,
  parseTaskLine,
  statusIcon,
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

  it("reduces an embedded wikilink to its display text", () => {
    expect(taskContentToTitle("[[Design doc]]")).toBe("Design doc");
    expect(taskContentToTitle("[[folder/Design doc]]")).toBe("Design doc");
    expect(taskContentToTitle("[[folder/Note|Alias]]")).toBe("Alias");
    expect(taskContentToTitle("[[Note#Heading]]")).toBe("Note");
    expect(taskContentToTitle("[[Note#Heading|Alias]]")).toBe("Alias");
    expect(taskContentToTitle("![[embed]]")).toBe("embed");
  });

  it("reduces an inline wikilink within a longer task", () => {
    expect(taskContentToTitle("Review [[Design doc]] with the team")).toBe(
      "Review Design doc with the team",
    );
  });

  it("reduces a markdown link to its text", () => {
    expect(taskContentToTitle("[Buy milk](https://example.com)")).toBe(
      "Buy milk",
    );
    expect(taskContentToTitle("See [the spec](spec.md) first")).toBe(
      "See the spec first",
    );
  });

  it("drops any stray brackets or pipes that would break the alias", () => {
    expect(taskContentToTitle("Weird | pipe [and] brackets")).toBe(
      "Weird pipe and brackets",
    );
  });

  it("is empty when the task is only an empty or broken link", () => {
    expect(taskContentToTitle("[[]]")).toBe("");
    expect(taskContentToTitle("[]()")).toBe("");
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

describe("parsePromotedTaskLine", () => {
  it("matches a bullet whose whole content is a wikilink", () => {
    expect(parsePromotedTaskLine("- [[Buy milk]]")).toEqual({
      prefix: "- ",
      target: "Buy milk",
    });
    expect(parsePromotedTaskLine("  * [[folder/Buy milk|Buy milk]]")).toEqual({
      prefix: "  * ",
      target: "folder/Buy milk",
    });
    expect(parsePromotedTaskLine("> 1. [[Note#Heading]]  ")).toEqual({
      prefix: "> 1. ",
      target: "Note",
    });
  });

  it("rejects checkboxes, embeds, prose and multi-link lines", () => {
    expect(parsePromotedTaskLine("- [ ] Buy milk")).toBeNull();
    expect(parsePromotedTaskLine("- ![[Buy milk]]")).toBeNull();
    expect(parsePromotedTaskLine("- see [[Buy milk]] later")).toBeNull();
    expect(parsePromotedTaskLine("- [[a]] [[b]]")).toBeNull();
    expect(parsePromotedTaskLine("[[Buy milk]]")).toBeNull();
    expect(parsePromotedTaskLine("- [[]]")).toBeNull();
  });
});

describe("statusIcon", () => {
  it("maps statuses to the Minimal-theme checkbox equivalents", () => {
    expect(statusIcon("Todo")).toBe("lucide-square");
    expect(statusIcon("Done")).toBe("lucide-check-square");
    expect(statusIcon("cancelled")).toBe("lucide-minus-square");
    expect(statusIcon("  Waiting ")).toBe("lucide-send");
    expect(statusIcon("In Progress")).toBe("lucide-square-slash");
  });

  it("falls back to the empty checkbox for anything else", () => {
    expect(statusIcon("Someday")).toBe("lucide-square");
  });
});

describe("hasCheckboxTask", () => {
  it("finds a task line anywhere in a document", () => {
    expect(hasCheckboxTask("# Note\n\nsome text\n- [ ] a task\nmore")).toBe(
      true,
    );
  });

  it("is false when there are no task lines", () => {
    expect(hasCheckboxTask("# Note\n\n- a bullet\n- [[a link]]\n")).toBe(false);
  });
});

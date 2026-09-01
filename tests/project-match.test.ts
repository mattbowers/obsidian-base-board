import { describe, expect, it } from "vitest";
import { inferProject, type ProjectCandidate } from "../src/project-match";

const projects: ProjectCandidate[] = [
  { name: "Website Redesign", path: "Projects/Website Redesign.md" },
  { name: "Q3 Launch", path: "Projects/Q3 Launch.md" },
];

describe("inferProject", () => {
  it("matches on the note basename with highest precedence", () => {
    const match = inferProject(projects, {
      noteBasename: "Website Redesign meeting notes",
      sectionHeading: "Q3 Launch",
      parentFolder: "Q3 Launch",
      ancestorFolders: ["Q3 Launch"],
    });
    expect(match?.name).toBe("Website Redesign");
  });

  it("falls back to the section heading when the basename doesn't match", () => {
    const match = inferProject(projects, {
      noteBasename: "Daily note",
      sectionHeading: "Notes for Q3 Launch",
      parentFolder: null,
      ancestorFolders: [],
    });
    expect(match?.name).toBe("Q3 Launch");
  });

  it("falls back to the parent folder when higher tiers don't match", () => {
    const match = inferProject(projects, {
      noteBasename: "Daily note",
      sectionHeading: "Random",
      parentFolder: "Website Redesign",
      ancestorFolders: ["Areas"],
    });
    expect(match?.name).toBe("Website Redesign");
  });

  it("falls back to any ancestor folder as the lowest-precedence tier", () => {
    const match = inferProject(projects, {
      noteBasename: "Daily note",
      sectionHeading: null,
      parentFolder: "Meetings",
      ancestorFolders: ["Q3 Launch", "Areas"],
    });
    expect(match?.name).toBe("Q3 Launch");
  });

  it("returns null when nothing matches", () => {
    const match = inferProject(projects, {
      noteBasename: "Daily note",
      sectionHeading: "Random",
      parentFolder: "Meetings",
      ancestorFolders: ["Areas"],
    });
    expect(match).toBeNull();
  });

  it("is case-insensitive", () => {
    const match = inferProject(projects, {
      noteBasename: "website redesign kickoff",
      sectionHeading: null,
      parentFolder: null,
      ancestorFolders: [],
    });
    expect(match?.name).toBe("Website Redesign");
  });

  it("prefers the most specific (longest) name within a tier", () => {
    const overlapping: ProjectCandidate[] = [
      { name: "Launch", path: "Projects/Launch.md" },
      { name: "Q3 Launch", path: "Projects/Q3 Launch.md" },
    ];
    const match = inferProject(overlapping, {
      noteBasename: "Q3 Launch retro",
      sectionHeading: null,
      parentFolder: null,
      ancestorFolders: [],
    });
    expect(match?.name).toBe("Q3 Launch");
  });

  it("never matches a higher-precedence tier against a lower-precedence clue", () => {
    const match = inferProject(projects, {
      noteBasename: "Daily note",
      sectionHeading: null,
      parentFolder: null,
      ancestorFolders: ["Website Redesign"],
    });
    expect(match?.name).toBe("Website Redesign");
  });
});

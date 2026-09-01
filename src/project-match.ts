/**
 * Pure logic for inferring which project a promoted task note belongs to,
 * based on context clues around the inline task it was promoted from. Kept
 * free of Obsidian imports so it can be unit tested; see promote-task.ts for
 * how the vault-facing context (headings, folder path, candidate project
 * notes) is gathered.
 */

export interface ProjectCandidate {
  /** The project note's display name — matched against context clues. */
  name: string;
  /** The project note's vault path, used only to break ties deterministically. */
  path: string;
}

export interface ProjectMatchContext {
  /** Basename (no extension) of the note containing the inline task. */
  noteBasename: string;
  /** Heading of the section containing the inline task, if any. */
  sectionHeading: string | null;
  /** Immediate parent folder name of the note containing the inline task. */
  parentFolder: string | null;
  /**
   * Ancestor folder names above the immediate parent, nearest first. (The
   * immediate parent itself is `parentFolder`, checked at higher precedence.)
   */
  ancestorFolders: string[];
}

/** Case-insensitive substring test: does `name` appear anywhere in `haystack`? */
function nameAppearsIn(name: string, haystack: string): boolean {
  return name.length > 0 && haystack.toLowerCase().includes(name.toLowerCase());
}

/**
 * Among candidates whose name appears in any of `haystacks`, return the one
 * with the longest name (most specific match); ties broken by path so the
 * result is deterministic.
 */
function bestMatch(
  candidates: ProjectCandidate[],
  haystacks: string[],
): ProjectCandidate | null {
  let best: ProjectCandidate | null = null;
  for (const candidate of candidates) {
    if (!haystacks.some((h) => nameAppearsIn(candidate.name, h))) continue;
    if (
      !best ||
      candidate.name.length > best.name.length ||
      (candidate.name.length === best.name.length && candidate.path < best.path)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Infer which project note a promoted task belongs to, in order of
 * precedence:
 *
 *  1. a project name appearing in the basename of the note containing the task
 *  2. a project name appearing in the heading of the section containing it
 *  3. a project name appearing in the note's parent folder
 *  4. a project name appearing in any ancestor folder above that
 *
 * The first tier with any match wins; returns null when nothing matches.
 */
export function inferProject(
  candidates: ProjectCandidate[],
  context: ProjectMatchContext,
): ProjectCandidate | null {
  const tiers: string[][] = [
    [context.noteBasename],
    context.sectionHeading ? [context.sectionHeading] : [],
    context.parentFolder ? [context.parentFolder] : [],
    context.ancestorFolders,
  ];

  for (const tier of tiers) {
    if (tier.length === 0) continue;
    const match = bestMatch(candidates, tier);
    if (match) return match;
  }
  return null;
}

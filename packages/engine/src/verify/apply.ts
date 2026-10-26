import { readFile, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import type { RepairProposal } from "@a11yforge/shared";

/**
 * Phase 5 safe repair application.
 *
 * Consumes the validated Phase 4 RepairProposal — the model never executes
 * anything and its text is never treated as instructions. For every edit
 * the engine verifies: the target exists inside the repair workspace, the
 * path stays inside the workspace, and `originalText` occurs EXACTLY once.
 * Ambiguous or missing anchors refuse the whole repair; nothing is
 * partially applied. Each application records before/after lengths and
 * emits a deterministic diff artifact.
 */

export class RepairApplyError extends Error {
  constructor(message: string) {
    super(`Repair application refused: ${message}`);
    this.name = "RepairApplyError";
  }
}

/** Repo-relative path confined to the workspace source root. */
export function resolveWorkspacePath(
  workspaceSourceRoot: string,
  filePath: string,
): string {
  if (
    filePath === "" ||
    filePath.startsWith("/") ||
    filePath.includes("\0") ||
    normalize(filePath).startsWith("..") ||
    normalize(filePath).includes(`..${sep}`)
  ) {
    throw new RepairApplyError(
      `edit path escapes the repair workspace: ${filePath}`,
    );
  }
  return join(workspaceSourceRoot, normalize(filePath));
}

/** Count non-overlapping occurrences of `needle` in `haystack`. */
export function countAnchorOccurrences(haystack: string, needle: string): number {
  if (needle === "") {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

export interface AppliedEdit {
  filePath: string;
  beforeChars: number;
  afterChars: number;
}

export interface ApplyRepairResult {
  appliedEdits: AppliedEdit[];
  /** Deterministic unified-style diff of every applied edit. */
  diffText: string;
}

/**
 * Build a small deterministic line diff between before/after contents.
 * Emits `--- a/<path>` / `+++ b/<path>` headers plus one hunk with 3
 * lines of context around the first-to-last changed line. Removed lines
 * carry `-`, added lines `+`, context lines a space.
 */
export function buildLineDiff(
  filePath: string,
  before: string,
  after: string,
): string {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let first = 0;
  while (
    first < beforeLines.length &&
    first < afterLines.length &&
    beforeLines[first] === afterLines[first]
  ) {
    first += 1;
  }
  let lastBefore = beforeLines.length - 1;
  let lastAfter = afterLines.length - 1;
  while (
    lastBefore >= first &&
    lastAfter >= first &&
    beforeLines[lastBefore] === afterLines[lastAfter]
  ) {
    lastBefore -= 1;
    lastAfter -= 1;
  }
  const context = 3;
  const start = Math.max(0, first - context);
  const endBefore = Math.min(beforeLines.length, lastBefore + 1 + context);
  const endAfter = Math.min(afterLines.length, lastAfter + 1 + context);
  const lines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${start + 1},${endBefore - start} +${start + 1},${endAfter - start} @@`,
  ];
  // Walk the two windows: shared prefix/suffix are context, the middle
  // is removed then added.
  const prefixLen = first - start;
  for (let i = start; i < start + prefixLen; i += 1) {
    lines.push(` ${beforeLines[i] ?? ""}`);
  }
  for (let i = first; i <= lastBefore; i += 1) {
    lines.push(`-${beforeLines[i] ?? ""}`);
  }
  for (let i = first; i <= lastAfter; i += 1) {
    lines.push(`+${afterLines[i] ?? ""}`);
  }
  const suffixStartBefore = lastBefore + 1;
  for (let i = suffixStartBefore; i < endBefore; i += 1) {
    lines.push(` ${beforeLines[i] ?? ""}`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Apply every edit of a validated proposal inside the workspace.
 * Throws RepairApplyError (applying nothing further) on the first
 * refusal: path escape, missing file, missing anchor, or ambiguous
 * anchor. Returns per-edit records plus the combined diff text.
 */
export async function applyRepairProposal(args: {
  workspaceSourceRoot: string;
  proposal: RepairProposal;
}): Promise<ApplyRepairResult> {
  const { workspaceSourceRoot, proposal } = args;
  // Verify ALL anchors before writing ANY file: a refused repair leaves
  // the workspace untouched.
  const pending: Array<{
    absolute: string;
    filePath: string;
    before: string;
    after: string;
  }> = [];
  for (const edit of proposal.edits) {
    const absolute = resolveWorkspacePath(
      workspaceSourceRoot,
      edit.filePath,
    );
    let before: string;
    try {
      before = await readFile(absolute, "utf8");
    } catch {
      throw new RepairApplyError(
        `target file does not exist in the repair workspace: ${edit.filePath}`,
      );
    }
    if (edit.originalText.trim() === "") {
      throw new RepairApplyError(
        `originalText is empty for ${edit.filePath}`,
      );
    }
    const occurrences = countAnchorOccurrences(before, edit.originalText);
    if (occurrences === 0) {
      throw new RepairApplyError(
        `anchor not found in ${edit.filePath} (missing anchor)`,
      );
    }
    if (occurrences > 1) {
      throw new RepairApplyError(
        `anchor occurs ${occurrences} times in ${edit.filePath} (ambiguous replacement refused)`,
      );
    }
    pending.push({
      absolute,
      filePath: edit.filePath,
      before,
      after: before.replace(edit.originalText, edit.replacementText),
    });
  }
  const appliedEdits: AppliedEdit[] = [];
  const diffs: string[] = [];
  for (const item of pending) {
    await writeFile(item.absolute, item.after, "utf8");
    appliedEdits.push({
      filePath: item.filePath,
      beforeChars: item.before.length,
      afterChars: item.after.length,
    });
    diffs.push(buildLineDiff(item.filePath, item.before, item.after));
  }
  return { appliedEdits, diffText: diffs.join("") };
}

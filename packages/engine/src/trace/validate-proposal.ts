import { existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import {
  MAX_REPAIR_EDITS,
  MAX_REPAIR_FILES,
  repairEvidenceIdsOf,
  repairSourceFilesOf,
  type RepairContextBundle,
  type RepairProposal,
} from "@a11yforge/shared";
import { TRACE_IGNORED_DIRS } from "./locator.js";

/**
 * Phase 4 local validation of a model-proposed repair.
 *
 * The proposal is checked against the EXACT context that was supplied to
 * the model — never against the wider repository. Any failure rejects the
 * proposal outright; there is no automatic second paid call.
 */
export class RepairProposalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepairProposalValidationError";
  }
}

/** Repo-relative path confined to the traced source root. */
function isConfinedPath(filePath: string): boolean {
  if (
    filePath === "" ||
    filePath.startsWith("/") ||
    filePath.includes("\0") ||
    normalize(filePath).startsWith("..") ||
    normalize(filePath).includes(`..${sep}`)
  ) {
    return false;
  }
  const segments = normalize(filePath).split(sep);
  return !segments.some(
    (segment) => TRACE_IGNORED_DIRS.has(segment) || segment === ".a11yforge",
  );
}

function fail(reason: string): never {
  throw new RepairProposalValidationError(
    `Repair proposal rejected: ${reason}`,
  );
}

export interface ValidateProposalArgs {
  proposal: RepairProposal;
  context: RepairContextBundle;
  /** Absolute traced source root the context paths are relative to. */
  sourceRoot: string;
}

/**
 * Validate a repair proposal against its supplied context.
 * Throws RepairProposalValidationError on the first violation.
 */
export function validateRepairProposal(args: ValidateProposalArgs): void {
  const { proposal, context, sourceRoot } = args;

  if (proposal.diagnosisId !== context.diagnosisId) {
    fail(
      `diagnosis mismatch (proposal targets ${proposal.diagnosisId}, context supplies ${context.diagnosisId})`,
    );
  }

  const knownEvidence = repairEvidenceIdsOf(context);
  const unknownEvidence = proposal.evidenceIds.filter(
    (id) => !knownEvidence.has(id),
  );
  if (unknownEvidence.length > 0) {
    fail(`unknown evidence IDs: ${unknownEvidence.join(", ")}`);
  }

  const suppliedFiles = repairSourceFilesOf(context);
  for (const target of proposal.targetFiles) {
    if (!suppliedFiles.has(target)) {
      fail(`target file was not supplied in source context: ${target}`);
    }
  }

  const editFiles = new Set(proposal.edits.map((edit) => edit.filePath));
  if (editFiles.size > MAX_REPAIR_FILES) {
    fail(
      `too many files touched (${editFiles.size} > ${MAX_REPAIR_FILES}): ${[...editFiles].join(", ")}`,
    );
  }
  if (proposal.edits.length > MAX_REPAIR_EDITS) {
    fail(
      `too many edits (${proposal.edits.length} > ${MAX_REPAIR_EDITS})`,
    );
  }

  const snippetContentByFile = new Map<string, string>();
  for (const snippet of context.snippets) {
    const prior = snippetContentByFile.get(snippet.filePath) ?? "";
    snippetContentByFile.set(
      snippet.filePath,
      prior === "" ? snippet.content : `${prior}\n${snippet.content}`,
    );
  }

  for (const edit of proposal.edits) {
    if (!suppliedFiles.has(edit.filePath)) {
      fail(`edit file was not supplied in source context: ${edit.filePath}`);
    }
    if (!isConfinedPath(edit.filePath)) {
      fail(`edit path escapes the traced source root: ${edit.filePath}`);
    }
    const absolute = join(sourceRoot, edit.filePath);
    let onDisk = false;
    try {
      onDisk = statSync(absolute).isFile();
    } catch {
      onDisk = existsSync(absolute);
    }
    if (!onDisk) {
      fail(`edit file does not exist under the source root: ${edit.filePath}`);
    }
    if (edit.originalText.trim() === "") {
      fail(`originalText is empty for ${edit.filePath}`);
    }
    const supplied = snippetContentByFile.get(edit.filePath) ?? "";
    if (!supplied.includes(edit.originalText)) {
      fail(
        `originalText for ${edit.filePath} does not appear in the supplied source context`,
      );
    }
    if (edit.replacementText === edit.originalText) {
      fail(`replacementText is identical to originalText for ${edit.filePath}`);
    }
  }
}

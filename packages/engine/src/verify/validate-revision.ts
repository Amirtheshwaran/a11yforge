import {
  type RepairContextBundle,
  type RepairProposal,
  type VerificationStage,
} from "@a11yforge/shared";
import {
  RepairProposalValidationError,
  validateRepairProposal,
} from "../trace/validate-proposal.js";

/**
 * Revision safety validation.
 *
 * Runs every existing proposal safeguard first (diagnosis match, evidence
 * grounding, supplied-files confinement, exact anchors, file/edit bounds),
 * then enforces revision-only rules: the revision must differ from the
 * rejected original, must not touch tests or compiler configuration, and
 * must not carry compiler-bypass escape hatches. Non-null assertions are
 * reported (not rejected): an `!` can be legitimate next to an explicit
 * `undefined` guard, and the typecheck gate — not a regex — is the
 * authority on whether the revision compiles.
 */

export class RepairRevisionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepairRevisionValidationError";
  }
}

/** Edit targets that are never acceptable in a revision. */
const FORBIDDEN_TARGET_PATTERNS: RegExp[] = [
  /\.test\.[a-z]+$/i,
  /\.spec\.[a-z]+$/i,
  /(^|\/)__tests__\//i,
  /(^|\/)tests?\//i,
  /tsconfig/i,
  /eslint/i,
  /package\.json$/i,
  /vite\.config\./i,
];

/** Compiler-bypass spellings rejected outright in replacement text. */
const FORBIDDEN_CODE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bas\s+any\b/, label: "`as any`" },
  { pattern: /:\s*any\b/, label: "`any` type annotation" },
  { pattern: /<\s*any\s*>/, label: "generic `any`" },
  { pattern: /@ts-ignore/, label: "`@ts-ignore`" },
  { pattern: /@ts-expect-error/, label: "`@ts-expect-error`" },
  { pattern: /@ts-nocheck/, label: "`@ts-nocheck`" },
  { pattern: /eslint-disable/, label: "`eslint-disable`" },
  { pattern: /noUncheckedIndexedAccess/, label: "noUncheckedIndexedAccess tampering" },
];

/** Heuristic matches for reported (not rejected) non-null assertions. */
export function findNonNullAssertions(text: string): string[] {
  const matches: string[] = [];
  for (const match of text.matchAll(
    /[A-Za-z0-9_)\]]\s*!\s*(\.|\[)/g,
  )) {
    matches.push(match[0]);
  }
  return matches;
}

function fail(reason: string): never {
  throw new RepairRevisionValidationError(
    `Repair revision rejected: ${reason}`,
  );
}

export interface ValidateRevisionArgs {
  revision: RepairProposal;
  original: RepairProposal;
  context: RepairContextBundle;
  sourceRoot: string;
  failedStage: VerificationStage;
}

export interface ValidateRevisionResult {
  /** Non-null-assertion-like spellings found (reported, not rejected). */
  nonNullAssertions: string[];
}

/**
 * Validate a revised proposal against its supplied context plus the
 * revision-only safety rules. Throws on the first violation.
 */
export function validateRepairRevision(
  args: ValidateRevisionArgs,
): ValidateRevisionResult {
  const { revision, original, context, sourceRoot, failedStage } = args;

  try {
    validateRepairProposal({ proposal: revision, context, sourceRoot });
  } catch (error) {
    if (error instanceof RepairProposalValidationError) {
      fail(error.message);
    }
    throw error;
  }

  if (revision.proposalId === original.proposalId) {
    fail("revision reuses the rejected proposalId (must differ)");
  }

  const originalSignatures = new Set(
    original.edits.map(
      (edit) => `${edit.filePath}\n${edit.originalText}\n${edit.replacementText}`,
    ),
  );
  const differs = revision.edits.some(
    (edit) =>
      !originalSignatures.has(
        `${edit.filePath}\n${edit.originalText}\n${edit.replacementText}`,
      ),
  );
  if (!differs) {
    fail(
      `revision is identical to the rejected proposal (failed stage: ${failedStage})`,
    );
  }

  for (const edit of revision.edits) {
    for (const pattern of FORBIDDEN_TARGET_PATTERNS) {
      if (pattern.test(edit.filePath)) {
        fail(
          `revision edits a forbidden target: ${edit.filePath} (no test/config edits)`,
        );
      }
    }
    for (const { pattern, label } of FORBIDDEN_CODE_PATTERNS) {
      if (pattern.test(edit.replacementText)) {
        fail(
          `revision contains a forbidden compiler bypass (${label}) in ${edit.filePath}`,
        );
      }
    }
  }

  return {
    nonNullAssertions: revision.edits.flatMap((edit) =>
      findNonNullAssertions(edit.replacementText),
    ),
  };
}

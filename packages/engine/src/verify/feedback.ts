import {
  RepairFailureFeedbackSchema,
  type RepairFailureFeedback,
  type RepairProposal,
  type VerificationStage,
} from "@a11yforge/shared";

/**
 * Verifier failure-feedback extraction.
 *
 * Turns a rejected Attempt-1 verification into the compact
 * `RepairFailureFeedback` bundle the single revision call receives.
 * Everything here is deterministic and bounded: stderr is tailed,
 * diagnostic codes are extracted by pattern, and only the affected
 * region plus the original edit travel forward.
 */

/** Characters of compiler output retained in feedback (bounded evidence). */
export const MAX_FEEDBACK_STDERR_CHARS = 2000;

/** Characters of the affected-region summary retained. */
export const MAX_FEEDBACK_REGION_CHARS = 1000;

/** Extract `TSxxxxx` diagnostic codes from compiler output. */
export function extractTsDiagnosticCodes(output: string): string[] {
  const codes = new Set<string>();
  for (const match of output.matchAll(/\bTS(\d{4,5})\b/g)) {
    codes.add(`TS${match[1] ?? ""}`);
  }
  return [...codes].sort();
}

/** Extract bounded `path(line,col)` locations from `tsc` output lines. */
export function extractAffectedRegion(output: string): string {
  const locations: string[] = [];
  for (const line of output.split("\n")) {
    const match = /([A-Za-z0-9_./\\-]+\.tsx?\(\d+,\d+\))/.exec(line);
    if (match?.[1] !== undefined && !locations.includes(match[1])) {
      locations.push(match[1]);
    }
  }
  return locations.join("; ").slice(0, MAX_FEEDBACK_REGION_CHARS);
}

/** Keep only the bounded tail of compiler output. */
export function boundCompilerOutput(output: string): string {
  return output.slice(-MAX_FEEDBACK_STDERR_CHARS);
}

export interface FailureStageInput {
  applySucceeded: boolean;
  typecheckPassed: boolean | null;
  buildPassed: boolean | null;
  resolvedTargetFailure: boolean | null;
  regressions: string[];
  newSeriousCritical: string[];
}

/**
 * Classify which deterministic stage rejected the repair. Typecheck takes
 * precedence: a compiler failure is reported as `typecheck` even when the
 * historical lifecycle label grouped it under regression.
 */
export function classifyFailureStage(
  input: FailureStageInput,
): VerificationStage {
  if (!input.applySucceeded) {
    return "apply";
  }
  if (input.typecheckPassed === false) {
    return "typecheck";
  }
  if (input.buildPassed === false) {
    return "build";
  }
  if (input.resolvedTargetFailure === false) {
    return "replay";
  }
  if (
    input.regressions.length > 0 ||
    input.newSeriousCritical.length > 0
  ) {
    return "regression";
  }
  return "replay";
}

export interface BuildFeedbackArgs {
  proposal: RepairProposal;
  repairId: string;
  previousLifecycleResult: string;
  failedStage: VerificationStage;
  compilerCommand: string;
  exitStatus: number | null;
  compilerOutput: string;
  diagnosisId: string;
  observedFailure: string;
  repairStrategy: string;
  suppliedSourceFiles: string[];
}

/** Assemble the validated feedback bundle for one rejected repair. */
export function buildFailureFeedback(
  args: BuildFeedbackArgs,
): RepairFailureFeedback {
  const stderrTail = boundCompilerOutput(args.compilerOutput);
  const firstEdit = args.proposal.edits[0];
  if (firstEdit === undefined) {
    throw new Error("buildFailureFeedback: proposal has no edits");
  }
  return RepairFailureFeedbackSchema.parse({
    proposalId: args.proposal.proposalId,
    repairId: args.repairId,
    previousLifecycleResult: args.previousLifecycleResult,
    failedStage: args.failedStage,
    compilerCommand: args.compilerCommand,
    exitStatus: args.exitStatus,
    stderrTail,
    diagnosticCodes: extractTsDiagnosticCodes(args.compilerOutput),
    affectedSourceRegion: extractAffectedRegion(args.compilerOutput),
    originalProposedEdit: firstEdit,
    originalDiagnosis: {
      diagnosisId: args.diagnosisId,
      observedFailure: args.observedFailure,
      repairStrategy: args.repairStrategy,
    },
    originalEvidenceIds: args.proposal.evidenceIds,
    originalRepairRationale: args.proposal.rationale,
    suppliedSourceFiles: args.suppliedSourceFiles,
  });
}

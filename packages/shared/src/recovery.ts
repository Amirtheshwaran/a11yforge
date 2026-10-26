import { z } from "zod";
import {
  RepairContextBundleSchema,
  RepairEditSchema,
  RepairProposalSchema,
} from "./repair.js";
import type { RepairLifecycleState } from "./verify.js";

/**
 * Verifier-driven bounded recovery (Attempt 2).
 *
 * When a first repair proposal passes behavioral replay but fails a later
 * deterministic gate (e.g. strict typecheck), the verifier — never the
 * model — decides whether one bounded revision is allowed. The failure
 * feedback bundle carries ONLY what a revision needs: the failed stage,
 * bounded compiler output, and the original proposal/context references.
 * Attempt 1 artifacts are never rewritten; the revision lives in its own
 * `repair-revision-*` artifacts with a fresh isolated workspace.
 */

/** Hard cap on repair attempts per issue: 1 proposal + 1 revision. */
export const MAX_REPAIR_ATTEMPTS = 2;

/** Which deterministic verification stage rejected the previous proposal. */
export const VerificationStageSchema = z.enum([
  "apply",
  "typecheck",
  "build",
  "test",
  "replay",
  "regression",
]);
export type VerificationStage = z.infer<typeof VerificationStageSchema>;

/** Original diagnosis facts restated for the revision call (no repo). */
export const RevisionDiagnosisSchema = z.object({
  diagnosisId: z.string().min(1),
  observedFailure: z.string().min(1).max(2000),
  repairStrategy: z.string().min(1).max(2000),
});
export type RevisionDiagnosis = z.infer<typeof RevisionDiagnosisSchema>;

/**
 * Compact verifier feedback for one rejected repair. Bounded by
 * construction: stderr is tailed, diagnostics are code lists, and only
 * the affected region plus the original edit travel — never the
 * repository, logs, node_modules, secrets, or screenshots.
 */
export const RepairFailureFeedbackSchema = z.object({
  /** Proposal that was rejected. */
  proposalId: z.string().min(1),
  /** Repair lifecycle id of the rejected attempt. */
  repairId: z.string().min(1),
  /** Terminal lifecycle result of the rejected attempt. */
  previousLifecycleResult: z.string().min(1),
  /** Deterministic stage that failed. */
  failedStage: VerificationStageSchema,
  /** Compiler/build command that produced the failure. */
  compilerCommand: z.string().min(1),
  /** Process exit status (null when the process never exited). */
  exitStatus: z.number().int().nullable(),
  /** Bounded tail of stderr/stdout explaining the failure. */
  stderrTail: z.string().max(2000),
  /** Exact compiler diagnostic codes observed (e.g. `TS18048`). */
  diagnosticCodes: z.array(z.string().min(1)),
  /** Affected source region (`path(line,col)` entries, bounded). */
  affectedSourceRegion: z.string().max(1000),
  /** The exact edit that was rejected. */
  originalProposedEdit: RepairEditSchema,
  /** Original diagnosis facts (strategy, not source). */
  originalDiagnosis: RevisionDiagnosisSchema,
  /** Evidence IDs cited by the original proposal. */
  originalEvidenceIds: z.array(z.string().min(1)).min(1),
  /** Why the original change was believed to work. */
  originalRepairRationale: z.string().min(1).max(2000),
  /** Repo-relative files already supplied as source context. */
  suppliedSourceFiles: z.array(z.string().min(1)).min(1),
});
export type RepairFailureFeedback = z.infer<
  typeof RepairFailureFeedbackSchema
>;

/**
 * Revision request: the ONLY input to the `accessibility-repair-revision`
 * model call. Carries the original context bundle (same source snippets,
 * same anchors available), the rejected proposal, and the verifier
 * feedback — nothing else.
 */
export const RepairRevisionRequestSchema = z.object({
  /** Stable id for this revision request (e.g. `rev-<suffix>`). */
  requestId: z.string().min(1),
  /** The exact source context the original proposal was built from. */
  context: RepairContextBundleSchema,
  /** The rejected first proposal (the revision must differ from it). */
  originalProposal: RepairProposalSchema,
  /** Verifier feedback explaining the rejection. */
  feedback: RepairFailureFeedbackSchema,
});
export type RepairRevisionRequest = z.infer<
  typeof RepairRevisionRequestSchema
>;

/** True once a revision artifact already exists — no Proposal #3 allowed. */
export function isRevisionExhausted(existingRevisionFiles: string[]): boolean {
  return existingRevisionFiles.some((name) =>
    name.startsWith("repair-revision-proposal"),
  );
}

/** Assert a lifecycle result string is a known terminal failure state. */
export function isTerminalFailureState(state: RepairLifecycleState): boolean {
  return (
    state === "BUILD_FAILED" ||
    state === "VERIFY_FAILED" ||
    state === "REGRESSION_FAILED" ||
    state === "TYPECHECK_FAILED" ||
    state === "REJECTED"
  );
}

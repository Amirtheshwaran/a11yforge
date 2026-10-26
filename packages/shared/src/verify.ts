import { z } from "zod";

/**
 * Phase 5 repair-lifecycle, verification, and critic schemas.
 *
 * Trust model (two levels):
 * 1. The deterministic verifier is authoritative: build result, replayed
 *    assertion, and axe regression comparison decide eligibility.
 * 2. The AI critic runs ONLY after deterministic success and only
 *    adjudicates an otherwise passing repair — it can never override a
 *    deterministic failure.
 */

/** Repair lifecycle states for one proposed repair. */
export const RepairLifecycleStateSchema = z.enum([
  "PROPOSED",
  "APPLYING",
  "APPLIED",
  "BUILD_FAILED",
  "TYPECHECK_FAILED",
  "VERIFY_FAILED",
  "REGRESSION_FAILED",
  "VERIFIED",
  "ACCEPTED",
  "REJECTED",
]);
export type RepairLifecycleState = z.infer<typeof RepairLifecycleStateSchema>;

/**
 * Allowed lifecycle transitions. Failure states (BUILD_FAILED,
 * TYPECHECK_FAILED, VERIFY_FAILED, REGRESSION_FAILED) and verdicts
 * (ACCEPTED, REJECTED) are terminal. VERIFIED is transient: deterministic
 * gate passed, critic verdict still pending. Historical artifacts that
 * recorded a compiler failure as REGRESSION_FAILED remain readable: the
 * enum only gains a state, never renames one.
 */
export const REPAIR_LIFECYCLE_TRANSITIONS: Record<
  RepairLifecycleState,
  RepairLifecycleState[]
> = {
  PROPOSED: ["APPLYING", "REJECTED"],
  APPLYING: ["APPLIED", "REJECTED"],
  APPLIED: [
    "BUILD_FAILED",
    "TYPECHECK_FAILED",
    "VERIFY_FAILED",
    "REGRESSION_FAILED",
    "VERIFIED",
  ],
  BUILD_FAILED: [],
  TYPECHECK_FAILED: [],
  VERIFY_FAILED: [],
  REGRESSION_FAILED: [],
  VERIFIED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [],
  REJECTED: [],
};

/** True when no further transition is allowed from `state`. */
export function isRepairLifecycleTerminal(
  state: RepairLifecycleState,
): boolean {
  return REPAIR_LIFECYCLE_TRANSITIONS[state].length === 0;
}

/** One recorded lifecycle transition. */
export const RepairLifecycleTransitionSchema = z.object({
  from: RepairLifecycleStateSchema,
  to: RepairLifecycleStateSchema,
  at: z.string().min(1),
  reason: z.string().min(1).max(1000),
});
export type RepairLifecycleTransition = z.infer<
  typeof RepairLifecycleTransitionSchema
>;

/** Persisted lifecycle record for one repair. */
export const RepairLifecycleSchema = z.object({
  repairId: z.string().min(1),
  proposalId: z.string().min(1),
  state: RepairLifecycleStateSchema,
  transitions: z.array(RepairLifecycleTransitionSchema),
});
export type RepairLifecycle = z.infer<typeof RepairLifecycleSchema>;

/** Before/after assertion snapshot used by the deterministic comparison. */
export const AssertionSnapshotSchema = z.object({
  passed: z.boolean(),
  actualFocus: z.string().min(1),
});
export type AssertionSnapshot = z.infer<typeof AssertionSnapshotSchema>;

/**
 * Deterministic verification result for one applied repair.
 *
 * Every field is measured, never inferred: build outcome from the real
 * build, assertions from the replayed scenario runs, axe rule sets from
 * the two scans. `decisionBasis` is a human-readable sentence summarizing
 * which gate inputs decided eligibility.
 */
export const RepairVerificationResultSchema = z.object({
  repairId: z.string().min(1),
  proposalId: z.string().min(1),
  buildPassed: z.boolean(),
  buildCommand: z.string().min(1),
  buildExitCode: z.number().int().nullable(),
  buildDurationMs: z.number().int().nonnegative(),
  originalAssertion: AssertionSnapshotSchema,
  repairedAssertion: AssertionSnapshotSchema,
  scenarioPassed: z.boolean(),
  baselineAxeRules: z.array(z.string().min(1)),
  repairedAxeRules: z.array(z.string().min(1)),
  newAxeViolations: z.array(z.string().min(1)),
  removedBaselineRules: z.array(z.string().min(1)),
  newSeriousCritical: z.array(z.string().min(1)),
  resolvedTargetFailure: z.boolean(),
  regressions: z.array(z.string()),
  diffArtifact: z.string().min(1),
  evidenceArtifacts: z.array(z.string().min(1)),
  decisionBasis: z.string().min(1),
});
export type RepairVerificationResult = z.infer<
  typeof RepairVerificationResultSchema
>;

/**
 * Bounded input to the repair critic. Only measured artifacts are
 * supplied: diagnosis facts, the proposal, the deterministic diff, build
 * and replay outcomes, and the axe comparison. Never the repository.
 */
export const CriticInputSchema = z.object({
  repairId: z.string().min(1),
  proposalId: z.string().min(1),
  diagnosisId: z.string().min(1),
  observedFailure: z.string().min(1).max(2000),
  proposalSummary: z.string().min(1).max(2000),
  proposalRationale: z.string().min(1).max(2000),
  evidenceIds: z.array(z.string().min(1)).min(1),
  diff: z.string().min(1).max(16000),
  buildCommand: z.string().min(1),
  buildExitCode: z.number().int().nullable(),
  buildPassed: z.boolean(),
  before: AssertionSnapshotSchema,
  after: AssertionSnapshotSchema,
  baselineAxeRules: z.array(z.string().min(1)),
  repairedAxeRules: z.array(z.string().min(1)),
  newAxeViolations: z.array(z.string().min(1)),
  regressions: z.array(z.string()),
  /** Rejected first-attempt summary (revision reviews only). */
  previousProposalSummary: z.string().min(1).max(2000).optional(),
  /** Why the first attempt was rejected (revision reviews only). */
  previousRejectionReason: z.string().min(1).max(2000).optional(),
});
export type CriticInput = z.infer<typeof CriticInputSchema>;

/**
 * Structured critic verdict. ACCEPT keeps a deterministically passing
 * repair; REJECT sends it back. The critic cannot override deterministic
 * failure — the engine never calls it unless the gate already passed.
 */
export const CriticDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "REJECT"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(1000),
  evidenceIds: z.array(z.string().min(1)).min(1),
  verificationConcerns: z.array(z.string()),
  remainingRisks: z.array(z.string()),
});
export type CriticDecision = z.infer<typeof CriticDecisionSchema>;

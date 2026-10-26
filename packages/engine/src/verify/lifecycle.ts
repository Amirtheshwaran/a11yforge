import {
  REPAIR_LIFECYCLE_TRANSITIONS,
  RepairLifecycleSchema,
  type RepairLifecycle,
  type RepairLifecycleState,
} from "@a11yforge/shared";

/**
 * Phase 5 repair lifecycle tracker.
 *
 * A proposed repair moves PROPOSED → APPLYING → APPLIED, then to exactly
 * one of BUILD_FAILED / TYPECHECK_FAILED / VERIFY_FAILED /
 * REGRESSION_FAILED / VERIFIED.
 * VERIFIED is transient (deterministic gate passed, critic pending) and
 * resolves to ACCEPTED or REJECTED. An apply-time safety refusal goes
 * straight to REJECTED. Illegal transitions throw — the lifecycle is a
 * record of what happened, never a guess.
 */

export class IllegalLifecycleTransitionError extends Error {
  constructor(from: RepairLifecycleState, to: RepairLifecycleState) {
    super(`Illegal repair lifecycle transition: ${from} → ${to}`);
    this.name = "IllegalLifecycleTransitionError";
  }
}

/** Start a lifecycle for a validated proposal. */
export function newRepairLifecycle(args: {
  repairId: string;
  proposalId: string;
}): RepairLifecycle {
  return RepairLifecycleSchema.parse({
    repairId: args.repairId,
    proposalId: args.proposalId,
    state: "PROPOSED",
    transitions: [],
  });
}

/** Move a lifecycle forward, recording the transition with a reason. */
export function transitionRepairLifecycle(
  lifecycle: RepairLifecycle,
  to: RepairLifecycleState,
  reason: string,
): RepairLifecycle {
  const allowed = REPAIR_LIFECYCLE_TRANSITIONS[lifecycle.state];
  if (!allowed.includes(to)) {
    throw new IllegalLifecycleTransitionError(lifecycle.state, to);
  }
  return RepairLifecycleSchema.parse({
    ...lifecycle,
    state: to,
    transitions: [
      ...lifecycle.transitions,
      {
        from: lifecycle.state,
        to,
        at: new Date().toISOString(),
        reason: reason.slice(0, 1000),
      },
    ],
  });
}

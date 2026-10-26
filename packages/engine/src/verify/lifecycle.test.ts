import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRepairLifecycleTerminal } from "@a11yforge/shared";
import {
  IllegalLifecycleTransitionError,
  newRepairLifecycle,
  transitionRepairLifecycle,
} from "./lifecycle.js";

describe("repair lifecycle", () => {
  it("starts PROPOSED with no transitions", () => {
    const lifecycle = newRepairLifecycle({
      repairId: "repair-1",
      proposalId: "prop-1",
    });
    assert.equal(lifecycle.state, "PROPOSED");
    assert.deepEqual(lifecycle.transitions, []);
    assert.ok(!isRepairLifecycleTerminal("PROPOSED"));
  });

  it("walks the happy path PROPOSED → APPLYING → APPLIED → VERIFIED → ACCEPTED", () => {
    let lifecycle = newRepairLifecycle({
      repairId: "repair-1",
      proposalId: "prop-1",
    });
    for (const to of ["APPLYING", "APPLIED", "VERIFIED", "ACCEPTED"] as const) {
      lifecycle = transitionRepairLifecycle(lifecycle, to, `reason for ${to}`);
    }
    assert.equal(lifecycle.state, "ACCEPTED");
    assert.equal(lifecycle.transitions.length, 4);
    assert.ok(isRepairLifecycleTerminal("ACCEPTED"));
  });

  it("rejects illegal transitions", () => {
    const lifecycle = newRepairLifecycle({
      repairId: "repair-1",
      proposalId: "prop-1",
    });
    assert.throws(
      () => transitionRepairLifecycle(lifecycle, "ACCEPTED", "skip"),
      (error: unknown) => error instanceof IllegalLifecycleTransitionError,
    );
    assert.throws(
      () => transitionRepairLifecycle(lifecycle, "VERIFIED", "skip"),
      /Illegal repair lifecycle transition: PROPOSED → VERIFIED/,
    );
  });

  it("treats every failure state as terminal", () => {
    for (const state of [
      "BUILD_FAILED",
      "VERIFY_FAILED",
      "REGRESSION_FAILED",
      "ACCEPTED",
      "REJECTED",
    ] as const) {
      assert.ok(isRepairLifecycleTerminal(state), state);
      // From a terminal state, no transition is possible — including
      // staying in place or moving to another terminal state.
      const terminal = { ...newRepairLifecycle({
        repairId: "repair-1",
        proposalId: "prop-1",
      }), state };
      for (const next of ["APPLYING", "ACCEPTED", "REJECTED", state] as const) {
        assert.throws(
          () => transitionRepairLifecycle(terminal, next, "skip"),
          IllegalLifecycleTransitionError,
          `${state} → ${next}`,
        );
      }
    }
  });

  it("allows APPLYING → REJECTED on safety refusal and VERIFIED → REJECTED on critic reject", () => {
    let lifecycle = newRepairLifecycle({
      repairId: "repair-1",
      proposalId: "prop-1",
    });
    lifecycle = transitionRepairLifecycle(lifecycle, "APPLYING", "start");
    lifecycle = transitionRepairLifecycle(
      lifecycle,
      "REJECTED",
      "anchor missing",
    );
    assert.equal(lifecycle.state, "REJECTED");

    let second = newRepairLifecycle({
      repairId: "repair-2",
      proposalId: "prop-2",
    });
    for (const to of ["APPLYING", "APPLIED", "VERIFIED"] as const) {
      second = transitionRepairLifecycle(second, to, `reason for ${to}`);
    }
    second = transitionRepairLifecycle(second, "REJECTED", "critic reject");
    assert.equal(second.state, "REJECTED");
  });
});

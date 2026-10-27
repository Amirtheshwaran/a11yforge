import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STAGE_ORDER, stageState } from "./lib/exploration-stages.ts";

/**
 * Exploration stage mapping: human stages derive from the real backend
 * event stream plus the authoritative finished run — never from timers.
 * Events here are minimal `{ stage }` frames; the production mapper only
 * reads `stage`, and the shared Zod schemas validate full frames at the
 * API boundary (lib/api.ts).
 */

function frame(stage) {
  return { stage };
}

describe("exploration stage mapping", () => {
  it("all stages pending before any event", () => {
    for (const stage of STAGE_ORDER) {
      assert.equal(stageState(stage, [], null), "pending");
    }
  });

  it("observed stage and frontier show as running", () => {
    // Frontier optimism is verbatim production behavior: the first stage
    // without events yet reads as running once earlier events exist.
    const events = [frame("opening")];
    assert.equal(stageState("opening", events, null), "running");
    assert.equal(stageState("exploring", events, null), "running");
    assert.equal(stageState("done", events, null), "pending");
  });

  it("a later stage marks earlier stages done", () => {
    const events = [frame("opening"), frame("exploring"), frame("scanning")];
    assert.equal(stageState("opening", events, null), "done");
    assert.equal(stageState("exploring", events, null), "done");
    assert.equal(stageState("scanning", events, null), "running");
    assert.equal(stageState("interacting", events, null), "running");
    assert.equal(stageState("reviewing", events, null), "pending");
  });

  it("done event completes the run progression", () => {
    const events = [frame("opening"), frame("done")];
    assert.equal(stageState("opening", events, null), "done");
    assert.equal(stageState("done", events, null), "running");
  });

  it("persisted run marks every stage done regardless of events", () => {
    const run = { state: "COMPLETED" };
    for (const stage of STAGE_ORDER) {
      assert.equal(stageState(stage, [], run), "done");
    }
  });

  it("cancelled or failed runs still read as done (authoritative state)", () => {
    for (const state of ["CANCELLED", "FAILED"]) {
      for (const stage of STAGE_ORDER) {
        assert.equal(stageState(stage, [frame("opening")], { state }), "done");
      }
    }
  });
});

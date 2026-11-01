import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STAGE_ORDER, stageState } from "./lib/exploration-stages.ts";
const frame = (stage, status = "running") => ({ stage, status });
describe("exploration stage mapping", () => {
  it("keeps unobserved stages pending", () => {
    for (const stage of STAGE_ORDER) assert.equal(stageState(stage, [], null), "pending");
    assert.equal(stageState("opening", [frame("opening")], null), "running");
    assert.equal(stageState("exploring", [frame("opening")], null), "pending");
  });
  it("distinguishes stages that ended from stages never observed", () => {
    const events = [frame("opening", "passed"), frame("scanning")];
    assert.equal(stageState("opening", events, null), "done");
    assert.equal(stageState("exploring", events, null), "skipped");
    assert.equal(stageState("scanning", events, null), "running");
    assert.equal(stageState("interacting", events, null), "pending");
  });
  it("retains failures and skips when later events arrive", () => {
    const events = [frame("exploring", "skipped"), frame("scanning", "failed"), frame("done", "passed")];
    assert.equal(stageState("exploring", events, null), "skipped");
    assert.equal(stageState("scanning", events, null), "failed");
    assert.equal(stageState("done", events, null), "done");
  });
  it("uses recorded outcomes instead of treating a finished run as all passed", () => {
    const run = { state: "COMPLETED", stages: [{ stage: "opening", state: "passed" }, { stage: "exploring", state: "skipped" }, { stage: "scanning", state: "failed" }] };
    assert.equal(stageState("opening", [], run), "done");
    assert.equal(stageState("exploring", [], run), "skipped");
    assert.equal(stageState("scanning", [], run), "failed");
    assert.equal(stageState("interacting", [], run), "skipped");
  });
  it("does not promote interrupted checks to passes", () => {
    for (const state of ["CANCELLED", "FAILED"]) {
      const run = { state, stages: [{ stage: "opening", state: "running" }] };
      for (const stage of STAGE_ORDER) assert.equal(stageState(stage, [frame("opening")], run), "skipped");
      assert.equal(stageState("opening", [frame("opening", "failed")], run), "failed");
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  InteractionAssertion,
  KeyboardScenarioResult,
} from "@a11yforge/shared";
import {
  EXPECTED_DEFECT_REPRODUCED_MESSAGE,
  isExpectedFixtureDefectReproduced,
  resolveFixtureScenarioExitCode,
} from "./fixture-verdict.js";

function failedAssertion(): InteractionAssertion {
  return {
    assertion: "focus-contained-in-modal",
    passed: false,
    step: 3,
    pressedKey: "Tab",
    expectedRegion: "#checkout-modal",
    actualFocus: "#background-control",
    actualHtml: '<a id="background-control">',
  };
}

function passedAssertion(): InteractionAssertion {
  return {
    assertion: "focus-contained-in-modal",
    passed: true,
    step: 2,
    pressedKey: "Tab",
    expectedRegion: "#checkout-modal",
    actualFocus: "#checkout-modal-continue",
    actualHtml: "<button>",
  };
}

function resultWith(
  assertions: InteractionAssertion[],
): KeyboardScenarioResult {
  return {
    runId: "test-run",
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002/",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: [],
    assertions,
    screenshots: [],
    events: [],
  };
}

/**
 * Protects the `scenario:fixture` exit-code contract: a reproduced fixture
 * defect (assertion `passed: false`) is a successful verification run
 * (exit 0); failing to reproduce the known defect is a verification
 * failure (exit non-zero). The structured assertion meaning itself is
 * unchanged — `passed: false` still marks the defect.
 */
describe("fixture-verdict exit-code contract", () => {
  it("exits 0 when the expected defect is reproduced (assertion failed)", () => {
    const result = resultWith([failedAssertion()]);
    assert.equal(isExpectedFixtureDefectReproduced(result), true);
    assert.equal(resolveFixtureScenarioExitCode(result), 0);
    // The assertion meaning is unchanged: failed stays failed.
    assert.equal(result.assertions[0]?.passed, false);
  });

  it("exits non-zero when the expected defect is NOT reproduced (assertion passed)", () => {
    const result = resultWith([passedAssertion()]);
    assert.equal(isExpectedFixtureDefectReproduced(result), false);
    assert.equal(resolveFixtureScenarioExitCode(result), 1);
  });

  it("announces a successful reproduction with the expected message", () => {
    assert.equal(
      EXPECTED_DEFECT_REPRODUCED_MESSAGE,
      "Expected fixture defect reproduced successfully.",
    );
  });
});

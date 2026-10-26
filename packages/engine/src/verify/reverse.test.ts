import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ScenarioDefinitionSchema,
  type KeyboardScenarioResult,
} from "@a11yforge/shared";
import {
  REVERSE_TAB_PRESSES,
  REVERSE_TRAVERSAL_SCENARIO_ID,
  buildReverseTraversalScenario,
  evaluateReverseTraversal,
} from "./reverse.js";

function reverseResult(passed: boolean): KeyboardScenarioResult {
  const selectors = passed
    ? ["#checkout-modal-close", "#checkout-modal-continue", "#checkout-modal-email"]
    : ["#checkout-modal-close", "#background-control"];
  return {
    runId: "reverse-test",
    scenarioId: REVERSE_TRAVERSAL_SCENARIO_ID,
    targetUrl: "http://127.0.0.1:9",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: selectors.map((selector, seq) => ({
      seq,
      action: seq === 0 ? "modal-open" : "press",
      key: seq === 0 ? null : "Shift+Tab",
      timestamp: `2026-10-26T00:00:0${seq}.000Z`,
      pageUrl: "http://127.0.0.1:9/",
      selector,
      tagName: selector.startsWith("#background") ? "a" : "button",
      role: null,
      accessibleName: selector,
      text: selector,
      tabIndex: 0,
      disabled: false,
      ariaHidden: false,
      insideModal: selector !== "#background-control",
    })),
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed,
        step: selectors.length - 1,
        pressedKey: "Shift+Tab",
        expectedRegion: "#checkout-modal",
        actualFocus: selectors[selectors.length - 1] ?? "",
        actualHtml: "<div></div>",
      },
    ],
    screenshots: [],
    events: [],
  };
}

describe("reverse traversal containment", () => {
  it("builds a valid scenario that presses Shift+Tab without touching the primary registry", () => {
    const scenario = buildReverseTraversalScenario();
    ScenarioDefinitionSchema.parse(scenario);
    assert.equal(scenario.id, REVERSE_TRAVERSAL_SCENARIO_ID);
    assert.notEqual(scenario.id, "checkout-modal-keyboard");
    assert.equal(scenario.modalSelector, "#checkout-modal");
    const presses = scenario.steps.filter((step) => step.kind === "press");
    assert.equal(presses.length, REVERSE_TAB_PRESSES);
    for (const press of presses) {
      assert.equal(press.kind, "press");
      if (press.kind === "press") {
        assert.equal(press.key, "Shift+Tab");
      }
    }
  });

  it("passes when Shift+Tab wraps inside the modal", () => {
    const verdict = evaluateReverseTraversal(reverseResult(true));
    assert.equal(verdict.passed, true);
    assert.equal(verdict.allInsideModal, true);
  });

  it("fails when Shift+Tab escapes to a background control", () => {
    const verdict = evaluateReverseTraversal(reverseResult(false));
    assert.equal(verdict.passed, false);
    assert.equal(verdict.actualFocus, "#background-control");
    assert.equal(verdict.allInsideModal, false);
  });
});

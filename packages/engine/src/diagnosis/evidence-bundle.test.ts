import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  FocusObservation,
  KeyboardScenarioResult,
} from "@a11yforge/shared";
import { buildFocusContainmentBundle } from "./evidence-bundle.js";

function observation(
  seq: number,
  selector: string,
  insideModal: boolean,
): FocusObservation {
  return {
    seq,
    action: seq === 0 ? "modal-open" : "press",
    key: seq === 0 ? null : "Tab",
    timestamp: `2026-10-26T00:00:0${seq}.000Z`,
    pageUrl: "http://127.0.0.1:3002/",
    selector,
    tagName: selector.startsWith("#checkout-modal-email") ? "input" : "button",
    role: "button",
    accessibleName: selector,
    text: selector,
    tabIndex: 0,
    disabled: false,
    ariaHidden: false,
    insideModal,
  };
}

function scenarioResult(): KeyboardScenarioResult {
  return {
    runId: "run-1",
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: [
      observation(0, "#checkout-modal-close", true),
      observation(1, "#checkout-modal-email", true),
      observation(2, "#checkout-modal-continue", true),
      observation(3, "#background-control", false),
    ],
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed: false,
        step: 3,
        pressedKey: "Tab",
        expectedRegion: "#checkout-modal",
        actualFocus: "#background-control",
        actualHtml:
          '<a id="background-control" href="#shipping-info">Shipping info</a>',
      },
    ],
    screenshots: [],
    events: [],
  };
}

describe("buildFocusContainmentBundle", () => {
  it("builds a compact bundle with stable evidence IDs", () => {
    const bundle = buildFocusContainmentBundle(scenarioResult());
    assert.equal(bundle.bundleId, "bundle-run-1");
    assert.equal(bundle.assertion, "focus-contained-in-modal");
    assert.equal(bundle.failedStep, 3);
    assert.equal(bundle.failingKey, "Tab");
    assert.equal(bundle.actualFocus, "#background-control");
    assert.deepEqual(
      bundle.items.map((item) => item.id),
      [
        "ev-modal-open",
        "ev-focus-step-1",
        "ev-focus-step-2",
        "ev-focus-escape",
        "ev-assertion-failed",
      ],
    );
  });

  it("carries only diagnostic fields (no events, screenshots, or dumps)", () => {
    const bundle = buildFocusContainmentBundle(scenarioResult());
    const serialized = JSON.stringify(bundle);
    assert.ok(!serialized.includes("screenshot"));
    assert.ok(!serialized.includes("scenario-started"));
    const escape = bundle.items.find((item) => item.id === "ev-focus-escape");
    assert.equal(escape?.selector, "#background-control");
    assert.equal(escape?.insideModal, false);
  });

  it("refuses a run with no failed containment assertion", () => {
    const result = scenarioResult();
    assert.throws(() =>
      buildFocusContainmentBundle({
        ...result,
        assertions: [{ ...result.assertions[0]!, passed: true }],
      }),
    );
  });

  it("refuses an unsupported scenario", () => {
    assert.throws(() =>
      buildFocusContainmentBundle({
        ...scenarioResult(),
        scenarioId: "other-scenario",
      }),
    );
  });
});

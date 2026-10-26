import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FocusObservation } from "@a11yforge/shared";
import { evaluateFocusContainment } from "./assertions.js";

function observation(
  seq: number,
  selector: string,
  insideModal: boolean,
  key: string | null = "Tab",
): FocusObservation {
  return {
    seq,
    action: seq === 0 ? "modal-open" : "press",
    key: seq === 0 ? null : key,
    timestamp: `2026-10-26T00:00:0${seq}.000Z`,
    pageUrl: "http://127.0.0.1:3002/",
    selector,
    tagName: "button",
    role: "button",
    accessibleName: selector,
    text: selector,
    tabIndex: 0,
    disabled: false,
    ariaHidden: false,
    insideModal,
  };
}

describe("evaluateFocusContainment", () => {
  it("fails on the first observation outside the modal", () => {
    const assertion = evaluateFocusContainment({
      observations: [
        observation(0, "#checkout-modal-close", true),
        observation(1, "#checkout-modal-email", true),
        observation(2, "#checkout-modal-continue", true),
        observation(3, "#background-control", false),
      ],
      expectedRegion: "#checkout-modal",
      htmlBySeq: new Map([
        [3, '<a id="background-control" href="#shipping-info">'],
      ]),
    });
    assert.equal(assertion.assertion, "focus-contained-in-modal");
    assert.equal(assertion.passed, false);
    assert.equal(assertion.step, 3);
    assert.equal(assertion.pressedKey, "Tab");
    assert.equal(assertion.expectedRegion, "#checkout-modal");
    assert.equal(assertion.actualFocus, "#background-control");
    assert.match(assertion.actualHtml, /background-control/);
  });

  it("reports the earliest escape when several steps are outside", () => {
    const assertion = evaluateFocusContainment({
      observations: [
        observation(0, "#checkout-modal-close", true),
        observation(1, "#background-control", false),
        observation(2, "#background-help", false),
      ],
      expectedRegion: "#checkout-modal",
      htmlBySeq: new Map(),
    });
    assert.equal(assertion.passed, false);
    assert.equal(assertion.step, 1);
    assert.equal(assertion.actualFocus, "#background-control");
    assert.equal(assertion.actualHtml, "");
  });

  it("passes when every observation stays inside the modal", () => {
    const assertion = evaluateFocusContainment({
      observations: [
        observation(0, "#checkout-modal-close", true),
        observation(1, "#checkout-modal-email", true),
      ],
      expectedRegion: "#checkout-modal",
      htmlBySeq: new Map(),
    });
    assert.equal(assertion.passed, true);
    assert.equal(assertion.step, 1);
    assert.equal(assertion.actualFocus, "#checkout-modal-email");
  });

  it("refuses to judge an empty observation list", () => {
    assert.throws(
      () =>
        evaluateFocusContainment({
          observations: [],
          expectedRegion: "#checkout-modal",
          htmlBySeq: new Map(),
        }),
      /no observations/,
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FocusObservationSchema } from "@a11yforge/shared";
import { toFocusObservation, type RawFocusSnapshot } from "./observe.js";

function rawSnapshot(overrides: Partial<RawFocusSnapshot> = {}): RawFocusSnapshot {
  return {
    selector: "#checkout-modal-close",
    tagName: "button",
    role: "button",
    accessibleName: "Close",
    text: "Close",
    tabIndex: 0,
    disabled: false,
    ariaHidden: false,
    insideModal: true,
    html: '<button id="checkout-modal-close">Close</button>',
    ...overrides,
  };
}

describe("toFocusObservation", () => {
  it("normalizes a raw snapshot into schema-valid evidence", () => {
    const observation = toFocusObservation(
      rawSnapshot(),
      {
        seq: 0,
        action: "modal-open",
        key: null,
        timestamp: "2026-10-26T00:00:00.000Z",
        pageUrl: "http://127.0.0.1:3002/",
      },
    );
    assert.equal(observation.seq, 0);
    assert.equal(observation.action, "modal-open");
    assert.equal(observation.key, null);
    assert.equal(observation.selector, "#checkout-modal-close");
    assert.equal(observation.tagName, "button");
    assert.equal(observation.role, "button");
    assert.equal(observation.accessibleName, "Close");
    assert.equal(observation.insideModal, true);
    assert.doesNotThrow(() => FocusObservationSchema.parse(observation));
  });

  it("bounds long text fields instead of storing snapshots", () => {
    const observation = toFocusObservation(
      rawSnapshot({ accessibleName: "x".repeat(500), text: "y".repeat(500) }),
      {
        seq: 3,
        action: "press",
        key: "Tab",
        timestamp: "2026-10-26T00:00:03.000Z",
        pageUrl: "http://127.0.0.1:3002/",
      },
    );
    assert.ok(observation.accessibleName.length <= 200);
    assert.ok(observation.text.length <= 200);
    assert.equal(observation.key, "Tab");
  });

  it("records background focus as outside the modal", () => {
    const observation = toFocusObservation(
      rawSnapshot({
        selector: "#background-control",
        tagName: "a",
        role: "link",
        accessibleName: "Shipping info",
        text: "Shipping info",
        insideModal: false,
      }),
      {
        seq: 3,
        action: "press",
        key: "Tab",
        timestamp: "2026-10-26T00:00:03.000Z",
        pageUrl: "http://127.0.0.1:3002/",
      },
    );
    assert.equal(observation.insideModal, false);
    assert.equal(observation.selector, "#background-control");
  });
});

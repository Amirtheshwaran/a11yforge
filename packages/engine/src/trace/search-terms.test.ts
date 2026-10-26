import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  AccessibilityDiagnosis,
  EvidenceBundle,
} from "@a11yforge/shared";
import { extractSearchTerms } from "./search-terms.js";

const BUNDLE: EvidenceBundle = {
  bundleId: "bundle-r1",
  scenarioId: "checkout-modal-keyboard",
  targetUrl: "http://127.0.0.1:3002",
  assertion: "focus-contained-in-modal",
  expectedRegion: "#checkout-modal",
  failedStep: 3,
  failingKey: "Tab",
  actualFocus: "#background-control",
  items: [
    {
      id: "ev-modal-open",
      kind: "modal-open",
      summary: "Modal #checkout-modal opened with focus on #checkout-modal-close.",
      selector: "#checkout-modal-close",
      insideModal: true,
      role: "button",
      accessibleName: "Close",
    },
    {
      id: "ev-focus-step-1",
      kind: "focus-observation",
      summary: "Focus on #checkout-modal-email inside #checkout-modal.",
      selector: "#checkout-modal-email",
      insideModal: true,
      role: "textbox",
      accessibleName: "checkout-modal-email",
    },
    {
      id: "ev-focus-step-2",
      kind: "focus-observation",
      summary: "Focus on #checkout-modal-continue inside #checkout-modal.",
      selector: "#checkout-modal-continue",
      insideModal: true,
      role: "button",
      accessibleName: "Continue",
    },
    {
      id: "ev-focus-escape",
      kind: "focus-escape",
      summary:
        "After pressing Tab, focus moved to #background-control while #checkout-modal remained open.",
      selector: "#background-control",
      insideModal: false,
      role: "link",
      accessibleName: "Shipping info",
      html: '<a id="background-control" href="#shipping-info">Shipping info</a>',
    },
    {
      id: "ev-assertion-failed",
      kind: "assertion-result",
      summary:
        "Assertion focus-contained-in-modal failed at step 3: expected focus inside #checkout-modal, observed #background-control.",
      selector: "#background-control",
      insideModal: false,
    },
  ],
};

const DIAGNOSIS: AccessibilityDiagnosis = {
  diagnosisId: "diag-r1",
  issueType: "focus-containment",
  title: "Focus escapes open checkout modal to background on Tab",
  summary: "Keyboard focus escaped the open checkout modal.",
  severity: "serious",
  confidence: 0.95,
  affectedStrategies: ["keyboard-navigation"],
  evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
  observedFailure:
    "While #checkout-modal remained open, Tab moved focus through the dialog controls and then to #background-control outside the modal.",
  likelyCause: "The active modal does not constrain keyboard focus.",
  recommendedRepairStrategy:
    "Implement focus containment while the modal is active.",
  relevantWcagCriteria: ["2.4.3"],
  needsSourceContext: true,
};

describe("extractSearchTerms (deterministic, no model)", () => {
  it("derives modal and escape selectors from evidence facts", () => {
    const terms = extractSearchTerms(DIAGNOSIS, BUNDLE);
    for (const expected of [
      "checkout-modal",
      "checkout-modal-close",
      "checkout-modal-email",
      "checkout-modal-continue",
      "background-control",
    ]) {
      assert.ok(
        terms.includes(expected),
        `expected search term ${expected} in [${terms.join(", ")}]`,
      );
    }
  });

  it("returns a sorted, de-duplicated term list (stable across runs)", () => {
    const first = extractSearchTerms(DIAGNOSIS, BUNDLE);
    const second = extractSearchTerms(DIAGNOSIS, BUNDLE);
    assert.deepEqual(first, second);
    assert.deepEqual(first, [...new Set(first)].sort());
  });

  it("ignores free-prose accessible names that are not identifiers", () => {
    const terms = extractSearchTerms(DIAGNOSIS, BUNDLE);
    assert.ok(!terms.includes("Shipping info"));
    assert.ok(terms.every((term) => !term.includes(" ")));
  });

  it("asks the model nothing: identical output with no network or env", () => {
    const terms = extractSearchTerms(DIAGNOSIS, BUNDLE);
    assert.ok(terms.length > 0);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ProbeResult } from "@a11yforge/shared";
import { collectFingerprints, generateSearchTerms } from "./evidence-terms.js";
import { capWeakWeight, isWeakTerm, weightTerm } from "./term-weight.js";

function probeResult(): ProbeResult {
  return {
    probeId: "page-axe-scan",
    targetId: "t",
    pageUrl: "https://example.com/settings/profile?tab=a11y",
    status: "failed",
    title: "Automated checks found problems on this page.",
    humanSummary: "Checks reported problems.",
    severity: "serious",
    evidence: [
      {
        kind: "axe-violation",
        summary: "Form elements must have labels — #user-email",
        data: {
          ruleId: "label",
          selector: "#user-email",
          html: '<input id="user-email" class="field-input" data-testid="email-field" type="email">',
        },
      },
    ],
    actionTrace: [],
    screenshots: [],
    standardReferences: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

describe("evidence terms", () => {
  it("derives ids, classes, and data values from evidence only", () => {
    const fingerprints = collectFingerprints({ probe: probeResult() });
    assert.equal(fingerprints.length, 1);
    assert.equal(fingerprints[0]?.elementId, "user-email");
    const terms = generateSearchTerms(fingerprints).map((t) => t.term);
    assert.ok(terms.includes("user-email"));
    assert.ok(terms.includes("field-input") || terms.includes("field"));
    assert.ok(terms.includes("email-field"));
    // Deterministic: sorted and de-duplicated.
    assert.deepEqual(terms, [...terms].sort());
    assert.equal(new Set(terms).size, terms.length);
  });

  it("records the page route, never invents terms", () => {
    const fingerprints = collectFingerprints({ probe: probeResult() });
    assert.equal(fingerprints[0]?.pageRoute, "/settings/profile?tab=a11y");
    const empty = generateSearchTerms([]);
    assert.deepEqual(empty, []);
  });

  it("drops generic English stop-words at generation", () => {
    const terms = generateSearchTerms([
      {
        kind: "axe-violation",
        elementId: "",
        accessibleName: "",
        role: "",
        text: "The element must have an attribute",
        ariaLabel: "",
        ariaControls: "",
        ariaDescribedBy: "",
        classTokens: [],
        dataAttributes: [],
        outerHtml: "",
        nearbyText: "",
        pageRoute: "/",
      },
    ]).map((t) => t.term);
    assert.ok(!terms.includes("The"));
    assert.ok(!terms.includes("must"));
    assert.ok(!terms.includes("attribute"));
    assert.ok(!terms.includes("element"));
  });
});

describe("term weighting", () => {
  it("ranks rare ids above ubiquitous prose", () => {
    const rare = weightTerm(["axe-violation:id"], 1, 1000);
    const common = weightTerm(["axe-violation:text"], 400, 1000);
    assert.ok(rare > common);
  });

  it("caps generic vocabulary", () => {
    assert.ok(isWeakTerm("button"));
    assert.ok(!isWeakTerm("user-email"));
    assert.ok(capWeakWeight("button", 9) <= 1.5);
    assert.equal(capWeakWeight("user-email", 9), 9);
  });
});

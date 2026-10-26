import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  AccessibilityScanResult,
  KeyboardScenarioResult,
} from "@a11yforge/shared";
import {
  axeRuleIdsOf,
  compareAxeScans,
  compareScenarioAssertions,
  evaluateAcceptanceGate,
  snapshotTargetAssertion,
} from "./regression.js";

function scanWith(
  rules: Array<{ rule: string; impact: "serious" | "critical" | "moderate" | null }>,
): AccessibilityScanResult {
  return {
    scanId: "scan-test",
    pageUrl: "http://127.0.0.1:3002/",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    findings: rules.map(({ rule, impact }, index) => ({
      id: `${rule}#${index}`,
      ruleId: rule,
      impact,
      description: rule,
      help: rule,
      helpUrl: "https://example.test",
      pageUrl: "http://127.0.0.1:3002/",
      selector: `#node-${index}`,
      html: `<div id="node-${index}"></div>`,
      failureSummary: "failed",
    })),
  };
}

function scenarioWith(passed: boolean, actualFocus: string): KeyboardScenarioResult {
  return {
    runId: "run-test",
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: [],
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed,
        step: passed ? 10 : 3,
        pressedKey: "Tab",
        expectedRegion: "#checkout-modal",
        actualFocus,
        actualHtml: `<a id="${actualFocus.replace("#", "")}"></a>`,
      },
    ],
    screenshots: [],
    events: [],
  };
}

const BASELINE_RULES = [
  { rule: "button-name", impact: "critical" as const },
  { rule: "image-alt", impact: "critical" as const },
  { rule: "label", impact: "critical" as const },
  { rule: "color-contrast", impact: "serious" as const },
];

describe("axe regression comparison", () => {
  it("preserves the intentional four-rule baseline with no regressions", () => {
    const comparison = compareAxeScans({
      baseline: scanWith(BASELINE_RULES),
      repaired: scanWith(BASELINE_RULES),
    });
    assert.deepEqual(comparison.baselineRules, [
      "button-name",
      "color-contrast",
      "image-alt",
      "label",
    ]);
    assert.deepEqual(comparison.newViolations, []);
    assert.deepEqual(comparison.removedBaselineRules, []);
    assert.deepEqual(comparison.newSeriousCritical, []);
    assert.deepEqual(comparison.regressions, []);
  });

  it("flags a new serious violation as a regression", () => {
    const comparison = compareAxeScans({
      baseline: scanWith(BASELINE_RULES),
      repaired: scanWith([
        ...BASELINE_RULES,
        { rule: "aria-required-attr", impact: "critical" },
      ]),
    });
    assert.deepEqual(comparison.newViolations, ["aria-required-attr"]);
    assert.deepEqual(comparison.newSeriousCritical, ["aria-required-attr"]);
    assert.equal(comparison.regressions.length, 1);
  });

  it("flags an accidentally removed baseline defect", () => {
    const comparison = compareAxeScans({
      baseline: scanWith(BASELINE_RULES),
      repaired: scanWith(BASELINE_RULES.slice(0, 3)),
    });
    assert.deepEqual(comparison.removedBaselineRules, ["color-contrast"]);
    assert.equal(comparison.regressions.length, 1);
    assert.ok(comparison.regressions[0]?.includes("color-contrast"));
  });

  it("ignores a new non-serious rule for the blocking set but still reports it", () => {
    const comparison = compareAxeScans({
      baseline: scanWith(BASELINE_RULES),
      repaired: scanWith([
        ...BASELINE_RULES,
        { rule: "landmark-one-main", impact: "moderate" },
      ]),
    });
    assert.deepEqual(comparison.newViolations, ["landmark-one-main"]);
    assert.deepEqual(comparison.newSeriousCritical, []);
    assert.deepEqual(comparison.regressions, []);
  });

  it("extracts sorted distinct rule ids", () => {
    assert.deepEqual(
      axeRuleIdsOf(
        scanWith([
          { rule: "label", impact: "critical" },
          { rule: "label", impact: "critical" },
          { rule: "button-name", impact: "critical" },
        ]),
      ),
      ["button-name", "label"],
    );
  });
});

describe("scenario verification comparison", () => {
  it("resolves the target failure only on a false→true flip", () => {
    const flip = compareScenarioAssertions({
      before: scenarioWith(false, "#background-control"),
      after: scenarioWith(true, "#checkout-modal-continue"),
    });
    assert.equal(flip.resolvedTargetFailure, true);
    assert.equal(flip.scenarioPassed, true);
    assert.deepEqual(flip.before, {
      passed: false,
      actualFocus: "#background-control",
    });
    assert.deepEqual(flip.after, {
      passed: true,
      actualFocus: "#checkout-modal-continue",
    });
  });

  it("does not resolve when the replay still escapes", () => {
    const stuck = compareScenarioAssertions({
      before: scenarioWith(false, "#background-control"),
      after: scenarioWith(false, "#background-control"),
    });
    assert.equal(stuck.resolvedTargetFailure, false);
    assert.equal(stuck.scenarioPassed, false);
  });

  it("throws when the target assertion is absent", () => {
    const empty = scenarioWith(true, "#checkout-modal-continue");
    assert.throws(
      () => snapshotTargetAssertion({ ...empty, assertions: [] }),
      /assertion missing/,
    );
  });
});

describe("deterministic acceptance gate", () => {
  const passing = {
    buildPassed: true,
    applySucceeded: true,
    scenarioCompleted: true,
    resolvedTargetFailure: true,
    newSeriousCritical: [],
    regressions: [],
    requiredTestsPassed: true,
  };

  it("admits a fully passing repair", () => {
    const gate = evaluateAcceptanceGate(passing);
    assert.equal(gate.eligible, true);
    assert.deepEqual(gate.reasons, []);
  });

  it("rejects on every single failing input", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["not applied", { applySucceeded: false }],
      ["build failed", { buildPassed: false }],
      ["no replay", { scenarioCompleted: false }],
      ["assertion stuck", { resolvedTargetFailure: false }],
      ["tests failed", { requiredTestsPassed: false }],
    ];
    for (const [label, override] of cases) {
      const gate = evaluateAcceptanceGate({ ...passing, ...override });
      assert.equal(gate.eligible, false, label);
      assert.ok(gate.reasons.length > 0, label);
    }
  });

  it("rejects on new serious violations and names them", () => {
    const gate = evaluateAcceptanceGate({
      ...passing,
      newSeriousCritical: ["aria-required-attr"],
      regressions: ["new aria-required-attr violation introduced by the repair"],
    });
    assert.equal(gate.eligible, false);
    assert.ok(gate.reasons.join(" ").includes("aria-required-attr"));
  });
});

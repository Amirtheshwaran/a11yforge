import type {
  AccessibilityScanResult,
  AssertionSnapshot,
  KeyboardScenarioResult,
} from "@a11yforge/shared";

/**
 * Phase 5 deterministic comparisons and acceptance gate.
 *
 * No AI decides whether the repair improved anything: the before/after
 * `focus-contained-in-modal` assertions are compared field-by-field, the
 * baseline vs repaired axe rule sets are diffed, and the acceptance gate
 * is a pure conjunction. Any failure REJECTS deterministically without
 * spending the critic call.
 */

/** Distinct axe rule ids present in a scan, in sorted order. */
export function axeRuleIdsOf(scan: AccessibilityScanResult): string[] {
  return [...new Set(scan.findings.map((finding) => finding.ruleId))].sort();
}

export interface AxeComparison {
  baselineRules: string[];
  repairedRules: string[];
  newViolations: string[];
  removedBaselineRules: string[];
  /** New violations with serious/critical impact (acceptance-blocking). */
  newSeriousCritical: string[];
  regressions: string[];
}

/**
 * Compare the baseline scan against the repaired scan. The repair targets
 * an interaction issue, so the four intentional fixture defects must
 * remain: a removed baseline rule means an unrelated defect was
 * accidentally fixed, and any new serious/critical rule is a regression.
 */
export function compareAxeScans(args: {
  baseline: AccessibilityScanResult;
  repaired: AccessibilityScanResult;
}): AxeComparison {
  const baselineRules = axeRuleIdsOf(args.baseline);
  const repairedRules = axeRuleIdsOf(args.repaired);
  const baselineSet = new Set(baselineRules);
  const repairedSet = new Set(repairedRules);
  const newViolations = repairedRules.filter((rule) => !baselineSet.has(rule));
  const removedBaselineRules = baselineRules.filter(
    (rule) => !repairedSet.has(rule),
  );
  const seriousCriticalImpacts = new Set(["serious", "critical"]);
  const newSeriousCritical = [
    ...new Set(
      args.repaired.findings
        .filter(
          (finding) =>
            newViolations.includes(finding.ruleId) &&
            finding.impact !== null &&
            seriousCriticalImpacts.has(finding.impact),
        )
        .map((finding) => finding.ruleId),
    ),
  ].sort();
  const regressions: string[] = [];
  for (const rule of newSeriousCritical) {
    regressions.push(`new ${rule} violation introduced by the repair`);
  }
  for (const rule of removedBaselineRules) {
    regressions.push(
      `baseline ${rule} defect removed — unrelated fixture defect changed`,
    );
  }
  return {
    baselineRules,
    repairedRules,
    newViolations,
    removedBaselineRules,
    newSeriousCritical,
    regressions,
  };
}

/** Snapshot the `focus-contained-in-modal` assertion of a scenario run. */
export function snapshotTargetAssertion(
  result: KeyboardScenarioResult,
): AssertionSnapshot {
  const assertion = result.assertions.find(
    (item) => item.assertion === "focus-contained-in-modal",
  );
  if (!assertion) {
    throw new Error(
      "snapshotTargetAssertion: focus-contained-in-modal assertion missing",
    );
  }
  return { passed: assertion.passed, actualFocus: assertion.actualFocus };
}

export interface VerificationComparison {
  before: AssertionSnapshot;
  after: AssertionSnapshot;
  resolvedTargetFailure: boolean;
  scenarioPassed: boolean;
}

/**
 * Compare the original failing assertion against the replayed one. The
 * target failure counts as resolved only when the same scenario now
 * passes with focus inside the modal.
 */
export function compareScenarioAssertions(args: {
  before: KeyboardScenarioResult;
  after: KeyboardScenarioResult;
}): VerificationComparison {
  const before = snapshotTargetAssertion(args.before);
  const after = snapshotTargetAssertion(args.after);
  const scenarioPassed = args.after.assertions.every((item) => item.passed);
  return {
    before,
    after,
    resolvedTargetFailure:
      before.passed === false &&
      after.passed === true &&
      scenarioPassed,
    scenarioPassed,
  };
}

export interface AcceptanceGateInput {
  buildPassed: boolean;
  applySucceeded: boolean;
  scenarioCompleted: boolean;
  resolvedTargetFailure: boolean;
  newSeriousCritical: string[];
  regressions: string[];
  requiredTestsPassed: boolean;
}

export interface AcceptanceGateResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Deterministic acceptance gate. A repair is eligible for the critic
 * only when EVERY input holds; the reasons list names each failing
 * input for the terminal report. The critic is never consulted here —
 * ineligibility REJECTS without spending a model call.
 */
export function evaluateAcceptanceGate(
  input: AcceptanceGateInput,
): AcceptanceGateResult {
  const reasons: string[] = [];
  if (!input.applySucceeded) {
    reasons.push("repair was not applied safely");
  }
  if (!input.buildPassed) {
    reasons.push("repaired fixture build failed");
  }
  if (!input.scenarioCompleted) {
    reasons.push("same-scenario replay did not complete");
  }
  if (!input.resolvedTargetFailure) {
    reasons.push("target focus assertion did not flip to passing");
  }
  if (input.newSeriousCritical.length > 0) {
    reasons.push(
      `new serious/critical axe violations: ${input.newSeriousCritical.join(", ")}`,
    );
  }
  if (input.regressions.length > 0) {
    reasons.push(`regressions: ${input.regressions.join("; ")}`);
  }
  if (!input.requiredTestsPassed) {
    reasons.push("required regression tests did not pass");
  }
  return { eligible: reasons.length === 0, reasons };
}

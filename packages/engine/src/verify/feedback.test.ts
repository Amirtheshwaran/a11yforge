import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FEEDBACK_STDERR_CHARS,
  boundCompilerOutput,
  buildFailureFeedback,
  classifyFailureStage,
  extractAffectedRegion,
  extractTsDiagnosticCodes,
} from "./feedback.js";

const TS_OUTPUT =
  "src/App.tsx(150,21): error TS18048: 'last' is possibly 'undefined'.\n" +
  "src/App.tsx(153,21): error TS18048: 'first' is possibly 'undefined'.\n";

function baseArgs(): Parameters<typeof buildFailureFeedback>[0] {
  return {
    proposal: {
      proposalId: "prop-1",
      diagnosisId: "diag-1",
      summary: "Contain focus.",
      rationale: "Observed escape; containment addresses it.",
      evidenceIds: ["ev-focus-escape"],
      targetFiles: ["src/App.tsx"],
      edits: [
        {
          filePath: "src/App.tsx",
          originalText: '<div id="checkout-modal">',
          replacementText: '<div id="checkout-modal" data-trap="true">',
          reason: "Anchor the dialog.",
        },
      ],
      risks: [],
      verificationPlan: ["rebuild"],
    },
    repairId: "repair-1",
    previousLifecycleResult: "REGRESSION_FAILED",
    failedStage: "typecheck",
    compilerCommand: "node <workspace>/typescript/bin/tsc --noEmit",
    exitStatus: 2,
    compilerOutput: TS_OUTPUT,
    diagnosisId: "diag-1",
    observedFailure: "Focus escaped the modal.",
    repairStrategy: "Contain focus while modal is active.",
    suppliedSourceFiles: ["src/App.tsx"],
  };
}

describe("verifier failure feedback", () => {
  it("extracts exact TypeScript diagnostic codes", () => {
    assert.deepEqual(extractTsDiagnosticCodes(TS_OUTPUT), ["TS18048"]);
    assert.deepEqual(extractTsDiagnosticCodes("all clean"), []);
    assert.deepEqual(
      extractTsDiagnosticCodes("error TS2322 and error TS18048 again TS2322"),
      ["TS18048", "TS2322"],
    );
  });

  it("extracts the affected source region", () => {
    const region = extractAffectedRegion(TS_OUTPUT);
    assert.ok(region.includes("src/App.tsx(150,21)"));
    assert.ok(region.includes("src/App.tsx(153,21)"));
  });

  it("bounds compiler output to a fixed tail", () => {
    const huge = `x\n`.repeat(5000);
    const bounded = boundCompilerOutput(huge);
    assert.ok(bounded.length <= MAX_FEEDBACK_STDERR_CHARS);
    assert.ok(bounded.endsWith("x\n".repeat(1000).slice(-MAX_FEEDBACK_STDERR_CHARS)));
  });

  it("classifies a compiler failure as the typecheck stage", () => {
    // Even when the historical lifecycle label grouped it under
    // regression, the verifier reports the precise failed stage.
    assert.equal(
      classifyFailureStage({
        applySucceeded: true,
        typecheckPassed: false,
        buildPassed: null,
        resolvedTargetFailure: null,
        regressions: ["baseline label defect removed"],
        newSeriousCritical: [],
      }),
      "typecheck",
    );
  });

  it("classifies each deterministic stage in precedence order", () => {
    const base = {
      applySucceeded: true,
      typecheckPassed: true as boolean | null,
      buildPassed: true as boolean | null,
      resolvedTargetFailure: true as boolean | null,
      regressions: [] as string[],
      newSeriousCritical: [] as string[],
    };
    assert.equal(classifyFailureStage({ ...base, applySucceeded: false }), "apply");
    assert.equal(
      classifyFailureStage({ ...base, buildPassed: false }),
      "build",
    );
    assert.equal(
      classifyFailureStage({ ...base, resolvedTargetFailure: false }),
      "replay",
    );
    assert.equal(
      classifyFailureStage({ ...base, regressions: ["new x introduced"] }),
      "regression",
    );
  });

  it("builds a bounded feedback bundle with the TS18048 diagnostics", () => {
    const feedback = buildFailureFeedback(baseArgs());
    assert.equal(feedback.proposalId, "prop-1");
    assert.equal(feedback.repairId, "repair-1");
    assert.equal(feedback.failedStage, "typecheck");
    assert.equal(feedback.exitStatus, 2);
    assert.deepEqual(feedback.diagnosticCodes, ["TS18048"]);
    assert.ok(feedback.stderrTail.length <= MAX_FEEDBACK_STDERR_CHARS);
    assert.ok(feedback.affectedSourceRegion.includes("src/App.tsx(150,21)"));
    assert.equal(
      feedback.originalProposedEdit.replacementText,
      '<div id="checkout-modal" data-trap="true">',
    );
    assert.deepEqual(feedback.originalEvidenceIds, ["ev-focus-escape"]);
    assert.deepEqual(feedback.suppliedSourceFiles, ["src/App.tsx"]);
  });

  it("rejects feedback without a proposed edit", () => {
    const args = baseArgs();
    assert.throws(() =>
      buildFailureFeedback({
        ...args,
        proposal: { ...args.proposal, edits: [] },
      }),
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CriticInput, RepairVerificationResult } from "@a11yforge/shared";
import type { MetaFetch } from "@a11yforge/meta";
import {
  assertCriticEvidenceKnown,
  buildCriticInput,
  CriticEvidenceError,
  requestCriticDecision,
} from "./critic.js";

const INPUT: CriticInput = {
  repairId: "repair-test-1",
  proposalId: "prop-test-1",
  diagnosisId: "diag-test-1",
  observedFailure: "Focus escaped the modal.",
  proposalSummary: "Trap focus in the modal.",
  proposalRationale: "Wrapping Tab keeps focus inside.",
  evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
  diff: "--- a/src/App.tsx\n+++ b/src/App.tsx\n+ trap",
  buildCommand: "vite build",
  buildExitCode: 0,
  buildPassed: true,
  before: { passed: false, actualFocus: "#background-control" },
  after: { passed: true, actualFocus: "#checkout-modal-continue" },
  baselineAxeRules: ["button-name", "image-alt", "label", "color-contrast"],
  repairedAxeRules: ["button-name", "image-alt", "label", "color-contrast"],
  newAxeViolations: [],
  regressions: [],
};

function verification(): RepairVerificationResult {
  return {
    repairId: "repair-test-1",
    proposalId: "prop-test-1",
    buildPassed: true,
    buildCommand: "vite build",
    buildExitCode: 0,
    buildDurationMs: 1200,
    originalAssertion: { passed: false, actualFocus: "#background-control" },
    repairedAssertion: { passed: true, actualFocus: "#checkout-modal-continue" },
    scenarioPassed: true,
    baselineAxeRules: ["button-name", "image-alt", "label", "color-contrast"],
    repairedAxeRules: ["button-name", "image-alt", "label", "color-contrast"],
    newAxeViolations: [],
    removedBaselineRules: [],
    newSeriousCritical: [],
    resolvedTargetFailure: true,
    regressions: [],
    diffArtifact: "repair-diff.patch",
    evidenceArtifacts: ["repaired-scenario.json"],
    decisionBasis: "gate passed",
  };
}

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

function acceptPayload() {
  return {
    id: "req-critic-9",
    choices: [
      {
        message: {
          role: "assistant",
          content: JSON.stringify({
            decision: "ACCEPT",
            confidence: 0.9,
            summary: "Evidence shows the failure resolved.",
            evidenceIds: ["ev-focus-escape"],
            verificationConcerns: [],
            remainingRisks: [],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 40 },
  };
}

describe("critic request shape", () => {
  it("builds the bounded input from verified artifacts only", () => {
    const input = buildCriticInput({
      diagnosis: {
        diagnosisId: "diag-test-1",
        issueType: "focus-containment",
        title: "t",
        summary: "s",
        severity: "serious",
        confidence: 0.9,
        affectedStrategies: ["keyboard-navigation"],
        evidenceIds: ["ev-focus-escape"],
        observedFailure: "Focus escaped the modal.",
        likelyCause: "No trap.",
        recommendedRepairStrategy: "Trap focus.",
        relevantWcagCriteria: [],
        needsSourceContext: true,
      },
      proposal: {
        proposalId: "prop-test-1",
        diagnosisId: "diag-test-1",
        summary: "Trap focus in the modal.",
        rationale: "Wrapping Tab keeps focus inside.",
        evidenceIds: ["ev-focus-escape"],
        targetFiles: ["src/App.tsx"],
        edits: [
          {
            filePath: "src/App.tsx",
            originalText: "a",
            replacementText: "b",
            reason: "r",
          },
        ],
        risks: [],
        verificationPlan: ["rebuild"],
      },
      verification: verification(),
      diffText: "--- a/src/App.tsx\n+++ b/src/App.tsx\n+ trap",
      evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
    });
    assert.equal(input.repairId, "repair-test-1");
    assert.equal(input.before.actualFocus, "#background-control");
    assert.equal(input.after.actualFocus, "#checkout-modal-continue");
    // The input carries no repository paths or source beyond the diff.
    assert.ok(!JSON.stringify(input).includes("node_modules"));
    assert.ok(!JSON.stringify(input).includes(".a11yforge/workspaces"));
  });

  it("sends exactly one critic call and records critic operation usage", async () => {
    let calls = 0;
    let seenBody = "";
    const fetchFn = ((url: string, init: RequestInit) => {
      calls += 1;
      seenBody = String(init.body);
      return Promise.resolve(okResponse(acceptPayload()));
    }) as unknown as MetaFetch;
    const result = await requestCriticDecision({
      env: { MODEL_API_KEY: "test-key" },
      fetchFn,
      input: INPUT,
    });
    assert.equal(calls, 1);
    assert.equal(result.decision.decision, "ACCEPT");
    assert.equal(result.usage.operation, "repair-critic-review");
    assert.equal(result.model, "muse-spark-1.3-contributor");
    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const format = body["response_format"] as Record<string, unknown>;
    assert.equal(
      (format["json_schema"] as Record<string, unknown>)["name"],
      "repair-critic-decision",
    );
    assert.equal(body["max_completion_tokens"], 2048);
    assert.equal(body["reasoning_effort"], "low");
  });

  it("fails before any request when MODEL_API_KEY is missing", async () => {
    let calls = 0;
    const fetchFn = ((() => {
      calls += 1;
      return Promise.resolve(okResponse(acceptPayload()));
    }) as unknown) as MetaFetch;
    await assert.rejects(
      () => requestCriticDecision({ env: {}, fetchFn, input: INPUT }),
      /MODEL_API_KEY/,
    );
    assert.equal(calls, 0);
  });

  it("rejects a critic verdict citing unknown evidence", async () => {
    const payload = acceptPayload();
    const content = JSON.parse(
      String(
        (payload.choices[0] as { message: { content: string } }).message.content,
      ),
    ) as Record<string, unknown>;
    content["evidenceIds"] = ["ev-invented"];
    (payload.choices[0] as { message: { content: string } }).message.content =
      JSON.stringify(content);
    const fetchFn = ((() =>
      Promise.resolve(okResponse(payload))) as unknown) as MetaFetch;
    await assert.rejects(
      () => requestCriticDecision({ env: { MODEL_API_KEY: "k" }, fetchFn, input: INPUT }),
      (error: unknown) => error instanceof CriticEvidenceError,
    );
  });

  it("assertCriticEvidenceKnown accepts known ids", () => {
    assertCriticEvidenceKnown(
      {
        decision: "REJECT",
        confidence: 0.4,
        summary: "Inconsistent evidence.",
        evidenceIds: ["ev-modal-open"],
        verificationConcerns: ["trace mismatch"],
        remainingRisks: [],
      },
      INPUT,
    );
  });
});

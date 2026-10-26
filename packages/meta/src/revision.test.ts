import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RepairProposalSchema,
  type RepairRevisionRequest,
} from "@a11yforge/shared";
import {
  MetaApiError,
  MetaMalformedResultError,
  type MetaFetch,
} from "./provider.js";
import { proposeRepairRevisionWithMeta } from "./revision.js";

const REQUEST: RepairRevisionRequest = {
  requestId: "rev-checkout-modal-keyboard-001",
  context: {
    bundleId: "repair-ctx-trace-run-1",
    diagnosisId: "diag-r1",
    evidenceIds: ["ev-modal-open", "ev-focus-escape"],
    observedFailure:
      "While #checkout-modal remained open, Tab moved focus to #background-control outside the modal.",
    repairStrategy: "Implement focus containment while the modal is active.",
    sourceFiles: [
      {
        filePath: "src/App.tsx",
        score: 300,
        matchedTerms: ["checkout-modal", "background-control"],
        matchCount: 20,
      },
    ],
    snippets: [
      {
        filePath: "src/App.tsx",
        startLine: 1,
        endLine: 8,
        content: '<div id="checkout-modal">\n  <a id="background-control" />\n</div>',
        matchedTerms: ["checkout-modal", "background-control"],
      },
    ],
  },
  originalProposal: {
    proposalId: "prop-r1",
    diagnosisId: "diag-r1",
    summary: "First attempt.",
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
  feedback: {
    proposalId: "prop-r1",
    repairId: "repair-r1",
    previousLifecycleResult: "REGRESSION_FAILED",
    failedStage: "typecheck",
    compilerCommand: "node <workspace>/typescript/bin/tsc --noEmit",
    exitStatus: 2,
    stderrTail: "src/App.tsx(150,21): error TS18048: 'last' is possibly 'undefined'.",
    diagnosticCodes: ["TS18048"],
    affectedSourceRegion: "src/App.tsx(150,21)",
    originalProposedEdit: {
      filePath: "src/App.tsx",
      originalText: '<div id="checkout-modal">',
      replacementText: '<div id="checkout-modal" data-trap="true">',
      reason: "Anchor the dialog.",
    },
    originalDiagnosis: {
      diagnosisId: "diag-r1",
      observedFailure: "Focus escaped.",
      repairStrategy: "Contain focus.",
    },
    originalEvidenceIds: ["ev-focus-escape"],
    originalRepairRationale: "Observed escape; containment addresses it.",
    suppliedSourceFiles: ["src/App.tsx"],
  },
};

const REVISION = {
  proposalId: "prop-r1-rev2",
  diagnosisId: "diag-r1",
  summary: "Same trap with strict-safe access.",
  rationale: "Guards address TS18048 without changing behavior.",
  evidenceIds: ["ev-focus-escape"],
  targetFiles: ["src/App.tsx"],
  edits: [
    {
      filePath: "src/App.tsx",
      originalText: '<div id="checkout-modal">',
      replacementText: '<div id="checkout-modal" data-trap="guarded">',
      reason: "Revised anchor.",
    },
  ],
  risks: [],
  verificationPlan: ["rebuild", "replay checkout-modal-keyboard"],
};

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

function completionWith(content: string, usage?: unknown): unknown {
  return {
    id: "req-revision-1",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
    ...(usage !== undefined ? { usage } : {}),
  };
}

function mockFetch(
  payload: unknown,
  onCall?: (url: string, init: RequestInit) => void,
): { fetchFn: MetaFetch; calls: () => number } {
  let calls = 0;
  const fetchFn = ((url: string, init: RequestInit) => {
    calls += 1;
    onCall?.(url, init);
    return Promise.resolve(okResponse(payload));
  }) as unknown as MetaFetch;
  return { fetchFn, calls: () => calls };
}

describe("proposeRepairRevisionWithMeta (mocked transport)", () => {
  it("sends one revision request grounded in verifier feedback", async () => {
    let seenBody = "";
    const { fetchFn, calls } = mockFetch(
      completionWith(JSON.stringify(REVISION), {
        prompt_tokens: 500,
        completion_tokens: 350,
        completion_tokens_details: { reasoning_tokens: 45 },
      }),
      (_url, init) => {
        seenBody = String(init.body);
      },
    );
    const { proposal, usage } = await proposeRepairRevisionWithMeta(REQUEST, {
      fetchFn,
      model: "muse-spark-1.3-contributor",
      apiKey: "test-key",
    });
    assert.equal(proposal.proposalId, "prop-r1-rev2");
    RepairProposalSchema.parse(proposal);
    assert.equal(usage.operation, "accessibility-repair-revision");
    assert.equal(usage.model, "muse-spark-1.3-contributor");
    assert.equal(usage.requestId, "req-revision-1");
    assert.equal(calls(), 1);

    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const format = body["response_format"] as Record<string, unknown>;
    const schema = format["json_schema"] as Record<string, unknown>;
    assert.equal(schema["name"], "accessibility-repair-proposal");
    assert.equal(schema["strict"], true);
    assert.equal(body["reasoning_effort"], "low");
    const messages = body["messages"] as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    // The revision prompt states the strict-TS rejection explicitly.
    assert.ok(
      String(messages[0]?.["content"]).includes("strict TypeScript"),
    );
    // The request carries the failed stage, diagnostics, and original.
    const userContent = String(messages[1]?.["content"]);
    assert.ok(userContent.includes("TS18048"));
    assert.ok(userContent.includes("typecheck"));
    assert.ok(userContent.includes("prop-r1"));
  });

  it("rejects revisions citing evidence outside the original context", async () => {
    const bad = { ...REVISION, evidenceIds: ["ev-made-up"] };
    const { fetchFn, calls } = mockFetch(completionWith(JSON.stringify(bad)));
    await assert.rejects(
      () =>
        proposeRepairRevisionWithMeta(REQUEST, {
          fetchFn,
          model: "m",
          apiKey: "k",
        }),
      MetaMalformedResultError,
    );
    assert.equal(calls(), 1);
  });

  it("fails on non-JSON content without retrying", async () => {
    const { fetchFn, calls } = mockFetch(completionWith("{{{ not json"));
    await assert.rejects(
      () =>
        proposeRepairRevisionWithMeta(REQUEST, {
          fetchFn,
          model: "m",
          apiKey: "k",
        }),
      MetaMalformedResultError,
    );
    assert.equal(calls(), 1);
  });

  it("propagates transport failures with no fabrication", async () => {
    const fetchFn = ((() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("server error"),
      })) as unknown) as MetaFetch;
    await assert.rejects(
      () =>
        proposeRepairRevisionWithMeta(REQUEST, {
          fetchFn,
          model: "m",
          apiKey: "k",
        }),
      (error: unknown) =>
        error instanceof MetaApiError &&
        (error as MetaApiError).status === 500,
    );
  });
});

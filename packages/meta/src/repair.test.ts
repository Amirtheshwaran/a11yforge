import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RepairProposalSchema,
  type RepairContextBundle,
} from "@a11yforge/shared";
import {
  MetaApiError,
  MetaMalformedResultError,
  UnknownEvidenceReferenceError,
  type MetaFetch,
} from "./provider.js";
import { proposeRepairWithMeta } from "./repair.js";

const CONTEXT: RepairContextBundle = {
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
};

const PROPOSAL = {
  proposalId: "prop-r1",
  diagnosisId: "diag-r1",
  summary: "Contain keyboard focus within the active checkout dialog.",
  rationale:
    "Observed evidence shows focus leaving #checkout-modal; containment addresses the escape.",
  evidenceIds: ["ev-focus-escape"],
  targetFiles: ["src/App.tsx"],
  edits: [
    {
      filePath: "src/App.tsx",
      originalText: '<div id="checkout-modal">',
      replacementText: '<div id="checkout-modal" data-focus-trap="true">',
      reason: "Anchors the dialog element that must contain focus.",
    },
  ],
  risks: ["Wrap-around behavior needs replay verification."],
  verificationPlan: ["rebuild project", "replay checkout-modal-keyboard"],
};

function okResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

function completionWith(
  content: string,
  usage?: unknown,
  finishReason = "stop",
): unknown {
  return {
    id: "req-repair-1",
    choices: [
      {
        message: { role: "assistant", content },
        finish_reason: finishReason,
      },
    ],
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

describe("proposeRepairWithMeta (mocked transport)", () => {
  it("sends one constrained repair request with its own operation label", async () => {
    let seenBody = "";
    const { fetchFn } = mockFetch(
      completionWith(JSON.stringify(PROPOSAL), {
        prompt_tokens: 400,
        completion_tokens: 300,
        completion_tokens_details: { reasoning_tokens: 40 },
      }),
      (_url, init) => {
        seenBody = String(init.body);
      },
    );
    const { proposal, usage } = await proposeRepairWithMeta(CONTEXT, {
      fetchFn,
      model: "muse-spark-1.3-contributor",
      apiKey: "test-key",
    });
    assert.equal(proposal.proposalId, "prop-r1");
    // Local Zod shape holds for the wire result too.
    RepairProposalSchema.parse(proposal);
    assert.equal(usage.model, "muse-spark-1.3-contributor");
    assert.equal(usage.operation, "accessibility-repair-proposal");
    assert.equal(usage.inputTokens, 400);
    assert.equal(usage.outputTokens, 300);
    assert.equal(usage.reasoningTokens, 40);
    assert.equal(usage.requestId, "req-repair-1");

    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const format = body["response_format"] as Record<string, unknown>;
    const schema = format["json_schema"] as Record<string, unknown>;
    assert.equal(format["type"], "json_schema");
    assert.equal(schema["name"], "accessibility-repair-proposal");
    assert.equal(schema["strict"], true);
    assert.equal(body["model"], "muse-spark-1.3-contributor");
    assert.equal(body["max_completion_tokens"], 4096);
    assert.equal(body["reasoning_effort"], "low");
    assert.ok(!("max_tokens" in body));
    const messages = body["messages"] as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    assert.ok(String(messages[0]?.["content"]).includes("SMALLEST"));
    assert.ok(String(messages[1]?.["content"]).includes("repair-ctx-"));
  });

  it("rejects unknown evidence IDs without another request", async () => {
    const bad = { ...PROPOSAL, evidenceIds: ["ev-focus-escape", "ev-made-up"] };
    const { fetchFn, calls } = mockFetch(completionWith(JSON.stringify(bad)));
    await assert.rejects(
      () => proposeRepairWithMeta(CONTEXT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => {
        assert.ok(error instanceof UnknownEvidenceReferenceError);
        assert.deepEqual(
          (error as UnknownEvidenceReferenceError).unknownIds,
          ["ev-made-up"],
        );
        return true;
      },
    );
    assert.equal(calls(), 1);
  });

  it("fails on non-JSON content without retrying", async () => {
    const { fetchFn, calls } = mockFetch(completionWith("{{{ not json"));
    await assert.rejects(
      () => proposeRepairWithMeta(CONTEXT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => error instanceof MetaMalformedResultError,
    );
    assert.equal(calls(), 1);
  });

  it("preserves usage with the repair operation on empty content", async () => {
    const { fetchFn, calls } = mockFetch(
      completionWith("", { prompt_tokens: 10, completion_tokens: 5 }),
    );
    await assert.rejects(
      () => proposeRepairWithMeta(CONTEXT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => {
        assert.ok(error instanceof MetaMalformedResultError);
        const usage = (error as MetaMalformedResultError).usage;
        assert.ok(usage !== null);
        assert.equal(usage?.operation, "accessibility-repair-proposal");
        return true;
      },
    );
    assert.equal(calls(), 1);
  });

  it("propagates transport failures with no fabrication", async () => {
    let calls = 0;
    const fetchFn = ((() => {
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve("rate limited"),
      });
    }) as unknown) as MetaFetch;
    await assert.rejects(
      () => proposeRepairWithMeta(CONTEXT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) =>
        error instanceof MetaApiError &&
        (error as MetaApiError).status === 429,
    );
    assert.equal(calls, 1);
  });
});

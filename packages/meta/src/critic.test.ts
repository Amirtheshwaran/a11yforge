import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CriticDecisionSchema,
  type CriticInput,
} from "@a11yforge/shared";
import {
  MetaApiError,
  MetaMalformedResultError,
  type MetaFetch,
} from "./provider.js";
import { critiqueRepairWithMeta } from "./critic.js";
import { CRITIC_DECISION_JSON_SCHEMA } from "./jsonschema.js";

const INPUT: CriticInput = {
  repairId: "repair-checkout-modal-keyboard-001",
  proposalId: "prop-checkout-modal-keyboard-001",
  diagnosisId: "diag-checkout-modal-keyboard-001",
  observedFailure:
    "While #checkout-modal remained open, Tab moved focus to #background-control outside the modal.",
  proposalSummary: "Add minimal focus-trap key handler to #checkout-modal.",
  proposalRationale:
    "Wrapping Tab on the dialog container keeps focus inside the modal.",
  evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
  diff: "--- a/src/App.tsx\n+++ b/src/App.tsx\n+ onKeyDown focus trap",
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

const ACCEPT = {
  decision: "ACCEPT",
  confidence: 0.85,
  summary: "Replayed evidence shows focus now stays inside the modal.",
  evidenceIds: ["ev-focus-escape", "ev-assertion-failed"],
  verificationConcerns: [],
  remainingRisks: ["Shift+Tab wrap verified only by code reading."],
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
    id: "req-critic-1",
    choices: [{ message: { role: "assistant", content } }],
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

describe("critiqueRepairWithMeta (mocked transport)", () => {
  it("sends one constrained critic request with its own operation label", async () => {
    let seenBody = "";
    const { fetchFn, calls } = mockFetch(
      completionWith(JSON.stringify(ACCEPT), {
        prompt_tokens: 500,
        completion_tokens: 120,
        completion_tokens_details: { reasoning_tokens: 20 },
      }),
      (_url, init) => {
        seenBody = String(init.body);
      },
    );
    const { decision, usage } = await critiqueRepairWithMeta(INPUT, {
      fetchFn,
      model: "muse-spark-1.3-contributor",
      apiKey: "test-key",
    });
    assert.equal(calls(), 1);
    assert.equal(decision.decision, "ACCEPT");
    CriticDecisionSchema.parse(decision);
    assert.equal(usage.model, "muse-spark-1.3-contributor");
    assert.equal(usage.operation, "repair-critic-review");
    assert.equal(usage.requestId, "req-critic-1");

    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const format = body["response_format"] as Record<string, unknown>;
    const schema = format["json_schema"] as Record<string, unknown>;
    assert.equal(format["type"], "json_schema");
    assert.equal(schema["name"], "repair-critic-decision");
    assert.equal(schema["strict"], true);
    assert.equal(body["model"], "muse-spark-1.3-contributor");
    assert.equal(body["max_completion_tokens"], 2048);
    assert.equal(body["reasoning_effort"], "low");
    assert.ok(!("max_tokens" in body));
    const messages = body["messages"] as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    assert.ok(
      String(messages[1]?.["content"]).includes(
        "repair-checkout-modal-keyboard-001",
      ),
    );
    // The user message carries measured artifacts, never repository paths.
    assert.ok(!String(messages[1]?.["content"]).includes("node_modules"));
  });

  it("rejects schema-invalid verdicts without another request", async () => {
    const bad = { ...ACCEPT, decision: "MAYBE" };
    const { fetchFn, calls } = mockFetch(completionWith(JSON.stringify(bad)));
    await assert.rejects(
      () => critiqueRepairWithMeta(INPUT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => error instanceof MetaMalformedResultError,
    );
    assert.equal(calls(), 1);
  });

  it("fails on non-JSON content without retrying", async () => {
    const { fetchFn, calls } = mockFetch(completionWith("{{{ not json"));
    await assert.rejects(
      () => critiqueRepairWithMeta(INPUT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => error instanceof MetaMalformedResultError,
    );
    assert.equal(calls(), 1);
  });

  it("propagates transport failures with no fabrication", async () => {
    let calls = 0;
    const fetchFn = ((() => {
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve("unavailable"),
      });
    }) as unknown) as MetaFetch;
    await assert.rejects(
      () => critiqueRepairWithMeta(INPUT, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => error instanceof MetaApiError,
    );
    assert.equal(calls, 1);
  });

  it("wire schema mirrors the shared CriticDecisionSchema", async () => {
    // Every required shared field is required on the wire, and no extra
    // top-level property is permitted on either side.
    const sharedRequired = [
      "decision",
      "confidence",
      "summary",
      "evidenceIds",
      "verificationConcerns",
      "remainingRisks",
    ];
    assert.deepEqual(
      [...(CRITIC_DECISION_JSON_SCHEMA.required as string[])].sort(),
      [...sharedRequired].sort(),
    );
    assert.equal(CRITIC_DECISION_JSON_SCHEMA.additionalProperties, false);
    const wireKeys = Object.keys(CRITIC_DECISION_JSON_SCHEMA.properties);
    assert.deepEqual([...wireKeys].sort(), [...sharedRequired].sort());
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AccessibilityDiagnosisSchema,
  type EvidenceBundle,
} from "@a11yforge/shared";
import {
  MetaApiError,
  MetaMalformedResultError,
  UnknownEvidenceReferenceError,
  diagnoseWithMeta,
  type MetaFetch,
} from "./provider.js";

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

const DIAGNOSIS = {
  diagnosisId: "diag-r1",
  issueType: "focus-containment",
  title: "Focus escapes checkout dialog",
  summary: "Keyboard focus leaves the open checkout modal.",
  severity: "serious",
  confidence: 0.95,
  affectedStrategies: ["keyboard-navigation", "focus-management"],
  evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
  observedFailure:
    "After the third Tab action, focus moved outside the active dialog to #background-control while the dialog remained open.",
  likelyCause: "The active dialog does not constrain keyboard focus.",
  recommendedRepairStrategy:
    "Implement focus containment while the modal is active and restore focus to the triggering control on close.",
  relevantWcagCriteria: ["2.4.3"],
  needsSourceContext: true,
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
    id: "req-test-1",
    choices: [{ message: { role: "assistant", content } }],
    ...(usage !== undefined ? { usage } : {}),
  };
}

function mockFetch(
  payload: unknown,
  onCall?: (url: string, init: RequestInit) => void,
): { fetchFn: MetaFetch; calls: number } {
  const state = { calls: 0 };
  const fetchFn = ((url: string, init: RequestInit) => {
    state.calls += 1;
    onCall?.(url, init);
    return Promise.resolve(okResponse(payload));
  }) as unknown as MetaFetch;
  return { fetchFn, ...state };
}

describe("diagnoseWithMeta (mocked transport)", () => {
  it("sends one constrained request and maps usage without fabrication", async () => {
    let seenUrl = "";
    let seenBody = "";
    let seenAuth = "";
    const { fetchFn } = mockFetch(
      completionWith(JSON.stringify(DIAGNOSIS), {
        prompt_tokens: 120,
        completion_tokens: 200,
        total_tokens: 320,
        prompt_tokens_details: { cached_tokens: 10 },
        completion_tokens_details: { reasoning_tokens: 5 },
      }),
      (url, init) => {
        seenUrl = String(url);
        seenBody = String(init.body);
        seenAuth = String(
          (init.headers as Record<string, string>)["authorization"],
        );
      },
    );
    const { diagnosis, usage } = await diagnoseWithMeta(BUNDLE, {
      fetchFn,
      model: "muse-spark-1.3-contributor",
      apiKey: "test-key",
    });
    assert.equal(diagnosis.title, "Focus escapes checkout dialog");
    assert.equal(usage.model, "muse-spark-1.3-contributor");
    assert.equal(usage.operation, "accessibility-diagnosis");
    assert.equal(usage.inputTokens, 120);
    assert.equal(usage.cachedInputTokens, 10);
    assert.equal(usage.outputTokens, 200);
    assert.equal(usage.reasoningTokens, 5);
    assert.equal(usage.requestId, "req-test-1");
    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const format = body["response_format"] as Record<string, unknown>;
    assert.equal(format["type"], "json_schema");
    assert.equal(body["max_tokens"], 1500);
    assert.ok(seenUrl.endsWith("/chat/completions"));
    assert.equal(seenAuth, "Bearer test-key");
  });

  it("leaves absent usage fields null instead of fabricating them", async () => {
    const { fetchFn } = mockFetch(completionWith(JSON.stringify(DIAGNOSIS)));
    const { usage } = await diagnoseWithMeta(BUNDLE, {
      fetchFn,
      model: "m",
      apiKey: "k",
    });
    assert.equal(usage.inputTokens, null);
    assert.equal(usage.cachedInputTokens, null);
    assert.equal(usage.outputTokens, null);
    assert.equal(usage.reasoningTokens, null);
    assert.equal(usage.requestId, "req-test-1");
  });

  it("rejects unknown evidence IDs without another request", async () => {
    const bad = {
      ...DIAGNOSIS,
      evidenceIds: ["ev-focus-escape", "ev-invented"],
    };
    let calls = 0;
    const fetchFn = (() => {
      calls += 1;
      return Promise.resolve(
        okResponse(completionWith(JSON.stringify(bad))),
      );
    }) as unknown as MetaFetch;
    await assert.rejects(
      () => diagnoseWithMeta(BUNDLE, { fetchFn, model: "m", apiKey: "k" }),
      (error: unknown) => {
        assert.ok(error instanceof UnknownEvidenceReferenceError);
        assert.deepEqual(
          (error as UnknownEvidenceReferenceError).unknownIds,
          ["ev-invented"],
        );
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it("fails on non-JSON content without retrying", async () => {
    let calls = 0;
    const fetchFn = (() => {
      calls += 1;
      return Promise.resolve(okResponse(completionWith("not json {")));
    }) as unknown as MetaFetch;
    await assert.rejects(
      () => diagnoseWithMeta(BUNDLE, { fetchFn, model: "m", apiKey: "k" }),
      MetaMalformedResultError,
    );
    assert.equal(calls, 1);
  });

  it("fails on schema violations (e.g. confidence out of bounds)", async () => {
    let calls = 0;
    const bad = { ...DIAGNOSIS, confidence: 1.5 };
    const fetchFn = (() => {
      calls += 1;
      return Promise.resolve(
        okResponse(completionWith(JSON.stringify(bad))),
      );
    }) as unknown as MetaFetch;
    await assert.rejects(
      () => diagnoseWithMeta(BUNDLE, { fetchFn, model: "m", apiKey: "k" }),
      MetaMalformedResultError,
    );
    assert.equal(calls, 1);
  });

  it("fails on empty message content", async () => {
    const fetchFn = (() =>
      Promise.resolve(
        okResponse(completionWith("   ")),
      )) as unknown as MetaFetch;
    await assert.rejects(
      () => diagnoseWithMeta(BUNDLE, { fetchFn, model: "m", apiKey: "k" }),
      MetaMalformedResultError,
    );
  });

  it("propagates API errors with the status attached", async () => {
    const fetchFn = (() =>
      Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve("rate limited"),
      })) as unknown as MetaFetch;
    const error = await diagnoseWithMeta(BUNDLE, {
      fetchFn,
      model: "m",
      apiKey: "k",
    }).catch((e: unknown) => e);
    assert.ok(error instanceof MetaApiError);
    assert.equal((error as MetaApiError).status, 429);
  });

  it("reports transport failures without a status", async () => {
    const fetchFn = (() =>
      Promise.reject(new Error("socket hang up"))) as unknown as MetaFetch;
    const error = await diagnoseWithMeta(BUNDLE, {
      fetchFn,
      model: "m",
      apiKey: "k",
    }).catch((e: unknown) => e);
    assert.ok(error instanceof MetaApiError);
    assert.equal((error as MetaApiError).status, null);
  });
});

describe("diagnosis confidence bounds", () => {
  it("accepts 0 and 1 but rejects outside", () => {
    assert.ok(
      AccessibilityDiagnosisSchema.safeParse({ ...DIAGNOSIS, confidence: 0 })
        .success,
    );
    assert.ok(
      AccessibilityDiagnosisSchema.safeParse({ ...DIAGNOSIS, confidence: 1 })
        .success,
    );
    assert.ok(
      !AccessibilityDiagnosisSchema.safeParse({ ...DIAGNOSIS, confidence: -0.1 })
        .success,
    );
    assert.ok(
      !AccessibilityDiagnosisSchema.safeParse({ ...DIAGNOSIS, confidence: 1.1 })
        .success,
    );
  });
});

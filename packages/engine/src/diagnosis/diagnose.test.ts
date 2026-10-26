import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MetaFetch } from "@a11yforge/meta";
import { runDiagnoseFixture } from "./diagnose.js";

const OBSERVATIONS = [
  ["#checkout-modal-close", true, "modal-open", null],
  ["#checkout-modal-email", true, "press", "Tab"],
  ["#checkout-modal-continue", true, "press", "Tab"],
  ["#background-control", false, "press", "Tab"],
] as const;

function scenarioJson(runId: string): string {
  return JSON.stringify({
    runId,
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: OBSERVATIONS.map(([selector, insideModal, action, key], seq) => ({
      seq,
      action,
      key,
      timestamp: `2026-10-26T00:00:0${seq}.000Z`,
      pageUrl: "http://127.0.0.1:3002/",
      selector,
      tagName: "button",
      role: "button",
      accessibleName: selector,
      text: selector,
      tabIndex: 0,
      disabled: false,
      ariaHidden: false,
      insideModal,
    })),
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed: false,
        step: 3,
        pressedKey: "Tab",
        expectedRegion: "#checkout-modal",
        actualFocus: "#background-control",
        actualHtml:
          '<a id="background-control" href="#shipping-info">Shipping info</a>',
      },
    ],
    screenshots: [],
    events: [],
  });
}

function diagnosisJson(): string {
  return JSON.stringify({
    diagnosisId: "diag-test",
    issueType: "focus-containment",
    title: "Focus escapes checkout dialog",
    summary: "Keyboard focus leaves the open checkout modal.",
    severity: "serious",
    confidence: 0.95,
    affectedStrategies: ["keyboard-navigation"],
    evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
    observedFailure:
      "After the third Tab action, focus moved to #background-control while the dialog remained open.",
    likelyCause: "The active dialog does not constrain keyboard focus.",
    recommendedRepairStrategy:
      "Implement focus containment while the modal is active.",
    relevantWcagCriteria: ["2.4.3"],
    needsSourceContext: true,
  });
}

async function seedRun(runsDir: string, runId: string): Promise<string> {
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "scenario.json"), scenarioJson(runId));
  return runDir;
}

function mockFetch(content: string): { fetchFn: MetaFetch; calls: () => number } {
  let calls = 0;
  const fetchFn = (() => {
    calls += 1;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "req-mock-1",
          choices: [{ message: { role: "assistant", content } }],
          usage: { prompt_tokens: 50, completion_tokens: 60 },
        }),
      text: () => Promise.resolve("{}"),
    });
  }) as unknown as MetaFetch;
  return { fetchFn, calls: () => calls };
}

function freshRunsDir(tag: string): string {
  return join(
    tmpdir(),
    `a11yforge-diag-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
}

describe("runDiagnoseFixture (mocked model)", () => {
  it("persists diagnosis + usage artifacts with exactly one model call", async () => {
    const runsDir = freshRunsDir("ok");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    await seedRun(runsDir, runId);
    const { fetchFn, calls } = mockFetch(diagnosisJson());
    const result = await runDiagnoseFixture({
      env: { MODEL_API_KEY: "test-key" },
      fetchFn,
      runsDir,
    });
    assert.equal(calls(), 1);
    assert.equal(result.runId, runId);
    assert.equal(result.model, "muse-spark-1.3-contributor");
    assert.equal(result.diagnosis.issueType, "focus-containment");
    const diagnosisRaw = await readFile(result.diagnosisPath, "utf8");
    assert.equal(
      (JSON.parse(diagnosisRaw) as { diagnosisId: string }).diagnosisId,
      "diag-test",
    );
    const usageRaw = await readFile(result.usagePath, "utf8");
    assert.equal(
      (JSON.parse(usageRaw) as { operation: string }).operation,
      "accessibility-diagnosis",
    );
  });

  it("fails before any request when MODEL_API_KEY is missing", async () => {
    const runsDir = freshRunsDir("nokey");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    const { fetchFn, calls } = mockFetch(diagnosisJson());
    await assert.rejects(
      () => runDiagnoseFixture({ env: {}, fetchFn, runsDir }),
      /MODEL_API_KEY/,
    );
    assert.equal(calls(), 0);
  });

  it("fails without persisting when the model cites unknown evidence", async () => {
    const runsDir = freshRunsDir("badev");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    const runDir = await seedRun(runsDir, runId);
    const bad = JSON.stringify({
      ...JSON.parse(diagnosisJson()),
      evidenceIds: ["ev-nope"],
    });
    const { fetchFn, calls } = mockFetch(bad);
    await assert.rejects(
      () =>
        runDiagnoseFixture({ env: { MODEL_API_KEY: "k" }, fetchFn, runsDir }),
      /unknown evidence/,
    );
    assert.equal(calls(), 1);
    await assert.rejects(() => readFile(join(runDir, "diagnosis.json"), "utf8"));
  });

  it("fails on malformed model output without a second request", async () => {
    const runsDir = freshRunsDir("malformed");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    const { fetchFn, calls } = mockFetch("{{{ not json");
    await assert.rejects(
      () =>
        runDiagnoseFixture({ env: { MODEL_API_KEY: "k" }, fetchFn, runsDir }),
      /not valid JSON/,
    );
    assert.equal(calls(), 1);
  });

  it("preserves usage but no diagnosis when the model returns empty content", async () => {
    const runsDir = freshRunsDir("emptycontent");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    const runDir = await seedRun(runsDir, runId);
    let calls = 0;
    const fetchFn = (() => {
      calls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "req-length-fixture",
            choices: [
              {
                message: { role: "assistant", content: "" },
                finish_reason: "length",
              },
            ],
            usage: {
              prompt_tokens: 812,
              completion_tokens: 4096,
              total_tokens: 4908,
              completion_tokens_details: { reasoning_tokens: 4050 },
            },
          }),
        text: () => Promise.resolve("{}"),
      });
    }) as unknown as MetaFetch;
    await assert.rejects(
      () =>
        runDiagnoseFixture({ env: { MODEL_API_KEY: "k" }, fetchFn, runsDir }),
      /exhausted the completion-token budget/,
    );
    assert.equal(calls, 1);
    // Credits were consumed: the usage artifact is preserved in the
    // existing usage structure, but no diagnosis is fabricated.
    const usageRaw = await readFile(join(runDir, "model-usage.json"), "utf8");
    const usage = JSON.parse(usageRaw) as {
      operation: string;
      reasoningTokens: number;
      requestId: string;
    };
    assert.equal(usage.operation, "accessibility-diagnosis");
    assert.equal(usage.reasoningTokens, 4050);
    assert.equal(usage.requestId, "req-length-fixture");
    await assert.rejects(() => readFile(join(runDir, "diagnosis.json"), "utf8"));
  });
});

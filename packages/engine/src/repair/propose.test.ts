import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MetaFetch } from "@a11yforge/meta";
import { runTraceFixture, SourceTraceResultSchema } from "../trace/trace.js";
import { runProposeFixture } from "./propose.js";

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
    diagnosisId: "diag-prop-test",
    issueType: "focus-containment",
    title: "Focus escapes open checkout modal",
    summary: "Keyboard focus leaves the open checkout modal.",
    severity: "serious",
    confidence: 0.95,
    affectedStrategies: ["keyboard-navigation"],
    evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
    observedFailure:
      "While #checkout-modal remained open, Tab moved focus to #background-control outside the modal.",
    likelyCause: "The active modal does not constrain keyboard focus.",
    recommendedRepairStrategy:
      "Implement focus containment while the modal is active.",
    relevantWcagCriteria: ["2.4.3"],
    needsSourceContext: true,
  });
}

const MODAL_SOURCE = [
  "export function App() {",
  "  return (",
  '    <div role="dialog" id="checkout-modal">',
  '      <button id="checkout-modal-close">Close</button>',
  '      <input id="checkout-modal-email" />',
  '      <button id="checkout-modal-continue">Continue</button>',
  "    </div>",
  "  );",
  "}",
  '<a id="background-control" href="#s">info</a>',
].join("\n");

function freshDir(tag: string): string {
  return join(
    tmpdir(),
    `a11yforge-propose-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
}

async function seedRun(runsDir: string, runId: string): Promise<string> {
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "scenario.json"), scenarioJson(runId));
  await writeFile(join(runDir, "diagnosis.json"), diagnosisJson());
  return runDir;
}

async function seedSource(root: string, modal: boolean): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src", "App.tsx"),
    modal ? MODAL_SOURCE : "export const x = 1;\n",
  );
}

function completionWith(content: string, usage?: unknown): unknown {
  return {
    id: "req-prop-1",
    choices: [{ message: { role: "assistant", content } }],
    ...(usage !== undefined ? { usage } : {}),
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

/** Proposal JSON anchored in the seeded trace's own snippets (guaranteed). */
async function groundedProposalJson(runDir: string): Promise<string> {
  const trace = SourceTraceResultSchema.parse(
    JSON.parse(await readFile(join(runDir, "source-trace.json"), "utf8")),
  );
  const snippet = trace.selectedContext[0];
  assert.ok(snippet !== undefined);
  const anchorLine = snippet.content
    .split("\n")
    .find((line) => line.includes("checkout-modal"));
  assert.ok(anchorLine !== undefined && anchorLine.trim() !== "");
  return JSON.stringify({
    proposalId: "prop-test-1",
    diagnosisId: "diag-prop-test",
    summary: "Contain keyboard focus within the active checkout dialog.",
    rationale:
      "Observed evidence shows focus leaving #checkout-modal; containment addresses the escape.",
    evidenceIds: ["ev-focus-escape"],
    targetFiles: [snippet.filePath],
    edits: [
      {
        filePath: snippet.filePath,
        originalText: anchorLine,
        replacementText: `${anchorLine}\n{/* proposed focus trap */}`,
        reason: "Anchors the dialog element that must contain focus.",
      },
    ],
    risks: ["Wrap-around behavior needs replay verification."],
    verificationPlan: [
      "rebuild project",
      "replay checkout-modal-keyboard",
      "verify focus-contained-in-modal passes",
    ],
  });
}

describe("runProposeFixture (mocked model)", () => {
  it("persists proposal + usage with exactly one model call", async () => {
    const runsDir = freshDir("ok");
    const sourceRoot = freshDir("oksrc");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    const runDir = await seedRun(runsDir, runId);
    await seedSource(sourceRoot, true);
    await runTraceFixture({ runsDir, sourceRoot });

    let seenBody = "";
    const { fetchFn, calls } = mockFetch(
      completionWith(await groundedProposalJson(runDir)),
      (_url, init) => {
        seenBody = String(init.body);
      },
    );
    const result = await runProposeFixture({
      env: { MODEL_API_KEY: "test-key" },
      fetchFn,
      runsDir,
      sourceRoot,
    });
    assert.equal(calls(), 1);
    assert.equal(result.runId, runId);
    assert.equal(result.model, "muse-spark-1.3-contributor");
    assert.equal(result.maxModelCalls, 1);
    assert.equal(result.proposal.proposalId, "prop-test-1");

    const body = JSON.parse(seenBody) as Record<string, unknown>;
    const format = body["response_format"] as Record<string, unknown>;
    const schema = format["json_schema"] as Record<string, unknown>;
    assert.equal(format["type"], "json_schema");
    assert.equal(schema["name"], "accessibility-repair-proposal");
    assert.equal(body["max_completion_tokens"], 4096);
    assert.equal(body["reasoning_effort"], "low");
    assert.ok(!("max_tokens" in body));
    const messages = body["messages"] as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    assert.ok(String(messages[1]?.["content"]).includes("repair-ctx-"));

    const proposalRaw = await readFile(result.proposalPath, "utf8");
    assert.equal(
      (JSON.parse(proposalRaw) as { proposalId: string }).proposalId,
      "prop-test-1",
    );
    const usageRaw = await readFile(result.usagePath, "utf8");
    const usage = JSON.parse(usageRaw) as {
      operation: string;
      requestId: string;
    };
    assert.equal(usage.operation, "accessibility-repair-proposal");
    assert.equal(usage.requestId, "req-prop-1");
  });

  it("fails before any request when MODEL_API_KEY is missing", async () => {
    const runsDir = freshDir("nokey");
    const sourceRoot = freshDir("nokeysrc");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    await seedSource(sourceRoot, true);
    await runTraceFixture({ runsDir, sourceRoot });
    const { fetchFn, calls } = mockFetch(completionWith("{}"));
    await assert.rejects(
      () => runProposeFixture({ env: {}, fetchFn, runsDir, sourceRoot }),
      /MODEL_API_KEY/,
    );
    assert.equal(calls(), 0);
  });

  it("refuses an insufficient trace without spending a call", async () => {
    const runsDir = freshDir("weak");
    const sourceRoot = freshDir("weaksrc");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    await seedSource(sourceRoot, false);
    const traced = await runTraceFixture({ runsDir, sourceRoot });
    assert.ok(!traced.sufficient);
    const { fetchFn, calls } = mockFetch(completionWith("{}"));
    await assert.rejects(
      () =>
        runProposeFixture({
          env: { MODEL_API_KEY: "k" },
          fetchFn,
          runsDir,
          sourceRoot,
        }),
      /INSUFFICIENT/,
    );
    assert.equal(calls(), 0);
  });

  it("fails without persisting when the model cites unknown evidence", async () => {
    const runsDir = freshDir("badev");
    const sourceRoot = freshDir("badevsrc");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    const runDir = await seedRun(runsDir, runId);
    await seedSource(sourceRoot, true);
    await runTraceFixture({ runsDir, sourceRoot });
    const bad = JSON.stringify({
      ...JSON.parse(await groundedProposalJson(runDir)),
      evidenceIds: ["ev-nope"],
    });
    const { fetchFn, calls } = mockFetch(completionWith(bad));
    await assert.rejects(
      () =>
        runProposeFixture({
          env: { MODEL_API_KEY: "k" },
          fetchFn,
          runsDir,
          sourceRoot,
        }),
      /unknown evidence/,
    );
    assert.equal(calls(), 1);
    await assert.rejects(() =>
      readFile(join(runDir, "repair-proposal.json"), "utf8"),
    );
  });

  it("preserves usage but no proposal on malformed model output", async () => {
    const runsDir = freshDir("malformed");
    const sourceRoot = freshDir("malformedsrc");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    const runDir = await seedRun(runsDir, runId);
    await seedSource(sourceRoot, true);
    await runTraceFixture({ runsDir, sourceRoot });
    const { fetchFn, calls } = mockFetch(completionWith("{{{ not json"));
    await assert.rejects(
      () =>
        runProposeFixture({
          env: { MODEL_API_KEY: "k" },
          fetchFn,
          runsDir,
          sourceRoot,
        }),
      /not valid JSON/,
    );
    assert.equal(calls(), 1);
    // Unparseable content carries no usable telemetry: neither artifact
    // is fabricated.
    await assert.rejects(() =>
      readFile(join(runDir, "repair-proposal.json"), "utf8"),
    );
    await assert.rejects(() =>
      readFile(join(runDir, "repair-model-usage.json"), "utf8"),
    );
  });
});
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSourceTrace,
  findLatestDiagnosedRun,
  formatTraceSummary,
  isTraceSufficient,
  MAX_TOTAL_CONTEXT_CHARS,
  runTraceFixture,
  SourceTraceResultSchema,
} from "./trace.js";

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
      tagName: selector.startsWith("#background") ? "a" : "button",
      role: selector.startsWith("#background") ? "link" : "button",
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
    diagnosisId: "diag-trace-test",
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
    `a11yforge-trace-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
}

async function seedRun(runsDir: string, runId: string): Promise<string> {
  const runDir = join(runsDir, runId);
  await mkdir(join(runDir, "src"), { recursive: true });
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

describe("deterministic source trace", () => {
  it("selects the latest diagnosed run and skips scan-only runs", async () => {
    const runsDir = freshDir("select");
    await mkdir(join(runsDir, "2026-01-01T00-00-00-000Z-aaaa"), {
      recursive: true,
    });
    await writeFile(
      join(runsDir, "2026-01-01T00-00-00-000Z-aaaa", "scan.json"),
      "{}",
    );
    await seedRun(runsDir, "2026-01-02T00-00-00-000Z-bbbb");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    const selection = await findLatestDiagnosedRun(runsDir);
    assert.equal(selection.runId, "2026-01-03T00-00-00-000Z-cccc");
    assert.equal(selection.diagnosis.diagnosisId, "diag-trace-test");
  });

  it("builds a sufficient trace over a modal source tree", async () => {
    const runsDir = freshDir("build");
    const sourceRoot = freshDir("src");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    await seedSource(sourceRoot, true);
    const selection = await findLatestDiagnosedRun(runsDir);
    const trace = await buildSourceTrace({
      diagnosis: selection.diagnosis,
      result: selection.result,
      sourceRoot,
    });
    assert.equal(trace.diagnosisId, "diag-trace-test");
    assert.ok(trace.searchTerms.includes("checkout-modal"));
    assert.equal(trace.candidates[0]?.filePath, "src/App.tsx");
    assert.ok(trace.selectedContext.length > 0);
    assert.ok(isTraceSufficient(trace));
    const totalChars = trace.selectedContext.reduce(
      (sum, snippet) => sum + snippet.content.length,
      0,
    );
    assert.ok(totalChars <= MAX_TOTAL_CONTEXT_CHARS);
  });

  it("marks an unmatched tree INSUFFICIENT so no model call is authorized", async () => {
    const runsDir = freshDir("weak");
    const sourceRoot = freshDir("weaksrc");
    await seedRun(runsDir, "2026-01-03T00-00-00-000Z-cccc");
    await seedSource(sourceRoot, false);
    const selection = await findLatestDiagnosedRun(runsDir);
    const trace = await buildSourceTrace({
      diagnosis: selection.diagnosis,
      result: selection.result,
      sourceRoot,
    });
    assert.equal(trace.candidates.length, 0);
    assert.ok(!isTraceSufficient(trace));
  });

  it("persists source-trace.json with zero model calls or keys", async () => {
    const runsDir = freshDir("persist");
    const sourceRoot = freshDir("persistsrc");
    const runId = "2026-01-03T00-00-00-000Z-cccc";
    await seedRun(runsDir, runId);
    await seedSource(sourceRoot, true);
    // The trace deps carry no env/fetch/key by design: the free path
    // cannot consume credentials even when the caller holds them.
    const result = await runTraceFixture({ runsDir, sourceRoot });
    assert.equal(result.runId, runId);
    assert.ok(result.sufficient);
    const raw = await readFile(result.tracePath, "utf8");
    const parsed = SourceTraceResultSchema.parse(JSON.parse(raw) as unknown);
    assert.equal(parsed.traceId, `trace-${runId}`);
    const summary = formatTraceSummary(parsed, runId, result.tracePath);
    assert.ok(summary.includes("A11yForge Source Trace"));
    assert.ok(summary.includes("checkout-modal"));
    assert.ok(summary.includes("src/App.tsx"));
  });
});

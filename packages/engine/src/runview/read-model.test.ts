import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  containsNoSecrets,
  isAllowedArtifactName,
  toDisplayPath,
} from "@a11yforge/shared";
import {
  buildRunViewModel,
  findDemoRunId,
  listRunSummaries,
  resolveRunDir,
  RunArtifactError,
  type ArtifactUrlFor,
} from "./read-model.js";

const urlFor: ArtifactUrlFor = (runId, name) => `/runs/${runId}/artifacts/${name}`;

function observation(seq: number, selector: string, insideModal: boolean) {
  return {
    seq,
    action: seq === 0 ? "modal-open" : "press",
    key: seq === 0 ? null : "Tab",
    timestamp: "2026-10-26T17:40:56.471Z",
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
  };
}

function scenarioJson(runId: string) {
  return {
    runId,
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002",
    startedAt: "2026-10-26T17:40:56.287Z",
    completedAt: "2026-10-26T17:40:56.527Z",
    observations: [
      observation(0, "#checkout-modal-close", true),
      observation(1, "#checkout-modal-email", true),
      observation(2, "#checkout-modal-continue", true),
      observation(3, "#background-control", false),
    ],
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed: false,
        step: 3,
        pressedKey: "Tab",
        expectedRegion: "#checkout-modal",
        actualFocus: "#background-control",
        actualHtml: "<a id=\"background-control\">x</a>",
      },
    ],
    screenshots: [],
    events: [],
  };
}

const diagnosisJson = {
  diagnosisId: "diag-1",
  issueType: "focus-containment",
  title: "Focus escapes open checkout modal",
  summary: "Focus escaped the open modal.",
  severity: "serious",
  confidence: 0.95,
  affectedStrategies: ["keyboard-navigation"],
  evidenceIds: ["ev-modal-open", "ev-focus-escape", "ev-assertion-failed"],
  observedFailure: "Tab moved focus outside the open modal.",
  likelyCause: "No focus trap in the dialog.",
  recommendedRepairStrategy: "Cycle Tab within the dialog.",
  relevantWcagCriteria: ["2.4.3 Focus Order"],
  needsSourceContext: true,
};

const traceJson = {
  traceId: "trace-1",
  diagnosisId: "diag-1",
  sourceRoot: "/home/user/work/a11yforge/fixtures/broken-shop",
  searchTerms: ["checkout-modal", "background-control"],
  candidates: [
    {
      filePath: "src/App.tsx",
      score: 915,
      matchedTerms: ["checkout-modal", "background-control"],
      matchCount: 23,
      snippets: [],
    },
  ],
  selectedContext: [
    {
      filePath: "src/App.tsx",
      startLine: 117,
      endLine: 187,
      content: "snippet",
      matchedTerms: ["checkout-modal"],
    },
  ],
};

const proposalJson = {
  proposalId: "prop-001",
  diagnosisId: "diag-1",
  summary: "Add focus-trap key handler.",
  rationale: "Wrap Tab within the dialog.",
  evidenceIds: ["ev-modal-open"],
  targetFiles: ["src/App.tsx"],
  edits: [
    {
      filePath: "src/App.tsx",
      originalText: "anchor",
      replacementText: "anchor+handler",
      reason: "wrap",
    },
  ],
  risks: [],
  verificationPlan: ["replay"],
};

function lifecycleJson(repairId: string, state: string) {
  return {
    repairId,
    proposalId: "prop-001",
    state,
    transitions: [],
  };
}

function verificationJson(decisionBasis: string, buildPassed = true) {
  return {
    repairId: "repair-001",
    proposalId: "prop-001",
    buildPassed,
    buildCommand: "vite build",
    buildExitCode: 0,
    buildDurationMs: 500,
    originalAssertion: { passed: false, actualFocus: "#background-control" },
    repairedAssertion: { passed: true, actualFocus: "#checkout-modal-email" },
    scenarioPassed: true,
    baselineAxeRules: ["button-name", "label"],
    repairedAxeRules: ["button-name", "label"],
    newAxeViolations: [],
    removedBaselineRules: [],
    newSeriousCritical: [],
    resolvedTargetFailure: true,
    regressions: [],
    diffArtifact: "repair-diff.patch",
    evidenceArtifacts: [],
    decisionBasis,
  };
}

async function writeRun(
  runsDir: string,
  runId: string,
  files: Record<string, unknown>,
): Promise<string> {
  const dir = join(runsDir, runId);
  await mkdir(dir, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    await writeFile(join(dir, name), JSON.stringify(value));
  }
  return dir;
}

describe("read-model path handling", () => {
  it("rejects traversal run ids without touching the filesystem", () => {
    for (const bad of ["..", "../x", "a/b", "", ".a11yforge"]) {
      assert.throws(() => resolveRunDir("/tmp/runs", bad), RunArtifactError);
    }
  });

  it("strips absolute source roots to repo-relative display paths", () => {
    assert.equal(
      toDisplayPath("/home/user/work/a11yforge/fixtures/broken-shop/src/App.tsx"),
      "fixtures/broken-shop/src/App.tsx",
    );
    assert.equal(toDisplayPath("src/App.tsx"), "src/App.tsx");
    assert.ok(!toDisplayPath("/home/user/work/a11yforge/fixtures/broken-shop").startsWith("/"));
  });

  it("restricts artifact names to known safe files", () => {
    assert.ok(isAllowedArtifactName("focus-escaped.png"));
    assert.ok(isAllowedArtifactName("scenario.json"));
    assert.ok(isAllowedArtifactName("repair-revision-diff.patch"));
    assert.ok(!isAllowedArtifactName("../scenario.json"));
    assert.ok(!isAllowedArtifactName("a/b.png"));
    assert.ok(!isAllowedArtifactName("MODEL_API_KEY.json"));
    assert.ok(!isAllowedArtifactName("repair-diff.patch.exe"));
    assert.ok(!isAllowedArtifactName(".env"));
  });

  it("detects secret-shaped payloads fail-closed", () => {
    assert.ok(containsNoSecrets({ decision: "ACCEPT", confidence: 0.82 }));
    assert.ok(!containsNoSecrets({ MODEL_API_KEY: "sk-live-value" }));
  });
});

describe("read-model view construction", () => {
  it("builds a sanitized view from attempt-1-only artifacts", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "runs-"));
    try {
      const runId = "2026-10-26T17-40-55-727Z-7c0d4f";
      await writeRun(runsDir, runId, {
        "scenario.json": scenarioJson(runId),
        "diagnosis.json": diagnosisJson,
        "source-trace.json": traceJson,
        "repair-proposal.json": proposalJson,
        "repair-lifecycle.json": lifecycleJson("repair-001", "REGRESSION_FAILED"),
        "repair-verification.json": verificationJson(
          "deterministic gate failed: fixture typecheck failed: tsc exited 2: src/App.tsx(150,21): error TS18048",
        ),
      });
      const view = await buildRunViewModel(runsDir, runId, urlFor);
      assert.equal(view.runId, runId);
      assert.equal(view.targetLabel, "Broken Shop / checkout flow");
      assert.equal(view.sourceFile, "src/App.tsx");
      assert.equal(view.finalStatus, "REGRESSION_FAILED");
      assert.equal(view.attempts.length, 1);
      assert.equal(view.attempts[0]?.state, "REGRESSION_FAILED");
      assert.deepEqual(view.attempts[0]?.diagnosticCodes, ["TS18048"]);
      assert.equal(view.critic, null);
      assert.ok(view.focusTrace.some((s) => s.selector === "#background-control" && !s.insideModal));
      assert.ok(!JSON.stringify(view).includes("/home/user"));
      assert.ok(containsNoSecrets(view));
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it("prefers the accepted revision and critic when present", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "runs-"));
    try {
      const runId = "2026-10-26T17-40-55-727Z-7c0d4f";
      await writeRun(runsDir, runId, {
        "scenario.json": scenarioJson(runId),
        "diagnosis.json": diagnosisJson,
        "source-trace.json": traceJson,
        "repair-proposal.json": proposalJson,
        "repair-lifecycle.json": lifecycleJson("repair-001", "REGRESSION_FAILED"),
        "repair-verification.json": verificationJson("typecheck failed: TS18048"),
        "repair-revision-proposal.json": { ...proposalJson, proposalId: "prop-002" },
        "repair-revision-lifecycle.json": lifecycleJson("repair-002", "ACCEPTED"),
        "repair-revision-verification.json": verificationJson(
          "deterministic gate passed: typecheck clean, build passed, same scenario replayed, reverse Shift+Tab traversal contained, axe baseline preserved",
        ),
        "critic-decision.json": {
          decision: "ACCEPT",
          confidence: 0.82,
          summary: "After focus is inside the modal.",
          evidenceIds: ["ev-assertion-failed"],
          verificationConcerns: [],
          remainingRisks: ["Escape path not tested"],
        },
      });
      const view = await buildRunViewModel(runsDir, runId, urlFor);
      assert.equal(view.finalStatus, "ACCEPTED");
      assert.equal(view.attempts.length, 2);
      assert.equal(view.attempts[1]?.state, "ACCEPTED");
      assert.equal(view.verification.reverseReplayPassed, true);
      assert.equal(view.critic?.decision, "ACCEPT");
      assert.equal(view.finalConfidence, 0.82);
      assert.ok(view.pipeline.some((p) => p.id === "attempt-1" && p.status === "failed"));
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it("reports missing artifacts instead of inventing data", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "runs-"));
    try {
      const runId = "2026-10-26T17-40-55-727Z-7c0d4f";
      await writeRun(runsDir, runId, { "scenario.json": scenarioJson(runId) });
      await assert.rejects(
        buildRunViewModel(runsDir, runId, urlFor),
        (e: unknown) => e instanceof RunArtifactError && e.code === "ARTIFACT_MISSING",
      );
      await assert.rejects(
        buildRunViewModel(runsDir, "no-such-run", urlFor),
        (e: unknown) => e instanceof RunArtifactError && e.code === "RUN_NOT_FOUND",
      );
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });

  it("lists summaries newest-first and selects the accepted demo run", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "runs-"));
    try {
      const oldId = "2026-10-26T17-00-00-000Z-aaaaaa";
      const newId = "2026-10-26T18-00-00-000Z-bbbbbb";
      await writeRun(runsDir, oldId, { "scenario.json": scenarioJson(oldId) });
      await writeRun(runsDir, newId, {
        "scenario.json": scenarioJson(newId),
        "repair-lifecycle.json": lifecycleJson("repair-002", "ACCEPTED"),
        "repair-revision-lifecycle.json": lifecycleJson("repair-002", "ACCEPTED"),
      });
      await writeFile(join(runsDir, "scan-only.json"), "{}");
      const summaries = await listRunSummaries(runsDir);
      assert.equal(summaries.length, 2);
      assert.equal(summaries[0]?.runId, newId);
      assert.equal(await findDemoRunId(runsDir), newId);
      assert.equal(await findDemoRunId(join(runsDir, "missing")), null);
    } finally {
      await rm(runsDir, { recursive: true, force: true });
    }
  });
});

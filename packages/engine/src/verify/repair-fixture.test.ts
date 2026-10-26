import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccessibilityScanResult,
  CriticDecision,
  CriticInput,
  KeyboardScenarioResult,
} from "@a11yforge/shared";
import { runTraceFixture, SourceTraceResultSchema } from "../trace/trace.js";
import {
  runRepairFixture,
  type RepairDrivers,
} from "./repair-fixture.js";

const OBSERVATIONS = [
  ["#checkout-modal-close", true, "modal-open", null],
  ["#checkout-modal-email", true, "press", "Tab"],
  ["#checkout-modal-continue", true, "press", "Tab"],
  ["#background-control", false, "press", "Tab"],
] as const;

function scenarioJson(runId: string, passed: boolean): string {
  const actualFocus = passed ? "#checkout-modal-continue" : "#background-control";
  const inside = (seq: number): boolean => passed || seq < 3;
  return JSON.stringify({
    runId,
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    observations: OBSERVATIONS.map(([selector, , action, key], seq) => ({
      seq,
      action,
      key,
      timestamp: `2026-10-26T00:00:0${seq}.000Z`,
      pageUrl: "http://127.0.0.1:3002/",
      selector: passed && seq === 3 ? "#checkout-modal-close" : selector,
      tagName: "button",
      role: "button",
      accessibleName: selector,
      text: selector,
      tabIndex: 0,
      disabled: false,
      ariaHidden: false,
      insideModal: inside(seq),
    })),
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed,
        step: passed ? 10 : 3,
        pressedKey: "Tab",
        expectedRegion: "#checkout-modal",
        actualFocus,
        actualHtml: `<a id="${actualFocus.replace("#", "")}"></a>`,
      },
    ],
    screenshots: [],
    events: [],
  });
}

function diagnosisJson(): string {
  return JSON.stringify({
    diagnosisId: "diag-repair-test",
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

function scanJson(
  extra: Array<{ rule: string; impact: "critical" | "serious" | "moderate" }> = [],
): AccessibilityScanResult {
  const rules = [
    { rule: "button-name", impact: "critical" as const },
    { rule: "image-alt", impact: "critical" as const },
    { rule: "label", impact: "critical" as const },
    { rule: "color-contrast", impact: "serious" as const },
    ...extra,
  ];
  return {
    scanId: "scan-repair-test",
    pageUrl: "http://127.0.0.1:3002/",
    startedAt: "2026-10-26T00:00:00.000Z",
    completedAt: "2026-10-26T00:00:01.000Z",
    findings: rules.map(({ rule, impact }, index) => ({
      id: `${rule}#${index}`,
      ruleId: rule,
      impact,
      description: rule,
      help: rule,
      helpUrl: "https://example.test",
      pageUrl: "http://127.0.0.1:3002/",
      selector: `#node-${index}`,
      html: "<div></div>",
      failureSummary: "failed",
    })),
  };
}

function freshDir(tag: string): string {
  return join(
    tmpdir(),
    `a11yforge-repair-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
}

async function seedRun(runsDir: string, runId: string): Promise<string> {
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "scenario.json"), scenarioJson(runId, false));
  await writeFile(join(runDir, "diagnosis.json"), diagnosisJson());
  return runDir;
}

async function seedFixture(root: string): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "public"), { recursive: true });
  await writeFile(join(root, "src", "App.tsx"), `${MODAL_SOURCE}\n`);
  await writeFile(join(root, "index.html"), "<html></html>\n");
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "vite.config.ts"), "export default {};\n");
  await writeFile(join(root, "tsconfig.json"), "{}\n");
}

async function seedProposal(runDir: string, originalText?: string): Promise<void> {
  const trace = SourceTraceResultSchema.parse(
    JSON.parse(await readFile(join(runDir, "source-trace.json"), "utf8")),
  );
  const snippet = trace.selectedContext[0];
  assert.ok(snippet !== undefined);
  const anchor =
    originalText ??
    snippet.content
      .split("\n")
      .find((line) => line.includes('id="checkout-modal"'));
  assert.ok(anchor !== undefined && anchor.trim() !== "");
  await writeFile(
    join(runDir, "repair-proposal.json"),
    JSON.stringify({
      proposalId: "prop-checkout-modal-keyboard-001",
      diagnosisId: "diag-repair-test",
      summary: "Contain keyboard focus within the active checkout dialog.",
      rationale: "Observed escape; containment addresses it.",
      evidenceIds: ["ev-focus-escape", "ev-assertion-failed"],
      targetFiles: [snippet.filePath],
      edits: [
        {
          filePath: snippet.filePath,
          originalText: anchor,
          replacementText: `${anchor}\n{/* proposed focus trap */}`,
          reason: "Anchors the dialog element that must contain focus.",
        },
      ],
      risks: [],
      verificationPlan: ["rebuild", "replay", "rescan"],
    }),
  );
}

function passingReplay(): KeyboardScenarioResult {
  return JSON.parse(scenarioJson("replay-run", true)) as KeyboardScenarioResult;
}

function fakeDrivers(overrides: Partial<RepairDrivers> = {}): {
  drivers: RepairDrivers;
  criticCalls: () => number;
  seenCriticInput: () => CriticInput | null;
} {
  let calls = 0;
  let seen: CriticInput | null = null;
  const drivers: RepairDrivers = {
    buildWorkspace: () =>
      Promise.resolve({
        command: "vite build",
        exitCode: 0,
        durationMs: 100,
        stdoutTail: "",
        stderrTail: "",
        passed: true,
      }),
    typecheckWorkspace: () =>
      Promise.resolve({
        passed: true,
        command: "tsc",
        note: "ok",
        outputTail: "",
      }),
    serveDist: () =>
      Promise.resolve({ url: "http://127.0.0.1:9", stop: () => Promise.resolve() }),
    replayScenario: () => Promise.resolve(passingReplay()),
    scanUrl: () => Promise.resolve(scanJson()),
    scanBaseline: () => Promise.resolve(scanJson()),
    requestCritic: (input: CriticInput) => {
      calls += 1;
      seen = input;
      const decision: CriticDecision = {
        decision: "ACCEPT",
        confidence: 0.9,
        summary: "Replayed evidence shows focus stays inside the modal.",
        evidenceIds: ["ev-focus-escape"],
        verificationConcerns: [],
        remainingRisks: [],
      };
      return Promise.resolve({
        decision,
        usage: {
          model: "muse-spark-1.3-contributor",
          operation: "repair-critic-review",
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 40,
          reasoningTokens: 10,
          latencyMs: 50,
          timestamp: "2026-10-26T00:00:00.000Z",
          requestId: "req-test-critic",
        },
        model: "muse-spark-1.3-contributor",
      });
    },
    ...overrides,
  };
  return { drivers, criticCalls: () => calls, seenCriticInput: () => seen };
}

async function preparedDirs(tag: string): Promise<{
  runsDir: string;
  runDir: string;
  fixtureRoot: string;
  workspacesDir: string;
}> {
  const runsDir = freshDir(`${tag}-runs`);
  const fixtureRoot = freshDir(`${tag}-src`);
  const workspacesDir = freshDir(`${tag}-ws`);
  const runId = "2026-01-04T00-00-00-000Z-aaaa";
  const runDir = await seedRun(runsDir, runId);
  await seedFixture(fixtureRoot);
  await runTraceFixture({ runsDir, sourceRoot: fixtureRoot });
  await seedProposal(runDir);
  return { runsDir, runDir, fixtureRoot, workspacesDir };
}

describe("runRepairFixture (mocked drivers, no browsers, no model)", () => {
  it("accepts a fully passing repair with exactly one critic call", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("ok");
    const { drivers, criticCalls, seenCriticInput } = fakeDrivers();
    const result = await runRepairFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "ACCEPTED");
    assert.equal(result.modelCalls, 1);
    assert.equal(criticCalls(), 1);
    assert.equal(result.criticDecision?.decision, "ACCEPT");
    assert.equal(result.verification.resolvedTargetFailure, true);
    assert.deepEqual(result.verification.originalAssertion, {
      passed: false,
      actualFocus: "#background-control",
    });
    // Critic input carries measured artifacts, never the repository.
    const input = seenCriticInput();
    assert.ok(input !== null);
    assert.equal(input.before.actualFocus, "#background-control");
    assert.equal(input.after.passed, true);
    assert.ok(!JSON.stringify(input).includes("node_modules"));
    // Lifecycle walked the full path.
    assert.deepEqual(
      result.lifecycle.transitions.map((t) => t.to),
      ["APPLYING", "APPLIED", "VERIFIED", "ACCEPTED"],
    );
    // Artifacts persisted for every step that occurred.
    for (const artifact of [
      "repair-diff.patch",
      "repair-verification.json",
      "repaired-scenario.json",
      "repaired-scan.json",
      "critic-decision.json",
      "critic-model-usage.json",
      "repair-lifecycle.json",
    ]) {
      await readFile(join(runDir, artifact), "utf8");
    }
    const diff = await readFile(join(runDir, "repair-diff.patch"), "utf8");
    assert.ok(diff.includes("--- a/src/App.tsx"));
    // The main fixture source was never mutated.
    assert.equal(
      await readFile(join(fixtureRoot, "src", "App.tsx"), "utf8"),
      `${MODAL_SOURCE}\n`,
    );
  });

  it("ends BUILD_FAILED with no critic call when the build fails", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("buildfail");
    const { drivers, criticCalls } = fakeDrivers({
      buildWorkspace: () =>
        Promise.resolve({
          command: "vite build",
          exitCode: 1,
          durationMs: 50,
          stdoutTail: "",
          stderrTail: "error",
          passed: false,
        }),
    });
    const result = await runRepairFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "BUILD_FAILED");
    assert.equal(criticCalls(), 0);
    assert.equal(result.criticDecision, null);
    assert.equal(result.verification.buildPassed, false);
    await assert.rejects(() =>
      readFile(join(runDir, "critic-decision.json"), "utf8"),
    );
  });

  it("ends VERIFY_FAILED with no critic call when the replay still escapes", async () => {
    const { runsDir, fixtureRoot, workspacesDir } = await preparedDirs("verifyfail");
    const stuck = JSON.parse(
      scenarioJson("replay-stuck", false),
    ) as KeyboardScenarioResult;
    const { drivers, criticCalls } = fakeDrivers({
      replayScenario: () => Promise.resolve(stuck),
    });
    const result = await runRepairFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "VERIFY_FAILED");
    assert.equal(criticCalls(), 0);
    assert.equal(result.verification.resolvedTargetFailure, false);
  });

  it("ends REGRESSION_FAILED with no critic call on a new serious violation", async () => {
    const { runsDir, fixtureRoot, workspacesDir } = await preparedDirs("regress");
    const { drivers, criticCalls } = fakeDrivers({
      scanUrl: () =>
        Promise.resolve(scanJson([{ rule: "aria-required-attr", impact: "critical" }])),
    });
    const result = await runRepairFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "REGRESSION_FAILED");
    assert.equal(criticCalls(), 0);
    assert.deepEqual(result.verification.newSeriousCritical, ["aria-required-attr"]);
  });

  it("ends REJECTED when the critic rejects an otherwise passing repair", async () => {
    const { runsDir, fixtureRoot, workspacesDir } = await preparedDirs("critrej");
    const { drivers } = fakeDrivers({
      requestCritic: (_input: CriticInput) =>
        Promise.resolve({
          decision: {
            decision: "REJECT",
            confidence: 0.7,
            summary: "Diff plausible but after-evidence inconsistent.",
            evidenceIds: ["ev-focus-escape"],
            verificationConcerns: ["after focus not inside modal subtree"],
            remainingRisks: [],
          },
          usage: {
            model: "muse-spark-1.3-contributor",
            operation: "repair-critic-review",
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            reasoningTokens: 0,
            latencyMs: 1,
            timestamp: "2026-10-26T00:00:00.000Z",
            requestId: "req-test-critic-reject",
          },
          model: "muse-spark-1.3-contributor",
        }),
    });
    const result = await runRepairFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "REJECTED");
    assert.equal(result.criticDecision?.decision, "REJECT");
  });

  it("rejects without a critic call on an ambiguous anchor", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("ambig");
    await seedProposal(runDir, "<button");
    const { drivers, criticCalls } = fakeDrivers();
    const result = await runRepairFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "REJECTED");
    assert.equal(criticCalls(), 0);
  });

  it("fails before touching anything when no proposal exists", async () => {
    const runsDir = freshDir("noprop-runs");
    const fixtureRoot = freshDir("noprop-src");
    const runId = "2026-01-04T00-00-00-000Z-aaaa";
    await seedRun(runsDir, runId);
    await seedFixture(fixtureRoot);
    await assert.rejects(
      () =>
        runRepairFixture({
          env: {},
          runsDir,
          fixtureRoot,
          workspacesDir: freshDir("noprop-ws"),
        }),
      /propose:fixture/,
    );
  });
});

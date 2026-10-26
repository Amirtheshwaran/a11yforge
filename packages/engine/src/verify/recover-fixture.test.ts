import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AccessibilityScanResult,
  CriticDecision,
  CriticInput,
  KeyboardScenarioResult,
  RepairProposal,
} from "@a11yforge/shared";
import { runTraceFixture, SourceTraceResultSchema } from "../trace/trace.js";
import {
  REVISED_REVERSE_FILE,
  REVISED_SCAN_FILE,
  REVISED_SCENARIO_FILE,
  REVISION_CRITIC_DECISION_FILE,
  REVISION_CRITIC_USAGE_FILE,
  REVISION_DIFF_FILE,
  REVISION_FEEDBACK_FILE,
  REVISION_LIFECYCLE_FILE,
  REVISION_PROPOSAL_FILE,
  REVISION_USAGE_FILE,
  REVISION_VERIFY_FILE,
  runRecoverFixture,
  type RecoverDrivers,
} from "./recover-fixture.js";

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

const TYPECHECK_BASIS =
  "deterministic gate failed: required regression tests did not pass; " +
  "fixture typecheck failed: tsc exited 2: " +
  "src/App.tsx(150,21): error TS18048: 'last' is possibly 'undefined'.\n" +
  "src/App.tsx(153,21): error TS18048: 'first' is possibly 'undefined'.\n";

function scanJson(): AccessibilityScanResult {
  const rules = [
    { rule: "button-name", impact: "critical" as const },
    { rule: "image-alt", impact: "critical" as const },
    { rule: "label", impact: "critical" as const },
    { rule: "color-contrast", impact: "serious" as const },
  ];
  return {
    scanId: "scan-recover-test",
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
    `a11yforge-recover-${tag}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
  );
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

async function seedFailedAttempt(
  runsDir: string,
  fixtureRoot: string,
): Promise<{ runId: string; runDir: string }> {
  const runId = "2026-01-04T00-00-00-000Z-aaaa";
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "scenario.json"), scenarioJson(runId, false));
  await writeFile(join(runDir, "diagnosis.json"), diagnosisJson());
  await runTraceFixture({ runsDir, sourceRoot: fixtureRoot });
  const trace = SourceTraceResultSchema.parse(
    JSON.parse(await readFile(join(runDir, "source-trace.json"), "utf8")),
  );
  const snippet = trace.selectedContext[0];
  assert.ok(snippet !== undefined);
  const anchor = snippet.content
    .split("\n")
    .find((line) => line.includes('id="checkout-modal"'));
  assert.ok(anchor !== undefined && anchor.trim() !== "");
  const proposal: RepairProposal = {
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
  };
  await writeFile(
    join(runDir, "repair-proposal.json"),
    JSON.stringify(proposal),
  );
  await writeFile(
    join(runDir, "repair-lifecycle.json"),
    JSON.stringify({
      repairId: "repair-checkout-modal-keyboard-001",
      proposalId: "prop-checkout-modal-keyboard-001",
      state: "REGRESSION_FAILED",
      transitions: [
        {
          from: "PROPOSED",
          to: "APPLYING",
          at: "2026-10-26T00:00:00.000Z",
          reason: "validated proposal; creating isolated workspace",
        },
        {
          from: "APPLYING",
          to: "APPLIED",
          at: "2026-10-26T00:00:01.000Z",
          reason: "exact anchors verified; diff recorded",
        },
        {
          from: "APPLIED",
          to: "REGRESSION_FAILED",
          at: "2026-10-26T00:00:02.000Z",
          reason: TYPECHECK_BASIS.slice(0, 1000),
        },
      ],
    }),
  );
  await writeFile(
    join(runDir, "repair-verification.json"),
    JSON.stringify({
      repairId: "repair-checkout-modal-keyboard-001",
      proposalId: "prop-checkout-modal-keyboard-001",
      buildPassed: true,
      buildCommand: "vite build",
      buildExitCode: 0,
      buildDurationMs: 100,
      originalAssertion: { passed: false, actualFocus: "#background-control" },
      repairedAssertion: { passed: true, actualFocus: "#checkout-modal-email" },
      scenarioPassed: true,
      baselineAxeRules: ["button-name", "color-contrast", "image-alt", "label"],
      repairedAxeRules: ["button-name", "color-contrast", "image-alt", "label"],
      newAxeViolations: [],
      removedBaselineRules: [],
      newSeriousCritical: [],
      resolvedTargetFailure: true,
      regressions: [],
      diffArtifact: "repair-diff.patch",
      evidenceArtifacts: ["repaired-scenario.json"],
      decisionBasis: TYPECHECK_BASIS,
    }),
  );
  // Preserved Attempt-1 evidence that recovery must never rewrite.
  await writeFile(join(runDir, "repair-diff.patch"), "attempt-1 diff\n");
  await writeFile(join(runDir, "repaired-scenario.json"), scenarioJson("attempt-1", true));
  return { runId, runDir };
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
  await seedFixture(fixtureRoot);
  const { runDir } = await seedFailedAttempt(runsDir, fixtureRoot);
  return { runsDir, runDir, fixtureRoot, workspacesDir };
}

async function revisionProposalFor(runDir: string): Promise<RepairProposal> {
  const trace = SourceTraceResultSchema.parse(
    JSON.parse(await readFile(join(runDir, "source-trace.json"), "utf8")),
  );
  const snippet = trace.selectedContext[0];
  assert.ok(snippet !== undefined);
  const anchor = snippet.content
    .split("\n")
    .find((line) => line.includes('id="checkout-modal"'));
  assert.ok(anchor !== undefined);
  return {
    proposalId: "prop-checkout-modal-keyboard-002",
    diagnosisId: "diag-repair-test",
    summary: "Same trap with strict-safe focusable access.",
    rationale: "Undefined guards address TS18048 without changing behavior.",
    evidenceIds: ["ev-focus-escape"],
    targetFiles: [snippet.filePath],
    edits: [
      {
        filePath: snippet.filePath,
        originalText: anchor,
        replacementText: `${anchor}\n{/* revised focus trap with guards */}`,
        reason: "Revise the trap to satisfy strict typechecking.",
      },
    ],
    risks: [],
    verificationPlan: ["rebuild", "replay", "rescan"],
  };
}

function fakeDrivers(
  runDir: string,
  overrides: Partial<RecoverDrivers> = {},
): {
  drivers: RecoverDrivers;
  revisionCalls: () => number;
  criticCalls: () => number;
  seenCriticInput: () => CriticInput | null;
} {
  let revisions = 0;
  let critics = 0;
  let seen: CriticInput | null = null;
  const passing = (): KeyboardScenarioResult =>
    JSON.parse(scenarioJson("replay-run", true)) as KeyboardScenarioResult;
  const drivers: RecoverDrivers = {
    typecheckWorkspace: () =>
      Promise.resolve({
        passed: true,
        command: "tsc --noEmit",
        note: "tsc --noEmit clean",
        outputTail: "",
      }),
    buildWorkspace: () =>
      Promise.resolve({
        command: "vite build",
        exitCode: 0,
        durationMs: 100,
        stdoutTail: "",
        stderrTail: "",
        passed: true,
      }),
    serveDist: () =>
      Promise.resolve({ url: "http://127.0.0.1:9", stop: () => Promise.resolve() }),
    replayScenario: () => Promise.resolve(passing()),
    replayReverse: () => Promise.resolve(passing()),
    scanUrl: () => Promise.resolve(scanJson()),
    scanBaseline: () => Promise.resolve(scanJson()),
    requestRevision: () => {
      revisions += 1;
      return revisionProposalFor(runDir).then((proposal) => ({
        proposal,
        usage: {
          model: "muse-spark-1.3-contributor",
          operation: "accessibility-repair-revision",
          inputTokens: 500,
          cachedInputTokens: 0,
          outputTokens: 350,
          reasoningTokens: 45,
          latencyMs: 60,
          timestamp: "2026-10-26T00:00:00.000Z",
          requestId: "req-test-revision",
        },
        model: "muse-spark-1.3-contributor",
      }));
    },
    requestCritic: (input: CriticInput) => {
      critics += 1;
      seen = input;
      const decision: CriticDecision = {
        decision: "ACCEPT",
        confidence: 0.9,
        summary: "Revision resolves the failure with clean gates.",
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
  return {
    drivers,
    revisionCalls: () => revisions,
    criticCalls: () => critics,
    seenCriticInput: () => seen,
  };
}

describe("runRecoverFixture (mocked drivers, no browsers, no live calls)", () => {
  it("accepts a fully passing revision with the critic called exactly once", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("ok");
    const { drivers, revisionCalls, criticCalls, seenCriticInput } =
      fakeDrivers(runDir);
    const result = await runRecoverFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "ACCEPTED");
    assert.equal(result.modelCalls, 2);
    assert.equal(revisionCalls(), 1);
    assert.equal(criticCalls(), 1);
    assert.equal(result.criticDecision?.decision, "ACCEPT");
    assert.equal(result.reversePassed, true);
    assert.equal(result.originalRepairId, "repair-checkout-modal-keyboard-001");
    assert.equal(result.repairId, "repair-checkout-modal-keyboard-002");
    // Fresh workspace: a new repair id, never the Attempt-1 workspace.
    assert.notEqual(result.workspace?.workspaceRoot.includes("repair-checkout-modal-keyboard-001"), true);
    assert.ok(result.workspace?.workspaceRoot.includes("repair-checkout-modal-keyboard-002"));
    // Critic received the revision history alongside measured artifacts.
    const input = seenCriticInput();
    assert.ok(input !== null);
    assert.ok((input.previousProposalSummary ?? "").length > 0);
    assert.ok((input.previousRejectionReason ?? "").includes("REGRESSION_FAILED"));
    // Lifecycle walked the recovery path with the precise states.
    assert.deepEqual(
      result.lifecycle.transitions.map((t) => t.to),
      ["APPLYING", "APPLIED", "VERIFIED", "ACCEPTED"],
    );
    // Every revision artifact persisted under its own name.
    for (const artifact of [
      REVISION_FEEDBACK_FILE,
      REVISION_PROPOSAL_FILE,
      REVISION_USAGE_FILE,
      REVISION_DIFF_FILE,
      REVISION_VERIFY_FILE,
      REVISION_LIFECYCLE_FILE,
      REVISED_SCENARIO_FILE,
      REVISED_REVERSE_FILE,
      REVISED_SCAN_FILE,
      REVISION_CRITIC_DECISION_FILE,
      REVISION_CRITIC_USAGE_FILE,
    ]) {
      await readFile(join(runDir, artifact), "utf8");
    }
    // Verifier feedback names the exact compiler failure.
    const feedback = JSON.parse(
      await readFile(join(runDir, REVISION_FEEDBACK_FILE), "utf8"),
    ) as { failedStage: string; diagnosticCodes: string[] };
    assert.equal(feedback.failedStage, "typecheck");
    assert.deepEqual(feedback.diagnosticCodes, ["TS18048"]);
    // Attempt-1 evidence preserved byte-for-byte.
    assert.equal(
      await readFile(join(runDir, "repair-diff.patch"), "utf8"),
      "attempt-1 diff\n",
    );
    const originalLifecycle = JSON.parse(
      await readFile(join(runDir, "repair-lifecycle.json"), "utf8"),
    ) as { state: string };
    assert.equal(originalLifecycle.state, "REGRESSION_FAILED");
    // The main fixture source was never mutated.
    assert.equal(
      await readFile(join(fixtureRoot, "src", "App.tsx"), "utf8"),
      `${MODAL_SOURCE}\n`,
    );
  });

  it("ends TYPECHECK_FAILED with no critic call when the revision still fails typecheck", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("tcfail");
    const { drivers, revisionCalls, criticCalls } = fakeDrivers(runDir, {
      typecheckWorkspace: () =>
        Promise.resolve({
          passed: false,
          command: "tsc --noEmit",
          note: "tsc exited 2: src/App.tsx(9,1): error TS18048: 'x' is possibly 'undefined'.",
          outputTail: "error TS18048",
        }),
    });
    const result = await runRecoverFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "TYPECHECK_FAILED");
    assert.equal(revisionCalls(), 1);
    assert.equal(criticCalls(), 0);
    assert.equal(result.criticDecision, null);
    assert.equal(result.verification?.buildPassed, false);
    await assert.rejects(() =>
      readFile(join(runDir, REVISION_CRITIC_DECISION_FILE), "utf8"),
    );
  });

  it("ends VERIFY_FAILED with no critic call when reverse traversal escapes", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("revfail");
    const stuck = JSON.parse(
      scenarioJson("replay-stuck", false),
    ) as KeyboardScenarioResult;
    const { drivers, criticCalls } = fakeDrivers(runDir, {
      replayReverse: () => Promise.resolve(stuck),
    });
    const result = await runRecoverFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(result.finalState, "VERIFY_FAILED");
    assert.equal(criticCalls(), 0);
    assert.equal(result.reversePassed, false);
  });

  it("rejects an invalid revision without applying or calling the critic", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("invalid");
    const original = JSON.parse(
      await readFile(join(runDir, "repair-proposal.json"), "utf8"),
    ) as RepairProposal;
    const { drivers, criticCalls } = fakeDrivers(runDir, {
      requestRevision: () => {
        revisionsGuard();
        return Promise.resolve({
          proposal: { ...original },
          usage: {
            model: "m",
            operation: "accessibility-repair-revision",
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            reasoningTokens: 0,
            latencyMs: 1,
            timestamp: "2026-10-26T00:00:00.000Z",
            requestId: "req-x",
          },
          model: "m",
        });
      },
    });
    let guarded = 0;
    function revisionsGuard(): void {
      guarded += 1;
    }
    const result = await runRecoverFixture({
      env: {},
      runsDir,
      fixtureRoot,
      workspacesDir,
      drivers,
    });
    assert.equal(guarded, 1);
    assert.equal(result.finalState, "REJECTED");
    assert.equal(result.verification, null);
    assert.equal(result.workspace, null);
    assert.equal(criticCalls(), 0);
    // No fresh workspace was created for an invalid revision.
    const workspaceEntries = await readdir(workspacesDir).catch(
      (error: unknown) =>
        (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : Promise.reject(error),
    );
    assert.deepEqual(workspaceEntries, []);
  });

  it("refuses Proposal #3 once the revision is exhausted", async () => {
    const { runsDir, runDir, fixtureRoot, workspacesDir } =
      await preparedDirs("exhaust");
    await writeFile(
      join(runDir, REVISION_PROPOSAL_FILE),
      JSON.stringify({ proposalId: "prop-old-revision" }),
    );
    const { drivers, revisionCalls } = fakeDrivers(runDir);
    await assert.rejects(
      () =>
        runRecoverFixture({
          env: {},
          runsDir,
          fixtureRoot,
          workspacesDir,
          drivers,
        }),
      /already attempted/,
    );
    assert.equal(revisionCalls(), 0);
  });

  it("throws when no failed first attempt exists", async () => {
    const runsDir = freshDir("empty-runs");
    await mkdir(runsDir, { recursive: true });
    const { drivers, revisionCalls } = fakeDrivers(runsDir);
    await assert.rejects(
      () =>
        runRecoverFixture({
          env: {},
          runsDir,
          fixtureRoot: freshDir("empty-src"),
          workspacesDir: freshDir("empty-ws"),
          drivers,
        }),
      /no failed first attempt/,
    );
    assert.equal(revisionCalls(), 0);
  });
});

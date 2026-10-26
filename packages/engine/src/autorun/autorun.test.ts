import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  KeyboardScenarioResultSchema,
  LiveRunEventSchema,
  containsNoSecrets,
  projectLiveStages,
  sanitizeLiveMetadata,
  type AccessibilityDiagnosis,
  type AccessibilityScanResult,
  type CriticDecision,
  type KeyboardScenarioResult,
  type LiveRunEvent,
  type LiveRunEventType,
  type ModelUsage,
  type RepairProposal,
} from "@a11yforge/shared";
import {
  newRepairLifecycle,
  transitionRepairLifecycle,
} from "../verify/lifecycle.js";
import {
  RepairVerificationResultSchema,
  type RepairVerificationResult,
} from "@a11yforge/shared";
import { buildFailureFeedback } from "../verify/feedback.js";
import {
  collectSpendLedger,
  runAutonomousRepair,
  summarizeSpend,
  type AutorunDrivers,
  type AutorunEmit,
} from "./pipeline.js";

/**
 * Autorun pipeline tests: full path-A/path-B orchestration with mocked
 * stage drivers, stage timeout, run failure, defect-not-reproduced,
 * spend-ledger accounting, event ordering/schema/redaction, and the live
 * stage projection. No browser, no fixture server, no live inference —
 * every stage boundary is injected through `AutorunDrivers`.
 */

const TEST_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  MODEL_API_KEY: "test-placeholder-key",
};

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

function mockScenario(runId: string, escaped: boolean): KeyboardScenarioResult {
  return KeyboardScenarioResultSchema.parse({
    runId,
    scenarioId: "checkout-modal-keyboard",
    targetUrl: "http://127.0.0.1:3002/",
    startedAt: "2026-10-26T17:40:56.287Z",
    completedAt: "2026-10-26T17:40:56.527Z",
    observations: [
      observation(0, "#checkout-modal-close", true),
      observation(1, "#checkout-modal-email", true),
      observation(2, "#checkout-modal-continue", true),
      observation(3, escaped ? "#background-control" : "#checkout-modal-close", !escaped ? true : false),
    ],
    assertions: [
      {
        assertion: "focus-contained-in-modal",
        passed: !escaped,
        step: escaped ? 3 : 4,
        pressedKey: "Tab",
        expectedRegion: "#checkout-modal",
        actualFocus: escaped ? "#background-control" : "#checkout-modal-close",
        actualHtml: "<a>evidence</a>",
      },
    ],
    screenshots: [],
    events: [],
  });
}

function mockScan(): AccessibilityScanResult {
  return {
    scanId: "scan-1",
    pageUrl: "http://127.0.0.1:3002/",
    startedAt: "2026-10-26T17:40:50.000Z",
    completedAt: "2026-10-26T17:40:52.000Z",
    findings: [
      {
        id: "label#0",
        ruleId: "label",
        impact: "critical",
        description: "Form elements must have labels",
        help: "help",
        helpUrl: "https://example.test/label",
        pageUrl: "http://127.0.0.1:3002/",
        selector: "#email",
        html: "<input>",
        failureSummary: "check failed",
      },
    ],
  };
}

const MOCK_DIAGNOSIS: AccessibilityDiagnosis = {
  diagnosisId: "diag-1",
  issueType: "focus-containment",
  title: "Focus escapes open checkout modal",
  summary: "Focus escaped the open modal.",
  severity: "serious",
  confidence: 0.95,
  affectedStrategies: ["keyboard-navigation"],
  evidenceIds: ["ev-modal-open", "ev-assertion-failed"],
  observedFailure: "Tab moved focus outside the open modal.",
  likelyCause: "No focus trap in the dialog.",
  recommendedRepairStrategy: "Cycle Tab within the dialog.",
  relevantWcagCriteria: ["2.4.3 Focus Order"],
  needsSourceContext: true,
};

function mockTrace() {
  return {
    traceId: "trace-1",
    diagnosisId: "diag-1",
    sourceRoot: "fixtures/broken-shop",
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
}

const MOCK_PROPOSAL: RepairProposal = {
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

function mockVerification(overrides: Partial<RepairVerificationResult> = {}) {
  return RepairVerificationResultSchema.parse({
    repairId: "repair-001",
    proposalId: "prop-001",
    buildPassed: true,
    buildCommand: "npm run build",
    buildExitCode: 0,
    buildDurationMs: 500,
    originalAssertion: { passed: false, actualFocus: "#background-control" },
    repairedAssertion: { passed: true, actualFocus: "#checkout-modal-email" },
    scenarioPassed: true,
    baselineAxeRules: ["button-name"],
    repairedAxeRules: ["button-name"],
    newAxeViolations: [],
    removedBaselineRules: [],
    newSeriousCritical: [],
    resolvedTargetFailure: true,
    regressions: [],
    diffArtifact: "repair-diff.patch",
    evidenceArtifacts: [],
    decisionBasis:
      "deterministic gate passed: applied safely, build passed, same scenario replayed, target assertion flips to passing, axe baseline preserved, typecheck clean",
    ...overrides,
  });
}

function mockUsage(operation: string, input: number | null = 100): ModelUsage {
  return {
    model: "muse-spark-1.3-contributor",
    operation,
    inputTokens: input,
    cachedInputTokens: null,
    outputTokens: 50,
    reasoningTokens: 200,
    latencyMs: 1000,
    timestamp: "2026-10-26T18:00:00.000Z",
    requestId: `req-${operation}`,
  };
}

async function writeUsage(runDir: string, file: string, operation: string) {
  await writeFile(
    join(runDir, file),
    `${JSON.stringify(mockUsage(operation))}\n`,
    "utf8",
  );
}

function lifecycleTo(state: "ACCEPTED" | "TYPECHECK_FAILED") {
  let lc = newRepairLifecycle({ repairId: "repair-001", proposalId: "prop-001" });
  lc = transitionRepairLifecycle(lc, "APPLYING", "test");
  lc = transitionRepairLifecycle(lc, "APPLIED", "test");
  if (state === "ACCEPTED") {
    lc = transitionRepairLifecycle(lc, "VERIFIED", "test");
    lc = transitionRepairLifecycle(lc, "ACCEPTED", "test");
  } else {
    lc = transitionRepairLifecycle(lc, state, "test");
  }
  return lc;
}

interface Collected {
  events: LiveRunEvent[];
  emit: AutorunEmit;
}

function collector(runId: string): Collected {
  const events: LiveRunEvent[] = [];
  const emit: AutorunEmit = (event) => {
    events.push({
      ...event,
      eventId: `${runId}-${events.length}`,
      sequence: events.length,
      timestamp:
        event.timestamp !== "" ? event.timestamp : new Date().toISOString(),
    });
  };
  return { events, emit };
}

const CRITIC_DECISION: CriticDecision = {
  decision: "ACCEPT",
  confidence: 0.9,
  summary: "Passing repair confirmed.",
  evidenceIds: ["ev-assertion-failed"],
  verificationConcerns: [],
  remainingRisks: ["Escape path not tested"],
};

function pathADrivers(seen: string[]): AutorunDrivers {
  return {
    // Mock evidence drivers honor the same contract as the default:
    // they emit the scan + keyboard boundary events themselves, while
    // the pipeline derives focus-escape/completion from the scenario.
    collectEvidence: async (ctx) => {
      seen.push("evidence");
      const scan = mockScan();
      ctx.emit({
        eventId: "",
        runId: ctx.runId,
        sequence: -1,
        timestamp: new Date().toISOString(),
        type: "scanner-started",
        stage: "scan",
        status: "started",
        message: "Mock axe scan started.",
        metadata: {},
      });
      ctx.emit({
        eventId: "",
        runId: ctx.runId,
        sequence: -1,
        timestamp: new Date().toISOString(),
        type: "scanner-completed",
        stage: "scan",
        status: "completed",
        message: "Mock axe scan found 1 finding across 1 rule.",
        metadata: { findings: 1, rules: ["label"] },
      });
      ctx.emit({
        eventId: "",
        runId: ctx.runId,
        sequence: -1,
        timestamp: new Date().toISOString(),
        type: "keyboard-test-started",
        stage: "keyboard",
        status: "started",
        message: "Mock keyboard scenario started.",
        metadata: {},
      });
      return { scenario: mockScenario(ctx.runId, true), scan };
    },
    diagnose: async (ctx) => {
      seen.push("diagnose");
      await writeUsage(ctx.runDir, "model-usage.json", "accessibility-diagnosis");
      return {
        runId: ctx.runId,
        resultPath: join(ctx.runDir, "scenario.json"),
        diagnosis: { ...MOCK_DIAGNOSIS },
        usage: mockUsage("accessibility-diagnosis"),
        diagnosisPath: join(ctx.runDir, "diagnosis.json"),
        usagePath: join(ctx.runDir, "model-usage.json"),
        model: "muse-spark-1.3-contributor",
        evidenceItemCount: 4,
        maxModelCalls: 4,
      };
    },
    trace: async (ctx) => {
      seen.push("trace");
      return {
        runId: ctx.runId,
        trace: mockTrace(),
        tracePath: join(ctx.runDir, "source-trace.json"),
        sufficient: true,
      };
    },
    propose: async (ctx) => {
      seen.push("propose");
      await writeUsage(ctx.runDir, "repair-model-usage.json", "accessibility-repair-proposal");
      return {
        runId: ctx.runId,
        proposal: { ...MOCK_PROPOSAL },
        usage: mockUsage("accessibility-repair-proposal"),
        proposalPath: join(ctx.runDir, "repair-proposal.json"),
        usagePath: join(ctx.runDir, "repair-model-usage.json"),
        model: "muse-spark-1.3-contributor",
        sourceFileCount: 1,
        sourceLineCount: 71,
        evidenceItemCount: 4,
        maxModelCalls: 4,
      };
    },
    repair: async (ctx) => {
      seen.push("repair");
      await writeUsage(ctx.runDir, "critic-model-usage.json", "repair-critic-review");
      const lifecycle = lifecycleTo("ACCEPTED");
      return {
        runId: ctx.runId,
        runDir: ctx.runDir,
        repairId: "repair-001",
        workspace: { repairId: "repair-001", workspaceRoot: "/tmp/ws", sourceRoot: "/tmp/ws/src" },
        finalState: "ACCEPTED",
        lifecycle,
        verification: mockVerification(),
        criticDecision: { ...CRITIC_DECISION },
        criticUsage: mockUsage("repair-critic-review"),
        criticModel: "muse-spark-1.3-contributor",
        modelCalls: 1,
      };
    },
    recover: async () => {
      seen.push("recover");
      throw new Error("recover should not run on path A");
    },
  };
}

describe("autorun pipeline", () => {
  let runsDir = "";

  before(async () => {
    runsDir = await mkdtemp(join(tmpdir(), "autorun-"));
    return async () => {
      await rm(runsDir, { recursive: true, force: true });
    };
  });

  it("runs path A to ACCEPTED with ordered, schema-valid, secret-free events", async () => {
    const runId = "2026-10-26T20-00-00-000Z-aaaaaa";
    const { events, emit } = collector(runId);
    const seen: string[] = [];
    const result = await runAutonomousRepair({
      env: TEST_ENV,
      runsDir,
      fixtureRoot: join(tmpdir(), "autorun-fixture"),
      runId,
      emit,
      drivers: pathADrivers(seen),
    });

    assert.equal(result.finalState, "ACCEPTED");
    assert.equal(result.revised, false);
    assert.equal(result.modelCalls, 3);
    assert.deepEqual(seen, ["evidence", "diagnose", "trace", "propose", "repair"]);

    const types = events.map((e) => e.type);
    assert.equal(types[0], "run-started");
    assert.equal(types[types.length - 1], "run-completed");
    const order: LiveRunEventType[] = [
      "scanner-started",
      "scanner-completed",
      "keyboard-test-started",
      "focus-escape-detected",
      "keyboard-test-completed",
      "diagnosis-started",
      "diagnosis-completed",
      "source-trace-started",
      "source-candidate-selected",
      "repair-proposal-started",
      "repair-proposal-completed",
      "repair-applied",
      "build-passed",
      "replay-passed",
      "axe-regression-passed",
      "typecheck-started",
      "typecheck-passed",
      "critic-started",
      "critic-completed",
      "repair-accepted",
      "run-completed",
    ];
    let cursor = -1;
    for (const expected of order) {
      const next = types.indexOf(expected, cursor + 1);
      assert.ok(next > cursor, `expected ${expected} in order (got ${types.join(",")})`);
      cursor = next;
    }
    assert.ok(!types.includes("repair-revision-started"));

    for (const event of events) {
      assert.ok(LiveRunEventSchema.safeParse(event).success, `invalid event: ${event.type}`);
    }
    assert.ok(containsNoSecrets(events));
    assert.ok(result.usage.calls === 3);
    assert.equal(result.usage.operations.map((o) => o.operation).join(","), "accessibility-diagnosis,accessibility-repair-proposal,repair-critic-review");
  });

  it("runs path B: failed attempt 1, bounded revision, ACCEPTED", async () => {
    const runId = "2026-10-26T20-01-00-000Z-bbbbbb";
    const { events, emit } = collector(runId);
    const seen: string[] = [];
    const drivers = pathADrivers(seen);
    drivers.repair = async (ctx) => {
      seen.push("repair");
      const lifecycle = lifecycleTo("TYPECHECK_FAILED");
      return {
        runId: ctx.runId,
        runDir: ctx.runDir,
        repairId: "repair-001",
        workspace: { repairId: "repair-001", workspaceRoot: "/tmp/ws", sourceRoot: "/tmp/ws/src" },
        finalState: "TYPECHECK_FAILED",
        lifecycle,
        verification: mockVerification({
          repairedAssertion: { passed: true, actualFocus: "#checkout-modal-email" },
          decisionBasis:
            "deterministic gate failed: focus-contained-in-modal resolved; fixture typecheck failed: tsc exited 2: src/App.tsx(142,15): error TS18048: 'first' is possibly 'undefined'.",
        }),
        criticDecision: null,
        criticUsage: null,
        criticModel: null,
        modelCalls: 0,
      };
    };
    const feedback = buildFailureFeedback({
      proposal: { ...MOCK_PROPOSAL },
      repairId: "repair-001",
      previousLifecycleResult: "TYPECHECK_FAILED",
      failedStage: "typecheck",
      compilerCommand: "tsc --noEmit",
      exitStatus: 2,
      compilerOutput: "src/App.tsx(142,15): error TS18048: 'first' is possibly 'undefined'.",
      diagnosisId: "diag-1",
      observedFailure: "Tab moved focus outside the open modal.",
      repairStrategy: "Cycle Tab within the dialog.",
      suppliedSourceFiles: ["src/App.tsx"],
    });
    drivers.recover = async (ctx) => {
      seen.push("recover");
      await writeUsage(ctx.runDir, "repair-revision-model-usage.json", "accessibility-repair-revision");
      await writeUsage(ctx.runDir, "critic-model-usage.json", "repair-critic-review");
      const lifecycle = lifecycleTo("ACCEPTED");
      return {
        runId: ctx.runId,
        runDir: ctx.runDir,
        originalRepairId: "repair-001",
        repairId: "repair-002",
        workspace: { repairId: "repair-002", workspaceRoot: "/tmp/ws2", sourceRoot: "/tmp/ws2/src" },
        feedback,
        revision: { ...MOCK_PROPOSAL, proposalId: "prop-002" },
        finalState: "ACCEPTED",
        lifecycle,
        verification: mockVerification({ repairId: "repair-002", proposalId: "prop-002" }),
        reversePassed: true,
        criticDecision: { ...CRITIC_DECISION },
        criticUsage: mockUsage("repair-critic-review"),
        criticModel: "muse-spark-1.3-contributor",
        modelCalls: 2,
      };
    };

    const result = await runAutonomousRepair({
      env: TEST_ENV,
      runsDir,
      fixtureRoot: join(tmpdir(), "autorun-fixture"),
      runId,
      emit,
      drivers,
    });

    assert.equal(result.finalState, "ACCEPTED");
    assert.equal(result.revised, true);
    assert.equal(result.modelCalls, 4);
    const types = events.map((e) => e.type);
    assert.ok(types.includes("typecheck-failed"));
    assert.ok(types.indexOf("typecheck-failed") < types.indexOf("repair-revision-started"));
    assert.ok(types.includes("verifier-feedback-created"));
    assert.ok(types.includes("repair-revision-completed"));
    assert.ok(types.includes("repair-accepted"));
    for (const event of events) {
      assert.ok(LiveRunEventSchema.safeParse(event).success, `invalid event: ${event.type}`);
    }
    assert.ok(containsNoSecrets(events));
  });

  it("fails the run when diagnosis throws, preserving order and stopping later stages", async () => {
    const runId = "2026-10-26T20-02-00-000Z-cccccc";
    const { events, emit } = collector(runId);
    const seen: string[] = [];
    const drivers = pathADrivers(seen);
    drivers.diagnose = async () => {
      seen.push("diagnose");
      throw new Error("boom diagnosis");
    };
    await assert.rejects(
      () =>
        runAutonomousRepair({
          env: TEST_ENV,
          runsDir,
          fixtureRoot: join(tmpdir(), "autorun-fixture"),
          runId,
          emit,
          drivers,
        }),
      /Diagnosis failed: boom diagnosis/,
    );
    assert.deepEqual(seen, ["evidence", "diagnose"]);
    const types = events.map((e) => e.type);
    assert.equal(types[types.length - 1], "run-failed");
    assert.ok(!types.includes("repair-proposal-started"));
  });

  it("fails the run when the evidence stage times out", async () => {
    const runId = "2026-10-26T20-03-00-000Z-dddddd";
    const { events, emit } = collector(runId);
    await assert.rejects(
      () =>
        runAutonomousRepair({
          env: TEST_ENV,
          runsDir,
          fixtureRoot: join(tmpdir(), "autorun-fixture"),
          runId,
          emit,
          timeouts: { evidence: 50 },
          drivers: {
            collectEvidence: () => new Promise(() => undefined) as never,
          },
        }),
      /timed out/,
    );
    assert.equal(events[events.length - 1]?.type, "run-failed");
  });

  it("fails honestly when the fixture defect is not reproduced", async () => {
    const runId = "2026-10-26T20-04-00-000Z-eeeeee";
    const { events, emit } = collector(runId);
    const seen: string[] = [];
    const drivers = pathADrivers(seen);
    drivers.collectEvidence = async (ctx) => {
      seen.push("evidence");
      return { scenario: mockScenario(ctx.runId, false), scan: mockScan() };
    };
    await assert.rejects(
      () =>
        runAutonomousRepair({
          env: TEST_ENV,
          runsDir,
          fixtureRoot: join(tmpdir(), "autorun-fixture"),
          runId,
          emit,
          drivers,
        }),
      /defect not reproduced/,
    );
    assert.deepEqual(seen, ["evidence"]);
    assert.ok(!events.some((e) => e.type === "focus-escape-detected"));
  });

  it("accounts spend from persisted usage telemetry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spend-"));
    try {
      await writeUsage(dir, "model-usage.json", "accessibility-diagnosis");
      await writeUsage(dir, "repair-model-usage.json", "accessibility-repair-proposal");
      const { summary, calls } = await collectSpendLedger(dir);
      assert.equal(calls, 2);
      assert.equal(summary.inputTokens, 200);
      assert.equal(summary.outputTokens, 100);
      assert.equal(summary.reasoningTokens, 400);
      const empty = summarizeSpend([]);
      assert.equal(empty.calls, 0);
      assert.equal(empty.inputTokens, null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("projects live stages from path-A and path-B event streams", async () => {
    const runId = "2026-10-26T20-05-00-000Z-ffffff";
    const collected = collector(runId);
    const seen: string[] = [];
    await runAutonomousRepair({
      env: TEST_ENV,
      runsDir,
      fixtureRoot: join(tmpdir(), "autorun-fixture"),
      runId,
      emit: collected.emit,
      drivers: pathADrivers(seen),
    });
    const stages = projectLiveStages(collected.events);
    const byId = new Map(stages.map((s) => [s.id, s.state]));
    assert.equal(byId.get("scan"), "passed");
    assert.equal(byId.get("keyboard"), "passed");
    assert.equal(byId.get("diagnosis"), "passed");
    assert.equal(byId.get("decision"), "passed");
    assert.equal(byId.get("revision"), "skipped");
    assert.equal(byId.get("verify-attempt-2"), "skipped");
  });

  it("sanitizes hostile metadata: secrets stripped, paths reduced, payload bounded", () => {
    const cleaned = sanitizeLiveMetadata({
      MODEL_API_KEY: "sk-should-never-appear",
      nested: { token: "abc", keep: "yes" },
      path: "/home/someone/work/a11yforge/fixtures/broken-shop/src/App.tsx",
      big: "x".repeat(5000),
      arr: Array.from({ length: 30 }, (_, i) => i),
    });
    const text = JSON.stringify(cleaned);
    assert.ok(!text.includes("sk-should-never-appear"));
    assert.ok(!text.includes("/home/someone"));
    assert.ok(text.includes("fixtures/broken-shop/src/App.tsx"));
    assert.ok(text.includes("yes"));
    assert.ok((cleaned["arr"] as unknown[]).length <= 20);
    assert.ok(text.length <= 4100);
  });
});

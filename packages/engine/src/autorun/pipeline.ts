import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  ModelUsageSchema,
  isRepairLifecycleTerminal,
  sanitizeLiveMessage,
  sanitizeLiveMetadata,
  toDisplayPath,
  type AccessibilityScanResult,
  type KeyboardScenarioResult,
  type LiveRunEvent,
  type LiveRunEventType,
  type LiveRunStage,
  type ModelSpendSummary,
  type ModelUsage,
  type RepairLifecycleState,
} from "@a11yforge/shared";
import { requireApiKey } from "@a11yforge/meta";
import { runAxeScan } from "../scanner/scan.js";
import {
  startFixtureServer,
  type FixtureServer,
} from "../scanner/fixture-server.js";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import { getScenario } from "../interaction/scenarios.js";
import { newRunId, runKeyboardScenario } from "../interaction/runner.js";
import { writeInteractionArtifacts } from "../interaction/artifacts.js";
import {
  runDiagnoseFixture,
  type DiagnoseFixtureResult,
} from "../diagnosis/diagnose.js";
import {
  defaultFixtureSourceRoot,
  isTraceSufficient,
  runTraceFixture,
  type TraceFixtureResult,
} from "../trace/trace.js";
import {
  runProposeFixture,
  type ProposeFixtureResult,
} from "../repair/propose.js";
import {
  runRepairFixture,
  type RepairFixtureResult,
} from "../verify/repair-fixture.js";
import {
  runRecoverFixture,
  type RecoverFixtureResult,
} from "../verify/recover-fixture.js";

/**
 * Phase 6.5 autonomous run pipeline.
 *
 * Chains the EXISTING engine stages against one fresh run directory —
 * deterministic axe scan, keyboard scenario, Meta diagnosis, deterministic
 * source trace, Meta repair proposal, isolated repair application with
 * deterministic verification, bounded verifier-driven revision, and the
 * critic iff eligible — while emitting observable `LiveRunEvent` records
 * for every stage outcome that actually occurs.
 *
 * No new repair intelligence lives here: each stage delegates to the
 * Phase 1–5 implementation. The pipeline only sequences, times out,
 * budgets, and narrates. Model calls are bounded by
 * `MAX_LIVE_MODEL_CALLS_PER_RUN`; every stage runs at most once, so no
 * model loop is possible.
 */

/**
 * Absolute ceiling on live Meta calls in one autonomous run.
 *
 * The expected run spends 3 (diagnosis, repair proposal, critic iff the
 * deterministic gates allow it). The 4th slot exists ONLY for the single
 * bounded verifier-driven revision (`MAX_REPAIR_ATTEMPTS = 2`): when
 * Attempt 1 fails verification, the revision replaces the unspent
 * Attempt-1 critic call. There are no retries beyond this — each stage
 * executes at most once per run.
 */
export const MAX_LIVE_MODEL_CALLS_PER_RUN = 4;

export type AutorunStageKey =
  | "evidence"
  | "diagnosis"
  | "trace"
  | "propose"
  | "repair"
  | "recover";

/** Per-stage wall-clock ceilings (generous; real stages finish far sooner). */
export const AUTORUN_STAGE_TIMEOUTS_MS: Record<AutorunStageKey, number> = {
  evidence: 480_000,
  diagnosis: 240_000,
  trace: 180_000,
  propose: 240_000,
  repair: 900_000,
  recover: 900_000,
};

const EVIDENCE_SCREENSHOT_TIMEOUT_MS = 10_000;

/** Sink receiving one fully-formed event per pipeline outcome. */
export type AutorunEmit = (event: LiveRunEvent) => void;

export interface AutorunEvidenceContext {
  runId: string;
  runDir: string;
  runsDir: string;
  fixtureRoot: string;
  emit: AutorunEmit;
}

export interface AutorunStageContext {
  env: NodeJS.ProcessEnv;
  runId: string;
  runDir: string;
  runsDir: string;
  fixtureRoot: string;
  emit: AutorunEmit;
}

/**
 * Injectable stage drivers — production defaults call the real engine.
 *
 * Driver event contract: `collectEvidence` emits `scanner-started`,
 * `scanner-completed`, and `keyboard-test-started` itself (the pipeline
 * cannot see inside evidence collection); the pipeline derives
 * `focus-escape-detected` / `keyboard-test-completed` from the returned
 * scenario. All other stages are fully narrated by the pipeline.
 */
export interface AutorunDrivers {
  collectEvidence?: (
    ctx: AutorunEvidenceContext,
  ) => Promise<{ scenario: KeyboardScenarioResult; scan: AccessibilityScanResult }>;
  diagnose?: (ctx: AutorunStageContext) => Promise<DiagnoseFixtureResult>;
  trace?: (ctx: AutorunStageContext) => Promise<TraceFixtureResult>;
  propose?: (ctx: AutorunStageContext) => Promise<ProposeFixtureResult>;
  repair?: (ctx: AutorunStageContext) => Promise<RepairFixtureResult>;
  recover?: (ctx: AutorunStageContext) => Promise<RecoverFixtureResult>;
}

export interface AutorunOptions {
  env?: NodeJS.ProcessEnv;
  runsDir?: string;
  fixtureRoot?: string;
  runId?: string;
  emit: AutorunEmit;
  timeouts?: Partial<Record<AutorunStageKey, number>>;
  drivers?: AutorunDrivers;
}

export interface AutorunResult {
  runId: string;
  runDir: string;
  /** Terminal verdict: ACCEPTED, REJECTED, or a FAILED lifecycle state. */
  finalState: RepairLifecycleState | "REJECTED" | "FAILED";
  revised: boolean;
  usage: ModelSpendSummary;
  modelCalls: number;
}

export class AutorunStageTimeoutError extends Error {
  readonly stage: AutorunStageKey;
  readonly timeoutMs: number;
  constructor(stage: AutorunStageKey, timeoutMs: number) {
    super(`stage ${stage} timed out after ${timeoutMs}ms`);
    this.name = "AutorunStageTimeoutError";
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stage: AutorunStageKey,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return (async () => {
      try {
        return await Promise.race([
          promise,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new AutorunStageTimeoutError(stage, ms)),
              ms,
            );
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    })();
  } catch {
    if (timer !== undefined) clearTimeout(timer);
    throw new AutorunStageTimeoutError(stage, ms);
  }
}

/** Usage artifact files — one per live Meta call, in call order. */
const USAGE_FILES: { file: string; operation: string }[] = [
  { file: "model-usage.json", operation: "accessibility-diagnosis" },
  { file: "repair-model-usage.json", operation: "accessibility-repair-proposal" },
  {
    file: "repair-revision-model-usage.json",
    operation: "accessibility-repair-revision",
  },
  { file: "critic-model-usage.json", operation: "repair-critic-review" },
];

/** Read persisted per-call telemetry into a UI-safe spend summary. */
export async function collectSpendLedger(
  runDir: string,
): Promise<{ summary: ModelSpendSummary; calls: number }> {
  const operations: ModelSpendSummary["operations"] = [];
  for (const { file, operation } of USAGE_FILES) {
    let raw: string;
    try {
      raw = await readFile(join(runDir, file), "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    const usage = ModelUsageSchema.safeParse(parsed);
    if (!usage.success) continue;
    operations.push(rowOf(usage.data, operation));
  }
  return { summary: summarizeSpend(operations), calls: operations.length };
}

function rowOf(
  usage: ModelUsage,
  fallbackOperation: string,
): ModelSpendSummary["operations"][number] {
  return {
    operation: usage.operation || fallbackOperation,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    latencyMs: usage.latencyMs,
    requestId: usage.requestId,
  };
}

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

export function summarizeSpend(
  operations: ModelSpendSummary["operations"],
): ModelSpendSummary {
  return {
    calls: operations.length,
    inputTokens: sumOrNull(operations.map((o) => o.inputTokens)),
    outputTokens: sumOrNull(operations.map((o) => o.outputTokens)),
    reasoningTokens: sumOrNull(operations.map((o) => o.reasoningTokens)),
    operations,
  };
}

async function writeSpendSummary(runDir: string): Promise<ModelSpendSummary> {
  const { summary } = await collectSpendLedger(runDir);
  await writeFile(
    join(runDir, "model-usage-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  return summary;
}

function errorMessage(error: unknown): string {
  return sanitizeLiveMessage(
    error instanceof Error ? error.message : String(error),
  );
}

async function defaultCollectEvidence(
  ctx: AutorunEvidenceContext,
): Promise<{ scenario: KeyboardScenarioResult; scan: AccessibilityScanResult }> {
  const scenarioDef = getScenario("checkout-modal-keyboard");

  ctx.emit({
    eventId: "",
    runId: ctx.runId,
    sequence: -1,
    timestamp: "",
    type: "scanner-started",
    stage: "scan",
    status: "started",
    message: "Booting broken-shop fixture and running deterministic axe scan.",
    metadata: {},
  });

  let server: FixtureServer | undefined;
  let scan: AccessibilityScanResult;
  try {
    server = await startFixtureServer();
    scan = await runAxeScan(server.url);
    const scanPath = join(ctx.runDir, "scan.json");
    await writeFile(scanPath, `${JSON.stringify(scan, null, 2)}\n`, "utf8");
  } finally {
    await server?.stop();
  }
  const ruleIds = [...new Set(scan.findings.map((f) => f.ruleId))];
  ctx.emit({
    eventId: "",
    runId: ctx.runId,
    sequence: -1,
    timestamp: "",
    type: "scanner-completed",
    stage: "scan",
    status: "completed",
    message: `Axe scan found ${scan.findings.length} findings across ${ruleIds.length} rules.`,
    metadata: sanitizeLiveMetadata({
      findings: scan.findings.length,
      rules: ruleIds,
    }),
  });

  ctx.emit({
    eventId: "",
    runId: ctx.runId,
    sequence: -1,
    timestamp: "",
    type: "keyboard-test-started",
    stage: "keyboard",
    status: "started",
    message: "Replaying checkout-modal-keyboard scenario against the fixture.",
    metadata: {},
  });

  let browser: Browser | undefined;
  try {
    server = await startFixtureServer();
    browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const scenario = await runKeyboardScenario({
        page,
        scenario: scenarioDef,
        runId: ctx.runId,
        targetUrl: server.url,
        takeScreenshot: async (name: string) => {
          await page.screenshot({
            path: join(ctx.runDir, name),
            timeout: EVIDENCE_SCREENSHOT_TIMEOUT_MS,
          });
        },
      });
      await writeInteractionArtifacts(scenario, { runsDir: ctx.runsDir });
      return { scenario, scan };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } finally {
    await server?.stop();
  }
}

/**
 * Execute the full autonomous repair against the broken-shop fixture.
 *
 * Emits one `LiveRunEvent` per real outcome (the API assigns delivery
 * order; the sequence/timestamp here describe occurrence). Throws nothing
 * for verdicts — ACCEPTED and REJECTED both resolve — and throws only when
 * the pipeline itself cannot proceed (stage error or timeout), after
 * emitting `run-failed` with the preserved artifacts in place.
 */
export async function runAutonomousRepair(
  options: AutorunOptions,
): Promise<AutorunResult> {
  const env = options.env ?? process.env;
  const runsDir =
    options.runsDir ??
    (env["A11YFORGE_RUNS_DIR"] !== undefined && env["A11YFORGE_RUNS_DIR"] !== ""
      ? env["A11YFORGE_RUNS_DIR"]
      : join(findWorkspaceRoot(), ".a11yforge", "runs"));
  const fixtureRoot = options.fixtureRoot ?? defaultFixtureSourceRoot();
  const runId = options.runId ?? newRunId();
  const runDir = join(runsDir, runId);
  const timeouts = {
    ...AUTORUN_STAGE_TIMEOUTS_MS,
    ...options.timeouts,
  };
  const drivers = options.drivers ?? {};

  await mkdir(runDir, { recursive: true });

  const emit = (
    type: LiveRunEventType,
    stage: LiveRunStage,
    message: string,
    metadata: unknown = {},
  ): void => {
    options.emit({
      eventId: "",
      runId,
      sequence: -1,
      timestamp: new Date().toISOString(),
      type,
      stage,
      status:
        type === "run-failed" ||
        type.endsWith("-failed") ||
        type === "repair-rejected"
          ? "failed"
          : type === "run-completed" ||
              type.endsWith("-completed") ||
              type.endsWith("-passed") ||
              type === "repair-accepted" ||
              type === "source-candidate-selected" ||
              type === "focus-escape-detected" ||
              type === "verifier-feedback-created" ||
              type === "repair-applied"
            ? "completed"
            : type.endsWith("-started") || type === "run-started"
              ? "started"
              : "info",
      message: sanitizeLiveMessage(message),
      metadata: sanitizeLiveMetadata(
        metadata as Record<string, unknown> | null,
      ),
    });
  };

  const stageCtx: AutorunStageContext = {
    env,
    runId,
    runDir,
    runsDir,
    fixtureRoot,
    emit: options.emit,
  };

  const fail = async (message: string): Promise<never> => {
    emit("run-failed", "run", message);
    await writeSpendSummary(runDir).catch(() => undefined);
    throw new Error(message);
  };

  // Run one stage, converting any throw into an honest run-failed event.
  // Never resolves after a failure (fail() always throws), so callers
  // keep definite assignment without non-null assertions.
  const runStage = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      await fail(`${label} failed: ${errorMessage(error)}`);
      throw new Error("unreachable: fail() always throws");
    }
  };

  emit("run-started", "run", `Autonomous repair run started against Broken Shop.`);

  // Fail BEFORE any browser or model work when the key is missing.
  try {
    requireApiKey(env);
  } catch (error) {
    await fail(
      error instanceof Error
        ? error.message
        : "Meta Model API key is not configured.",
    );
  }

  // 1–3. Deterministic evidence: axe scan + keyboard scenario.
  const collect = drivers.collectEvidence ?? defaultCollectEvidence;
  const evidence = await runStage("Evidence collection", () =>
    withTimeout(
      collect({ runId, runDir, runsDir, fixtureRoot, emit: options.emit }),
      timeouts.evidence,
      "evidence",
    ),
  );
  const scenario = evidence.scenario;

  const failedAssertion = scenario.assertions.find(
    (a) => a.assertion === "focus-contained-in-modal" && !a.passed,
  );
  if (failedAssertion === undefined) {
    emit(
      "keyboard-test-completed",
      "keyboard",
      "Scenario completed with focus contained — no failed assertion to diagnose.",
    );
    await fail(
      "Fixture defect not reproduced: focus-contained-in-modal passed, nothing to repair.",
    );
    throw new Error("unreachable: fail() always throws");
  }
  emit(
    "focus-escape-detected",
    "keyboard",
    `Focus escaped to ${failedAssertion.actualFocus} at step ${failedAssertion.step}.`,
    {
      step: failedAssertion.step,
      expectedRegion: failedAssertion.expectedRegion,
      actualFocus: failedAssertion.actualFocus,
    },
  );
  emit(
    "keyboard-test-completed",
    "keyboard",
    "Keyboard evidence recorded: focus-contained-in-modal failed as expected.",
    { observations: scenario.observations.length },
  );

  const assertBudget = async (needed: number, operation: string): Promise<void> => {
    const { calls } = await collectSpendLedger(runDir);
    if (calls + needed > MAX_LIVE_MODEL_CALLS_PER_RUN) {
      await fail(
        `Model call budget exhausted before ${operation} (${calls} spent, max ${MAX_LIVE_MODEL_CALLS_PER_RUN} per run): refusing another paid request.`,
      );
    }
  };

  // 4. Meta diagnosis (live call #1).
  await assertBudget(1, "diagnosis");
  emit("diagnosis-started", "diagnosis", "Requesting structured diagnosis from evidence.");
  const diagnose = drivers.diagnose ?? ((ctx: AutorunStageContext) =>
    runDiagnoseFixture({ env: ctx.env, runsDir: ctx.runsDir }));
  const diagnosis = await runStage("Diagnosis", () =>
    withTimeout(diagnose(stageCtx), timeouts.diagnosis, "diagnosis"),
  );
  emit(
    "diagnosis-completed",
    "diagnosis",
    `Diagnosed: ${diagnosis.diagnosis.title}`,
    {
      issueType: diagnosis.diagnosis.issueType,
      severity: diagnosis.diagnosis.severity,
      confidence: diagnosis.diagnosis.confidence,
      evidenceIds: diagnosis.diagnosis.evidenceIds,
    },
  );

  // 5. Deterministic source trace (no model call).
  emit("source-trace-started", "trace", "Searching fixture sources for evidence-derived terms.");
  const traceFn = drivers.trace ?? ((ctx: AutorunStageContext) =>
    runTraceFixture({ runsDir: ctx.runsDir, sourceRoot: ctx.fixtureRoot }));
  const trace = await runStage("Source trace", () =>
    withTimeout(traceFn(stageCtx), timeouts.trace, "trace"),
  );
  if (!isTraceSufficient(trace.trace)) {
    await fail(
      "Source trace is INSUFFICIENT — refusing a repair-model call without strong source evidence.",
    );
  }
  const top = trace.trace.candidates[0];
  emit(
    "source-candidate-selected",
    "trace",
    `Top candidate ${top !== undefined ? toDisplayPath(top.filePath) : "unknown"} selected deterministically.`,
    {
      file: top !== undefined ? toDisplayPath(top.filePath) : null,
      score: top?.score ?? null,
      matchedTerms: top?.matchedTerms ?? [],
    },
  );

  // 6. Meta repair proposal (live call #2).
  await assertBudget(1, "repair proposal");
  emit("repair-proposal-started", "proposal", "Requesting minimal anchored repair proposal.");
  const propose = drivers.propose ?? ((ctx: AutorunStageContext) =>
    runProposeFixture({
      env: ctx.env,
      runsDir: ctx.runsDir,
      sourceRoot: ctx.fixtureRoot,
    }));
  const proposal = await runStage("Repair proposal", () =>
    withTimeout(propose(stageCtx), timeouts.propose, "propose"),
  );
  emit(
    "repair-proposal-completed",
    "proposal",
    `Proposal targets ${proposal.proposal.targetFiles.map((f) => toDisplayPath(f)).join(", ")}.`,
    {
      targetFiles: proposal.proposal.targetFiles.map((f) => toDisplayPath(f)),
      edits: proposal.proposal.edits.length,
    },
  );

  // 7–8. Isolated apply + deterministic verification (critic iff eligible).
  await assertBudget(1, "verification");
  const repairFn = drivers.repair ?? ((ctx: AutorunStageContext) =>
    runRepairFixture({ env: ctx.env, runsDir: ctx.runsDir }));
  const repair = await runStage("Repair verification", () =>
    withTimeout(repairFn(stageCtx), timeouts.repair, "repair"),
  );
  emitAttemptOutcome(emit, repair.verification, 1, {
    criticCalled: repair.criticDecision !== null,
  });

  let finalState: RepairLifecycleState | "REJECTED" = repair.finalState;
  let revised = false;

  // 9. Bounded verifier-driven revision when Attempt 1 failed.
  if (
    finalState !== "ACCEPTED" &&
    isRepairLifecycleTerminal(finalState)
  ) {
    try {
      await assertBudget(2, "bounded revision");
    } catch (error) {
      await fail(errorMessage(error));
      throw new Error("unreachable: fail() always throws");
    }
    let recovered: RecoverFixtureResult;
    try {
      emit(
        "repair-revision-started",
        "revision",
        "Attempt 1 rejected by the verifier — requesting one feedback-grounded revision.",
      );
      const recover = drivers.recover ?? ((ctx: AutorunStageContext) =>
        runRecoverFixture({ env: ctx.env, runsDir: ctx.runsDir }));
      recovered = await withTimeout(
        recover(stageCtx),
        timeouts.recover,
        "recover",
      );
    } catch (error) {
      // No failed attempt eligible for recovery (or already revised):
      // Attempt 1's verdict stands as the final result.
      if (/no failed first attempt|already attempted|exhausted/i.test(
        error instanceof Error ? error.message : String(error),
      )) {
        return finishRun({
          runId,
          runDir,
          finalState,
          revised,
          emit,
        });
      }
      await fail(`Bounded revision failed: ${errorMessage(error)}`);
      throw new Error("unreachable: fail() always throws");
    }
    revised = true;
    emit(
      "verifier-feedback-created",
      "feedback",
      `Verifier feedback classified: ${recovered.feedback.failedStage} (${recovered.feedback.diagnosticCodes.join(", ") || "no codes"}).`,
      {
        failedStage: recovered.feedback.failedStage,
        diagnosticCodes: recovered.feedback.diagnosticCodes,
      },
    );
    emit(
      "repair-revision-completed",
      "revision",
      "Revised proposal validated against verifier feedback.",
      {
        proposalId: recovered.revision?.proposalId ?? null,
      },
    );
    if (recovered.verification !== null) {
      emitAttemptOutcome(emit, recovered.verification, 2, {
        criticCalled: recovered.criticDecision !== null,
      });
    }
    finalState = recovered.finalState;
  }

  return finishRun({ runId, runDir, finalState, revised, emit });
}

async function finishRun(args: {
  runId: string;
  runDir: string;
  finalState: RepairLifecycleState | "REJECTED";
  revised: boolean;
  emit: (
    type: LiveRunEventType,
    stage: LiveRunStage,
    message: string,
    metadata?: unknown,
  ) => void;
}): Promise<AutorunResult> {
  const usage = await writeSpendSummary(args.runDir).catch(() => ({
    calls: 0,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    operations: [],
  }));
  const { calls } = await collectSpendLedger(args.runDir).catch(() => ({
    summary: usage,
    calls: usage.calls,
  }));
  if (args.finalState === "ACCEPTED") {
    args.emit(
      "repair-accepted",
      "decision",
      args.revised
        ? "Repair ACCEPTED after bounded revision — every deterministic gate passed."
        : "Repair ACCEPTED on the first attempt — every deterministic gate passed.",
    );
  } else {
    args.emit(
      "repair-rejected",
      "decision",
      `Repair REJECTED (${args.finalState}) — reported with full evidence, not hidden.`,
      { finalState: args.finalState },
    );
  }
  args.emit(
    "run-completed",
    "run",
    `Autonomous run finished: ${args.finalState} after ${calls} Meta call${calls === 1 ? "" : "s"}.`,
    { finalState: args.finalState, modelCalls: calls },
  );
  return {
    runId: args.runId,
    runDir: args.runDir,
    finalState: args.finalState,
    revised: args.revised,
    usage,
    modelCalls: calls,
  };
}

/**
 * Translate a completed verification record into the observable outcome
 * events. Attempt 1 runs apply → build → replay → axe → typecheck;
 * Attempt 2 (fresh recovery workspace) runs apply → typecheck → build →
 * replay → axe. Only outcomes the verification record supports are
 * emitted: early-stop records mark un-run stages with `(not run)` /
 * `(no replay …)` sentinels, and those stages produce no event.
 */
function emitAttemptOutcome(
  emit: (
    type: LiveRunEventType,
    stage: LiveRunStage,
    message: string,
    metadata?: unknown,
  ) => void,
  verification: RepairFixtureResult["verification"],
  attempt: 1 | 2,
  opts: { criticCalled: boolean },
): void {
  const stage: LiveRunStage =
    attempt === 1 ? "verify-attempt-1" : "verify-attempt-2";
  const buildRan = verification.buildCommand !== "(not run)";
  const replayRan = !/no replay/i.test(verification.repairedAssertion.actualFocus);
  const typecheckFailed = /typecheck failed/i.test(verification.decisionBasis);

  if (attempt === 1) {
    emit(
      "repair-applied",
      stage,
      "Attempt 1 applied in an isolated workspace — exact anchors verified.",
    );
  }

  const emitTypecheck = (): void => {
    emit("typecheck-started", stage, "Running strict typecheck on the repaired workspace.");
    if (typecheckFailed) {
      const codes = verification.decisionBasis.match(/TS\d+/g) ?? [];
      emit(
        "typecheck-failed",
        stage,
        `Strict typecheck failed${codes.length > 0 ? ` (${codes.join(", ")})` : ""}.`,
        { diagnosticCodes: codes },
      );
    } else {
      emit("typecheck-passed", stage, "Strict typecheck clean.");
    }
  };

  if (attempt === 2) {
    // Recovery verifies typecheck FIRST — later stages never ran on failure.
    emitTypecheck();
    if (typecheckFailed) return;
  }

  if (!buildRan) {
    emit(
      "build-failed",
      stage,
      "Build never ran: the repair was refused before the workspace build.",
    );
    return;
  }
  if (!verification.buildPassed) {
    emit(
      "build-failed",
      stage,
      `Build failed: ${verification.buildCommand} exited ${String(verification.buildExitCode)}.`,
      { exitCode: verification.buildExitCode },
    );
    return;
  }
  emit("build-passed", stage, "Build passed in the isolated workspace.");

  if (!replayRan) {
    return;
  }
  if (verification.resolvedTargetFailure && verification.scenarioPassed) {
    emit(
      "replay-passed",
      stage,
      "Replayed scenario flips to passing: focus stays inside the dialog.",
      { actualFocus: verification.repairedAssertion.actualFocus },
    );
  } else {
    emit(
      "replay-failed",
      stage,
      `Replayed scenario still fails: focus on ${verification.repairedAssertion.actualFocus}.`,
      { actualFocus: verification.repairedAssertion.actualFocus },
    );
    return;
  }

  const axeClean =
    verification.newSeriousCritical.length === 0 &&
    verification.regressions.length === 0;
  if (axeClean) {
    emit(
      "axe-regression-passed",
      stage,
      "Axe baseline preserved: no new serious/critical violations.",
    );
  } else {
    emit(
      "axe-regression-failed",
      stage,
      `Axe regressions: ${(verification.regressions.length > 0 ? verification.regressions : verification.newSeriousCritical).join("; ").slice(0, 300) || "baseline changed"}.`,
      { newSeriousCritical: verification.newSeriousCritical },
    );
  }

  if (attempt === 1) {
    // Attempt 1 typechecks after the replay/scan evidence is collected.
    emitTypecheck();
  }

  if (opts.criticCalled) {
    emit("critic-started", "critic", "Deterministic gates passed — requesting critic verdict.");
    emit("critic-completed", "critic", "Critic verdict recorded.");
  }
}

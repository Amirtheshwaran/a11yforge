import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AccessibilityDiagnosisSchema,
  KeyboardScenarioResultSchema,
  MAX_REPAIR_ATTEMPTS,
  RepairLifecycleSchema,
  RepairProposalSchema,
  RepairRevisionRequestSchema,
  RepairVerificationResultSchema,
  isRepairLifecycleTerminal,
  type AccessibilityDiagnosis,
  type AccessibilityScanResult,
  type CriticDecision,
  type CriticInput,
  type KeyboardScenarioResult,
  type ModelUsage,
  type RepairFailureFeedback,
  type RepairLifecycle,
  type RepairLifecycleState,
  type RepairProposal,
  type RepairRevisionRequest,
  type RepairVerificationResult,
  type VerificationStage,
} from "@a11yforge/shared";
import {
  MetaApiError,
  ModelCallBudget,
  getMetaModel,
  proposeRepairRevisionWithMeta,
  requireApiKey,
  type MetaFetch,
} from "@a11yforge/meta";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import type { FixtureServer } from "../scanner/fixture-server.js";
import { runAxeScan } from "../scanner/scan.js";
import { buildFocusContainmentBundle } from "../diagnosis/evidence-bundle.js";
import {
  defaultFixtureSourceRoot,
  SourceTraceResultSchema,
  type SourceTraceResult,
} from "../trace/trace.js";
import { buildRepairContextBundle } from "../trace/repair-context.js";
import {
  RepairProposalValidationError,
  validateRepairProposal,
} from "../trace/validate-proposal.js";
import {
  newRepairLifecycle,
  transitionRepairLifecycle,
} from "./lifecycle.js";
import {
  createRepairWorkspace,
  defaultWorkspacesDir,
  type RepairWorkspace,
} from "./workspace.js";
import { RepairApplyError, applyRepairProposal } from "./apply.js";
import { buildWorkspace, type BuildResult } from "./build.js";
import type { RepairTypecheck } from "./repair-fixture.js";
import {
  replayCheckoutScenario,
  scanRepairedTarget,
  startStaticServer,
  type StaticServer,
} from "./replay.js";
import { buildCriticInput, requestCriticDecision } from "./critic.js";
import {
  compareAxeScans,
  compareScenarioAssertions,
  evaluateAcceptanceGate,
} from "./regression.js";
import {
  buildFailureFeedback,
  classifyFailureStage,
} from "./feedback.js";
import {
  RepairRevisionValidationError,
  validateRepairRevision,
} from "./validate-revision.js";
import {
  evaluateReverseTraversal,
  replayReverseTraversal,
} from "./reverse.js";

/**
 * Bounded verifier-driven recovery (Attempt 2 of MAX_REPAIR_ATTEMPTS).
 *
 * Consumes the preserved Attempt-1 artifacts (proposal, diff, replay,
 * typecheck failure, lifecycle) WITHOUT rewriting them, builds the
 * compact RepairFailureFeedback bundle, requests exactly ONE revised
 * proposal grounded in that feedback, applies it in a FRESH isolated
 * workspace, and re-runs deterministic verification (typecheck first,
 * then build, replay, reverse traversal, axe comparison). The critic is
 * called ONLY when every gate passes. Any deterministic failure STOPS
 * with no further model call — there is never a Proposal #3.
 */

export const REVISION_FEEDBACK_FILE = "repair-feedback.json";
export const REVISION_PROPOSAL_FILE = "repair-revision-proposal.json";
export const REVISION_USAGE_FILE = "repair-revision-model-usage.json";
export const REVISION_DIFF_FILE = "repair-revision-diff.patch";
export const REVISION_VERIFY_FILE = "repair-revision-verification.json";
export const REVISION_LIFECYCLE_FILE = "repair-revision-lifecycle.json";
export const REVISED_SCENARIO_FILE = "revised-scenario.json";
export const REVISED_SCAN_FILE = "revised-scan.json";
export const REVISED_REVERSE_FILE = "revised-reverse-scenario.json";
export const REVISED_SCREENSHOT = "focus-contained-after-revision.png";
export const REVISED_REVERSE_SCREENSHOT =
  "reverse-focus-contained-revision.png";
export const REVISION_CRITIC_DECISION_FILE = "critic-decision.json";
export const REVISION_CRITIC_USAGE_FILE = "critic-model-usage.json";

/** Typecheck runs before the build so compiler failure stops early. */
const REVISION_TYPECHECK_COMMAND = "node <workspace>/typescript/bin/tsc --noEmit";

export interface RecoverDrivers {
  typecheckWorkspace: (
    workspaceSourceRoot: string,
  ) => Promise<RepairTypecheck>;
  buildWorkspace: (workspaceSourceRoot: string) => Promise<BuildResult>;
  serveDist: (distDir: string) => Promise<StaticServer>;
  replayScenario: (
    targetUrl: string,
    screenshotDir: string,
  ) => Promise<KeyboardScenarioResult>;
  replayReverse: (
    targetUrl: string,
    screenshotDir: string,
  ) => Promise<KeyboardScenarioResult>;
  scanUrl: (targetUrl: string) => Promise<AccessibilityScanResult>;
  scanBaseline: () => Promise<AccessibilityScanResult>;
  requestRevision: (request: RepairRevisionRequest) => Promise<{
    proposal: RepairProposal;
    usage: ModelUsage;
    model: string;
  }>;
  requestCritic: (input: CriticInput) => Promise<{
    decision: CriticDecision;
    usage: ModelUsage;
    model: string;
  }>;
}

export interface RecoverFixtureDeps {
  env?: NodeJS.ProcessEnv;
  fetchFn?: MetaFetch;
  runsDir?: string;
  fixtureRoot?: string;
  workspacesDir?: string;
  drivers?: Partial<RecoverDrivers>;
}

export interface RecoverFixtureResult {
  runId: string;
  runDir: string;
  /** Attempt-1 repair id (preserved evidence). */
  originalRepairId: string;
  /** Attempt-2 repair id (fresh workspace). */
  repairId: string;
  workspace: RepairWorkspace | null;
  feedback: RepairFailureFeedback;
  revision: RepairProposal | null;
  finalState: RepairLifecycleState;
  lifecycle: RepairLifecycle;
  verification: RepairVerificationResult | null;
  reversePassed: boolean | null;
  criticDecision: CriticDecision | null;
  criticUsage: ModelUsage | null;
  criticModel: string | null;
  /** Live Meta calls made (revision + critic); at most 2. */
  modelCalls: number;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function defaultScanBaseline(): Promise<AccessibilityScanResult> {
  const { startFixtureServer } = await import(
    "../scanner/fixture-server.js"
  );
  let server: FixtureServer | undefined;
  try {
    server = await startFixtureServer();
    return await runAxeScan(server.url);
  } finally {
    await server?.stop();
  }
}

function defaultDrivers(
  env: NodeJS.ProcessEnv,
  fetchFn: MetaFetch | undefined,
): RecoverDrivers {
  return {
    typecheckWorkspace: async (root) => {
      const { spawn } = await import("node:child_process");
      const { createRequire } = await import("node:module");
      const { dirname, join: joinPath } = await import("node:path");
      let tscBin: string;
      try {
        const workspaceRequire = createRequire(joinPath(root, "package.json"));
        const tsPkgPath = workspaceRequire.resolve("typescript/package.json");
        tscBin = joinPath(dirname(tsPkgPath), "bin", "tsc");
      } catch {
        return {
          passed: false,
          command: REVISION_TYPECHECK_COMMAND,
          note: "typescript compiler not resolvable from the workspace",
          outputTail: "",
        };
      }
      let output = "";
      const exitCode: number | null = await new Promise((resolve) => {
        const child = spawn(process.execPath, [tscBin, "--noEmit"], {
          cwd: root,
          env: process.env,
        });
        const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
        if (typeof timer.unref === "function") {
          timer.unref();
        }
        child.stdout?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.on("error", () => {
          clearTimeout(timer);
          resolve(null);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });
      const outputTail = output.slice(-2000);
      return {
        passed: exitCode === 0,
        command: REVISION_TYPECHECK_COMMAND,
        note:
          exitCode === 0
            ? "tsc --noEmit clean"
            : `tsc exited ${String(exitCode)}: ${outputTail}`,
        outputTail,
      };
    },
    buildWorkspace: (root) => buildWorkspace({ workspaceSourceRoot: root }),
    serveDist: (distDir) => startStaticServer(distDir),
    replayScenario: (url, dir) =>
      replayCheckoutScenario({
        targetUrl: url,
        screenshotDir: dir,
        screenshotPrefix: "revised",
        containedScreenshotName: REVISED_SCREENSHOT,
      }),
    replayReverse: (url, dir) =>
      replayReverseTraversal({
        targetUrl: url,
        screenshotDir: dir,
        screenshotPrefix: "revised",
        containedScreenshotName: REVISED_REVERSE_SCREENSHOT,
      }),
    scanUrl: (url) => scanRepairedTarget(url),
    scanBaseline: () => defaultScanBaseline(),
    requestRevision: async (request) => {
      const apiKey = requireApiKey(env);
      const model = getMetaModel(env);
      // At most one transport retry, only when no usable response was
      // received (network-level failure, status unknown).
      try {
        const result = await proposeRepairRevisionWithMeta(request, {
          ...(fetchFn !== undefined ? { fetchFn } : {}),
          model,
          apiKey,
        });
        return { ...result, model };
      } catch (error) {
        if (error instanceof MetaApiError && error.status === null) {
          const result = await proposeRepairRevisionWithMeta(request, {
            ...(fetchFn !== undefined ? { fetchFn } : {}),
            model,
            apiKey,
          });
          return { ...result, model };
        }
        throw error;
      }
    },
    requestCritic: (input) =>
      requestCriticDecision({
        env,
        ...(fetchFn !== undefined ? { fetchFn } : {}),
        input,
      }),
  };
}

export interface FailedAttemptSelection {
  runId: string;
  runDir: string;
  diagnosis: AccessibilityDiagnosis;
  beforeResult: KeyboardScenarioResult;
  proposal: RepairProposal;
  trace: SourceTraceResult;
  repairId: string;
  previousState: RepairLifecycleState;
  previousBasis: string;
  repairStrategy: string;
}

/**
 * Select the latest run holding a terminally FAILED first attempt that has
 * not yet consumed its single revision. Runs that already carry
 * `repair-revision-proposal.json` have exhausted MAX_REPAIR_ATTEMPTS and
 * are skipped — there is never a Proposal #3.
 */
export async function findFailedAttemptForRecovery(
  runsDir: string,
): Promise<FailedAttemptSelection> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (error) {
    throw new Error(
      `recover:fixture: cannot list runs in ${runsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let exhausted = false;
  for (const runId of entries.sort().reverse()) {
    const runDir = join(runsDir, runId);
    const has = async (name: string): Promise<boolean> => {
      try {
        await readFile(join(runDir, name), "utf8");
        return true;
      } catch {
        return false;
      }
    };
    if (!(await has("repair-proposal.json"))) {
      continue;
    }
    if (await has(REVISION_PROPOSAL_FILE)) {
      exhausted = true;
      continue;
    }
    // Load this specific run directly (never a newer/older run's files).
    let diagnosisRaw: string;
    let resultRaw: string;
    let proposalRaw: string;
    let lifecycleRaw: string;
    let verificationRaw: string;
    let traceRaw: string | null;
    try {
      [diagnosisRaw, resultRaw, proposalRaw, lifecycleRaw, verificationRaw] =
        await Promise.all([
          readFile(join(runDir, "diagnosis.json"), "utf8"),
          readFile(join(runDir, "scenario.json"), "utf8"),
          readFile(join(runDir, "repair-proposal.json"), "utf8"),
          readFile(join(runDir, "repair-lifecycle.json"), "utf8"),
          readFile(join(runDir, "repair-verification.json"), "utf8"),
        ]);
      traceRaw = await readFile(join(runDir, "source-trace.json"), "utf8").catch(
        () => null,
      );
    } catch {
      continue;
    }
    const diagnosis = AccessibilityDiagnosisSchema.safeParse(
      safeJson(diagnosisRaw),
    );
    const beforeResult = KeyboardScenarioResultSchema.safeParse(
      safeJson(resultRaw),
    );
    const proposal = RepairProposalSchema.safeParse(safeJson(proposalRaw));
    const lifecycle = RepairLifecycleSchema.safeParse(safeJson(lifecycleRaw));
    const verification = RepairVerificationResultSchema.safeParse(
      safeJson(verificationRaw),
    );
    const trace =
      traceRaw === null
        ? null
        : SourceTraceResultSchema.safeParse(safeJson(traceRaw));
    if (
      !diagnosis.success ||
      !beforeResult.success ||
      !proposal.success ||
      !lifecycle.success ||
      !verification.success ||
      trace === null ||
      !trace.success
    ) {
      continue;
    }
    if (!isRepairLifecycleTerminal(lifecycle.data.state)) {
      continue;
    }
    if (
      lifecycle.data.state === "ACCEPTED" ||
      lifecycle.data.state === "VERIFIED"
    ) {
      continue;
    }
    return {
      runId,
      runDir,
      diagnosis: diagnosis.data,
      beforeResult: beforeResult.data,
      proposal: proposal.data,
      trace: trace.data,
      repairId: lifecycle.data.repairId,
      previousState: lifecycle.data.state,
      previousBasis: verification.data.decisionBasis,
      repairStrategy: diagnosis.data.recommendedRepairStrategy,
    };
  }
  if (exhausted) {
    throw new Error(
      `recover:fixture: revision already attempted (MAX_REPAIR_ATTEMPTS=${String(MAX_REPAIR_ATTEMPTS)} exhausted) — refusing Proposal #3.`,
    );
  }
  throw new Error(
    `recover:fixture: no failed first attempt found. Run \`pnpm repair:fixture\` first.`,
  );
}

/** Derive the Attempt-1 typecheck outcome from preserved verification. */
export function attemptTypecheckOf(basis: string): {
  passed: boolean;
  exitStatus: number | null;
  output: string;
} {
  const failed = /typecheck failed/i.test(basis);
  const exitMatch = /tsc exited (\d+)/.exec(basis);
  const output = failed
    ? (basis.split("fixture typecheck failed:")[1] ?? basis).trim()
    : "";
  return {
    passed: !failed,
    exitStatus: exitMatch?.[1] !== undefined ? Number(exitMatch[1]) : null,
    output,
  };
}

/** Human-readable closed-loop recovery report (the failed-first story). */
export function formatRecoverySummary(args: {
  result: RecoverFixtureResult;
  originalProposal: RepairProposal;
  diagnosisTitle: string;
}): string {
  const { result, originalProposal, diagnosisTitle } = args;
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge Autonomous Repair");
  lines.push("");
  lines.push("Target issue:");
  lines.push(diagnosisTitle);
  lines.push("");
  lines.push("ATTEMPT 1");
  lines.push("✓ repair applied");
  lines.push("✓ browser behavior fixed");
  const codes = result.feedback.diagnosticCodes;
  lines.push(
    `✗ TypeScript failed — ${codes.length > 0 ? codes.join(", ") : result.feedback.failedStage}`,
  );
  lines.push(`${result.originalRepairId}: ${result.feedback.previousLifecycleResult}`);
  lines.push(`(preserved: repair-proposal.json, repair-diff.patch, repair-lifecycle.json)`);
  lines.push("");
  lines.push("VERIFIER FEEDBACK");
  lines.push(
    `${result.feedback.diagnosticCodes.join(", ") || result.feedback.failedStage}: ${result.feedback.affectedSourceRegion || "see repair-feedback.json"}`,
  );
  lines.push("");
  lines.push("ATTEMPT 2");
  if (result.revision === null) {
    lines.push("✗ revision proposal invalid — stopped before applying");
  } else {
    lines.push("✓ revised proposal grounded in verifier feedback");
    lines.push("✓ exact anchor validated");
    const v = result.verification;
    if (v === null) {
      lines.push("(verification not reached)");
    } else {
      lines.push(v.buildPassed ? "✓ TypeScript" : "✗ TypeScript");
      lines.push(v.buildPassed ? "✓ build" : "✗ build");
      lines.push(v.scenarioPassed ? "✓ keyboard replay" : "✗ keyboard replay");
      lines.push(
        v.resolvedTargetFailure ? "✓ focus containment" : "✗ focus containment",
      );
      lines.push(
        result.reversePassed === true
          ? "✓ reverse traversal"
          : result.reversePassed === false
            ? "✗ reverse traversal"
            : "(reverse traversal not run)",
      );
      lines.push(
        v.regressions.length === 0
          ? "✓ axe baseline preserved"
          : `✗ axe regressions: ${v.regressions.join("; ")}`,
      );
    }
  }
  lines.push("");
  lines.push("CRITIC");
  if (result.criticDecision && result.criticModel) {
    lines.push(`Decision: ${result.criticDecision.decision}`);
    lines.push(`Confidence: ${String(result.criticDecision.confidence)}`);
  } else {
    lines.push("skipped (deterministic gate did not pass)");
  }
  lines.push("");
  lines.push("FINAL");
  lines.push(
    result.finalState === "ACCEPTED"
      ? "✓ REPAIR ACCEPTED"
      : `✗ REPAIR ${result.finalState}`,
  );
  lines.push("");
  lines.push(`Original proposal: ${originalProposal.proposalId}`);
  lines.push(`Revision: ${result.revision?.proposalId ?? "(none)"}`);
  lines.push(`Live Meta calls: ${String(result.modelCalls)} (max 2)`);
  lines.push("");
  return lines.join("\n");
}

function snapshotOf(result: KeyboardScenarioResult): {
  passed: boolean;
  actualFocus: string;
} {
  const assertion = result.assertions.find(
    (item) => item.assertion === "focus-contained-in-modal",
  );
  if (!assertion) {
    throw new Error(
      "recover:fixture: focus-contained-in-modal assertion missing from the original run",
    );
  }
  return { passed: assertion.passed, actualFocus: assertion.actualFocus };
}

/**
 * Run the single bounded recovery: feedback → ONE revision call → fresh
 * workspace → typecheck → build → replay (+ reverse) → axe → gate →
 * critic iff eligible. Returns the terminal result; never attempts a
 * third proposal.
 */
export async function runRecoverFixture(
  deps: RecoverFixtureDeps = {},
): Promise<RecoverFixtureResult> {
  const env = deps.env ?? process.env;
  const runsDir =
    deps.runsDir ?? join(findWorkspaceRoot(), ".a11yforge", "runs");
  const fixtureRoot = deps.fixtureRoot ?? defaultFixtureSourceRoot();
  const workspacesDir = deps.workspacesDir ?? defaultWorkspacesDir();
  const drivers: RecoverDrivers = {
    ...defaultDrivers(env, deps.fetchFn),
    ...deps.drivers,
  };

  const failed = await findFailedAttemptForRecovery(runsDir);
  const { runId, runDir, diagnosis, beforeResult, proposal } = failed;

  // Rebuild the exact context the first proposal was validated against.
  const bundle = buildFocusContainmentBundle(beforeResult);
  const context = buildRepairContextBundle(diagnosis, bundle, failed.trace);
  try {
    validateRepairProposal({ proposal, context, sourceRoot: fixtureRoot });
  } catch (error) {
    if (error instanceof RepairProposalValidationError) {
      throw new Error(
        `recover:fixture: original proposal no longer validates: ${error.message}`,
      );
    }
    throw error;
  }

  // Verifier feedback from the preserved Attempt-1 evidence.
  const typecheck = attemptTypecheckOf(failed.previousBasis);
  const failedStage: VerificationStage = classifyFailureStage({
    applySucceeded: true,
    typecheckPassed: typecheck.passed ? true : false,
    buildPassed: null,
    resolvedTargetFailure: null,
    regressions: [],
    newSeriousCritical: [],
  });
  const feedback = buildFailureFeedback({
    proposal,
    repairId: failed.repairId,
    previousLifecycleResult: failed.previousState,
    failedStage,
    compilerCommand: REVISION_TYPECHECK_COMMAND,
    exitStatus: typecheck.exitStatus,
    compilerOutput: typecheck.output === "" ? failed.previousBasis : typecheck.output,
    diagnosisId: diagnosis.diagnosisId,
    observedFailure: diagnosis.observedFailure,
    repairStrategy: failed.repairStrategy,
    suppliedSourceFiles: context.sourceFiles.map((file) => file.filePath),
  });
  await writeFile(
    join(runDir, REVISION_FEEDBACK_FILE),
    `${JSON.stringify(feedback, null, 2)}\n`,
    "utf8",
  );

  // Live call budget for the whole recovery: 1 revision + 1 critic.
  const budget = new ModelCallBudget(MAX_REPAIR_ATTEMPTS);
  budget.consume();

  const revisionRequest = RepairRevisionRequestSchema.parse({
    requestId: `rev-${proposal.proposalId.replace(/^prop-/, "")}`,
    context,
    originalProposal: proposal,
    feedback,
  });

  // THE single revision call (Call 1 of at most 2).
  const { proposal: revision, usage: revisionUsage } =
    await drivers.requestRevision(revisionRequest);
  let modelCalls = 1;
  await writeFile(
    join(runDir, REVISION_PROPOSAL_FILE),
    `${JSON.stringify(revision, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, REVISION_USAGE_FILE),
    `${JSON.stringify(revisionUsage, null, 2)}\n`,
    "utf8",
  );

  const repairId = `repair-${revision.proposalId.replace(/^prop-/, "")}`;
  let lifecycle = newRepairLifecycle({ repairId, proposalId: revision.proposalId });
  const persistLifecycle = async (): Promise<void> => {
    await writeFile(
      join(runDir, REVISION_LIFECYCLE_FILE),
      `${JSON.stringify(lifecycle, null, 2)}\n`,
      "utf8",
    );
  };
  let workspaceRef: RepairWorkspace | null = null;
  const snapshotBefore = snapshotOf(beforeResult);
  const noReplayVerification = (
    basis: string,
    typecheckNote: string,
  ): RepairVerificationResult =>
    RepairVerificationResultSchema.parse({
      repairId,
      proposalId: revision.proposalId,
      buildPassed: false,
      buildCommand: "(not run)",
      buildExitCode: null,
      buildDurationMs: 0,
      originalAssertion: snapshotBefore,
      repairedAssertion: {
        passed: false,
        actualFocus: "(no replay — stopped before replay)",
      },
      scenarioPassed: false,
      baselineAxeRules: [],
      repairedAxeRules: [],
      newAxeViolations: [],
      removedBaselineRules: [],
      newSeriousCritical: [],
      resolvedTargetFailure: false,
      regressions: [],
      diffArtifact: REVISION_DIFF_FILE,
      evidenceArtifacts: [],
      decisionBasis: `${basis}; ${typecheckNote}`,
    });
  const finish = (args: {
    verification: RepairVerificationResult | null;
    reversePassed: boolean | null;
    critic: {
      decision: CriticDecision | null;
      usage: ModelUsage | null;
      model: string | null;
    };
  }): RecoverFixtureResult => ({
    runId,
    runDir,
    originalRepairId: failed.repairId,
    repairId,
    workspace:
      workspaceRef ??
      null,
    feedback,
    revision,
    finalState: lifecycle.state,
    lifecycle,
    verification: args.verification,
    reversePassed: args.reversePassed,
    criticDecision: args.critic.decision,
    criticUsage: args.critic.usage,
    criticModel: args.critic.model,
    modelCalls,
  });
  const report = (result: RecoverFixtureResult): void => {
    console.log(
      formatRecoverySummary({
        result,
        originalProposal: proposal,
        diagnosisTitle: diagnosis.title,
      }),
    );
  };

  // Revision safety: all existing safeguards plus revision-only rules.
  let nonNullNotes: string[] = [];
  try {
    const checked = validateRepairRevision({
      revision,
      original: proposal,
      context,
      sourceRoot: fixtureRoot,
      failedStage,
    });
    nonNullNotes = checked.nonNullAssertions;
  } catch (error) {
    if (error instanceof RepairRevisionValidationError) {
      lifecycle = transitionRepairLifecycle(
        lifecycle,
        "REJECTED",
        error.message.slice(0, 1000),
      );
      await persistLifecycle();
      const done = finish({
        verification: null,
        reversePassed: null,
        critic: { decision: null, usage: null, model: null },
      });
      report(done);
      return done;
    }
    throw error;
  }
  // FRESH isolated workspace from the original broken fixture — never a
  // mutated repair workspace, never the main fixture source.
  lifecycle = transitionRepairLifecycle(
    lifecycle,
    "APPLYING",
    "validated revision; creating fresh isolated workspace",
  );
  const workspace = await createRepairWorkspace({
    repairId,
    fixtureRoot,
    workspacesDir,
  });
  workspaceRef = workspace;
  let diffText: string;
  try {
    ({ diffText } = await applyRepairProposal({
      workspaceSourceRoot: workspace.sourceRoot,
      proposal: revision,
    }));
  } catch (error) {
    if (error instanceof RepairApplyError) {
      lifecycle = transitionRepairLifecycle(lifecycle, "REJECTED", error.message);
      await persistLifecycle();
      const verification = noReplayVerification(
        `revision application refused: ${error.message}`,
        "no replay evidence fabricated",
      );
      await writeFile(
        join(runDir, REVISION_VERIFY_FILE),
        `${JSON.stringify(verification, null, 2)}\n`,
        "utf8",
      );
      const done = finish({
        verification,
        reversePassed: null,
        critic: { decision: null, usage: null, model: null },
      });
      report(done);
      return done;
    }
    throw error;
  }
  await writeFile(join(runDir, REVISION_DIFF_FILE), diffText, "utf8");
  lifecycle = transitionRepairLifecycle(
    lifecycle,
    "APPLIED",
    nonNullNotes.length > 0
      ? `exact anchors verified; revision diff recorded (non-null-like spellings reported: ${nonNullNotes.join(", ").slice(0, 200)})`
      : "exact anchors verified; revision diff recorded",
  );

  // TYPECHECK FIRST — a compiler failure stops before build/replay/critic.
  const revisionTypecheck = await drivers.typecheckWorkspace(
    workspace.sourceRoot,
  );
  if (!revisionTypecheck.passed) {
    lifecycle = transitionRepairLifecycle(
      lifecycle,
      "TYPECHECK_FAILED",
      `revision typecheck failed: ${revisionTypecheck.note}`.slice(0, 1000),
    );
    await persistLifecycle();
    const verification = noReplayVerification(
      "deterministic gate failed: revision typecheck did not pass",
      revisionTypecheck.note,
    );
    await writeFile(
      join(runDir, REVISION_VERIFY_FILE),
      `${JSON.stringify(verification, null, 2)}\n`,
      "utf8",
    );
    const done = finish({
      verification,
      reversePassed: null,
      critic: { decision: null, usage: null, model: null },
    });
    report(done);
    return done;
  }

  // BUILD the revised fixture.
  const build = await drivers.buildWorkspace(workspace.sourceRoot);
  if (!build.passed) {
    lifecycle = transitionRepairLifecycle(
      lifecycle,
      "BUILD_FAILED",
      `build failed: ${build.command} exited ${String(build.exitCode)}`,
    );
    await persistLifecycle();
    const verification = RepairVerificationResultSchema.parse({
      ...noReplayVerification(
        `build failed (${build.command} exit ${String(build.exitCode)}); replay and regression scan not run`,
        revisionTypecheck.note,
      ),
      buildCommand: build.command,
      buildExitCode: build.exitCode,
      buildDurationMs: build.durationMs,
    });
    await writeFile(
      join(runDir, REVISION_VERIFY_FILE),
      `${JSON.stringify(verification, null, 2)}\n`,
      "utf8",
    );
    const done = finish({
      verification,
      reversePassed: null,
      critic: { decision: null, usage: null, model: null },
    });
    report(done);
    return done;
  }

  // REPLAY the exact scenario + reverse traversal + axe scan of the build.
  let served: StaticServer | undefined;
  let revised: KeyboardScenarioResult;
  let reversed: KeyboardScenarioResult;
  let revisedScan: AccessibilityScanResult;
  try {
    served = await drivers.serveDist(join(workspace.sourceRoot, "dist"));
    revised = await drivers.replayScenario(served.url, runDir);
    reversed = await drivers.replayReverse(served.url, runDir);
    revisedScan = await drivers.scanUrl(served.url);
  } finally {
    await served?.stop();
  }
  await writeFile(
    join(runDir, REVISED_SCENARIO_FILE),
    `${JSON.stringify(revised, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, REVISED_REVERSE_FILE),
    `${JSON.stringify(reversed, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, REVISED_SCAN_FILE),
    `${JSON.stringify(revisedScan, null, 2)}\n`,
    "utf8",
  );

  const baseline = await drivers.scanBaseline();
  const axe = compareAxeScans({ baseline, repaired: revisedScan });
  const scenario = compareScenarioAssertions({
    before: beforeResult,
    after: revised,
  });
  const reverse = evaluateReverseTraversal(reversed);

  // DETERMINISTIC GATE — any failure REJECTS without spending the critic.
  const gate = evaluateAcceptanceGate({
    buildPassed: build.passed,
    applySucceeded: true,
    scenarioCompleted: true,
    resolvedTargetFailure: scenario.resolvedTargetFailure,
    newSeriousCritical: axe.newSeriousCritical,
    regressions: axe.regressions,
    requiredTestsPassed: revisionTypecheck.passed,
  });
  const reasons = [...gate.reasons];
  if (!reverse.passed || !reverse.allInsideModal) {
    reasons.push(
      `reverse Shift+Tab traversal did not stay inside the modal (focus on ${reverse.actualFocus})`,
    );
  }
  const reverseNote =
    reverse.passed && reverse.allInsideModal
      ? "reverse Shift+Tab traversal contained"
      : `reverse traversal failed (focus on ${reverse.actualFocus})`;

  const verification = RepairVerificationResultSchema.parse({
    repairId,
    proposalId: revision.proposalId,
    buildPassed: build.passed,
    buildCommand: build.command,
    buildExitCode: build.exitCode,
    buildDurationMs: build.durationMs,
    originalAssertion: scenario.before,
    repairedAssertion: scenario.after,
    scenarioPassed: scenario.scenarioPassed,
    baselineAxeRules: axe.baselineRules,
    repairedAxeRules: axe.repairedRules,
    newAxeViolations: axe.newViolations,
    removedBaselineRules: axe.removedBaselineRules,
    newSeriousCritical: axe.newSeriousCritical,
    resolvedTargetFailure: scenario.resolvedTargetFailure,
    regressions: axe.regressions,
    diffArtifact: REVISION_DIFF_FILE,
    evidenceArtifacts: [
      REVISED_SCENARIO_FILE,
      REVISED_REVERSE_FILE,
      REVISED_SCAN_FILE,
      REVISED_SCREENSHOT,
    ],
    decisionBasis:
      reasons.length === 0
        ? `deterministic gate passed: typecheck clean, build passed, same scenario replayed, target assertion flips to passing, ${reverseNote}, axe baseline preserved`
        : `deterministic gate failed: ${reasons.join("; ")}; ${reverseNote}`,
  });
  await writeFile(
    join(runDir, REVISION_VERIFY_FILE),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );

  if (reasons.length > 0) {
    const failureState: RepairLifecycleState = !scenario.resolvedTargetFailure ||
      !reverse.passed
      ? "VERIFY_FAILED"
      : "REGRESSION_FAILED";
    lifecycle = transitionRepairLifecycle(
      lifecycle,
      failureState,
      verification.decisionBasis.slice(0, 1000),
    );
    await persistLifecycle();
    const done = finish({
      verification,
      reversePassed: reverse.passed && reverse.allInsideModal,
      critic: { decision: null, usage: null, model: null },
    });
    report(done);
    return done;
  }

  // CRITIC — the second and final permitted live call, only after all gates.
  lifecycle = transitionRepairLifecycle(
    lifecycle,
    "VERIFIED",
    "deterministic gate passed; requesting critic verdict",
  );
  budget.consume();
  const criticInput = {
    ...buildCriticInput({
      diagnosis,
      proposal: revision,
      verification,
      diffText,
      evidenceIds: bundle.items.map((item) => item.id),
    }),
    previousProposalSummary: proposal.summary.slice(0, 2000),
    previousRejectionReason:
      `Attempt 1 ${failed.previousState}: ${failed.previousBasis}`.slice(0, 2000),
  };
  const { decision, usage, model } = await drivers.requestCritic(criticInput);
  modelCalls += 1;
  await writeFile(
    join(runDir, REVISION_CRITIC_DECISION_FILE),
    `${JSON.stringify(decision, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, REVISION_CRITIC_USAGE_FILE),
    `${JSON.stringify(usage, null, 2)}\n`,
    "utf8",
  );

  lifecycle = transitionRepairLifecycle(
    lifecycle,
    decision.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
    `critic ${decision.decision} (confidence ${decision.confidence}): ${decision.summary}`,
  );
  await persistLifecycle();
  const done = finish({
    verification,
    reversePassed: true,
    critic: { decision, usage, model },
  });
  report(done);
  return done;
}

import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ModelCallBudget, getMaxModelCallsPerRun, type MetaFetch } from "@a11yforge/meta";
import {
  RepairProposalSchema,
  RepairVerificationResultSchema,
  type AccessibilityScanResult,
  type CriticDecision,
  type CriticInput,
  type KeyboardScenarioResult,
  type ModelUsage,
  type RepairLifecycle,
  type RepairLifecycleState,
  type RepairProposal,
  type RepairVerificationResult,
} from "@a11yforge/shared";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import {
  startFixtureServer,
  type FixtureServer,
} from "../scanner/fixture-server.js";
import { runAxeScan } from "../scanner/scan.js";
import { buildFocusContainmentBundle } from "../diagnosis/evidence-bundle.js";
import {
  defaultFixtureSourceRoot,
  findLatestDiagnosedRun,
  SourceTraceResultSchema,
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

/**
 * Phase 5 closed-loop repair: validate proposal → isolated workspace →
 * apply → build → replay the SAME scenario → axe regression scan →
 * deterministic gate → bounded critic iff eligible → final verdict.
 *
 * Never generates another repair proposal. Never mutates the main
 * fixture source. Makes AT MOST ONE Meta call (the critic), only after
 * deterministic verification passes. Transport/API failure never retries.
 */

export interface RepairTypecheck {
  passed: boolean;
  command: string;
  note: string;
  /** Bounded compiler output explaining a failure (empty when clean). */
  outputTail: string;
}

export interface RepairDrivers {
  buildWorkspace: (workspaceSourceRoot: string) => Promise<BuildResult>;
  typecheckWorkspace: (
    workspaceSourceRoot: string,
  ) => Promise<RepairTypecheck>;
  serveDist: (distDir: string) => Promise<StaticServer>;
  replayScenario: (
    targetUrl: string,
    screenshotDir: string,
  ) => Promise<KeyboardScenarioResult>;
  scanUrl: (targetUrl: string) => Promise<AccessibilityScanResult>;
  scanBaseline: () => Promise<AccessibilityScanResult>;
  requestCritic: (input: CriticInput) => Promise<{
    decision: CriticDecision;
    usage: ModelUsage;
    model: string;
  }>;
}

export interface RepairFixtureDeps {
  env?: NodeJS.ProcessEnv;
  fetchFn?: MetaFetch;
  runsDir?: string;
  fixtureRoot?: string;
  workspacesDir?: string;
  drivers?: Partial<RepairDrivers>;
}

export interface RepairFixtureResult {
  runId: string;
  runDir: string;
  repairId: string;
  workspace: RepairWorkspace;
  finalState: RepairLifecycleState;
  lifecycle: RepairLifecycle;
  verification: RepairVerificationResult;
  criticDecision: CriticDecision | null;
  criticUsage: ModelUsage | null;
  criticModel: string | null;
  modelCalls: number;
}

async function defaultTypecheck(
  workspaceSourceRoot: string,
): Promise<RepairTypecheck> {
  const command = "node <workspace>/typescript/bin/tsc --noEmit";
  let tscBin: string;
  try {
    const workspaceRequire = createRequire(
      join(workspaceSourceRoot, "package.json"),
    );
    const tsPkgPath = workspaceRequire.resolve("typescript/package.json");
    tscBin = join(dirname(tsPkgPath), "bin", "tsc");
  } catch {
    return {
      passed: false,
      command,
      note: "typescript compiler not resolvable from the workspace",
      outputTail: "",
    };
  }
  let output = "";
  const exitCode: number | null = await new Promise((resolve) => {
    const child = spawn(process.execPath, [tscBin, "--noEmit"], {
      cwd: workspaceSourceRoot,
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
    command,
    note:
      exitCode === 0
        ? "tsc --noEmit clean"
        : `tsc exited ${String(exitCode)}: ${outputTail}`,
    outputTail,
  };
}

async function defaultScanBaseline(): Promise<AccessibilityScanResult> {
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
): RepairDrivers {
  return {
    buildWorkspace: (root) => buildWorkspace({ workspaceSourceRoot: root }),
    typecheckWorkspace: (root) => defaultTypecheck(root),
    serveDist: (distDir) => startStaticServer(distDir),
    replayScenario: (url, dir) =>
      replayCheckoutScenario({ targetUrl: url, screenshotDir: dir }),
    scanUrl: (url) => scanRepairedTarget(url),
    scanBaseline: () => defaultScanBaseline(),
    requestCritic: (input) =>
      requestCriticDecision({
        env,
        ...(fetchFn !== undefined ? { fetchFn } : {}),
        input,
      }),
  };
}

async function loadProposal(runDir: string): Promise<RepairProposal> {
  const path = join(runDir, "repair-proposal.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      `repair:fixture: no repair-proposal.json in ${runDir}. Run \`pnpm propose:fixture\` first.`,
    );
  }
  const parsed = RepairProposalSchema.safeParse(safeJson(raw));
  if (!parsed.success) {
    throw new Error(
      `repair:fixture: ${path} is not a valid repair-proposal artifact: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Human-readable closed-loop terminal report. */
export function formatRepairSummary(args: {
  result: RepairFixtureResult;
  proposal: RepairProposal;
  diagnosisTitle: string;
}): string {
  const { result, proposal, diagnosisTitle } = args;
  const v = result.verification;
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge Autonomous Repair");
  lines.push("");
  lines.push("Target issue:");
  lines.push(diagnosisTitle);
  lines.push("");
  lines.push("Source:");
  for (const target of proposal.targetFiles) {
    lines.push(target);
  }
  lines.push("");
  lines.push("APPLY");
  if (result.lifecycle.transitions.some((t) => t.to === "REJECTED" && t.from === "APPLYING")) {
    lines.push("✗ repair application refused (see repair-lifecycle.json)");
  } else {
    lines.push("✓ exact source anchor verified");
    lines.push("✓ repair applied in isolated workspace");
  }
  lines.push("");
  lines.push("BUILD");
  lines.push(v.buildPassed ? "✓ passed" : "✗ failed");
  lines.push("");
  lines.push("REPLAY");
  if (v.buildPassed) {
    lines.push(
      `Before: focus ${v.originalAssertion.passed ? "contained" : `escaped to ${v.originalAssertion.actualFocus}`}`,
    );
    lines.push(
      `After:  focus ${v.repairedAssertion.passed ? `remained inside #checkout-modal (${v.repairedAssertion.actualFocus})` : `escaped to ${v.repairedAssertion.actualFocus}`}`,
    );
    lines.push(
      v.resolvedTargetFailure
        ? "✓ target failure resolved"
        : "✗ target failure NOT resolved",
    );
  } else {
    lines.push("(not run — build failed; no replay evidence fabricated)");
  }
  lines.push("");
  lines.push("REGRESSION");
  if (!v.buildPassed) {
    lines.push("(not run — build failed; no regression evidence fabricated)");
  } else if (v.regressions.length === 0) {
    lines.push("✓ existing axe baseline preserved");
    lines.push("✓ no new serious/critical violations");
  } else {
    for (const regression of v.regressions) {
      lines.push(`✗ ${regression}`);
    }
  }
  lines.push("");
  lines.push("CRITIC");
  if (result.criticDecision && result.criticModel) {
    lines.push(`Model: ${result.criticModel}`);
    lines.push(`Decision: ${result.criticDecision.decision}`);
    lines.push(`Confidence: ${result.criticDecision.confidence}`);
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
  lines.push("Basis:");
  lines.push(v.decisionBasis);
  lines.push("");
  return lines.join("\n");
}

export async function runRepairFixture(
  deps: RepairFixtureDeps = {},
): Promise<RepairFixtureResult> {
  const env = deps.env ?? process.env;
  const runsDir =
    deps.runsDir ?? join(findWorkspaceRoot(), ".a11yforge", "runs");
  const fixtureRoot = deps.fixtureRoot ?? defaultFixtureSourceRoot();
  const workspacesDir = deps.workspacesDir ?? defaultWorkspacesDir();
  const drivers: RepairDrivers = {
    ...defaultDrivers(env, deps.fetchFn),
    ...deps.drivers,
  };

  const selection = await findLatestDiagnosedRun(runsDir);
  const { runId, runDir, diagnosis, result: beforeResult } = selection;
  const proposal = await loadProposal(runDir);

  // Rebuild the exact context the proposal was validated against and
  // re-validate: an invalid proposal never reaches the workspace.
  const traceRaw = await readFile(join(runDir, "source-trace.json"), "utf8").catch(
    () => null,
  );
  const trace = SourceTraceResultSchema.safeParse(
    traceRaw ? safeJson(traceRaw) : null,
  );
  if (!trace.success) {
    throw new Error(
      `repair:fixture: missing or invalid source-trace.json in ${runDir}. Run \`pnpm trace:fixture\` first.`,
    );
  }
  const bundle = buildFocusContainmentBundle(beforeResult);
  const context = buildRepairContextBundle(diagnosis, bundle, trace.data);
  try {
    validateRepairProposal({ proposal, context, sourceRoot: fixtureRoot });
  } catch (error) {
    if (error instanceof RepairProposalValidationError) {
      let rejected = newRepairLifecycle({
        repairId: `repair-${proposal.proposalId.replace(/^prop-/, "")}`,
        proposalId: proposal.proposalId,
      });
      rejected = transitionRepairLifecycle(
        rejected,
        "REJECTED",
        `proposal re-validation failed: ${error.message}`,
      );
      await writeFile(
        join(runDir, "repair-lifecycle.json"),
        `${JSON.stringify(rejected, null, 2)}\n`,
        "utf8",
      );
    }
    throw error;
  }

  const repairId = `repair-${proposal.proposalId.replace(/^prop-/, "")}`;
  let lifecycle = newRepairLifecycle({
    repairId,
    proposalId: proposal.proposalId,
  });
  const persistLifecycle = async (): Promise<void> => {
    await writeFile(
      join(runDir, "repair-lifecycle.json"),
      `${JSON.stringify(lifecycle, null, 2)}\n`,
      "utf8",
    );
  };
  const finish = (
    verification: RepairVerificationResult,
    critic: {
      decision: CriticDecision | null;
      usage: ModelUsage | null;
      model: string | null;
      calls: number;
    },
    workspace: RepairWorkspace,
  ): RepairFixtureResult => ({
    runId,
    runDir,
    repairId,
    workspace,
    finalState: lifecycle.state,
    lifecycle,
    verification,
    criticDecision: critic.decision,
    criticUsage: critic.usage,
    criticModel: critic.model,
    modelCalls: critic.calls,
  });
  const report = (
    result: RepairFixtureResult,
  ): void => {
    console.log(
      formatRepairSummary({ result, proposal, diagnosisTitle: diagnosis.title }),
    );
  };
  const snapshotBefore = snapshotOf(beforeResult);
  const noReplayVerification = (
    basis: string,
  ): RepairVerificationResult =>
    RepairVerificationResultSchema.parse({
      repairId,
      proposalId: proposal.proposalId,
      buildPassed: false,
      buildCommand: "(not run)",
      buildExitCode: null,
      buildDurationMs: 0,
      originalAssertion: snapshotBefore,
      repairedAssertion: {
        passed: false,
        actualFocus: "(no replay — build or apply failed)",
      },
      scenarioPassed: false,
      baselineAxeRules: [],
      repairedAxeRules: [],
      newAxeViolations: [],
      removedBaselineRules: [],
      newSeriousCritical: [],
      resolvedTargetFailure: false,
      regressions: [],
      diffArtifact: "repair-diff.patch",
      evidenceArtifacts: [],
      decisionBasis: basis,
    });

  // APPLY in isolation — the main fixture source is never touched.
  lifecycle = transitionRepairLifecycle(
    lifecycle,
    "APPLYING",
    "validated proposal; creating isolated workspace",
  );
  const workspace = await createRepairWorkspace({
    repairId,
    fixtureRoot,
    workspacesDir,
  });
  let diffText: string;
  try {
    ({ diffText } = await applyRepairProposal({
      workspaceSourceRoot: workspace.sourceRoot,
      proposal,
    }));
  } catch (error) {
    if (error instanceof RepairApplyError) {
      lifecycle = transitionRepairLifecycle(lifecycle, "REJECTED", error.message);
      await persistLifecycle();
      const verification = noReplayVerification(
        `repair application refused: ${error.message}`,
      );
      await writeFile(
        join(runDir, "repair-verification.json"),
        `${JSON.stringify(verification, null, 2)}\n`,
        "utf8",
      );
      const done = finish(
        verification,
        { decision: null, usage: null, model: null, calls: 0 },
        workspace,
      );
      report(done);
      return done;
    }
    throw error;
  }
  await writeFile(join(runDir, "repair-diff.patch"), diffText, "utf8");
  lifecycle = transitionRepairLifecycle(
    lifecycle,
    "APPLIED",
    "exact anchors verified; diff recorded",
  );

  // BUILD the repaired fixture.
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
      ),
      buildCommand: build.command,
      buildExitCode: build.exitCode,
      buildDurationMs: build.durationMs,
    });
    await writeFile(
      join(runDir, "repair-verification.json"),
      `${JSON.stringify(verification, null, 2)}\n`,
      "utf8",
    );
    const done = finish(
      verification,
      { decision: null, usage: null, model: null, calls: 0 },
      workspace,
    );
    report(done);
    return done;
  }

  // REPLAY the exact scenario + axe regression scan against the build.
  let served: StaticServer | undefined;
  let repaired: KeyboardScenarioResult;
  let repairedScan: AccessibilityScanResult;
  try {
    served = await drivers.serveDist(join(workspace.sourceRoot, "dist"));
    repaired = await drivers.replayScenario(served.url, runDir);
    repairedScan = await drivers.scanUrl(served.url);
  } finally {
    await served?.stop();
  }
  await writeFile(
    join(runDir, "repaired-scenario.json"),
    `${JSON.stringify(repaired, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, "repaired-scan.json"),
    `${JSON.stringify(repairedScan, null, 2)}\n`,
    "utf8",
  );

  const baseline = await drivers.scanBaseline();
  const axe = compareAxeScans({ baseline, repaired: repairedScan });
  const scenario = compareScenarioAssertions({
    before: beforeResult,
    after: repaired,
  });
  const typecheck = await drivers.typecheckWorkspace(workspace.sourceRoot);

  // DETERMINISTIC GATE — any failure REJECTS without spending the critic.
  const gate = evaluateAcceptanceGate({
    buildPassed: build.passed,
    applySucceeded: true,
    scenarioCompleted: true,
    resolvedTargetFailure: scenario.resolvedTargetFailure,
    newSeriousCritical: axe.newSeriousCritical,
    regressions: axe.regressions,
    requiredTestsPassed: typecheck.passed,
  });
  const reasons = typecheck.passed
    ? gate.reasons
    : [...gate.reasons, `fixture typecheck failed: ${typecheck.note}`];

  const verification = RepairVerificationResultSchema.parse({
    repairId,
    proposalId: proposal.proposalId,
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
    diffArtifact: "repair-diff.patch",
    evidenceArtifacts: [
      "repaired-scenario.json",
      "repaired-scan.json",
      "focus-contained-after.png",
    ],
    decisionBasis:
      reasons.length === 0
        ? "deterministic gate passed: applied safely, build passed, same scenario replayed, target assertion flips to passing, axe baseline preserved, typecheck clean"
        : `deterministic gate failed: ${reasons.join("; ")}`,
  });
  await writeFile(
    join(runDir, "repair-verification.json"),
    `${JSON.stringify(verification, null, 2)}\n`,
    "utf8",
  );

  if (reasons.length > 0) {
    // Compiler failures get their own precise state instead of grouping
    // under REGRESSION_FAILED; historical artifacts stay readable.
    const failureState: RepairLifecycleState = !typecheck.passed
      ? "TYPECHECK_FAILED"
      : !scenario.resolvedTargetFailure
        ? "VERIFY_FAILED"
        : "REGRESSION_FAILED";
    lifecycle = transitionRepairLifecycle(lifecycle, failureState, verification.decisionBasis);
    await persistLifecycle();
    const done = finish(
      verification,
      { decision: null, usage: null, model: null, calls: 0 },
      workspace,
    );
    report(done);
    return done;
  }

  // CRITIC — the optional final call, only after deterministic success.
  lifecycle = transitionRepairLifecycle(
    lifecycle,
    "VERIFIED",
    "deterministic gate passed; requesting critic verdict",
  );
  const budget = new ModelCallBudget(getMaxModelCallsPerRun(env));
  budget.consume();
  const criticInput = buildCriticInput({
    diagnosis,
    proposal,
    verification,
    diffText,
    evidenceIds: bundle.items.map((item) => item.id),
  });
  const { decision, usage, model } = await drivers.requestCritic(criticInput);
  await writeFile(
    join(runDir, "critic-decision.json"),
    `${JSON.stringify(decision, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(runDir, "critic-model-usage.json"),
    `${JSON.stringify(usage, null, 2)}\n`,
    "utf8",
  );

  lifecycle = transitionRepairLifecycle(
    lifecycle,
    decision.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
    `critic ${decision.decision} (confidence ${decision.confidence}): ${decision.summary}`,
  );
  await persistLifecycle();
  const done = finish(
    verification,
    { decision, usage, model, calls: 1 },
    workspace,
  );
  report(done);
  return done;
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
      "repair:fixture: focus-contained-in-modal assertion missing from the original run",
    );
  }
  return { passed: assertion.passed, actualFocus: assertion.actualFocus };
}

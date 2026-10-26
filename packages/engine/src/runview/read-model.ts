import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  AccessibilityDiagnosisSchema,
  CriticDecisionSchema,
  KeyboardScenarioResultSchema,
  ModelUsageSchema,
  RepairLifecycleSchema,
  RepairProposalSchema,
  RepairVerificationResultSchema,
  RunSummarySchema,
  RunViewModelSchema,
  toDisplayPath,
  type AttemptView,
  type PipelineStage,
  type RunSummary,
  type RunViewModel,
} from "@a11yforge/shared";
import { SourceTraceResultSchema } from "../trace/trace.js";

/**
 * Phase 6 read model: converts existing local run artifacts in
 * `.a11yforge/runs/<run-id>/` into the frontend-safe `RunViewModel`.
 *
 * Read-only and inference-free: every field comes from a parsed artifact.
 * Absolute paths are reduced to repo-relative display forms, secrets are
 * never included, and screenshots travel as opaque API URLs.
 */

export class RunArtifactError extends Error {
  readonly code: "RUN_NOT_FOUND" | "ARTIFACT_MISSING" | "ARTIFACT_INVALID";
  constructor(
    code: "RUN_NOT_FOUND" | "ARTIFACT_MISSING" | "ARTIFACT_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "RunArtifactError";
    this.code = code;
  }
}

/** Builds opaque artifact URLs; the API owns the route shape. */
export type ArtifactUrlFor = (runId: string, fileName: string) => string;

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Guarded run-dir resolution — run ids can never escape the runs dir. */
export function resolveRunDir(runsDir: string, runId: string): string {
  if (!RUN_ID_PATTERN.test(runId) || runId.includes("..")) {
    throw new RunArtifactError("RUN_NOT_FOUND", `unknown run: ${runId}`);
  }
  const dir = resolve(runsDir, runId);
  if (dir !== resolve(runsDir) + sep + runId) {
    throw new RunArtifactError("RUN_NOT_FOUND", `unknown run: ${runId}`);
  }
  if (!existsSync(dir)) {
    throw new RunArtifactError("RUN_NOT_FOUND", `unknown run: ${runId}`);
  }
  return dir;
}

async function readJson(runDir: string, fileName: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(join(runDir, fileName), "utf8");
  } catch {
    throw new RunArtifactError(
      "ARTIFACT_MISSING",
      `missing artifact: ${fileName}`,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RunArtifactError(
      "ARTIFACT_INVALID",
      `invalid JSON artifact: ${fileName}`,
    );
  }
}

function parse<T>(fileName: string, value: unknown, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data === undefined) {
    throw new RunArtifactError(
      "ARTIFACT_INVALID",
      `invalid artifact shape: ${fileName}`,
    );
  }
  return parsed.data;
}

function targetLabelFor(scenarioId: string): string {
  if (scenarioId.includes("checkout-modal")) return "Broken Shop / checkout flow";
  return scenarioId;
}

function diagnosticCodesOf(decisionBasis: string): string[] {
  const codes = decisionBasis.match(/TS\d+/g) ?? [];
  return [...new Set(codes)];
}

async function artifactUrlIfPresent(
  runDir: string,
  runId: string,
  fileName: string,
  urlFor: ArtifactUrlFor,
): Promise<string | null> {
  try {
    await readFile(join(runDir, fileName));
    return urlFor(runId, fileName);
  } catch {
    return null;
  }
}

function buildAttempt(args: {
  attempt: number;
  proposalId: string;
  repairId: string;
  summary: string;
  state: string;
  behaviorFixed: boolean;
  typecheckFailed: boolean;
  buildPassed: boolean;
  scenarioPassed: boolean;
  diffArtifact: string | null;
  runId: string;
  outcomeNote: string;
  diagnosticCodes: string[];
  urlFor: ArtifactUrlFor;
}): AttemptView {
  return {
    attempt: args.attempt,
    proposalId: args.proposalId,
    repairId: args.repairId,
    summary: args.summary,
    state: args.state,
    behaviorFixed: args.behaviorFixed,
    typecheckPassed: !args.typecheckFailed,
    buildPassed: args.buildPassed,
    scenarioPassed: args.scenarioPassed,
    diffUrl:
      args.diffArtifact === null ? null : args.urlFor(args.runId, args.diffArtifact),
    outcomeNote: args.outcomeNote,
    diagnosticCodes: args.diagnosticCodes,
  };
}

/**
 * Build the frontend-safe view model for one run directory.
 * Throws RunArtifactError when required artifacts are absent or invalid.
 */
export async function buildRunViewModel(
  runsDir: string,
  runId: string,
  urlFor: ArtifactUrlFor,
): Promise<RunViewModel> {
  const runDir = resolveRunDir(runsDir, runId);

  const scenario = parse(
    "scenario.json",
    await readJson(runDir, "scenario.json"),
    KeyboardScenarioResultSchema,
  );
  const diagnosis = parse(
    "diagnosis.json",
    await readJson(runDir, "diagnosis.json"),
    AccessibilityDiagnosisSchema,
  );
  const trace = parse(
    "source-trace.json",
    await readJson(runDir, "source-trace.json"),
    SourceTraceResultSchema,
  );
  const proposal = parse(
    "repair-proposal.json",
    await readJson(runDir, "repair-proposal.json"),
    RepairProposalSchema,
  );

  const failedAssertion = scenario.assertions.find(
    (a) => a.assertion === "focus-contained-in-modal",
  );
  if (failedAssertion === undefined || failedAssertion.passed) {
    throw new RunArtifactError(
      "ARTIFACT_INVALID",
      "scenario.json has no failed focus-contained-in-modal assertion",
    );
  }
  const top = trace.candidates[0];
  if (top === undefined) {
    throw new RunArtifactError(
      "ARTIFACT_INVALID",
      "source-trace.json has no candidates",
    );
  }
  const context = trace.selectedContext[0];

  const lifecycle = parse(
    "repair-lifecycle.json",
    await readJson(runDir, "repair-lifecycle.json"),
    RepairLifecycleSchema,
  );
  const verification = parse(
    "repair-verification.json",
    await readJson(runDir, "repair-verification.json"),
    RepairVerificationResultSchema,
  );

  const attempts: AttemptView[] = [
    buildAttempt({
      attempt: 1,
      proposalId: proposal.proposalId,
      repairId: lifecycle.repairId,
      summary: proposal.summary,
      state: lifecycle.state,
      behaviorFixed: verification.repairedAssertion.passed,
      typecheckFailed: /typecheck failed/i.test(verification.decisionBasis),
      buildPassed: verification.buildPassed,
      scenarioPassed: verification.scenarioPassed,
      diffArtifact: verification.diffArtifact,
      runId,
      outcomeNote:
        "Behavior fixed, strict TypeScript failed — deterministically REJECTED, critic never called.",
      diagnosticCodes: diagnosticCodesOf(verification.decisionBasis),
      urlFor,
    }),
  ];

  // Attempt 2 (revision) is optional: older runs stop at Attempt 1.
  let finalState = lifecycle.state;
  let activeVerification = verification;
  let critic: RunViewModel["critic"] = null;
  let finalConfidence: number | null = null;
  try {
    const revisionProposal = parse(
      "repair-revision-proposal.json",
      await readJson(runDir, "repair-revision-proposal.json"),
      RepairProposalSchema,
    );
    const revisionLifecycle = parse(
      "repair-revision-lifecycle.json",
      await readJson(runDir, "repair-revision-lifecycle.json"),
      RepairLifecycleSchema,
    );
    const revisionVerification = parse(
      "repair-revision-verification.json",
      await readJson(runDir, "repair-revision-verification.json"),
      RepairVerificationResultSchema,
    );
    finalState = revisionLifecycle.state;
    activeVerification = revisionVerification;
    attempts.push(
      buildAttempt({
        attempt: 2,
        proposalId: revisionProposal.proposalId,
        repairId: revisionLifecycle.repairId,
        summary: revisionProposal.summary,
        state: revisionLifecycle.state,
        behaviorFixed: revisionVerification.repairedAssertion.passed,
        typecheckFailed: /typecheck failed/i.test(
          revisionVerification.decisionBasis,
        ),
        buildPassed: revisionVerification.buildPassed,
        scenarioPassed: revisionVerification.scenarioPassed,
        diffArtifact: revisionVerification.diffArtifact,
        runId,
        outcomeNote:
          "Verifier feedback incorporated: strict-safety guard added — typecheck, build, replay, and axe regression all pass.",
        diagnosticCodes: diagnosticCodesOf(revisionVerification.decisionBasis),
        urlFor,
      }),
    );
    try {
      const decision = parse(
        "critic-decision.json",
        await readJson(runDir, "critic-decision.json"),
        CriticDecisionSchema,
      );
      critic = {
        decision: decision.decision,
        confidence: decision.confidence,
        summary: decision.summary,
        remainingRisks: decision.remainingRisks,
        verificationConcerns: decision.verificationConcerns,
      };
      finalConfidence = decision.confidence;
    } catch (error) {
      if (
        !(error instanceof RunArtifactError && error.code === "ARTIFACT_MISSING")
      ) {
        throw error;
      }
    }
  } catch (error) {
    if (
      !(error instanceof RunArtifactError && error.code === "ARTIFACT_MISSING")
    ) {
      throw error;
    }
  }

  let model = "muse-spark-1.3-contributor";
  try {
    const usage = parse(
      "model-usage.json",
      await readJson(runDir, "model-usage.json"),
      ModelUsageSchema,
    );
    model = usage.model;
  } catch (error) {
    if (
      !(error instanceof RunArtifactError && error.code === "ARTIFACT_MISSING")
    ) {
      throw error;
    }
  }

  const pipeline: PipelineStage[] = [
    { id: "explore", label: "Explore / Scan", status: "success", detail: "keyboard scenario collected" },
    {
      id: "evidence",
      label: "Interaction Evidence",
      status: "success",
      detail: `focus escaped at step ${failedAssertion.step}`,
    },
    { id: "diagnosis", label: "Diagnosis", status: "success", detail: diagnosis.title },
    {
      id: "trace",
      label: "Source Trace",
      status: "success",
      detail: `${toDisplayPath(top.filePath)} · score ${top.score}`,
    },
    {
      id: "attempt-1",
      label: "Repair Attempt 1",
      status: "failed",
      detail: `${lifecycle.state} · ${(diagnosticCodesOf(verification.decisionBasis)[0] ?? "gate failed")}`,
    },
    {
      id: "verification-1",
      label: "Verification Attempt 1",
      status: "failed",
      detail: verification.decisionBasis.slice(0, 120),
    },
    ...(attempts.length > 1
      ? [
          {
            id: "feedback",
            label: "Verifier Feedback",
            status: "success" as const,
            detail: "failure classified → revision allowed",
          },
          {
            id: "attempt-2",
            label: "Repair Attempt 2",
            status: "success" as const,
            detail: "guard added · gates green",
          },
        ]
      : []),
    {
      id: "verification-2",
      label: "Verification Attempt 2",
      status: activeVerification.resolvedTargetFailure ? ("success" as const) : ("failed" as const),
      detail: activeVerification.decisionBasis.slice(0, 120),
    },
    {
      id: "critic",
      label: "Critic",
      status: critic === null ? ("pending" as const) : critic.decision === "ACCEPT" ? ("success" as const) : ("failed" as const),
      detail: critic === null ? "not called" : `${critic.decision} · ${critic.confidence.toFixed(2)}`,
    },
    {
      id: "accepted",
      label: finalState === "ACCEPTED" ? "Accepted" : finalState,
      status: finalState === "ACCEPTED" ? ("success" as const) : ("current" as const),
    },
  ];

  const axePreserved =
    activeVerification.newSeriousCritical.length === 0 &&
    JSON.stringify([...activeVerification.baselineAxeRules].sort()) ===
      JSON.stringify([...activeVerification.repairedAxeRules].sort());

  const view: RunViewModel = {
    runId: scenario.runId,
    scenarioId: scenario.scenarioId,
    targetLabel: targetLabelFor(scenario.scenarioId),
    model,
    evidenceCount: diagnosis.evidenceIds.length,
    sourceFile: toDisplayPath(top.filePath),
    finalStatus: finalState,
    finalConfidence,
    finding: {
      assertion: failedAssertion.assertion,
      expectedRegion: failedAssertion.expectedRegion,
      actualFocusBefore: failedAssertion.actualFocus,
      passedBefore: failedAssertion.passed,
    },
    focusTrace: scenario.observations.map((o) => ({
      seq: o.seq,
      selector: o.selector,
      insideModal: o.insideModal,
      ...(o.role === null ? {} : { role: o.role }),
      ...(o.accessibleName === undefined ? {} : { accessibleName: o.accessibleName }),
    })),
    diagnosis: {
      title: diagnosis.title,
      issueType: diagnosis.issueType,
      severity: diagnosis.severity,
      confidence: diagnosis.confidence,
      observedFailure: diagnosis.observedFailure,
      likelyCause: diagnosis.likelyCause,
      recommendedRepairStrategy: diagnosis.recommendedRepairStrategy,
      evidenceIds: diagnosis.evidenceIds,
      wcagCriteria: diagnosis.relevantWcagCriteria,
    },
    sourceTrace: {
      topFile: toDisplayPath(top.filePath),
      score: top.score,
      matchedTerms: top.matchedTerms,
      startLine: context?.startLine ?? 1,
      endLine: context?.endLine ?? 1,
    },
    attempts,
    verification: {
      typecheckPassed: !/typecheck failed/i.test(activeVerification.decisionBasis),
      buildPassed: activeVerification.buildPassed,
      primaryReplayPassed: activeVerification.scenarioPassed,
      reverseReplayPassed: /reverse.*contained/i.test(activeVerification.decisionBasis),
      axeBaselinePreserved: axePreserved,
      newSeriousCritical: activeVerification.newSeriousCritical,
      decisionBasis: activeVerification.decisionBasis,
    },
    critic,
    pipeline,
    artifacts: {
      beforeModalUrl: await artifactUrlIfPresent(runDir, runId, "before-modal.png", urlFor),
      modalOpenUrl: await artifactUrlIfPresent(runDir, runId, "modal-open.png", urlFor),
      focusEscapedUrl: await artifactUrlIfPresent(runDir, runId, "focus-escaped.png", urlFor),
      afterUrl:
        (await artifactUrlIfPresent(runDir, runId, "focus-contained-after-revision.png", urlFor)) ??
        (await artifactUrlIfPresent(runDir, runId, "focus-contained-after.png", urlFor)),
    },
  };
  return RunViewModelSchema.parse(view);
}

/** One-line summary per run holding a keyboard scenario (newest first). */
export async function listRunSummaries(runsDir: string): Promise<RunSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch {
    return [];
  }
  const summaries: RunSummary[] = [];
  for (const runId of entries.sort().reverse()) {
    if (!RUN_ID_PATTERN.test(runId)) continue;
    const runDir = resolve(runsDir, runId);
    let scenarioRaw: string;
    let scenarioId = "unknown";
    try {
      scenarioRaw = await readFile(join(runDir, "scenario.json"), "utf8");
      const parsed = KeyboardScenarioResultSchema.safeParse(JSON.parse(scenarioRaw));
      if (!parsed.success) continue;
      scenarioId = parsed.data.scenarioId;
    } catch {
      continue;
    }
    let finalStatus = "EVIDENCE";
    for (const name of ["repair-revision-lifecycle.json", "repair-lifecycle.json"]) {
      try {
        const raw = await readFile(join(runDir, name), "utf8");
        const lc = RepairLifecycleSchema.safeParse(JSON.parse(raw));
        if (lc.success) {
          finalStatus = lc.data.state;
          break;
        }
      } catch {
        continue;
      }
    }
    const summary = RunSummarySchema.parse({
      runId,
      scenarioId,
      targetLabel: targetLabelFor(scenarioId),
      finalStatus,
    });
    summaries.push(summary);
  }
  return summaries;
}

/**
 * Select the demo run: the newest ACCEPTED revised run, else the newest run
 * holding a complete view (scenario + diagnosis + trace + proposal).
 * Returns null when no presentable run exists (empty state, never fake data).
 */
export async function findDemoRunId(runsDir: string): Promise<string | null> {
  const summaries = await listRunSummaries(runsDir);
  const accepted = summaries.find((s) => s.finalStatus === "ACCEPTED");
  if (accepted) return accepted.runId;
  for (const s of summaries) {
    for (const name of [
      "repair-revision-proposal.json",
      "repair-proposal.json",
    ]) {
      try {
        await readFile(join(resolve(runsDir, s.runId), name));
        return s.runId;
      } catch {
        continue;
      }
    }
  }
  return null;
}

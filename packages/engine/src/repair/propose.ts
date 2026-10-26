import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getMaxModelCallsPerRun,
  getMetaModel,
  requireApiKey,
  MetaMalformedResultError,
  ModelCallBudget,
  proposeRepairWithMeta,
  REPAIR_OPERATION,
  type MetaFetch,
} from "@a11yforge/meta";
import type {
  ModelUsage,
  RepairContextBundle,
  RepairProposal,
} from "@a11yforge/shared";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import { buildFocusContainmentBundle } from "../diagnosis/evidence-bundle.js";
import { buildRepairContextBundle } from "../trace/repair-context.js";
import {
  findLatestDiagnosedRun,
  isTraceSufficient,
  SourceTraceResultSchema,
  type SourceTraceResult,
} from "../trace/trace.js";
import {
  RepairProposalValidationError,
  validateRepairProposal,
} from "../trace/validate-proposal.js";

/**
 * Phase 4 `propose:fixture` flow.
 *
 * Consumes an existing valid source-trace artifact plus its diagnosis, then
 * makes AT MOST ONE Meta repair-proposal request (guarded by
 * `ModelCallBudget`). The proposal is VALIDATED locally and PERSISTED — it
 * is never applied. Application and verification belong to Phase 5.
 *
 * Refusals (no paid call spent):
 * - missing MODEL_API_KEY (fails before any network attempt);
 * - missing/invalid source-trace artifact (run `pnpm trace:fixture` first);
 * - insufficient trace (a repair request without source evidence is banned).
 */

export interface ProposeFixtureDeps {
  env?: NodeJS.ProcessEnv;
  fetchFn?: MetaFetch;
  runsDir?: string;
  sourceRoot?: string;
}

export interface ProposeFixtureResult {
  runId: string;
  proposal: RepairProposal;
  usage: ModelUsage;
  proposalPath: string;
  usagePath: string;
  model: string;
  sourceFileCount: number;
  sourceLineCount: number;
  evidenceItemCount: number;
  maxModelCalls: number;
}

export function proposePreamble(args: {
  model: string;
  diagnosisId: string;
  sourceFileCount: number;
  sourceLineCount: number;
  evidenceItemCount: number;
  maxModelCalls: number;
}): string {
  return [
    "",
    "A11yForge Repair Proposal",
    "",
    `Model: ${args.model}`,
    `Operation: ${REPAIR_OPERATION}`,
    `Diagnosis: ${args.diagnosisId}`,
    `Source files supplied: ${args.sourceFileCount}`,
    `Source lines supplied: ${args.sourceLineCount}`,
    `Evidence items: ${args.evidenceItemCount}`,
    `Maximum model calls: ${args.maxModelCalls}`,
    "",
    "This request uses Meta Model API credits.",
    "",
  ].join("\n");
}

/** Compact human-readable proposal report. Never claims success. */
export function formatProposalSummary(
  proposal: RepairProposal,
  context: RepairContextBundle,
  model: string,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge Repair Proposal");
  lines.push("");
  lines.push("Target:");
  for (const target of proposal.targetFiles) {
    lines.push(target);
  }
  lines.push("");
  lines.push("Summary:");
  lines.push(proposal.summary);
  lines.push("");
  proposal.edits.forEach((edit, index) => {
    lines.push(`Edit ${index + 1}: ${edit.filePath}`);
    lines.push(edit.replacementText);
    lines.push("");
    lines.push("Reason:");
    lines.push(edit.reason);
    lines.push("");
  });
  lines.push("Risks:");
  if (proposal.risks.length === 0) {
    lines.push("(none stated)");
  }
  for (const risk of proposal.risks) {
    lines.push(risk);
  }
  lines.push("");
  lines.push("Verification plan:");
  for (const step of proposal.verificationPlan) {
    lines.push(`- ${step}`);
  }
  lines.push("");
  lines.push("Evidence:");
  for (const id of proposal.evidenceIds) {
    lines.push(id);
  }
  lines.push("");
  lines.push("Source context:");
  for (const snippet of context.snippets) {
    lines.push(
      `${snippet.filePath} lines ${snippet.startLine}-${snippet.endLine}`,
    );
  }
  lines.push("");
  lines.push("Model:");
  lines.push(model);
  lines.push("");
  lines.push("STATUS:");
  lines.push("PROPOSED — NOT APPLIED");
  lines.push("");
  return lines.join("\n");
}

async function loadSourceTrace(runDir: string): Promise<SourceTraceResult> {
  const tracePath = join(runDir, "source-trace.json");
  let raw: string;
  try {
    raw = await readFile(tracePath, "utf8");
  } catch {
    throw new Error(
      `propose:fixture: no source-trace.json in ${runDir}. Run \`pnpm trace:fixture\` first.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`propose:fixture: ${tracePath} is not valid JSON.`);
  }
  const trace = SourceTraceResultSchema.safeParse(parsed);
  if (!trace.success) {
    throw new Error(
      `propose:fixture: ${tracePath} is not a valid source-trace artifact: ${trace.error.message}`,
    );
  }
  return trace.data;
}

function countContextLines(context: RepairContextBundle): number {
  return context.snippets.reduce(
    (sum, snippet) => sum + (snippet.endLine - snippet.startLine + 1),
    0,
  );
}

export async function runProposeFixture(
  deps: ProposeFixtureDeps = {},
): Promise<ProposeFixtureResult> {
  const env = deps.env ?? process.env;
  const runsDir =
    deps.runsDir ?? join(findWorkspaceRoot(), ".a11yforge", "runs");

  // Deterministic inputs first: diagnosis + scenario + existing trace.
  const selection = await findLatestDiagnosedRun(runsDir);
  const trace = await loadSourceTrace(selection.runDir);
  if (trace.diagnosisId !== selection.diagnosis.diagnosisId) {
    throw new Error(
      `propose:fixture: source-trace.json targets ${trace.diagnosisId} but the run diagnosis is ${selection.diagnosis.diagnosisId}. Re-run \`pnpm trace:fixture\`.`,
    );
  }
  if (!isTraceSufficient(trace)) {
    throw new Error(
      "propose:fixture: source trace is INSUFFICIENT — refusing a repair-model call without strong source evidence. " +
        "A repair request without source evidence is not allowed.",
    );
  }

  // Fail BEFORE any network attempt when the key is missing.
  const apiKey = requireApiKey(env);
  const model = getMetaModel(env);
  const maxModelCalls = getMaxModelCallsPerRun(env);

  const bundle = buildFocusContainmentBundle(selection.result);
  const context = buildRepairContextBundle(
    selection.diagnosis,
    bundle,
    trace,
  );

  console.log(
    proposePreamble({
      model,
      diagnosisId: selection.diagnosis.diagnosisId,
      sourceFileCount: context.sourceFiles.length,
      sourceLineCount: countContextLines(context),
      evidenceItemCount: bundle.items.length,
      maxModelCalls,
    }),
  );
  console.log(`Selected run: ${selection.runId}`);

  const budget = new ModelCallBudget(maxModelCalls);
  budget.consume(); // Maximum one model call for propose:fixture.
  const proposalPath = join(selection.runDir, "repair-proposal.json");
  const usagePath = join(selection.runDir, "repair-model-usage.json");
  let proposal: RepairProposal;
  let usage: ModelUsage;
  try {
    ({ proposal, usage } = await proposeRepairWithMeta(context, {
      ...(deps.fetchFn !== undefined ? { fetchFn: deps.fetchFn } : {}),
      model,
      apiKey,
    }));
  } catch (error) {
    // The HTTP request succeeded but the model returned no usable output:
    // credits were consumed, so preserve the usage telemetry in the
    // existing usage artifact before failing. Never write a proposal here.
    if (
      error instanceof MetaMalformedResultError &&
      error.usage !== null
    ) {
      await writeFile(
        usagePath,
        `${JSON.stringify(error.usage, null, 2)}\n`,
        "utf8",
      );
      console.log(`Artifact: ${usagePath} (failed attempt, usage only)`);
    }
    throw error;
  }

  // Local safety validation BEFORE accepting the proposal. A rejection ends
  // here — never an automatic second paid call.
  const sourceRoot =
    deps.sourceRoot ?? join(findWorkspaceRoot(), "fixtures", "broken-shop");
  try {
    validateRepairProposal({ proposal, context, sourceRoot });
  } catch (error) {
    if (error instanceof RepairProposalValidationError) {
      await writeFile(usagePath, `${JSON.stringify(usage, null, 2)}\n`, "utf8");
      console.log(`Artifact: ${usagePath} (rejected proposal, usage only)`);
    }
    throw error;
  }

  await writeFile(
    proposalPath,
    `${JSON.stringify(proposal, null, 2)}\n`,
    "utf8",
  );
  await writeFile(usagePath, `${JSON.stringify(usage, null, 2)}\n`, "utf8");

  console.log(formatProposalSummary(proposal, context, model));
  console.log(`Artifact: ${proposalPath}`);
  console.log(`Artifact: ${usagePath}`);

  return {
    runId: selection.runId,
    proposal,
    usage,
    proposalPath,
    usagePath,
    model,
    sourceFileCount: context.sourceFiles.length,
    sourceLineCount: countContextLines(context),
    evidenceItemCount: bundle.items.length,
    maxModelCalls,
  };
}

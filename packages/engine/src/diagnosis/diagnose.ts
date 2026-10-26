import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getMaxModelCallsPerRun,
  getMetaModel,
  requireApiKey,
  MetaMalformedResultError,
  ModelCallBudget,
  diagnoseWithMeta,
  type MetaFetch,
} from "@a11yforge/meta";
import type {
  AccessibilityDiagnosis,
  ModelUsage,
} from "@a11yforge/shared";
import { findWorkspaceRoot } from "../scanner/workspace.js";
import { buildFocusContainmentBundle } from "./evidence-bundle.js";
import { formatDiagnosisSummary } from "./report.js";
import { findLatestScenarioRun } from "./run-selector.js";

/**
 * Phase 3 `diagnose:fixture` flow.
 *
 * Consumes the deterministically selected completed Phase 2 artifact, builds
 * the compact evidence bundle, then makes AT MOST ONE Meta model request
 * (guarded by `ModelCallBudget`). Transport/API errors are reported; a
 * malformed or invalid model result fails rather than spending another
 * request. On success the diagnosis and usage artifacts land next to the
 * source scenario artifact.
 */

export interface DiagnoseFixtureDeps {
  env?: NodeJS.ProcessEnv;
  fetchFn?: MetaFetch;
  runsDir?: string;
}

export interface DiagnoseFixtureResult {
  runId: string;
  resultPath: string;
  diagnosis: AccessibilityDiagnosis;
  usage: ModelUsage;
  diagnosisPath: string;
  usagePath: string;
  model: string;
  evidenceItemCount: number;
  maxModelCalls: number;
}

export function diagnosePreamble(
  model: string,
  evidenceItemCount: number,
  maxModelCalls: number,
): string {
  return [
    "",
    "A11yForge AI Diagnosis",
    "",
    `Model: ${model}`,
    "Operation: accessibility-diagnosis",
    `Evidence items: ${evidenceItemCount}`,
    `Maximum model calls: ${maxModelCalls}`,
    "",
    "This request uses Meta Model API credits.",
    "",
  ].join("\n");
}

export async function runDiagnoseFixture(
  deps: DiagnoseFixtureDeps = {},
): Promise<DiagnoseFixtureResult> {
  const env = deps.env ?? process.env;
  // Fail BEFORE any network attempt when the key is missing.
  const apiKey = requireApiKey(env);
  const model = getMetaModel(env);
  const maxModelCalls = getMaxModelCallsPerRun(env);
  const runsDir =
    deps.runsDir ?? join(findWorkspaceRoot(), ".a11yforge", "runs");

  const selection = await findLatestScenarioRun(runsDir);
  const bundle = buildFocusContainmentBundle(selection.result);

  console.log(diagnosePreamble(model, bundle.items.length, maxModelCalls));
  console.log(`Selected run: ${selection.runId}`);
  console.log(`Artifact: ${selection.resultPath}`);

  const budget = new ModelCallBudget(maxModelCalls);
  budget.consume(); // Maximum one model call for diagnose:fixture.
  const diagnosisPath = join(selection.runDir, "diagnosis.json");
  const usagePath = join(selection.runDir, "model-usage.json");
  let diagnosis: AccessibilityDiagnosis;
  let usage: ModelUsage;
  try {
    ({ diagnosis, usage } = await diagnoseWithMeta(bundle, {
      ...(deps.fetchFn !== undefined ? { fetchFn: deps.fetchFn } : {}),
      model,
      apiKey,
    }));
  } catch (error) {
    // The HTTP request succeeded but the model returned no usable output:
    // credits were consumed, so preserve the usage telemetry in the
    // existing usage artifact before failing. Never write a diagnosis here.
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
  await writeFile(
    diagnosisPath,
    `${JSON.stringify(diagnosis, null, 2)}\n`,
    "utf8",
  );
  await writeFile(usagePath, `${JSON.stringify(usage, null, 2)}\n`, "utf8");

  console.log(formatDiagnosisSummary(diagnosis, usage, model));
  console.log(`Artifact: ${diagnosisPath}`);
  console.log(`Artifact: ${usagePath}`);

  return {
    runId: selection.runId,
    resultPath: selection.resultPath,
    diagnosis,
    usage,
    diagnosisPath,
    usagePath,
    model,
    evidenceItemCount: bundle.items.length,
    maxModelCalls,
  };
}

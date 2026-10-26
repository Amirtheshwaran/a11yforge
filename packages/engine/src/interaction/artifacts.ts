import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { KeyboardScenarioResult } from "@a11yforge/shared";

/**
 * Persists the keyboard scenario result as JSON for later phases.
 * Screenshots are written into the same run directory by the CLI.
 */

export interface InteractionArtifactOptions {
  /** Directory under which `<runId>/scenario.json` is written. */
  runsDir?: string;
}

const DEFAULT_RUNS_DIR = join(".a11yforge", "runs");

export interface InteractionArtifact {
  runDir: string;
  resultPath: string;
}

export async function writeInteractionArtifacts(
  result: KeyboardScenarioResult,
  options: InteractionArtifactOptions = {},
): Promise<InteractionArtifact> {
  const runsDir = resolve(options.runsDir ?? DEFAULT_RUNS_DIR);
  const runDir = join(runsDir, result.runId);
  await mkdir(runDir, { recursive: true });
  const resultPath = join(runDir, "scenario.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { runDir, resultPath };
}

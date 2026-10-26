import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  KeyboardScenarioResultSchema,
  type KeyboardScenarioResult,
} from "@a11yforge/shared";

/**
 * Deterministic selection of the Phase 2 artifact to diagnose.
 *
 * `diagnose:fixture` never runs a fresh keyboard scenario (that would risk
 * ambiguity and wasted work). It consumes the latest completed run whose
 * `scenario.json` contains a failed `focus-contained-in-modal` assertion —
 * lexical ordering of the timestamp-prefixed run ids *is* chronological, so
 * "latest" is unambiguous. Scan-only runs (no `scenario.json`) are skipped,
 * never selected.
 */
export interface ScenarioRunSelection {
  runId: string;
  runDir: string;
  resultPath: string;
  result: KeyboardScenarioResult;
}

export async function findLatestScenarioRun(
  runsDir: string,
): Promise<ScenarioRunSelection> {
  let entries: string[];
  try {
    entries = await readdir(runsDir);
  } catch (error) {
    throw new Error(
      `diagnose:fixture: cannot list runs in ${runsDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const candidates = entries.sort();
  let lastError: string | null = null;
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const runId = candidates[i];
    if (runId === undefined) {
      continue;
    }
    const resultPath = join(runsDir, runId, "scenario.json");
    let raw: string;
    try {
      raw = await readFile(resultPath, "utf8");
    } catch {
      continue; // Scan-only run or unrelated directory — skip.
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      lastError = `${resultPath} is not valid JSON`;
      continue;
    }
    const result = KeyboardScenarioResultSchema.safeParse(parsed);
    if (!result.success) {
      lastError = `${resultPath} is not a valid scenario artifact`;
      continue;
    }
    const failed = result.data.assertions.some(
      (assertion) =>
        assertion.assertion === "focus-contained-in-modal" && !assertion.passed,
    );
    if (!failed) {
      continue; // No failed containment assertion — nothing to diagnose.
    }
    return {
      runId,
      runDir: join(runsDir, runId),
      resultPath,
      result: result.data,
    };
  }
  throw new Error(
    `diagnose:fixture: no completed scenario run with a failed focus-contained-in-modal assertion found under ${runsDir}` +
      (lastError !== null ? ` (last skipped artifact: ${lastError})` : "") +
      ". Run `pnpm scenario:fixture` first.",
  );
}

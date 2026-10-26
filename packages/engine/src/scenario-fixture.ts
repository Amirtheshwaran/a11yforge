#!/usr/bin/env node
/**
 * `scenario:fixture` — boot the broken-shop fixture, run the checkout
 * keyboard scenario, and record deterministic focus evidence.
 *
 * One command, full Phase 2 loop:
 *   BROKEN FIXTURE -> BROWSER LAUNCH -> KEYBOARD SCENARIO
 *   -> FOCUS OBSERVATIONS -> DETERMINISTIC ASSERTION -> TERMINAL REPORT
 *
 * Exit 0: the runner executed successfully and reproduced the expected
 * fixture defect (focus escaped the modal, `focus-contained-in-modal`
 * fails with `passed: false`). Exit 1: the run itself failed (browser
 * launch failure, fixture server failure, scenario timeout, unexpected
 * runtime exception, artifact write failure) or the expected defect
 * could NOT be reproduced (verification failure).
 * Either way the browser is closed and the fixture stopped in `finally`
 * blocks, and structured artifacts land in `.a11yforge/runs/<run-id>/`.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { getScenario } from "./interaction/scenarios.js";
import {
  EXPECTED_DEFECT_REPRODUCED_MESSAGE,
  isExpectedFixtureDefectReproduced,
} from "./interaction/fixture-verdict.js";
import { newRunId, runKeyboardScenario } from "./interaction/runner.js";
import { writeInteractionArtifacts } from "./interaction/artifacts.js";
import { formatInteractionSummary } from "./interaction/report.js";
import {
  startFixtureServer,
  type FixtureServer,
} from "./scanner/fixture-server.js";
import { findWorkspaceRoot } from "./scanner/workspace.js";

const SCENARIO_TIMEOUT_MS = 120_000;
const SCREENSHOT_TIMEOUT_MS = 10_000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function main(): Promise<void> {
  const scenario = getScenario("checkout-modal-keyboard");
  const runId = newRunId();
  const runsDir = join(findWorkspaceRoot(), ".a11yforge", "runs");
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });

  console.log("Starting broken-shop fixture…");
  let server: FixtureServer | undefined;
  try {
    server = await startFixtureServer();
  } catch (error) {
    console.error(
      `scenario:fixture: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Fixture ready at ${server.url}`);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const result = await withTimeout(
        runKeyboardScenario({
          page,
          scenario,
          runId,
          targetUrl: server.url,
          takeScreenshot: async (name: string) => {
            await page.screenshot({
              path: join(runDir, name),
              timeout: SCREENSHOT_TIMEOUT_MS,
            });
          },
        }),
        SCENARIO_TIMEOUT_MS,
        `keyboard scenario ${scenario.id}`,
      );
      const { resultPath } = await writeInteractionArtifacts(result, {
        runsDir,
      });
      console.log(formatInteractionSummary(result, runDir));
      console.log(`Artifact: ${resultPath}`);
      if (isExpectedFixtureDefectReproduced(result)) {
        console.log(
          "Focus escaped the modal: intentional defect reproduced.",
        );
        console.log(EXPECTED_DEFECT_REPRODUCED_MESSAGE);
      } else {
        console.error(
          "scenario:fixture: expected fixture defect was NOT reproduced (verification failure).",
        );
        process.exitCode = 1;
      }
    } finally {
      try {
        await browser.close();
      } catch (error) {
        console.error(
          `scenario:fixture: browser close failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(
      `scenario:fixture: run failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    await server.stop();
  }
}

await main();

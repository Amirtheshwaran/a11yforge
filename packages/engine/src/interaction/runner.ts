import { randomBytes } from "node:crypto";
import type { Page } from "playwright";
import {
  KeyboardScenarioResultSchema,
  type FocusObservation,
  type KeyboardScenarioResult,
  type RunEvent,
  type RunEventType,
  type ScenarioDefinition,
  type ScreenshotRef,
} from "@a11yforge/shared";
import { captureFocusObservation, isModalOpen } from "./observe.js";
import { evaluateFocusContainment } from "./assertions.js";

/**
 * Phase 2 deterministic keyboard scenario runner.
 *
 * Executes a data-driven scenario (click / key press / readiness wait /
 * screenshot steps), records a focus observation after the modal opens and
 * after every key press, and stops at the first focus escape while the modal
 * is still open. No model calls — the outcome is derived from measured
 * `document.activeElement` states only.
 */

const DEFAULT_NAVIGATION_TIMEOUT_MS = 15_000;
const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
/** Fixture pages render client-side; wait for app content, not networkidle. */
const READY_SELECTOR = "main";
const FOCUS_ESCAPED_SCREENSHOT = "focus-escaped.png";

export interface KeyboardRunnerOptions {
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
}

export interface KeyboardRunnerDeps {
  page: Page;
  scenario: ScenarioDefinition;
  runId: string;
  targetUrl: string;
  takeScreenshot: (name: string) => Promise<void>;
  options?: KeyboardRunnerOptions;
}

/** Filesystem-safe run id, also used as the artifact directory name. */
export function newRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

function screenshotName(stepName: string): string {
  if (!/^[\w][\w\-.]*\.png$/.test(stepName)) {
    throw new Error(
      `Invalid screenshot name: ${stepName} (expected a safe *.png file name)`,
    );
  }
  return stepName;
}

export async function runKeyboardScenario(
  deps: KeyboardRunnerDeps,
): Promise<KeyboardScenarioResult> {
  const { page, scenario, runId, targetUrl, takeScreenshot } = deps;
  const navigationTimeoutMs =
    deps.options?.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
  const actionTimeoutMs =
    deps.options?.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;

  const startedAt = new Date().toISOString();
  const observations: FocusObservation[] = [];
  const screenshots: ScreenshotRef[] = [];
  const events: RunEvent[] = [];
  const htmlBySeq = new Map<number, string>();

  const recordEvent = (type: RunEventType, detail: string): void => {
    events.push({
      seq: events.length,
      type,
      timestamp: new Date().toISOString(),
      detail: detail.slice(0, 500),
    });
  };

  const captureScreenshot = async (name: string): Promise<void> => {
    const file = screenshotName(name);
    await takeScreenshot(file);
    screenshots.push({
      name: file,
      type: "screenshot",
      capturedAt: new Date().toISOString(),
    });
    recordEvent("screenshot-captured", file);
  };

  const observe = async (action: string, key: string | null): Promise<void> => {
    const previous = observations[observations.length - 1]?.selector;
    const { observation, html } = await captureFocusObservation(
      page,
      scenario.modalSelector,
      {
        seq: observations.length,
        action,
        key,
        timestamp: new Date().toISOString(),
        pageUrl: page.url(),
      },
    );
    observations.push(observation);
    htmlBySeq.set(observation.seq, html);
    if (
      previous !== undefined &&
      previous !== observation.selector &&
      action === "press"
    ) {
      recordEvent("focus-changed", `${previous} -> ${observation.selector}`);
    }
  };

  recordEvent("scenario-started", `${scenario.id} against ${targetUrl}`);
  await page.goto(targetUrl, {
    waitUntil: "load",
    timeout: navigationTimeoutMs,
  });
  await page.waitForSelector(READY_SELECTOR, { timeout: navigationTimeoutMs });
  recordEvent("page-loaded", targetUrl);

  let modalOpen = false;

  for (const step of scenario.steps) {
    if (step.kind === "click") {
      await page.click(step.selector, { timeout: actionTimeoutMs });
    } else if (step.kind === "wait-for") {
      await page.waitForSelector(step.selector, { timeout: step.timeoutMs });
      if (step.selector === scenario.modalSelector) {
        modalOpen = true;
        await observe("modal-open", null);
        const current = observations[observations.length - 1];
        recordEvent(
          "modal-opened",
          `${scenario.modalSelector} visible, focus on ${current?.selector ?? "unknown"}`,
        );
      }
    } else if (step.kind === "press") {
      await page.keyboard.press(step.key);
      recordEvent("key-pressed", `pressed ${step.key}`);
      await observe("press", step.key);
      if (modalOpen) {
        if (!(await isModalOpen(page, scenario.modalSelector))) {
          throw new Error(
            `Scenario ${scenario.id}: modal ${scenario.modalSelector} closed unexpectedly mid-run — cannot assert containment`,
          );
        }
        const current = observations[observations.length - 1];
        if (current && !current.insideModal) {
          await captureScreenshot(FOCUS_ESCAPED_SCREENSHOT);
          recordEvent(
            "assertion-failed",
            `focus-contained-in-modal failed at step ${current.seq}: focus on ${current.selector}`,
          );
          break;
        }
      }
    } else if (step.kind === "screenshot") {
      await captureScreenshot(step.name);
    }
  }

  if (!modalOpen) {
    throw new Error(
      `Scenario ${scenario.id}: modal ${scenario.modalSelector} never opened — no containment evidence collected`,
    );
  }

  const assertions = [
    evaluateFocusContainment({
      observations,
      expectedRegion: scenario.modalSelector,
      htmlBySeq,
    }),
  ];

  const completedAt = new Date().toISOString();
  recordEvent(
    "scenario-completed",
    `focus-contained-in-modal ${assertions[0]?.passed === true ? "passed" : "failed"}`,
  );

  // Reject our own bugs loudly: never emit evidence that fails the schema.
  return KeyboardScenarioResultSchema.parse({
    runId,
    scenarioId: scenario.id,
    targetUrl,
    startedAt,
    completedAt,
    observations,
    assertions,
    screenshots,
    events,
  });
}

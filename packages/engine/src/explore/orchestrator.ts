import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  ExplorationPolicySchema,
  ExplorationRunSchema,
  type ExplorationEvent,
  type ExplorationLimitation,
  type ExplorationPolicy,
  type ExplorationRun,
  type ExplorationStage,
  type PageSurface,
  type ProbeResult,
  type WebTarget,
} from "@a11yforge/shared";
import { createTargetGuard, TargetRejectedError, validateTargetUrl } from "./target.js";
import {
  collectPageSurface,
  filterNavigableSameOriginLinks,
  snapshotAbsoluteLinks,
  waitForStablePage,
} from "./surface.js";
import { projectFindings } from "./findings.js";
import { axeProbe } from "./probes/axe-probe.js";
import { keyboardProbe } from "./probes/keyboard-probe.js";
import { dialogProbe } from "./probes/dialog-probe.js";
import { formProbe } from "./probes/form-probe.js";
import { tabsProbe } from "./probes/tabs-probe.js";
import { disclosureProbe } from "./probes/disclosure-probe.js";
import type { AccessibilityProbe, ProbeContext } from "./probes/types.js";

/**
 * Phase 8 — universal exploration orchestrator.
 *
 * Drives a real Chromium instance through bounded same-origin discovery and
 * generic accessibility probes. Zero model calls: every assertion outcome
 * comes from browser measurements. Safe by default: unsafe request targets
 * are aborted before fetch, forms are never submitted, and only
 * observational or reversible interactions run.
 */

const ALL_PROBES: AccessibilityProbe[] = [
  axeProbe,
  keyboardProbe,
  dialogProbe,
  formProbe,
  tabsProbe,
  disclosureProbe,
];

export class ExplorationCancelledError extends Error {
  constructor() {
    super("Exploration cancelled by the user.");
    this.name = "ExplorationCancelledError";
  }
}

export interface RunExplorationOptions {
  runId: string;
  entryUrl: string;
  policy?: Partial<ExplorationPolicy>;
  /** Directory holding `<runId>/` artifact folders. */
  runsDir: string;
  allowPrivate?: boolean;
  emit?: (event: Omit<ExplorationEvent, "eventId" | "runId" | "sequence" | "timestamp">) => void;
  signal?: AbortSignal;
}

function stageState(
  done: ExplorationStage[],
  current: ExplorationStage | null,
): ExplorationRun["stages"] {
  const order: ExplorationStage[] = ["opening", "exploring", "scanning", "interacting", "reviewing", "done"];
  return order.map((stage) => ({
    stage,
    state: (done.includes(stage) ? "passed" : current === stage ? "running" : "pending") as
      | "pending"
      | "running"
      | "passed"
      | "failed"
      | "skipped",
  }));
}

/** Counts visible password fields — a generic authentication signal. */
function snapshotPasswordFieldCount(): number {
  const fields = Array.from(document.querySelectorAll('input[type="password"]'));
  return fields.filter((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return window.getComputedStyle(el).display !== "none";
  }).length;
}

export async function runExploration(options: RunExplorationOptions): Promise<ExplorationRun> {
  const policy = ExplorationPolicySchema.parse(options.policy ?? {});
  const startedAt = new Date().toISOString();
  const runDir = join(options.runsDir, options.runId);
  await mkdir(runDir, { recursive: true });

  const emit = (
    stage: ExplorationStage,
    status: ExplorationEvent["status"],
    message: string,
  ): void => {
    options.emit?.({ stage, status, message });
  };

  const checkCancelled = (): void => {
    if (options.signal?.aborted === true) throw new ExplorationCancelledError();
  };

  const deadline = Date.now() + policy.maxDurationMs;
  const outOfTime = (): boolean => Date.now() >= deadline;

  const finish = async (
    partial: Omit<ExplorationRun, "stages"> & { stages?: ExplorationRun["stages"] },
    stages: ExplorationRun["stages"],
  ): Promise<ExplorationRun> => {
    const run = ExplorationRunSchema.parse({ ...partial, stages });
    await writeFile(join(runDir, "exploration.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    return run;
  };

  // Entry validation happens before any browser starts.
  let validated: { normalizedUrl: string; origin: string; hostname: string };
  try {
    validated = await validateTargetUrl(options.entryUrl, { allowPrivate: options.allowPrivate });
  } catch (error) {
    const message =
      error instanceof TargetRejectedError ? error.message : "That website address could not be tested.";
    emit("opening", "failed", message);
    const target: WebTarget = {
      targetId: options.runId,
      entryUrl: options.entryUrl,
      normalizedUrl: options.entryUrl,
      origin: "",
      createdAt: startedAt,
      policy,
    };
    return finish(
      {
        runId: options.runId,
        target,
        state: "FAILED",
        pagesVisited: [],
        surfaces: [],
        probeResults: [],
        findings: [],
        limitations: [{ code: "invalid-target", message, pageUrl: options.entryUrl }],
        screenshots: [],
        startedAt,
        finishedAt: new Date().toISOString(),
        error: message,
      },
      stageState([], null),
    );
  }

  const target: WebTarget = {
    targetId: options.runId,
    entryUrl: options.entryUrl,
    normalizedUrl: validated.normalizedUrl,
    origin: validated.origin,
    createdAt: startedAt,
    policy,
  };

  const guard = createTargetGuard({ allowPrivate: options.allowPrivate });
  const pagesVisited: string[] = [];
  const surfaces: PageSurface[] = [];
  const probeResults: ProbeResult[] = [];
  const limitations: ExplorationLimitation[] = [];
  const screenshotNames: string[] = [];
  let screenshotCounter = 0;
  const doneStages: ExplorationStage[] = [];

  let browser: Browser | null = null;
  try {
    emit("opening", "running", `Opening ${validated.hostname} in a real browser.`);
    browser = await chromium.launch();
    const context = await browser.newContext();
    // Proactive SSRF guard: unsafe navigation targets never fetch.
    // Non-http(s) subresources (data:, blob:) are page-local and allowed;
    // every http(s) request is revalidated against the target policy.
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (!url.startsWith("http:") && !url.startsWith("https:")) {
        await route.continue().catch(() => undefined);
        return;
      }
      if (await guard.checkUrl(url)) {
        await route.continue().catch(() => undefined);
      } else {
        await route.abort().catch(() => undefined);
      }
    });
    const page = await context.newPage();

    const captureScreenshot = async (
      _label: string,
      highlight: { x: number; y: number; width: number; height: number } | null = null,
    ): Promise<string | null> => {
      if (screenshotNames.length >= policy.maxScreenshots) return null;
      const name = `screenshot-${screenshotCounter}.png`;
      screenshotCounter += 1;
      try {
        if (highlight !== null && highlight.width > 0 && highlight.height > 0) {
          await page.evaluate((box: { x: number; y: number; width: number; height: number }) => {
            const overlay = document.createElement("div");
            overlay.setAttribute("data-a11yforge-highlight", "true");
            overlay.style.position = "fixed";
            overlay.style.left = `${box.x}px`;
            overlay.style.top = `${box.y}px`;
            overlay.style.width = `${box.width}px`;
            overlay.style.height = `${box.height}px`;
            overlay.style.outline = "3px solid #e11d48";
            overlay.style.outlineOffset = "2px";
            overlay.style.zIndex = "2147483647";
            overlay.style.pointerEvents = "none";
            document.body.appendChild(overlay);
          }, highlight);
        }
        await page.screenshot({ path: join(runDir, name) });
        await page.evaluate(() => {
          document.querySelector('[data-a11yforge-highlight="true"]')?.remove();
        }).catch(() => undefined);
        screenshotNames.push(name);
        return name;
      } catch {
        return null;
      }
    };

    const queue: string[] = [validated.normalizedUrl];
    const seen = new Set<string>([validated.normalizedUrl]);

    while (queue.length > 0 && pagesVisited.length < policy.maxPages) {
      checkCancelled();
      if (outOfTime()) {
        limitations.push({
          code: "time-budget-exceeded",
          message: `Exploration stopped after the ${Math.round(policy.maxDurationMs / 1000)}-second budget; results cover the pages tested so far.`,
          pageUrl: "",
        });
        break;
      }
      const pageUrl = queue.shift();
      if (pageUrl === undefined) break;
      const isFirst = pagesVisited.length === 0;
      emit(isFirst ? "opening" : "exploring", "running", isFirst ? `Opening ${pageUrl}.` : `Exploring ${pageUrl}.`);

      let responseStatus: number | null = null;
      try {
        const response = await page.goto(pageUrl, {
          waitUntil: "load",
          timeout: policy.navigationTimeoutMs,
        });
        responseStatus = response?.status() ?? null;
      } catch (error) {
        const reason = error instanceof ExplorationCancelledError ? "cancelled" : "unreachable";
        if (reason === "cancelled") throw error;
        limitations.push({
          code: "navigation-failed",
          message: `Could not load ${pageUrl}. The site may be down, blocking automated browsers, or unreachable from here.`,
          pageUrl,
        });
        emit("exploring", "failed", `Could not load ${pageUrl}.`);
        continue;
      }

      // Every redirect hop already passed the request guard; revalidate the
      // final URL explicitly so a safe entry can never settle on private content.
      const finalUrl = page.url();
      if (!(await guard.checkUrl(finalUrl))) {
        const reason = (await guard.rejectionReason(finalUrl)) ?? "That redirect target cannot be tested.";
        limitations.push({ code: "redirect-blocked", message: `${pageUrl} redirected somewhere unsafe: ${reason}`, pageUrl });
        emit("exploring", "failed", "That page redirected somewhere unsafe, so it was skipped.");
        continue;
      }
      if (responseStatus !== null && responseStatus >= 400) {
        limitations.push({
          code: "page-unavailable",
          message: `The server answered ${responseStatus} for ${finalUrl}, so there was no usable page to test.`,
          pageUrl: finalUrl,
        });
        continue;
      }

      await waitForStablePage(page, policy.navigationTimeoutMs);
      checkCancelled();

      if (!doneStages.includes("opening")) {
        doneStages.push("opening");
        emit("opening", "passed", "Website opened.");
      }

      // Generic authentication signal: a password field on a page we did
      // not land on directly means a login wall redirected us.
      const passwordFields = await page.evaluate(snapshotPasswordFieldCount).catch(() => 0);
      if (passwordFields > 0 && finalUrl !== pageUrl) {
        limitations.push({
          code: "authentication-required",
          message: "This site redirected to a sign-in page. A11yForge does not sign in or guess credentials, so testing stopped at the login wall.",
          pageUrl: finalUrl,
        });
        emit("exploring", "skipped", "Sign-in required — testing stopped at the login wall.");
        pagesVisited.push(finalUrl);
        break;
      }

      const surface = await collectPageSurface(page, pageUrl, finalUrl);
      pagesVisited.push(finalUrl);
      surfaces.push(surface);
      await writeFile(join(runDir, `surface-${surfaces.length - 1}.json`), `${JSON.stringify(surface, null, 2)}\n`, "utf8");
      emit("exploring", "passed", `Mapped ${finalUrl} (${surface.keyboardOrderSize} keyboard stops, ${surface.buttonCount} buttons).`);

      // Discover more same-origin pages (bounded).
      if (pagesVisited.length < policy.maxPages) {
        const rawLinks = await page.evaluate(snapshotAbsoluteLinks).catch(() => []);
        const navigable = filterNavigableSameOriginLinks(rawLinks, validated.origin);
        surface.sameOriginLinkCount = navigable.length;
        for (const link of navigable) {
          if (seen.has(link)) continue;
          seen.add(link);
          if (queue.length + pagesVisited.length < policy.maxPages) queue.push(link);
        }
      }

      // Probes run against live state, most observational first.
      const probeCtx: ProbeContext = {
        targetId: target.targetId,
        page,
        pageUrl: finalUrl,
        surface,
        maxTabSteps: policy.maxTabStepsPerPage,
        captureScreenshot: (label, highlight = null) => captureScreenshot(label, highlight),
        checkCancelled,
      };
      for (const probe of ALL_PROBES) {
        checkCancelled();
        if (outOfTime()) break;
        if (!probe.applicable(surface)) {
          continue;
        }
        emit(
          probe.id === "page-axe-scan" ? "scanning" : "interacting",
          "running",
          probe.id === "page-axe-scan" ? `Testing accessibility on ${finalUrl}.` : "Testing keyboard interactions.",
        );
        try {
          const result = await probe.execute(probeCtx);
          probeResults.push(result);
        } catch (error) {
          if (error instanceof ExplorationCancelledError) throw error;
          limitations.push({
            code: "probe-error",
            message: `One check (${probe.id}) could not finish on ${finalUrl}; its area is reported as untested rather than guessed.`,
            pageUrl: finalUrl,
          });
        }
      }
      if (!doneStages.includes("exploring")) doneStages.push("exploring");
      if (!doneStages.includes("scanning")) doneStages.push("scanning");
      if (!doneStages.includes("interacting")) doneStages.push("interacting");
    }

    emit("reviewing", "running", "Reviewing the collected evidence.");
    const findings = projectFindings(probeResults);
    doneStages.push("reviewing", "done");
    emit("done", "passed", `Test complete: ${pagesVisited.length} ${pagesVisited.length === 1 ? "page" : "pages"} tested.`);

    return finish(
      {
        runId: options.runId,
        target,
        state: "COMPLETED",
        pagesVisited,
        surfaces,
        probeResults,
        findings,
        limitations,
        screenshots: screenshotNames,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: null,
      },
      stageState(doneStages, null),
    );
  } catch (error) {
    if (error instanceof ExplorationCancelledError) {
      emit("done", "skipped", "Test cancelled.");
      return finish(
        {
          runId: options.runId,
          target,
          state: "CANCELLED",
          pagesVisited,
          surfaces,
          probeResults,
          findings: projectFindings(probeResults),
          limitations,
          screenshots: screenshotNames,
          startedAt,
          finishedAt: new Date().toISOString(),
          error: null,
        },
        stageState(doneStages, null),
      );
    }
    const message = error instanceof Error ? error.message : "Exploration failed unexpectedly.";
    emit("done", "failed", message);
    return finish(
      {
        runId: options.runId,
        target,
        state: "FAILED",
        pagesVisited,
        surfaces,
        probeResults,
        findings: projectFindings(probeResults),
        limitations,
        screenshots: screenshotNames,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: message,
      },
      stageState(doneStages, null),
    );
  } finally {
    // Never leave Chromium behind: cancelled, failed, or finished.
    await browser?.close().catch(() => undefined);
  }
}

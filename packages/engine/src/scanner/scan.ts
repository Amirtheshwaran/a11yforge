import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright";
import type { AxeResults } from "axe-core";
import type { AccessibilityScanResult } from "@a11yforge/shared";
import { normalizeAxeResults } from "./normalize.js";

/**
 * Deterministic browser scanner (Phase 1).
 *
 * Launches Chromium via Playwright, navigates to the supplied URL, injects
 * axe-core from the local dependency (no CDN), runs the analysis, and
 * normalizes the output into shared evidence. No model calls, no
 * interpretation — pure evidence collection.
 */

export interface ScanOptions {
  /** Per-step timeout for navigation and the "ready" wait. */
  navigationTimeoutMs?: number;
  /** Timeout for the axe-core analysis itself. */
  axeTimeoutMs?: number;
  /** CSS selector the page must render before scanning. */
  readySelector?: string;
}

const DEFAULT_NAVIGATION_TIMEOUT_MS = 15_000;
const DEFAULT_AXE_TIMEOUT_MS = 30_000;
const DEFAULT_READY_SELECTOR = "main";

interface AxeWindow {
  axe: {
    run: (
      context: unknown,
      options: { timeout: number },
    ) => Promise<AxeResults>;
  };
}

/** Filesystem-safe scan id, also used as the artifact directory name. */
export function newScanId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

async function loadLocalAxeSource(): Promise<string> {
  const require = createRequire(import.meta.url);
  const axePath = require.resolve("axe-core/axe.min.js");
  return readFile(axePath, "utf8");
}

export async function runAxeScan(
  pageUrl: string,
  options: ScanOptions = {},
): Promise<AccessibilityScanResult> {
  const navigationTimeoutMs =
    options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
  const axeTimeoutMs = options.axeTimeoutMs ?? DEFAULT_AXE_TIMEOUT_MS;
  const readySelector = options.readySelector ?? DEFAULT_READY_SELECTOR;

  const scanId = newScanId();
  const startedAt = new Date().toISOString();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    throw new Error(`Invalid URL to scan: ${pageUrl}`);
  }
  const targetUrl = parsedUrl.toString();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(targetUrl, {
      waitUntil: "load",
      timeout: navigationTimeoutMs,
    });
    // Wait for app content, not just the empty shell (fixtures render
    // client-side, and dev servers keep HMR sockets open so `networkidle`
    // never settles — hence an explicit content selector instead).
    await page.waitForSelector(readySelector, {
      timeout: navigationTimeoutMs,
    });

    await page.addScriptTag({ content: await loadLocalAxeSource() });
    const axeResults = await page.evaluate((timeout: number) => {
      const win = window as unknown as AxeWindow;
      return win.axe.run(document, { timeout });
    }, axeTimeoutMs);

    const completedAt = new Date().toISOString();
    return normalizeAxeResults({
      axeResults,
      pageUrl: targetUrl,
      scanId,
      startedAt,
      completedAt,
    });
  } finally {
    // Always release the browser, even when navigation or axe fails.
    await browser.close();
  }
}

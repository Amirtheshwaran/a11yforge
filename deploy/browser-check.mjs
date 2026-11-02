#!/usr/bin/env node
// Real-browser check of a running deployment through its public URL.
// Usage: node deploy/browser-check.mjs <base-url> [scan-target-url]
//
// Opens the main pages in Chromium on desktop, a phone-sized viewport and with
// reduced motion; fails on uncaught page errors, error responses or sideways
// scrolling on the phone viewport. Then starts one website check through the
// real form, follows it to its result page, waits for the scan to finish and
// reloads the deep link. Makes no model calls. Screenshots are written to
// $BROWSER_CHECK_OUT (default: browser-check-output/).

/* global document, window -- used only inside page.evaluate(), which runs in the browser */

import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

// Playwright is a dependency of the engine workspace, not of the repository root.
const require = createRequire(new URL("../packages/engine/package.json", import.meta.url));
const { chromium } = require("playwright");

const baseUrl = (process.argv[2] ?? "").replace(/\/$/, "");
const scanTarget = process.argv[3] ?? "https://example.com/";
if (baseUrl === "") {
  console.error("Usage: node deploy/browser-check.mjs <base-url> [scan-target-url]");
  process.exit(2);
}
const outDir = process.env["BROWSER_CHECK_OUT"] ?? "browser-check-output";
const SCAN_TIMEOUT_MS = 180_000;
let failures = 0;

function check(name, passed, detail = "") {
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
  if (!passed) failures += 1;
}

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: "reduced-motion", viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch(
  process.env["CHROMIUM_PATH"] ? { executablePath: process.env["CHROMIUM_PATH"] } : {},
);

/** A context that skips ngrok's free-plan interstitial and records page errors. */
async function openContext(profile) {
  const options = { ...profile };
  delete options.name;
  const context = await browser.newContext({
    ...options,
    extraHTTPHeaders: { "ngrok-skip-browser-warning": "1" },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { context, page, pageErrors, consoleErrors };
}

async function visit(profile, path) {
  const { context, page, pageErrors, consoleErrors } = await openContext(profile);
  try {
    const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle", timeout: 60_000 });
    const status = response?.status() ?? 0;
    // Scroll through the page so scroll-driven scenes run their camera moves.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    const label = `${profile.name} ${path}`;
    check(`${label} loads`, status > 0 && status < 400, String(status));
    check(`${label} has no uncaught page errors`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
    if (profile.isMobile === true) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${label} has no sideways scrolling`, overflow <= 1, `${overflow}px wider than the screen`);
    }
    if (consoleErrors.length > 0) {
      console.log(`NOTE  ${label} logged ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 2).join(" | ")}`);
    }
    const file = `${profile.name}${path === "/" ? "-home" : path.replaceAll("/", "-")}.png`;
    await page.screenshot({ path: join(outDir, file), fullPage: false });
  } finally {
    await context.close();
  }
}

for (const profile of profiles) {
  for (const path of ["/", "/console", "/connect"]) {
    await visit(profile, path);
  }
}

// One website check through the real form, as a visitor would start it.
{
  const { context, page, pageErrors } = await openContext(profiles[0]);
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.fill("#site-url", scanTarget);
    await page.getByRole("button", { name: "Check my website" }).click();
    await page.waitForURL(/\/explore\/[^/?#]+/, { timeout: 60_000 });
    const runId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1);
    check("website check starts from the form", typeof runId === "string" && runId !== "", runId);

    let run = null;
    const deadline = Date.now() + SCAN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const res = await context.request.get(`${baseUrl}/backend/explorations/${runId}`);
      run = res.ok() ? await res.json() : null;
      if (run?.finishedAt != null) break;
      await page.waitForTimeout(2000);
    }
    check("website check completes", run?.state === "COMPLETED", `${run?.state}, ${run?.findings?.length ?? "?"} findings`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, "scan-result.png") });

    // The capture is drawn inside the 3D scene (a WebGL texture), so evidence
    // is checked as a served screenshot plus a drawn canvas, not an <img>.
    const screenshots = [];
    page.on("response", (response) => {
      if (/\/screenshots\//.test(response.url()) && response.ok() &&
          (response.headers()["content-type"] ?? "").startsWith("image/")) {
        screenshots.push(response.url());
      }
    });
    const reloaded = await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
    check("result page survives a refresh", (reloaded?.status() ?? 0) < 400, String(reloaded?.status()));
    check("result page loads the real page screenshot", screenshots.length > 0, `${screenshots.length} screenshot response(s)`);
    const canvas = await page.evaluate(() =>
      Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    );
    check("result page draws the 3D scene", canvas);
    check("result page has no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
    await page.screenshot({ path: join(outDir, "scan-result-reloaded.png") });
  } catch (error) {
    check("website check through the form", false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

await browser.close();
console.log(failures === 0 ? "\nAll browser checks passed." : `\n${failures} browser check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

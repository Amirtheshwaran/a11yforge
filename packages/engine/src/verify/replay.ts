import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { chromium, type Browser } from "playwright";
import type {
  AccessibilityScanResult,
  KeyboardScenarioResult,
} from "@a11yforge/shared";
import { runAxeScan } from "../scanner/scan.js";
import { getScenario } from "../interaction/scenarios.js";
import { newRunId, runKeyboardScenario } from "../interaction/runner.js";

/**
 * Phase 5 replay + regression scan against the repaired fixture.
 *
 * The repaired workspace `dist/` output is served over a local static
 * server (never the dev server, so the measured artifact is the actual
 * build), then the EXACT `checkout-modal-keyboard` scenario is replayed
 * and the Phase 1 axe scan runs against the same URL. No easier
 * scenario is ever substituted.
 */

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

export interface StaticServer {
  url: string;
  stop: () => Promise<void>;
}

/** Serve a vite `dist/` directory on an ephemeral 127.0.0.1 port. */
export async function startStaticServer(
  distDir: string,
): Promise<StaticServer> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
        let pathname = decodeURIComponent(rawPath);
        if (!pathname.startsWith("/")) {
          pathname = `/${pathname}`;
        }
        const relative = normalize(pathname).replace(/^[/\\]+/, "");
        if (
          relative.startsWith("..") ||
          relative.includes(`..${sep}`) ||
          relative.includes("\0")
        ) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end("bad request");
          return;
        }
        let file = join(distDir, relative === "" ? "index.html" : relative);
        try {
          const info = await stat(file);
          if (info.isDirectory()) {
            file = join(file, "index.html");
          }
        } catch {
          // SPA fallback: client-side routes serve index.html.
          file = join(distDir, "index.html");
        }
        const body = await readFile(file);
        res.writeHead(200, {
          "content-type":
            CONTENT_TYPES[extname(file).toLowerCase()] ??
            "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Static server did not bind to a port");
  }
  const url = `http://127.0.0.1:${String(address.port)}`;
  return {
    url,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

/** Screenshot captured after the equivalent post-repair Tab sequence. */
export const FOCUS_CONTAINED_AFTER_SCREENSHOT = "focus-contained-after.png";

export interface ReplayRepairedDeps {
  /** Base URL of the repaired fixture under test. */
  targetUrl: string;
  /** Run dir receiving `repaired-*.png`, scenario, and screenshots. */
  screenshotDir: string;
  screenshotTimeoutMs?: number;
}

/**
 * Replay the exact checkout-modal-keyboard scenario against the repaired
 * fixture. Internal runner screenshots are prefixed `repaired-` so they
 * never overwrite the before-state evidence; the final contained-focus
 * screenshot keeps its artifact name.
 */
export async function replayCheckoutScenario(
  deps: ReplayRepairedDeps,
): Promise<KeyboardScenarioResult> {
  const scenario = getScenario("checkout-modal-keyboard");
  const runId = newRunId();
  const browser: Browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const result = await runKeyboardScenario({
      page,
      scenario,
      runId,
      targetUrl: deps.targetUrl,
      takeScreenshot: async (name: string) => {
        await page.screenshot({
          path: join(deps.screenshotDir, `repaired-${name}`),
          timeout: deps.screenshotTimeoutMs ?? 10_000,
        });
      },
    });
    // Equivalent post-repair evidence: the visible state after the same
    // Tab sequence ran against the repaired modal.
    await page.screenshot({
      path: join(deps.screenshotDir, FOCUS_CONTAINED_AFTER_SCREENSHOT),
      timeout: deps.screenshotTimeoutMs ?? 10_000,
    });
    return result;
  } finally {
    await browser.close();
  }
}

/** Run the Phase 1 deterministic axe scan against any URL. */
export function scanRepairedTarget(
  targetUrl: string,
): Promise<AccessibilityScanResult> {
  return runAxeScan(targetUrl);
}

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExploration } from "./orchestrator.js";

describe("visual evidence at access boundaries", () => {
  const server = createServer((request, response) => {
    if (request.url === "/pending.js") {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.write("/* Deliberately unfinished dependency. */");
      return;
    }
    if (request.url === "/stalled") return; // No document is committed.
    if (request.url === "/before-stall") {
      response.writeHead(200, { "content-type": "text/html", "content-security-policy": "script-src 'none'" });
      response.end('<!doctype html><html lang="en"><head><title>First page</title></head><body><main><h1>First page</h1><a href="/stalled">Next</a></main></body></html>');
      return;
    }
    if (request.url === "/partial") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end('<!doctype html><html><head><title>Partial page</title><script defer src="/pending.js"></script></head><body><h1>Visible before dependencies finish</h1></body></html>');
      return;
    }
    if (request.url === "/public" || request.url === "/second") {
      response.writeHead(200, { "content-type": "text/html", "content-security-policy": "script-src 'none'" });
      response.end('<!doctype html><html lang="en"><head><title>Public page</title></head><body><main><h1>Public content</h1><a href="/second">Next page</a></main></body></html>');
      return;
    }
    if (request.url === "/entry") {
      response.writeHead(302, { location: "/sign-in" });
      response.end();
      return;
    }
    response.writeHead(request.url === "/unavailable" ? 403 : 200, { "content-type": "text/html" });
    response.end(request.url === "/unavailable"
      ? "<!doctype html><html><body><h1>Access unavailable</h1></body></html>"
      : '<!doctype html><html><body><h1>Sign in</h1><label>Password<input type="password"></label></body></html>');
  });
  let origin = "";
  let runsDir = "";
  before(async () => {
    runsDir = await mkdtemp(join(tmpdir(), "a11yforge-access-capture-"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address !== null && typeof address !== "string");
    origin = `http://127.0.0.1:${address.port}`;
  });
  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(runsDir, { recursive: true, force: true });
  });
  for (const [path, code] of [["/entry", "authentication-required"], ["/unavailable", "page-unavailable"]] as const) {
    it(`retains the visible ${code} page without probing protected content`, async () => {
      const runId = code;
      const run = await runExploration({ runId, entryUrl: `${origin}${path}`, runsDir, allowPrivate: true, policy: { maxPages: 1 } });
      assert.equal(run.state, "COMPLETED");
      assert.equal(run.limitations[0]?.code, code);
      assert.equal(run.screenshots.length, 1);
      assert.equal(run.pageCaptures?.[0]?.screenshot, run.screenshots[0]);
      assert.equal(run.pageCaptures?.[0]?.pageUrl, `${origin}${path === "/entry" ? "/sign-in" : path}`);
      assert.deepEqual(run.probeResults, []);
      assert.deepEqual(run.findings, []);
      const image = await readFile(join(runsDir, runId, run.screenshots[0]!));
      assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.ok(image.length > 1000);
    });
  }
  it("honors a zero screenshot budget at a sign-in boundary", async () => {
    const run = await runExploration({ runId: "no-capture-budget", entryUrl: `${origin}/entry`, runsDir, allowPrivate: true, policy: { maxPages: 1, maxScreenshots: 0 } });
    assert.equal(run.limitations[0]?.code, "authentication-required");
    assert.deepEqual(run.screenshots, []);
    assert.deepEqual(run.probeResults, []);
  });
  it("captures every visited page even when axe cannot run and the screenshot budget is tight", async () => {
    const run = await runExploration({ runId: "independent-captures", entryUrl: `${origin}/public`, runsDir, allowPrivate: true, policy: { maxPages: 2, maxScreenshots: 2, maxTabStepsPerPage: 3 } });
    assert.equal(run.state, "COMPLETED");
    assert.deepEqual(run.pagesVisited, [`${origin}/public`, `${origin}/second`]);
    assert.equal(run.screenshots.length, 2);
    assert.equal(run.pageCaptures?.length, 2);
    assert.deepEqual(run.pageCaptures?.map((capture) => capture.pageUrl), run.pagesVisited);
    assert.ok(run.pageCaptures?.every((capture) => run.screenshots.includes(capture.screenshot)));
    assert.ok(run.limitations.some((limitation) => limitation.code === "probe-error"));
  });
  it("retains visible partial content on navigation timeout without claiming it was tested", async () => {
    const run = await runExploration({ runId: "partial-navigation", entryUrl: `${origin}/partial`, runsDir, allowPrivate: true, policy: { maxPages: 1, navigationTimeoutMs: 1000 } });
    assert.equal(run.state, "COMPLETED");
    assert.equal(run.pageCaptures?.[0]?.pageUrl, `${origin}/partial`);
    assert.equal(run.screenshots.length, 1);
    assert.deepEqual(run.probeResults, []);
    assert.ok(run.limitations.some((limitation) => limitation.code === "navigation-failed"));
  });
  it("never reuses the previous document as a capture of an uncommitted navigation", async () => {
    const run = await runExploration({ runId: "stale-document", entryUrl: `${origin}/before-stall`, runsDir, allowPrivate: true, policy: { maxPages: 2, navigationTimeoutMs: 1000, maxTabStepsPerPage: 3 } });
    assert.equal(run.pageCaptures?.length, 1);
    assert.equal(run.pageCaptures?.[0]?.pageUrl, `${origin}/before-stall`);
    assert.ok(run.limitations.some((limitation) => limitation.code === "navigation-failed" && limitation.pageUrl === `${origin}/stalled`));
  });
});

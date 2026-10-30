import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExploration } from "./orchestrator.js";

describe("visual evidence at access boundaries", () => {
  const server = createServer((request, response) => {
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
});

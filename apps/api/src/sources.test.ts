import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "./index.js";

/**
 * Source-connection route tests: validation, hosted local-path refusal,
 * background failure honesty, and artifact 404s. Clones never reach the
 * network here — invalid URLs fail validation before any git attempt.
 */

async function postJson(
  app: ReturnType<typeof buildServer>,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: "POST", url: path, payload: body });
  return { status: res.statusCode, body: res.json() as Record<string, unknown> };
}

describe("source routes", () => {
  it("requires a git URL and refuses local paths in hosted mode", async () => {
    const app = buildServer();
    try {
      const missing = await postJson(app, "/sources/connect", {});
      assert.equal(missing.status, 400);

      const local = await postJson(app, "/sources/connect", { localPath: "/tmp/x" });
      assert.equal(local.status, 403);
      assert.ok(String(local.body["error"]).includes("trusted CLI"));
    } finally {
      await app.close();
    }
  });

  it("requires runId and findingId together", async () => {
    const app = buildServer();
    try {
      const res = await postJson(app, "/sources/connect", {
        gitUrl: "https://github.com/owner/repo",
        runId: "exp-1",
      });
      assert.equal(res.status, 400);
    } finally {
      await app.close();
    }
  });

  it("fails honestly on an invalid URL (no network, no clone)", async () => {
    const app = buildServer();
    try {
      const started = await postJson(app, "/sources/connect", {
        gitUrl: "not-a-repository-url",
      });
      assert.equal(started.status, 202);
      const sourceId = String(started.body["sourceId"]);
      assert.ok(sourceId.length > 0);
      // The background task fails fast on validation; poll briefly.
      let state = "";
      for (let i = 0; i < 40 && state !== "FAILED"; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        const res = await app.inject({ method: "GET", url: `/sources/${sourceId}` });
        state = String((res.json() as { state?: string }).state ?? "");
      }
      assert.equal(state, "FAILED");
      const trace = await app.inject({ method: "GET", url: `/sources/${sourceId}/trace` });
      assert.equal(trace.statusCode, 404);
      const patch = await app.inject({ method: "GET", url: `/sources/${sourceId}/patch` });
      assert.equal(patch.statusCode, 404);
    } finally {
      await app.close();
    }
  });

  it("returns 404 for unknown connections", async () => {
    const app = buildServer();
    try {
      const res = await app.inject({ method: "GET", url: "/sources/src-nope" });
      assert.equal(res.statusCode, 404);
    } finally {
      await app.close();
    }
  });
});

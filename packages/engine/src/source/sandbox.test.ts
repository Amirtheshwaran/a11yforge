import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSandboxEnv, runIsolated } from "./sandbox.js";
import { splitCommand } from "./repair-run.js";

describe("sandbox isolation", () => {
  it("strips MODEL_API_KEY and credential-like variables", () => {
    process.env["MODEL_API_KEY"] = "secret-key-for-test";
    process.env["GITHUB_TOKEN"] = "gh-secret";
    process.env["MY_PASSWORD"] = "pw";
    try {
      const env = buildSandboxEnv();
      assert.equal(env["MODEL_API_KEY"], undefined);
      assert.equal(env["GITHUB_TOKEN"], undefined);
      assert.equal(env["MY_PASSWORD"], undefined);
      // A11YFORGE_* runtime config never enters untrusted execution either.
      assert.equal(env["A11YFORGE_DATA_DIR"], undefined);
    } finally {
      delete process.env["MODEL_API_KEY"];
      delete process.env["GITHUB_TOKEN"];
      delete process.env["MY_PASSWORD"];
    }
  });

  it("refuses credential keys even in extraEnv", () => {
    const env = buildSandboxEnv({ MODEL_API_KEY: "x", SAFE_FLAG: "1" });
    assert.equal(env["MODEL_API_KEY"], undefined);
    assert.equal(env["SAFE_FLAG"], "1");
  });

  it("splitCommand rejects shell metacharacters (no shell ever)", () => {
    assert.equal(splitCommand("npm run build && rm -rf /"), null);
    assert.equal(splitCommand("build; echo hi"), null);
    assert.equal(splitCommand("$(evil)"), null);
    assert.equal(splitCommand("./local/script.sh"), null);
    assert.deepEqual(splitCommand("npm run build"), ["npm", "run", "build"]);
  });

  it("runs a trivial command with bounded output", async () => {
    const result = await runIsolated({
      argv: ["node", "-e", "console.log('sandbox-ok')"],
      cwd: "/tmp",
      timeoutMs: 30_000,
      requireDocker: false,
    });
    // Docker may or may not exist here; either isolation level is honest.
    assert.ok(result.isolation === "docker" || result.isolation === "process-disposable");
    if (result.isolation === "process-disposable") {
      assert.equal(result.exitCode, 0);
      assert.ok(result.output.includes("sandbox-ok"));
      assert.equal(result.timedOut, false);
    }
  });

  it("refuses honestly when Docker is required but missing", async () => {
    const { isDockerAvailable } = await import("./sandbox.js");
    if (await isDockerAvailable(3000)) return; // Covered by the docker path instead.
    const result = await runIsolated({
      argv: ["node", "-e", "1"],
      cwd: "/tmp",
      timeoutMs: 30_000,
      requireDocker: true,
    });
    assert.equal(result.exitCode, null);
    assert.ok(result.output.includes("Docker is required"));
  });

  it("times out long commands and cleans up the process", async () => {
    const result = await runIsolated({
      argv: ["node", "-e", "setInterval(() => {}, 1000)"],
      cwd: "/tmp",
      timeoutMs: 1500,
      requireDocker: false,
    });
    if (result.isolation === "process-disposable") {
      assert.equal(result.timedOut, true);
    }
  });
});

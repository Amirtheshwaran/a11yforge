import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWorkspace } from "./build.js";

function realCwd(): string {
  return mkdtempSync(join(tmpdir(), "a11yforge-build-"));
}

describe("repaired-fixture build capture", () => {
  it("reports a passing build with command, exit code, and duration", async () => {
    const result = await buildWorkspace({
      workspaceSourceRoot: realCwd(),
      command: [process.execPath, "-e", "console.log('built')"],
    });
    assert.equal(result.passed, true);
    assert.equal(result.exitCode, 0);
    assert.ok(result.durationMs >= 0);
    assert.ok(result.command.length > 0);
    assert.ok(result.stdoutTail.includes("built"));
  });

  it("reports a failing build deterministically (BUILD_FAILED input)", async () => {
    const result = await buildWorkspace({
      workspaceSourceRoot: realCwd(),
      command: [process.execPath, "-e", "console.error('boom'); process.exit(3)"],
    });
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 3);
    assert.ok(result.stderrTail.includes("boom"));
  });

  it("reports spawn failure as a failed build, never a throw", async () => {
    const result = await buildWorkspace({
      workspaceSourceRoot: realCwd(),
      command: ["/nonexistent-binary-xyz", "--build"],
    });
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, null);
    assert.ok(result.stderrTail.includes("spawn failed"));
  });
});

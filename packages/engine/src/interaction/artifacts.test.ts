import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Socket } from "node:net";
import { KeyboardScenarioResultSchema } from "@a11yforge/shared";
import { writeInteractionArtifacts } from "./artifacts.js";
import { CHECKOUT_MODAL_KEYBOARD } from "./scenarios.js";
import { startFixtureServer, FIXTURE_PORT } from "../scanner/fixture-server.js";

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    socket.setTimeout(2000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
    socket.connect(port, "127.0.0.1");
  });
}

describe("writeInteractionArtifacts", () => {
  it("writes a schema-valid scenario.json under <runsDir>/<runId>/", async () => {
    const runsDir = await mkdtemp(join(tmpdir(), "a11yforge-runs-"));
    const { runDir, resultPath } = await writeInteractionArtifacts(
      {
        runId: "test-run",
        scenarioId: CHECKOUT_MODAL_KEYBOARD.id,
        targetUrl: "http://127.0.0.1:3002/",
        startedAt: "2026-10-26T00:00:00.000Z",
        completedAt: "2026-10-26T00:00:01.000Z",
        observations: [],
        assertions: [],
        screenshots: [],
        events: [],
      },
      { runsDir },
    );
    assert.equal(runDir, join(runsDir, "test-run"));
    assert.equal(resultPath, join(runDir, "scenario.json"));
    const parsed = JSON.parse(await readFile(resultPath, "utf8"));
    assert.doesNotThrow(() => KeyboardScenarioResultSchema.parse(parsed));
  });
});

describe("fixture server lifecycle", { timeout: 120_000 }, () => {
  it("stops cleanly and releases its port", async () => {
    const server = await startFixtureServer();
    assert.ok(await canConnect(FIXTURE_PORT));
    await server.stop();
    // Poll briefly: SIGTERM delivery and socket teardown are async.
    let released = false;
    for (let attempt = 0; attempt < 10 && !released; attempt += 1) {
      released = !(await canConnect(FIXTURE_PORT));
      if (!released) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.ok(released, `port ${FIXTURE_PORT} still accepting after stop()`);
  });
});

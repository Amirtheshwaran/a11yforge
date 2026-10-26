import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import { KeyboardScenarioResultSchema } from "@a11yforge/shared";
import { CHECKOUT_MODAL_KEYBOARD } from "./scenarios.js";
import { newRunId, runKeyboardScenario } from "./runner.js";
import { startFixtureServer } from "../scanner/fixture-server.js";
import { writeInteractionArtifacts } from "./artifacts.js";

/**
 * Phase 2 integration test: the deliberately broken checkout modal must
 * deterministically leak focus onto a background control while open, and
 * the run must produce the expected observations, failed assertion, events,
 * and screenshot files. Browser and fixture are always released in
 * `finally` blocks, mirroring the CLI.
 */
describe("checkout-modal-keyboard scenario", { timeout: 180_000 }, () => {
  it("reproduces the focus escape with evidence", async () => {
    const server = await startFixtureServer();
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      const runDir = await mkdtemp(join(tmpdir(), "a11yforge-scenario-"));
      const result = await runKeyboardScenario({
        page,
        scenario: CHECKOUT_MODAL_KEYBOARD,
        runId: newRunId(),
        targetUrl: server.url,
        takeScreenshot: async (name: string) => {
          await page.screenshot({ path: join(runDir, name), timeout: 10_000 });
        },
      });

      assert.doesNotThrow(() => KeyboardScenarioResultSchema.parse(result));

      // Focus starts inside the modal once it opens.
      const opened = result.observations[0];
      assert.ok(opened);
      assert.equal(opened.action, "modal-open");
      assert.equal(opened.insideModal, true);

      // Deterministic Tab walk: close -> email -> continue -> background.
      const tabbed = result.observations
        .filter((o) => o.action === "press")
        .map((o) => o.selector);
      assert.deepEqual(tabbed, [
        "#checkout-modal-email",
        "#checkout-modal-continue",
        "#background-control",
      ]);

      // The containment assertion fails exactly on the escape step.
      assert.equal(result.assertions.length, 1);
      const assertion = result.assertions[0];
      assert.ok(assertion);
      assert.equal(assertion.assertion, "focus-contained-in-modal");
      assert.equal(assertion.passed, false);
      assert.equal(assertion.expectedRegion, "#checkout-modal");
      assert.equal(assertion.actualFocus, "#background-control");
      const escaped = result.observations.find(
        (o) => o.selector === "#background-control",
      );
      assert.ok(escaped);
      assert.equal(assertion.step, escaped.seq);

      // Run events trace the deterministic lifecycle.
      const eventTypes = result.events.map((e) => e.type);
      for (const expected of [
        "scenario-started",
        "page-loaded",
        "modal-opened",
        "key-pressed",
        "focus-changed",
        "assertion-failed",
        "screenshot-captured",
        "scenario-completed",
      ] as const) {
        assert.ok(
          eventTypes.includes(expected),
          `expected run event ${expected} in [${eventTypes.join(", ")}]`,
        );
      }

      // Exactly three screenshots were captured.
      assert.deepEqual(
        result.screenshots.map((s) => s.name),
        ["before-modal.png", "modal-open.png", "focus-escaped.png"],
      );
      const { resultPath } = await writeInteractionArtifacts(result, {
        runsDir: runDir,
      });
      for (const name of [
        "before-modal.png",
        "modal-open.png",
        "focus-escaped.png",
      ]) {
        const info = await stat(join(runDir, name));
        assert.ok(info.size > 0, `expected non-empty artifact ${name}`);
      }
      const scenarioInfo = await stat(resultPath);
      assert.ok(scenarioInfo.size > 0, "expected non-empty scenario.json");
    } finally {
      await browser?.close();
      await server.stop();
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAxeScan } from "./scan.js";
import { startFixtureServer } from "./fixture-server.js";

/**
 * Phase 1 smoke test: the deliberately broken fixture must expose the
 * expected axe rule ids. If this fails, either the fixture was
 * accidentally "fixed" or the scanner regressed — see
 * fixtures/broken-shop/README.md.
 */
describe("broken-shop fixture smoke test", { timeout: 180_000 }, () => {
  it("exposes the known deliberate violations", async () => {
    const server = await startFixtureServer();
    try {
      const result = await runAxeScan(server.url);
      const ruleIds = new Set(result.findings.map((f) => f.ruleId));
      for (const expected of [
        "button-name",
        "image-alt",
        "label",
        "color-contrast",
      ]) {
        assert.ok(
          ruleIds.has(expected),
          `expected rule ${expected} in [${[...ruleIds].join(", ")}]`,
        );
      }
    } finally {
      await server.stop();
    }
  });
});

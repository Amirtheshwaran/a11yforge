import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Anti-coupling regression test (Phase 8 ABSOLUTE ANTI-HARDCODING RULE).
 *
 * Generic explorer production modules must contain ZERO target-specific
 * knowledge: no fixture identifiers, routes, selectors, labels, or expected
 * flows. This test scans the generic sources and fails on the first
 * fixture-specific term, so accidental coupling cannot be reintroduced.
 *
 * Fixture tests may reference fixture identifiers — only the generic
 * production modules listed here are held to this rule.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
// dist/explore/anti-coupling.test.js → packages/engine/
const ENGINE_PACKAGE_DIR = join(HERE, "..", "..");
// Monorepo root: packages/engine/../../..
const REPO_ROOT = join(ENGINE_PACKAGE_DIR, "..", "..");

/** Literal fixture-specific identifiers forbidden in generic modules. */
const FORBIDDEN_IDENTIFIERS = [
  "broken-shop",
  "checkout-modal",
  "background-control",
  "proceed-to-checkout",
  "quantity-decrement",
  "fine-print",
  "checkout-modal-keyboard",
];

/** Fixture-route / target-conditional patterns forbidden in generic modules. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\/checkout\b/,
  /\bcheckout\b/i,
  /hostname\s*===/,
  /host\s*===\s*["']/,
];

/** Generic production modules under the anti-hardcoding rule. */
const SCAN_TARGETS = [
  "packages/engine/src/explore/target.ts",
  "packages/engine/src/explore/surface.ts",
  "packages/engine/src/explore/orchestrator.ts",
  "packages/engine/src/explore/findings.ts",
  "packages/engine/src/explore/probes/types.ts",
  "packages/engine/src/explore/probes/axe-probe.ts",
  "packages/engine/src/explore/probes/keyboard-probe.ts",
  "packages/engine/src/explore/probes/dialog-probe.ts",
  "packages/engine/src/explore/probes/form-probe.ts",
  "packages/engine/src/explore/probes/tabs-probe.ts",
  "packages/engine/src/explore/probes/disclosure-probe.ts",
  "packages/engine/src/explore-cli.ts",
  "packages/shared/src/explore.ts",
  "apps/api/src/explorations.ts",
];

async function readSource(relativePath: string): Promise<string> {
  return readFile(join(REPO_ROOT, relativePath), "utf8");
}

describe("anti-fixture-coupling", () => {
  it("every generic module under the rule exists and is readable", async () => {
    assert.ok((await readdir(join(ENGINE_PACKAGE_DIR, "src", "explore"))).length > 0);
    for (const target of SCAN_TARGETS) {
      const content = await readSource(target);
      assert.ok(content.length > 0, target);
    }
  });

  it("contains no fixture-specific identifiers", async () => {
    const violations: string[] = [];
    for (const target of SCAN_TARGETS) {
      const content = await readSource(target);
      for (const forbidden of FORBIDDEN_IDENTIFIERS) {
        if (content.includes(forbidden)) {
          violations.push(`${target}: contains "${forbidden}"`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it("contains no fixture routes or target-conditional behavior", async () => {
    const violations: string[] = [];
    for (const target of SCAN_TARGETS) {
      const content = await readSource(target);
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${target}: matches ${String(pattern)}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });
});

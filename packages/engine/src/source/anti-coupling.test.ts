import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Anti-coupling coverage for Phase 9 generic source-connection modules
 * (ABSOLUTE ANTI-HARDCODING RULE).
 *
 * Production source/repository/repair modules must contain ZERO knowledge
 * of the controlled fixture: no fixture identifiers, routes, accessible
 * names, expected source paths, expected compiler codes, expected repair
 * contents, or expected frameworks/package managers/build commands.
 * Fixture-specific tests and existing regression modules are exempt —
 * only the generic production modules listed here are scanned.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_PACKAGE_DIR = join(HERE, "..", "..");
const REPO_ROOT = join(ENGINE_PACKAGE_DIR, "..", "..");

/** Literal fixture/application-specific knowledge forbidden in generic modules. */
const FORBIDDEN_IDENTIFIERS = [
  "broken-shop",
  "checkout-modal",
  "checkout_modal",
  "background-control",
  "proceed-to-checkout",
  "quantity-decrement",
  "fine-print",
  "checkout-modal-keyboard",
  "CheckoutModal",
  "src/App.tsx",
  "fixtures/broken-shop",
  "TS18048",
  "noUncheckedIndexedAccess",
  "useFocusTrap",
];

/** Fixture-route / expected-fix / framework-assumption patterns. */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /\/checkout\b/,
  /\bcheckout\b/i,
  /expectedRepair/i,
  /expectedFix/i,
  /fixtureRoot/i,
  /brokenShop/i,
];

/** Generic production modules under the anti-hardcoding rule. */
const SCAN_TARGETS = [
  "packages/engine/src/source/git-url.ts",
  "packages/engine/src/source/paths.ts",
  "packages/engine/src/source/acquire.ts",
  "packages/engine/src/source/inventory.ts",
  "packages/engine/src/source/evidence-terms.ts",
  "packages/engine/src/source/term-weight.ts",
  "packages/engine/src/source/rank.ts",
  "packages/engine/src/source/context.ts",
  "packages/engine/src/source/exec-profile.ts",
  "packages/engine/src/source/sandbox.ts",
  "packages/engine/src/source/reproduce.ts",
  "packages/engine/src/source/diagnose-bundle.ts",
  "packages/engine/src/source/repair-run.ts",
  "packages/engine/src/source/connect.ts",
  "packages/engine/src/repair-cli.ts",
  "packages/shared/src/source.ts",
  "apps/api/src/sources.ts",
];

async function readSource(relativePath: string): Promise<string> {
  return readFile(join(REPO_ROOT, relativePath), "utf8");
}

describe("anti-fixture-coupling (source connection)", () => {
  it("every generic module under the rule exists and is readable", async () => {
    assert.ok((await readdir(join(ENGINE_PACKAGE_DIR, "src", "source"))).length > 0);
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

  it("contains no fixture routes or expected-fix patterns", async () => {
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

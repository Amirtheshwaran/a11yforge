import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static-content regression scan (data-integration contract).
 *
 * Live production routes must never ship hardcoded product values: every
 * finding, count, URL, status, screenshot, diff, and token on a live page
 * comes from the backend. This scan fails on literals that can only be
 * static placeholders. Allowed exceptions (kept narrow on purpose):
 * - input `placeholder="..."` attributes (UX hints, never rendered data),
 * - `components/ui/` (generic shadcn primitives, no product copy).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN_TARGETS = ["app", "components", "lib"];
const UI_DIR = join(HERE, "components", "ui");

const FORBIDDEN = [
  /example\.com/,
  /github\.com\/owner/,
  /abc1234/,
  /sk-ant-/,
  /lorem/i,
  /src\/components\/Dialog/,
  /\/settings/,
  /\b\d+ (issues found|pages tested)\b/,
  /\bTODO\b/,
  /\bFIXME\b/,
];

async function collect(path, out) {
  const info = await stat(path);
  if (!info.isDirectory()) {
    out.push(path);
    return;
  }
  for (const entry of await readdir(path)) {
    const full = join(path, entry);
    if (full === UI_DIR) continue;
    if (full.endsWith(".tsx") || full.endsWith(".ts")) {
      const child = await stat(full);
      if (child.isDirectory()) await collect(full, out);
      else out.push(full);
    } else {
      const child = await stat(full).catch(() => null);
      if (child !== null && child.isDirectory()) await collect(full, out);
    }
  }
}

describe("static content scan", () => {
  it("no hardcoded product values in live frontend sources", async () => {
    const files = [];
    for (const target of SCAN_TARGETS) {
      await collect(join(HERE, target), files);
    }
    assert.ok(files.length > 0, "expected frontend sources to scan");
    const hits = [];
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      // Input hints are UX copy, not rendered data — exclude them.
      const scrubbed = raw.replace(/placeholder="[^"]*"/g, 'placeholder=""');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(scrubbed)) hits.push(`${file}: ${pattern}`);
      }
    }
    assert.deepEqual(hits, [], `static placeholders in live UI:\n${hits.join("\n")}`);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Design-token contrast guard (rules.md #23: A11yForge itself must hold
 * 0 serious/critical axe findings).
 *
 * Every secondary text token must meet WCAG AA (4.5:1) against every
 * dark surface it can appear on. This is what keeps small muted labels,
 * help text, placeholders, and footer metadata axe-clean after any
 * token tweak. It guards token values only; rendered pages are still
 * verified with real axe runs.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(HERE, "app", "globals.css");

function token(css, name) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(match?.[1], `token --${name} must be a 6-digit hex color`);
  return match[1];
}

function luminance(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design token contrast", () => {
  it("secondary text tokens meet 4.5:1 on all dark surfaces", async () => {
    const css = await readFile(CSS_PATH, "utf8");
    const surfaces = [token(css, "bg"), token(css, "bg-raised")];
    for (const text of ["ink", "ink-dim", "ink-faint"]) {
      const fg = token(css, text);
      for (const bg of surfaces) {
        const ratio = contrast(fg, bg);
        assert.ok(
          ratio >= 4.5,
          `--${text} (${fg}) on ${bg} is ${ratio.toFixed(2)}:1, need >= 4.5:1`,
        );
      }
    }
  });
});

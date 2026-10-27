import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Layout regression guard: grid blowout on narrow viewports.
 *
 * Panel containers inside `.grid` tracks (shadcn Card panels, compare
 * cells) must carry `min-width: 0`, otherwise unbreakable content such as
 * diff lines or mono selectors forces the track wider than the viewport
 * and the page scrolls horizontally on mobile. The legacy `section.panel`
 * carried its own `min-width: 0`; this guard keeps the replacement rule
 * that covers all current and future grid children.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(HERE, "app", "globals.css");

describe("layout guards", () => {
  it("grid children cannot force tracks wider than the viewport", async () => {
    const css = await readFile(CSS_PATH, "utf8");
    assert.match(
      css,
      /\.grid\s*>\s*\*,/,
      "globals.css must keep the `.grid > *` min-width: 0 blowout guard",
    );
    assert.match(
      css,
      /min-width:\s*0/,
      "globals.css must constrain grid children with min-width: 0",
    );
  });

  it("walkthrough mini-nav buttons wrap instead of overflowing narrow viewports", async () => {
    const css = await readFile(CSS_PATH, "utf8");
    assert.match(
      css,
      /\.walk-mini-nav button\s*\{[^}]*white-space:\s*normal/,
      "walk mini-nav buttons must override shadcn whitespace-nowrap so long issue titles wrap",
    );
  });
});

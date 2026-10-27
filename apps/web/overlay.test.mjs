import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dimCutoutClip, isDrawableHighlight, toPercentBox } from "./lib/overlay.ts";

/**
 * Overlay geometry: percentages keep boxes aligned at any display size;
 * validity rules keep degenerate, offscreen, and page-level boxes out of
 * the viewer (those findings use the honest unlocatable fallback).
 */

describe("overlay geometry", () => {
  it("converts boxes to percentages of the native shot", () => {
    assert.deepEqual(
      toPercentBox({ x: 160, y: 360, width: 320, height: 180, viewportWidth: 1280, viewportHeight: 720 }),
      { left: 12.5, top: 50, width: 25, height: 25 },
    );
    assert.deepEqual(
      toPercentBox({ x: 0, y: 0, width: 0, height: 0, viewportWidth: 0, viewportHeight: 0 }),
      { left: 0, top: 0, width: 0, height: 0 },
    );
  });

  it("accepts normal boxes and rejects degenerate ones", () => {
    const good = { x: 10, y: 20, width: 100, height: 30, viewportWidth: 1280, viewportHeight: 720 };
    assert.equal(isDrawableHighlight(good), true);
    assert.equal(isDrawableHighlight({ ...good, width: 1, height: 1 }), false);
    assert.equal(isDrawableHighlight({ ...good, width: 0, height: 5 }), false);
  });

  it("rejects boxes fully outside the captured viewport", () => {
    const base = { width: 300, height: 150, viewportWidth: 1280, viewportHeight: 720 };
    assert.equal(isDrawableHighlight({ ...base, x: 0, y: -10000 }), false);
    assert.equal(isDrawableHighlight({ ...base, x: 2000, y: 100 }), false);
    assert.equal(isDrawableHighlight({ ...base, x: -300, y: 100 }), false);
    assert.equal(isDrawableHighlight({ ...base, x: -290, y: 100 }), true);
    assert.equal(isDrawableHighlight({ ...base, x: 1200, y: 100 }), true);
  });

  it("rejects page-level boxes that would outline the whole shot", () => {
    assert.equal(
      isDrawableHighlight({ x: 0, y: 0, width: 1280, height: 1877, viewportWidth: 1280, viewportHeight: 720 }),
      false,
    );
    assert.equal(
      isDrawableHighlight({ x: 0, y: 0, width: 1280, height: 720, viewportWidth: 1280, viewportHeight: 720 }),
      false,
    );
    assert.equal(
      isDrawableHighlight({ x: 32, y: 64, width: 1216, height: 600, viewportWidth: 1280, viewportHeight: 720 }),
      true,
    );
  });

  it("builds a dim cutout around the active box", () => {
    const clip = dimCutoutClip({ left: 10, top: 20, width: 30, height: 40 });
    assert.ok(clip.startsWith("polygon(evenodd,"));
    assert.ok(clip.includes("10% 20%"));
    assert.ok(clip.includes("40% 60%"));
  });
});

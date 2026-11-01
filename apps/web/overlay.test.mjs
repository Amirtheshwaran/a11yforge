import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dimCutoutClip, isDrawableHighlight, sourceEvidenceOf, toPercentBox } from "./lib/overlay.ts";

/**
 * Overlay geometry: percentages keep boxes aligned at any display size;
 * validity rules keep degenerate, offscreen, and page-level boxes out of
 * the viewer (those findings use the honest unlocatable fallback).
 */

describe("selected source evidence", () => {
  const box = { screenshot: "measured.png", x: 20, y: 30, width: 100, height: 40, viewportWidth: 1280, viewportHeight: 720 };
  const finding = { findingId: "selected", pageUrl: "https://example.com/about", screenshots: ["other.png"], highlights: [box] };
  const run = { findings: [finding], screenshots: ["other.png", "measured.png"], pageCaptures: [{ pageUrl: "https://example.com/", screenshot: "other.png" }] };
  it("shows no unrelated capture for a missing or invalid finding", () => {
    const empty = { finding: null, screenshot: null, highlight: null };
    assert.deepEqual(sourceEvidenceOf(null, "selected"), empty);
    assert.deepEqual(sourceEvidenceOf(run, "missing"), empty);
  });
  it("selects the registered capture belonging to the measured location", () => {
    assert.deepEqual(sourceEvidenceOf(run, "selected"), { finding, screenshot: "measured.png", highlight: box });
  });
  it("ignores unregistered images and does not borrow an unrelated page capture", () => {
    const absent = { ...finding, screenshots: ["missing.png"], highlights: [{ ...box, screenshot: "missing.png" }] };
    assert.deepEqual(sourceEvidenceOf({ ...run, findings: [absent] }, "selected"), { finding: absent, screenshot: null, highlight: null });
    assert.equal(sourceEvidenceOf({ ...run, findings: [absent], pageCaptures: [{ pageUrl: finding.pageUrl, screenshot: "other.png" }] }, "selected").screenshot, "other.png");
  });
  it("retains a real screenshot without inventing geometry", () => {
    const unlocated = { ...finding, highlights: [{ ...box, width: 0 }] };
    assert.deepEqual(sourceEvidenceOf({ ...run, findings: [unlocated] }, "selected"), { finding: unlocated, screenshot: "other.png", highlight: null });
  });
});

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

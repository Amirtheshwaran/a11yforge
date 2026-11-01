import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitCaptureDistance, followProgress, copyTransitionTiming } from "./lib/tour-motion.ts";
import { createTimeline } from "animejs";

describe("spatial framing and motion", () => {
  it("fits the full capture at phone, tablet, desktop, and landscape aspects", () => {
    for (const aspect of [0.65, 1, 1.4, 2.4, 3.5]) {
      const distance = fitCaptureDistance(10, 5.625, aspect, 43, 0.88, 0.82);
      const visibleHeight = 2 * distance * Math.tan(43 * Math.PI / 360);
      assert.ok(visibleHeight * 0.82 >= 5.625 - 1e-10);
      assert.ok(visibleHeight * aspect * 0.88 >= 10 - 1e-10);
    }
  });
  it("converges equally at 30, 60, and 120 FPS without overshoot", () => {
    const results = [30, 60, 120].map((fps) => {
      let value = 0;
      for (let frame = 0; frame < fps; frame++) {
        value = followProgress(value, 6, 1 / fps, false);
        assert.ok(value >= 0 && value <= 6);
      }
      return value;
    });
    assert.ok(Math.max(...results) - Math.min(...results) < 0.0001);
    assert.ok(results.every((value) => Math.abs(value - 6) < 0.001));
  });
  it("reverses from the current pose and snaps with reduced motion", () => {
    assert.ok(followProgress(5, 1, 1 / 60, false) < 5);
    assert.equal(followProgress(5, 1, 1 / 60, true), 1);
    assert.ok(followProgress(1, 5, 10, false) < 5, "background pauses do not teleport the scene");
  });
  it("keeps paused chapter copy readable across the camera handoff in both directions", () => {
    const count = 4;
    for (const order of [0, 1, 2, 3]) {
      const copy = Array.from({ length: count }, () => ({ opacity: 1 }));
      const timeline = createTimeline({ autoplay: false });
      copy.forEach((item, index) => {
        const timing = copyTransitionTiming(index, order);
        if (index > 0) timeline.add(item, { opacity: [0, 1], duration: timing.duration, ease: "outCubic" }, timing.enterAt);
        if (index < count - 1) timeline.add(item, { opacity: [1, 0], duration: timing.duration, ease: "inOutQuad" }, timing.exitAt);
      });
      try {
        const positions = Array.from({ length: 601 }, (_, index) => index / 200);
        for (const position of [...positions, ...positions.toReversed()]) {
          timeline.seek(position * 1000);
          const selected = Math.min(count - 1, Math.round(position));
          assert.ok(copy[selected].opacity >= 0.49, `copy ${order} at progress ${position}: ${copy[selected].opacity}`);
        }
      } finally { timeline.revert(); }
    }
  });
});

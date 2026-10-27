import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSceneNodes,
  cameraHomeFor,
  fitDistanceFor,
  focusPathOf,
  highlightToPlane,
  isMappableHighlight,
  markerCategoryCounts,
  planeSizeFor,
  repairStateFromStages,
  sceneShotsWithMarkers,
  tierOf,
  PLANE_WORLD_WIDTH,
} from "./lib/scene-model.ts";
import { isDrawableHighlight } from "./lib/overlay.ts";
import { groupOf, tierOfSeverity } from "./lib/human-copy.ts";

/**
 * Scene-model coordinates: viewport CSS pixels map linearly onto the
 * webpage plane, so a marker points at the same element at any display
 * size. Positions are never guessed — only measured boxes become nodes.
 */

const PLANE_16_9 = planeSizeFor(1280, 720);

function finding(overrides = {}) {
  return {
    findingId: "page-axe-scan-button-name-0",
    category: "automated-finding",
    title: "Automated check: buttons must have discernible text",
    whatHappened: "Automated check failed on 2 elements.",
    whyItMatters: "Screen-reader users may not know what the button does.",
    howReproduced: ["Opened the tested page.", "Ran the automated check."],
    pageUrl: "https://example.com/",
    severity: "serious",
    probeId: "page-axe-scan",
    screenshots: ["screenshot-0.png"],
    standardReferences: [],
    highlights: [],
    ...overrides,
  };
}

function box(overrides = {}) {
  return {
    screenshot: "screenshot-0.png",
    x: 320,
    y: 180,
    width: 160,
    height: 40,
    viewportWidth: 1280,
    viewportHeight: 720,
    label: '"Go" button',
    selector: "button.go",
    ...overrides,
  };
}

describe("plane geometry", () => {
  it("matches the capture aspect ratio", () => {
    assert.deepEqual(planeSizeFor(1280, 720), { width: 10, height: 5.625 });
    assert.deepEqual(planeSizeFor(800, 1200), { width: 10, height: 15 });
    assert.deepEqual(planeSizeFor(0, 0), { width: 10, height: 10 });
  });

  it("maps viewport origin top-left to plane top-left", () => {
    const full = { x: 0, y: 0, width: 1280, height: 720, viewportWidth: 1280, viewportHeight: 720 };
    const { center, rect } = highlightToPlane(full, PLANE_16_9);
    assert.deepEqual(center, { x: 0, y: 0 });
    assert.deepEqual(rect, { x: -5, y: -2.8125, width: 10, height: 5.625 });
  });

  it("maps an element box to the same relative spot for different aspects", () => {
    // Same relative box (25% from left, 25% from top, quarter size).
    const wide = { x: 320, y: 180, width: 320, height: 180, viewportWidth: 1280, viewportHeight: 720 };
    const tall = { x: 200, y: 300, width: 200, height: 300, viewportWidth: 800, viewportHeight: 1200 };
    const widePlane = planeSizeFor(1280, 720);
    const tallPlane = planeSizeFor(800, 1200);
    const widePt = highlightToPlane(wide, widePlane).center;
    const tallPt = highlightToPlane(tall, tallPlane).center;
    // Both centers sit at 37.5% across and 37.5% down their own capture.
    assert.equal(widePt.x / widePlane.width, -0.125);
    assert.equal(widePt.y / widePlane.height, 0.125);
    assert.equal(tallPt.x / tallPlane.width, -0.125);
    assert.equal(tallPt.y / tallPlane.height, 0.125);
  });

  it("keeps markers aligned when the screenshot is scaled", () => {
    // A 2x DPR capture of the same layout: marker fractions must match.
    const css = { x: 160, y: 90, width: 80, height: 20, viewportWidth: 1280, viewportHeight: 720 };
    const dpr2 = { x: 320, y: 180, width: 160, height: 40, viewportWidth: 2560, viewportHeight: 1440 };
    const plane = planeSizeFor(1280, 720);
    const a = highlightToPlane(css, plane);
    const b = highlightToPlane(dpr2, plane);
    assert.deepEqual(b.center, a.center);
    assert.deepEqual(b.rect, a.rect);
  });

  it("handles viewport offsets without drifting", () => {
    // A below-the-fold element maps below plane center, proportionally.
    const atTop = { x: 100, y: 700, width: 200, height: 50, viewportWidth: 1280, viewportHeight: 800 };
    const plane = planeSizeFor(1280, 800);
    const { center } = highlightToPlane(atTop, plane);
    assert.equal(center.x, ((100 + 100) / 1280 - 0.5) * plane.width);
    assert.equal(center.y, (0.5 - (700 + 25) / 800) * plane.height);
    assert.ok(center.y < 0, "below the fold maps below plane center");
    assert.ok(center.x < 0, "left-of-center maps left of plane center");
  });

  it("mirrors the 2D overlay validity rules and severity tiers", () => {
    const samples = [
      { x: 10, y: 20, width: 100, height: 30, viewportWidth: 1280, viewportHeight: 720 },
      { x: 10, y: 20, width: 1, height: 1, viewportWidth: 1280, viewportHeight: 720 },
      { x: 2000, y: 100, width: 300, height: 150, viewportWidth: 1280, viewportHeight: 720 },
      { x: 0, y: 0, width: 1280, height: 720, viewportWidth: 1280, viewportHeight: 720 },
      { x: 0, y: 0, width: 0, height: 0, viewportWidth: 0, viewportHeight: 0 },
    ];
    for (const sample of samples) {
      assert.equal(isMappableHighlight(sample), isDrawableHighlight(sample));
    }
    for (const severity of ["critical", "serious", "moderate", "minor", "info"]) {
      assert.equal(tierOf(severity), tierOfSeverity(severity));
    }
  });
});

describe("scene nodes", () => {
  it("creates one node per drawable affected element", () => {
    const findings = [
      finding({ highlights: [box(), box({ x: 800, y: 400, label: '"Stop" button' })] }),
    ];
    const nodes = buildSceneNodes(findings, { screenshot: "screenshot-0.png", plane: PLANE_16_9, categoryOf: groupOf });
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0]?.key, "page-axe-scan-button-name-0#0");
    assert.equal(nodes[1]?.key, "page-axe-scan-button-name-0#1");
    assert.notDeepEqual(nodes[0]?.center, nodes[1]?.center);
  });

  it("creates no nodes when geometry is unavailable", () => {
    const noGeometry = finding({ highlights: [] });
    const degenerate = finding({
      findingId: "page-axe-scan-x-1",
      highlights: [box({ width: 1, height: 1 })],
    });
    assert.equal(
      buildSceneNodes([noGeometry, degenerate], { screenshot: "screenshot-0.png", plane: PLANE_16_9, categoryOf: groupOf }).length,
      0,
    );
  });

  it("scopes nodes to one screenshot plane at a time", () => {
    const findings = [
      finding({ highlights: [box({ screenshot: "screenshot-0.png" }), box({ screenshot: "screenshot-1.png" })] }),
    ];
    const plane = planeSizeFor(1280, 720);
    assert.equal(buildSceneNodes(findings, { screenshot: "screenshot-0.png", plane, categoryOf: groupOf }).length, 1);
    assert.equal(buildSceneNodes(findings, { screenshot: "screenshot-1.png", plane, categoryOf: groupOf }).length, 1);
  });

  it("marks the selected finding and element only", () => {
    const findings = [finding({ highlights: [box(), box({ x: 800 })] })];
    const nodes = buildSceneNodes(findings, {
      screenshot: "screenshot-0.png",
      plane: PLANE_16_9,
      selectedFindingId: "page-axe-scan-button-name-0",
      selectedElementIndex: 1,
      categoryOf: groupOf,
    });
    assert.equal(nodes[0]?.selected, false);
    assert.equal(nodes[1]?.selected, true);
  });

  it("carries category, tier, and repair state for visuals", () => {
    const findings = [finding({ highlights: [box()] })];
    const nodes = buildSceneNodes(findings, {
      screenshot: "screenshot-0.png",
      plane: PLANE_16_9,
      repairStates: { "page-axe-scan-button-name-0": "verifying" },
      categoryOf: groupOf,
    });
    assert.equal(nodes[0]?.category, "forms");
    assert.equal(nodes[0]?.tier, 1);
    assert.equal(nodes[0]?.repairState, "verifying");
    assert.equal(nodes[0]?.hasGeometry, true);
  });

  it("lists only screenshots with real markers", () => {
    const findings = [
      finding({ highlights: [box({ screenshot: "screenshot-0.png" })] }),
      finding({ findingId: "other-1", highlights: [] }),
    ];
    assert.deepEqual(sceneShotsWithMarkers(findings), ["screenshot-0.png"]);
  });

  it("counts only findings that have markers per category", () => {
    const findings = [
      finding({ highlights: [box()] }),
      finding({ findingId: "imageless", highlights: [] }),
    ];
    const counts = markerCategoryCounts(findings, groupOf);
    assert.equal(counts.forms, 1);
    assert.equal(counts.images, 0);
  });
});

describe("focus path", () => {
  it("orders nodes by recorded sequence and fails the last one", () => {
    const keyboard = finding({
      findingId: "keyboard-traversal-0",
      probeId: "keyboard-traversal",
      highlights: [box({ label: "Menu button" }), box({ x: 640, label: "Hidden panel" })],
    });
    const path = focusPathOf(keyboard, PLANE_16_9);
    assert.equal(path.nodes.length, 2);
    assert.deepEqual(path.nodes.map((n) => n.seq), [0, 1]);
    assert.equal(path.nodes[0]?.failed, false);
    assert.equal(path.nodes[1]?.failed, true);
    assert.notDeepEqual(path.nodes[0]?.center, path.nodes[1]?.center);
  });

  it("is empty when no geometry was recorded", () => {
    const path = focusPathOf(finding(), PLANE_16_9);
    assert.equal(path.nodes.length, 0);
  });
});

describe("repair states", () => {
  it("folds real backend stages without inventing verified", () => {
    assert.equal(repairStateFromStages([]), "unresolved");
    assert.equal(repairStateFromStages(["scanner-completed"]), "unresolved");
    assert.equal(repairStateFromStages(["repair-proposal-started"]), "repairing");
    assert.equal(repairStateFromStages(["repair-proposal-started", "typecheck-started"]), "verifying");
    assert.equal(
      repairStateFromStages(["repair-proposal-started", "typecheck-started", "repair-accepted"]),
      "verified",
    );
    assert.equal(repairStateFromStages(["repair-proposal-started", "repair-rejected"]), "rejected");
    assert.equal(repairStateFromStages(["repair-proposal-started", "replay-failed"]), "unverifiable");
  });
});

describe("plane constants", () => {
  it("keeps a stable world width", () => {
    assert.equal(PLANE_WORLD_WIDTH, 10);
  });
});

describe("camera framing", () => {
  it("homes the camera on the whole page", () => {
    const home = cameraHomeFor(planeSizeFor(1280, 720));
    assert.deepEqual(home.target, [0, 0, 0]);
    assert.ok(home.position[2] >= 12.5);
    const tall = cameraHomeFor(planeSizeFor(800, 1200));
    assert.ok(tall.position[2] > home.position[2], "tall pages get more distance");
  });

  it("fits elements at short controlled distances", () => {
    assert.ok(fitDistanceFor(0.5, 0.2) >= 3.5, "never closer than readable");
    assert.ok(fitDistanceFor(20, 20) <= 9, "never a long dolly");
    assert.ok(fitDistanceFor(2, 1) > fitDistanceFor(0.5, 0.2), "larger elements get more distance");
  });
});

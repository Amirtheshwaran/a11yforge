import type { ElementHighlight, ExplorationFinding } from "@a11yforge/shared";
import type { GroupId } from "./human-copy";

/**
 * Scene-model mapping layer (single owner for backend → 3D translation).
 *
 * Pure and deterministic: backend findings/evidence go in, plane-space
 * scene nodes come out. No Three.js here, so this module stays testable
 * under plain `node --test` and reusable by both the canvas and the HTML
 * fallback. Positions are resolution-independent — a marker points at the
 * same element at any display size.
 *
 * Plane convention: the webpage plane is `planeWidth` world units wide,
 * centered on the origin, with +x right and +y up. Viewport CSS pixels
 * (origin top-left, measured by Playwright at capture scroll position)
 * map linearly onto that plane.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepairState =
  | "unresolved"
  | "repairing"
  | "verifying"
  | "verified"
  | "rejected"
  | "unverifiable";

export type Severity = ExplorationFinding["severity"];

export interface PlaneSize {
  width: number;
  height: number;
}

export interface PlanePoint {
  x: number;
  y: number;
}

export interface PlaneRect extends PlanePoint {
  width: number;
  height: number;
}

/** One spatial marker: one affected element of one finding. */
export interface FindingSceneNode {
  /** Stable key: `${findingId}#${highlightIndex}`. */
  key: string;
  findingId: string;
  highlightIndex: number;
  pageUrl: string;
  screenshot: string;
  label: string;
  selector: string;
  /** Marker anchor: element center in plane space. */
  center: PlanePoint;
  /** Element bounds in plane space (min-corner origin). */
  rect: PlaneRect;
  category: GroupId;
  severity: Severity;
  /** 0 = needs attention first, 1 = important, 2 = improvement. */
  tier: 0 | 1 | 2;
  hasGeometry: boolean;
  selected: boolean;
  repairState: RepairState;
}

/** One node of a keyboard focus path, in action order. */
export interface FocusPathNode {
  seq: number;
  center: PlanePoint;
  rect: PlaneRect;
  label: string;
  /** True for the final node where focus went wrong. */
  failed: boolean;
}

export interface FocusPathModel {
  findingId: string;
  nodes: FocusPathNode[];
}

// ---------------------------------------------------------------------------
// Plane geometry
// ---------------------------------------------------------------------------

/** World width of the webpage plane; height follows the capture aspect. */
export const PLANE_WORLD_WIDTH = 10;

export function planeSizeFor(
  viewportWidth: number,
  viewportHeight: number,
  worldWidth: number = PLANE_WORLD_WIDTH,
): PlaneSize {
  if (!(viewportWidth > 0) || !(viewportHeight > 0) || !(worldWidth > 0)) {
    return { width: worldWidth, height: worldWidth };
  }
  return { width: worldWidth, height: (worldWidth * viewportHeight) / viewportWidth };
}

/**
 * Convert a Playwright viewport-relative box to plane space.
 * Linear and deterministic: percentages of the native capture, so the
 * marker lands on the same element at any display size.
 */
export function highlightToPlane(
  box: Pick<ElementHighlight, "x" | "y" | "width" | "height" | "viewportWidth" | "viewportHeight">,
  plane: PlaneSize,
): { center: PlanePoint; rect: PlaneRect } {
  const { x, y, width, height, viewportWidth, viewportHeight } = box;
  const safeW = viewportWidth > 0 ? viewportWidth : 1;
  const safeH = viewportHeight > 0 ? viewportHeight : 1;
  const left = (x / safeW - 0.5) * plane.width;
  const top = (0.5 - y / safeH) * plane.height;
  const w = (width / safeW) * plane.width;
  const h = (height / safeH) * plane.height;
  return {
    center: { x: left + w / 2, y: top - h / 2 },
    rect: { x: left, y: top - h, width: w, height: h },
  };
}

/** Plane-space center of the whole page (camera home). */
export function planeHome(): PlanePoint {
  return { x: 0, y: 0 };
}

// ---------------------------------------------------------------------------
// Camera framing (pure math; the component lives in SceneCameraController)
// ---------------------------------------------------------------------------

/** A request to center a plane-space point at a camera distance. */
export interface CameraRequest {
  point: PlanePoint;
  distance: number;
  /** Monotonic id: a new id triggers a new move. */
  nonce: number;
}

export const CAMERA_HOME_DISTANCE = 12.5;

export function cameraHomeFor(plane: PlaneSize): {
  position: [number, number, number];
  target: [number, number, number];
} {
  const distance = Math.max(CAMERA_HOME_DISTANCE, plane.height * 0.9 + 4);
  return { position: [0, plane.height * 0.08, distance], target: [0, 0, 0] };
}

/** Fit distance for an element of the given plane-space size. */
export function fitDistanceFor(width: number, height: number): number {
  const largest = Math.max(width, height);
  return Math.min(9, Math.max(3.5, 2.6 + largest * 3));
}

// ---------------------------------------------------------------------------
// Scene nodes
// ---------------------------------------------------------------------------

/**
 * A highlight is mappable when it is worth drawing: same rules as the 2D
 * overlay's `isDrawableHighlight` (degenerate boxes, fully offscreen
 * boxes, and page-level boxes are out). The 2D overlay stays the owner
 * of those rules; this mirror keeps the mapping layer runnable without
 * sibling value imports, and the parity test pins them together.
 */
export function isMappableHighlight(
  highlight: Pick<ElementHighlight, "x" | "y" | "width" | "height" | "viewportWidth" | "viewportHeight">,
): boolean {
  const { x, y, width, height, viewportWidth, viewportHeight } = highlight;
  if (viewportWidth <= 0 || viewportHeight <= 0) return false;
  if (width < 2 || height < 2) return false;
  const intersects =
    x + width > 0 && y + height > 0 && x < viewportWidth && y < viewportHeight;
  if (!intersects) return false;
  const coverage = (width * height) / (viewportWidth * viewportHeight);
  if (coverage >= 0.95) return false;
  return true;
}

/** Severity tier for marker size/ring weight (mirrors `tierOfSeverity`). */
export function tierOf(severity: ExplorationFinding["severity"]): 0 | 1 | 2 {
  if (severity === "critical") return 0;
  if (severity === "serious") return 1;
  return 2;
}

export interface BuildSceneNodesOptions {
  /** Only nodes for this screenshot artifact (one page plane at a time). */
  screenshot: string;
  plane: PlaneSize;
  selectedFindingId?: string | null;
  selectedElementIndex?: number;
  repairStates?: Readonly<Record<string, RepairState>>;
  /**
   * Human category per finding (the page passes `groupOf`). Injected so
   * this module stays free of sibling value imports.
   */
  categoryOf: (finding: ExplorationFinding) => GroupId;
}

function repairOf(
  repairStates: Readonly<Record<string, RepairState>> | undefined,
  findingId: string,
): RepairState {
  return repairStates?.[findingId] ?? "unresolved";
}

/**
 * Build spatial markers for one screenshot from real findings.
 * Findings without drawable geometry produce no node — they stay in the
 * HTML list only and positions are never invented.
 */
export function buildSceneNodes(
  findings: ExplorationFinding[],
  options: BuildSceneNodesOptions,
): FindingSceneNode[] {
  const nodes: FindingSceneNode[] = [];
  for (const finding of findings) {
    const drawable = finding.highlights.filter(isMappableHighlight);
    drawable.forEach((highlight, drawableIndex) => {
      if (highlight.screenshot !== options.screenshot) return;
      // The highlight must carry the viewport its box was measured in.
      const plane =
        highlight.viewportWidth > 0 && highlight.viewportHeight > 0
          ? planeSizeFor(highlight.viewportWidth, highlight.viewportHeight, options.plane.width)
          : options.plane;
      const { center, rect } = highlightToPlane(highlight, plane);
      const selected =
        options.selectedFindingId === finding.findingId &&
        (options.selectedElementIndex ?? 0) === drawableIndex;
      nodes.push({
        key: `${finding.findingId}#${drawableIndex}`,
        findingId: finding.findingId,
        highlightIndex: drawableIndex,
        pageUrl: finding.pageUrl,
        screenshot: highlight.screenshot,
        label: highlight.label,
        selector: highlight.selector,
        center,
        rect,
        category: options.categoryOf(finding),
        severity: finding.severity,
        tier: tierOf(finding.severity),
        hasGeometry: true,
        selected,
        repairState: repairOf(options.repairStates, finding.findingId),
      });
    });
  }
  return nodes;
}

/** Screenshots that actually have drawable markers (real pages only). */
export function sceneShotsWithMarkers(findings: ExplorationFinding[]): string[] {
  const shots: string[] = [];
  for (const finding of findings) {
    for (const highlight of finding.highlights.filter(isMappableHighlight)) {
      if (!shots.includes(highlight.screenshot)) shots.push(highlight.screenshot);
    }
  }
  return shots;
}

/**
 * Count findings per human category that have at least one drawable
 * marker — filters must never offer empty categories.
 */
export function markerCategoryCounts(
  findings: ExplorationFinding[],
  categoryOf: (finding: ExplorationFinding) => GroupId,
): Record<GroupId, number> {
  const counts: Record<GroupId, number> = {
    keyboard: 0,
    forms: 0,
    images: 0,
    readability: 0,
    structure: 0,
    more: 0,
  };
  for (const finding of findings) {
    if (finding.highlights.filter(isMappableHighlight).length === 0) continue;
    counts[categoryOf(finding)] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Focus / keyboard path
// ---------------------------------------------------------------------------

/**
 * Spatial focus sequence for a keyboard finding: one node per affected
 * element with real geometry, in the recorded order. The final node is
 * the failed target. No intermediate steps are invented — when geometry
 * is missing the path is empty and the HTML storyboard stays authoritative.
 */
export function focusPathOf(
  finding: ExplorationFinding,
  plane: PlaneSize,
): FocusPathModel {
  const drawable = finding.highlights.filter(isMappableHighlight);
  const nodes: FocusPathNode[] = drawable.map((highlight, seq) => {
    const highlightPlane =
      highlight.viewportWidth > 0 && highlight.viewportHeight > 0
        ? planeSizeFor(highlight.viewportWidth, highlight.viewportHeight, plane.width)
        : plane;
    const { center, rect } = highlightToPlane(highlight, highlightPlane);
    return {
      seq,
      center,
      rect,
      label: highlight.label,
      failed: seq === drawable.length - 1,
    };
  });
  return { findingId: finding.findingId, nodes };
}

// ---------------------------------------------------------------------------
// Repair states from real backend stages
// ---------------------------------------------------------------------------

const REPAIR_STAGE_STATES: Record<string, RepairState> = {
  "repair-proposal-started": "repairing",
  "repair-applied": "repairing",
  "typecheck-started": "verifying",
  "build-passed": "verifying",
  "replay-passed": "verifying",
  "repair-accepted": "verified",
  "repair-rejected": "rejected",
};

/**
 * Fold a real backend event-stage sequence into a marker repair state.
 * Unknown or absent stages stay "unresolved" — verified is never claimed
 * from frontend state.
 */
export function repairStateFromStages(stages: string[]): RepairState {
  let state: RepairState = "unresolved";
  for (const stage of stages) {
    const next = REPAIR_STAGE_STATES[stage];
    if (next !== undefined) state = next;
  }
  if (stages.includes("replay-failed") && state !== "verified" && state !== "rejected") {
    return "unverifiable";
  }
  return state;
}

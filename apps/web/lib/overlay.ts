import type { ElementHighlight } from "@a11yforge/shared";

/**
 * Overlay geometry helpers (single owner for highlight positioning).
 *
 * Highlight boxes are viewport-relative CSS pixels measured against a
 * screenshot of known viewport size. The overlay renders with PERCENTAGE
 * coordinates, so boxes stay aligned at any display size:
 *   percent = box / native * 100
 * No fixed CSS pixels from the capture are ever used for positioning.
 */

export interface PercentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Convert a measured box to overlay percentages of the native shot. */
export function toPercentBox(
  box: Pick<ElementHighlight, "x" | "y" | "width" | "height" | "viewportWidth" | "viewportHeight">,
): PercentBox {
  const width = box.viewportWidth > 0 ? (box.width / box.viewportWidth) * 100 : 0;
  const height = box.viewportHeight > 0 ? (box.height / box.viewportHeight) * 100 : 0;
  return {
    left: box.viewportWidth > 0 ? (box.x / box.viewportWidth) * 100 : 0,
    top: box.viewportHeight > 0 ? (box.y / box.viewportHeight) * 100 : 0,
    width,
    height,
  };
}

/**
 * Whether a highlight is worth drawing. Rejects degenerate boxes
 * (tracking pixels), boxes fully outside the captured viewport, and
 * page-level boxes that would outline the entire screenshot.
 */
export function isDrawableHighlight(
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

/** Drawable subset of a finding's highlights (invalid boxes excluded). */
export function drawableHighlights(highlights: ElementHighlight[]): ElementHighlight[] {
  return highlights.filter(isDrawableHighlight);
}

/** Clip-path cutout for dimming everything except the active box. */
export function dimCutoutClip(active: PercentBox): string {
  const x2 = active.left + active.width;
  const y2 = active.top + active.height;
  return (
    `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ` +
    `${active.left}% ${active.top}%, ${active.left}% ${y2}%, ${x2}% ${y2}%, ${x2}% ${active.top}%, ${active.left}% ${active.top}%)`
  );
}

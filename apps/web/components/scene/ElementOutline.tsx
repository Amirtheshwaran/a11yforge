"use client";

import { Line } from "@react-three/drei";
import type { PlaneRect } from "../../lib/scene-model";

/**
 * Wireframe overlay matching the actual affected element bounds.
 * Bright double-weight rectangle floating just above the page plane —
 * the problem location is impossible to miss while the capture stays
 * fully visible underneath.
 */

interface Props {
  rect: PlaneRect;
}

export function ElementOutline({ rect }: Props): React.JSX.Element {
  const x0 = rect.x;
  const x1 = rect.x + rect.width;
  const y0 = rect.y;
  const y1 = rect.y + rect.height;
  const z = 0.04;
  const points: [number, number, number][] = [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
    [x0, y0, z],
  ];
  return <Line points={points} color="#ffffff" lineWidth={3} />;
}

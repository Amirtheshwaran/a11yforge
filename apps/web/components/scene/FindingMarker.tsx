"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { FindingSceneNode } from "../../lib/scene-model";
import { RepairStateMarker } from "./RepairStateMarker";

/**
 * One spatial issue marker: a minimalist monochrome pin (stem + head)
 * with severity carried by size and ring count, plus a dark backing disc
 * so it reads on light and dark captures alike.
 *
 * tier 0 (needs attention first) → large head + two rings
 * tier 1 (important)              → medium head + one ring
 * tier 2 (improvement)            → small head, no ring
 *
 * The selected marker grows, gains an outline ring and a label chip.
 * Every marker has an equivalent HTML control in the walkthrough and
 * the compact list, so the canvas is never the only path.
 */

const WHITE = "#ffffff";
const BACKING = "#000000";

function ringPoints(radius: number, segments = 48): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, 0]);
  }
  return points;
}

interface Props {
  node: FindingSceneNode;
  issueLabel: string | null;
  dimmed: boolean;
  reducedMotion: boolean;
  onSelect: (findingId: string, highlightIndex: number) => void;
}

export function FindingMarker({ node, issueLabel, dimmed, reducedMotion, onSelect }: Props): React.JSX.Element {
  const headRadius = node.tier === 0 ? 0.11 : node.tier === 1 ? 0.09 : 0.07;
  const ringCount = node.tier === 0 ? 2 : node.tier === 1 ? 1 : 0;
  const scale = node.selected ? 1.45 : 1;
  const opacity = dimmed && !node.selected ? 0.35 : 1;

  const breathe = useRef<THREE.Group>(null);
  useFrame((state) => {
    const group = breathe.current;
    if (group === null || !node.selected || reducedMotion) return;
    const t = state.clock.elapsedTime;
    group.scale.setScalar(scale * (1 + 0.07 * Math.sin(t * 2.2)));
    state.invalidate();
  });

  return (
    <group
      position={[node.center.x, node.center.y, 0.12]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.findingId, node.highlightIndex);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <group ref={breathe} scale={node.selected ? scale : 1}>
        {/* Backing disc for contrast on any capture brightness. */}
        <mesh position={[0, 0, -0.015]}>
          <circleGeometry args={[headRadius * 2.7, 32]} />
          <meshBasicMaterial color={BACKING} toneMapped={false} transparent opacity={0.72 * opacity} depthWrite={false} />
        </mesh>
        {/* Pin stem down to the page surface. */}
        <mesh position={[0, -headRadius * 1.6, -0.05]}>
          <cylinderGeometry args={[0.016, 0.016, headRadius * 3.2, 8]} />
          <meshBasicMaterial color={WHITE} toneMapped={false} transparent opacity={opacity} />
        </mesh>
        {/* Head. */}
        <mesh>
          <sphereGeometry args={[headRadius, 20, 20]} />
          <meshBasicMaterial color={WHITE} toneMapped={false} transparent opacity={opacity} />
        </mesh>
        {/* Severity rings. */}
        {Array.from({ length: ringCount }, (_, i) => (
          <Line
            key={i}
            points={ringPoints(headRadius * (2.1 + i * 0.85))}
            color={WHITE}
            lineWidth={node.tier === 0 ? 2 : 1.5}
            transparent
            opacity={opacity}
          />
        ))}
        {node.selected && (
          <Line points={ringPoints(headRadius * 3.4)} color={WHITE} lineWidth={2.5} transparent opacity={1} />
        )}
        <RepairStateMarker state={node.repairState} reducedMotion={reducedMotion} baseRadius={headRadius} />
      </group>
      {node.selected && issueLabel !== null && (
        <Html position={[0, headRadius * 4.4, 0]} center zIndexRange={[30, 0]}>
          <span
            style={{
              pointerEvents: "none",
              display: "inline-block",
              maxWidth: 220,
              background: "#000",
              border: "1px solid #fff",
              color: "#fff",
              fontSize: 12,
              lineHeight: "16px",
              padding: "4px 8px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontFamily: "inherit",
            }}
          >
            {issueLabel}
          </span>
        </Html>
      )}
    </group>
  );
}

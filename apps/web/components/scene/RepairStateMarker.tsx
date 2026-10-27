"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { RepairState } from "../../lib/scene-model";

/**
 * Repair-state geometry: state is carried by shape and motion, never by
 * color alone. All states stay monochrome.
 *
 * unresolved   → nothing extra (the plain marker ring/pin)
 * repairing    → slow pulsing ring
 * verifying    → concentric inspection rings (expanding pair)
 * verified     → small check-ring (torus + check stroke)
 * rejected     → marker plus a small cross indicator
 * unverifiable → open arc (an incomplete ring)
 */

const WHITE = "#ffffff";
const DIM = "#a3a3a3";

interface Props {
  state: RepairState;
  reducedMotion: boolean;
  baseRadius: number;
}

function ringPoints(radius: number, z: number, segments = 48): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, z]);
  }
  return points;
}

function PulseRing({ radius, reducedMotion }: { radius: number; reducedMotion: boolean }): React.JSX.Element {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const group = ref.current;
    if (group === null || reducedMotion) return;
    const t = state.clock.elapsedTime;
    const s = 1 + 0.14 * Math.sin(t * 2.4);
    group.scale.setScalar(s);
    state.invalidate();
  });
  return (
    <group ref={ref}>
      <Line points={ringPoints(radius, 0)} color={WHITE} lineWidth={2} transparent opacity={0.95} />
    </group>
  );
}

function InspectionRings({ radius, reducedMotion }: { radius: number; reducedMotion: boolean }): React.JSX.Element {
  const first = useRef<THREE.Group>(null);
  const second = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (reducedMotion) return;
    const t = state.clock.elapsedTime % 2.4;
    const a = first.current;
    const b = second.current;
    if (a !== null) {
      const k = 1 + (t / 2.4) * 0.9;
      a.scale.setScalar(k);
    }
    if (b !== null) {
      const t2 = (t + 1.2) % 2.4;
      const k = 1 + (t2 / 2.4) * 0.9;
      b.scale.setScalar(k);
    }
    state.invalidate();
  });
  return (
    <group>
      <group ref={first}>
        <Line points={ringPoints(radius, 0)} color={WHITE} lineWidth={1.5} transparent opacity={0.9} />
      </group>
      <group ref={second}>
        <Line points={ringPoints(radius, 0)} color={DIM} lineWidth={1.5} transparent opacity={0.7} />
      </group>
    </group>
  );
}

export function RepairStateMarker({ state, reducedMotion, baseRadius }: Props): React.JSX.Element | null {
  if (state === "unresolved") return null;
  if (state === "repairing") {
    return <PulseRing radius={baseRadius * 1.9} reducedMotion={reducedMotion} />;
  }
  if (state === "verifying") {
    return <InspectionRings radius={baseRadius * 1.9} reducedMotion={reducedMotion} />;
  }
  if (state === "verified") {
    // Collapsed check-ring: small torus with a check stroke inside.
    const r = baseRadius * 1.5;
    return (
      <group>
        <mesh>
          <torusGeometry args={[r, 0.022, 8, 40]} />
          <meshBasicMaterial color={WHITE} toneMapped={false} />
        </mesh>
        <Line
          points={[
            [-r * 0.45, -r * 0.05, 0.01],
            [-r * 0.1, -r * 0.4, 0.01],
            [r * 0.5, r * 0.35, 0.01],
          ]}
          color={WHITE}
          lineWidth={2.5}
        />
      </group>
    );
  }
  if (state === "rejected") {
    // The marker remains, flagged with a small cross above it.
    const y = baseRadius * 2.6;
    const s = baseRadius * 0.5;
    return (
      <group position={[0, y, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[s * 2, 0.035, 0.035]} />
          <meshBasicMaterial color={WHITE} toneMapped={false} />
        </mesh>
        <mesh rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[s * 2, 0.035, 0.035]} />
          <meshBasicMaterial color={WHITE} toneMapped={false} />
        </mesh>
      </group>
    );
  }
  // unverifiable: an incomplete ring — the check could not be closed.
  return (
    <group>
      <mesh>
        <torusGeometry args={[baseRadius * 1.9, 0.02, 8, 40, 4.4]} />
        <meshBasicMaterial color={DIM} toneMapped={false} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

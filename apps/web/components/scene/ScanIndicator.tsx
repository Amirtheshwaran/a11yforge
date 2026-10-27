"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { PlaneSize } from "../../lib/scene-model";

/**
 * Active-work indicator: a thin monochrome band sweeping the page while
 * the real run is in progress. It marks activity only — never a
 * detection location — and unmounts the moment the run stops.
 */

interface Props {
  plane: PlaneSize;
  reducedMotion: boolean;
}

export function ScanIndicator({ plane, reducedMotion }: Props): React.JSX.Element {
  const band = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const mesh = band.current;
    if (mesh === null) return;
    if (reducedMotion) {
      // Calm static band at mid-page instead of motion.
      mesh.position.y = 0;
      return;
    }
    const t = state.clock.elapsedTime;
    const span = plane.height / 2;
    const phase = (t * 0.35) % 2;
    mesh.position.y = phase < 1 ? span - phase * plane.height : -span + (phase - 1) * plane.height;
    state.invalidate();
  });

  return (
    <mesh ref={band} position={[0, plane.height / 2, 0.06]}>
      <planeGeometry args={[plane.width, 0.05]} />
      <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.55} depthWrite={false} />
    </mesh>
  );
}

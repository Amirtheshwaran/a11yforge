"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { FocusPathModel } from "../../lib/scene-model";

/**
 * Keyboard focus path: a node at each real focus target, connecting
 * lines in action order, a direction cone per edge, and a cross on the
 * failed final target. Built only from recorded geometry — never
 * invented steps.
 *
 * `activeSeq` drives the focus-playhead: the white traveler node sits at
 * the node under review (stepper or playback). Playback animates it
 * through the recorded sequence; reduced motion steps without animation.
 */

const WHITE = "#ffffff";
const DIM = "#8a8a8a";

interface Props {
  path: FocusPathModel;
  activeSeq: number;
  playing: boolean;
  reducedMotion: boolean;
}

export function FocusPath({ path, activeSeq, playing, reducedMotion }: Props): React.JSX.Element | null {
  const traveler = useRef<THREE.Mesh>(null);

  const clamped = Math.max(0, Math.min(activeSeq, path.nodes.length - 1));
  const current = path.nodes[clamped] ?? null;

  useEffect(() => {
    const mesh = traveler.current;
    if (mesh !== null && current !== null && (reducedMotion || !playing)) {
      mesh.position.set(current.center.x, current.center.y, 0.16);
    }
  }, [clamped, current, playing, reducedMotion]);

  useFrame((state, delta) => {
    const mesh = traveler.current;
    if (mesh === null || current === null) return;
    if (!playing || reducedMotion) return;
    const step = 1 - Math.exp(-4 * Math.min(Math.max(delta, 0), 0.05));
    mesh.position.x += (current.center.x - mesh.position.x) * step;
    mesh.position.y += (current.center.y - mesh.position.y) * step;
    mesh.position.z = 0.16;
    state.invalidate();
  });

  if (path.nodes.length === 0 || current === null) return null;

  const start = path.nodes[0] ?? null;

  return (
    <group>
      {/* Edges in action order; the failed final edge is dashed. */}
      {path.nodes.slice(1).map((node, i) => {
        const prev = path.nodes[i];
        if (prev === undefined) return null;
        const failed = node.failed;
        return (
          <Line
            key={node.seq}
            points={[
              [prev.center.x, prev.center.y, 0.1],
              [node.center.x, node.center.y, 0.1],
            ]}
            color={failed ? WHITE : DIM}
            lineWidth={failed ? 2.5 : 1.5}
            dashed={failed}
            dashSize={0.14}
            gapSize={0.09}
            transparent
            opacity={1}
          />
        );
      })}
      {/* Direction cones at edge midpoints. */}
      {path.nodes.slice(1).map((node, i) => {
        const prev = path.nodes[i];
        if (prev === undefined) return null;
        const mx = (prev.center.x + node.center.x) / 2;
        const my = (prev.center.y + node.center.y) / 2;
        const angle = Math.atan2(node.center.y - prev.center.y, node.center.x - prev.center.x);
        return (
          <mesh key={`cone-${node.seq}`} position={[mx, my, 0.1]} rotation={[0, 0, angle - Math.PI / 2]}>
            <coneGeometry args={[0.07, 0.18, 12]} />
            <meshBasicMaterial color={node.failed ? WHITE : DIM} toneMapped={false} />
          </mesh>
        );
      })}
      {/* Station nodes. */}
      {path.nodes.map((node) => (
        <mesh key={`node-${node.seq}`} position={[node.center.x, node.center.y, 0.1]}>
          <sphereGeometry args={[node.seq === clamped ? 0.09 : 0.06, 16, 16]} />
          <meshBasicMaterial color={node.failed ? WHITE : DIM} toneMapped={false} />
        </mesh>
      ))}
      {/* Failed target cross. */}
      {path.nodes
        .filter((node) => node.failed)
        .map((node) => (
          <group key={`fail-${node.seq}`} position={[node.center.x, node.center.y, 0.12]}>
            <mesh rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.34, 0.05, 0.05]} />
              <meshBasicMaterial color={WHITE} toneMapped={false} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]}>
              <boxGeometry args={[0.34, 0.05, 0.05]} />
              <meshBasicMaterial color={WHITE} toneMapped={false} />
            </mesh>
          </group>
        ))}
      {/* Traveler: the focus playhead. */}
      {start !== null && (
        <mesh
          ref={traveler}
          position={[path.nodes[clamped]?.center.x ?? 0, path.nodes[clamped]?.center.y ?? 0, 0.16]}
        >
          <sphereGeometry args={[0.11, 20, 20]} />
          <meshBasicMaterial color={WHITE} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

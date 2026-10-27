"use client";

import { Component, type ReactNode, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * Landing concept: a restrained monochrome webpage slab with
 * accessibility nodes attached — a preview of the product idea, not a
 * background effect. Static geometry; markers breathe gently unless
 * reduced motion is preferred.
 */

const PAGE = "#dedede";
const INK = "#0a0a0a";
const MARK = "#ffffff";
const FRAME = "#8a8a8a";

function blockPoints(x: number, y: number, w: number, h: number, z: number): [number, number, number][] {
  return [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + h, z],
    [x, y + h, z],
    [x, y, z],
  ];
}

const NODES: { x: number; y: number; rings: number }[] = [
  { x: 1.1, y: 1.5, rings: 2 },
  { x: -1.6, y: 0.4, rings: 1 },
  { x: 0.4, y: -0.9, rings: 1 },
  { x: -0.5, y: -1.9, rings: 0 },
];

function ConceptNodes({ reducedMotion }: { reducedMotion: boolean }): React.JSX.Element {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (reducedMotion || group.current === null) return;
    const t = state.clock.elapsedTime;
    group.current.position.y = Math.sin(t * 0.9) * 0.05;
    state.invalidate();
  });
  return (
    <group ref={group}>
      {NODES.map((node, i) => (
        <group key={i} position={[node.x, node.y, 0.35]}>
          <mesh position={[0, 0, -0.1]}>
            <cylinderGeometry args={[0.02, 0.02, 0.35, 8]} />
            <meshBasicMaterial color={MARK} toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.11, 20, 20]} />
            <meshBasicMaterial color={MARK} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, -0.01]}>
            <circleGeometry args={[0.26, 32]} />
            <meshBasicMaterial color={INK} toneMapped={false} transparent opacity={0.75} depthWrite={false} />
          </mesh>
          {Array.from({ length: node.rings }, (_, r) => (
            <MarkerRing key={r} radius={0.24 + r * 0.13} />
          ))}
        </group>
      ))}
      {/* A small focus path linking two nodes. */}
      <Line
        points={[
          [NODES[1]?.x ?? 0, NODES[1]?.y ?? 0, 0.35],
          [NODES[2]?.x ?? 0, NODES[2]?.y ?? 0, 0.35],
        ]}
        color={MARK}
        lineWidth={1.5}
        transparent
        opacity={0.8}
      />
    </group>
  );
}

function MarkerRing({ radius }: { radius: number }): React.JSX.Element {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    points.push([Math.cos(a) * radius, Math.sin(a) * radius, 0]);
  }
  return <Line points={points} color={MARK} lineWidth={1.5} transparent opacity={0.9} />;
}

function ConceptContents(): React.JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <>
      <color attach="background" args={["#000000"]} />
      {/* Page slab. */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[6.4, 8]} />
        <meshBasicMaterial color={PAGE} toneMapped={false} />
      </mesh>
      {/* Wireframe content blocks: heading, text lines, image, button. */}
      <Line points={blockPoints(-2.4, 2.6, 3.4, 0.5, 0.01)} color={INK} lineWidth={2} />
      {[-2.4, -1.55, -0.7].map((y, i) => (
        <mesh key={i} position={[-0.35 + i * 0, 1.9 - i * 0.32, 0.01]}>
          <planeGeometry args={[4.1 - i * 0.9, 0.12]} />
          <meshBasicMaterial color={INK} toneMapped={false} transparent opacity={0.55} />
        </mesh>
      ))}
      <Line points={blockPoints(-2.4, -0.6, 2.2, 1.6, 0.01)} color={INK} lineWidth={1.5} />
      <Line points={blockPoints(0.2, -0.6, 2.2, 0.5, 0.01)} color={INK} lineWidth={1.5} />
      <Line points={blockPoints(0.2, 0.1, 1.1, 0.42, 0.01)} color={INK} lineWidth={2} />
      {[-1.7, -2.05, -2.4].map((y, i) => (
        <mesh key={`b-${i}`} position={[-0.2, y, 0.01]}>
          <planeGeometry args={[4.4 - i * 0.7, 0.11]} />
          <meshBasicMaterial color={INK} toneMapped={false} transparent opacity={0.4} />
        </mesh>
      ))}
      <Line
        points={[
          [-3.2, 4, 0.001],
          [3.2, 4, 0.001],
          [3.2, -4, 0.001],
          [-3.2, -4, 0.001],
          [-3.2, 4, 0.001],
        ]}
        color={FRAME}
        lineWidth={1}
        transparent
        opacity={0.9}
      />
      <ConceptNodes reducedMotion={reducedMotion} />
      <OrbitControls
        makeDefault
        enableDamping
        enablePan={false}
        minDistance={8}
        maxDistance={18}
        minPolarAngle={1.1}
        maxPolarAngle={1.65}
        minAzimuthAngle={-0.5}
        maxAzimuthAngle={0.5}
        target={[0, 0, 0]}
      />
    </>
  );
}

class ConceptBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/** Conceptual 3D webpage with accessibility nodes for the landing page. */
export function LandingConceptScene(): React.JSX.Element {
  return (
    <ConceptBoundary>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0.6, 12.5], fov: 38, near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 1);
        }}
      >
        <ConceptContents />
      </Canvas>
    </ConceptBoundary>
  );
}

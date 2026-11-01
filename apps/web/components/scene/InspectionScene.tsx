"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { usePrefersReducedMotion } from "./use-reduced-motion";

interface Props { imageUrl: string; rotation: number; onUnavailable: () => void }

/** The frame is presentation geometry; its only page content is a recorded capture. */
function CapturedWebsite({ imageUrl, rotation, onUnavailable }: Props): React.JSX.Element {
  const root = useRef<THREE.Group>(null);
  const { invalidate, gl } = useThree();
  const reduced = usePrefersReducedMotion();
  const [capture, setCapture] = useState<THREE.Texture | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    let active = true;
    let loaded: THREE.Texture | null = null;
    const timeout = window.setTimeout(() => { if (active) onUnavailable(); }, 8000);
    new THREE.TextureLoader().setCrossOrigin("anonymous").load(imageUrl, (texture) => {
      window.clearTimeout(timeout);
      if (!active) { texture.dispose(); return; }
      loaded = texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      const image = texture.image as { width: number; height: number };
      setAspect(image.width / Math.max(image.height, 1)); setCapture(texture); invalidate();
    }, undefined, () => { window.clearTimeout(timeout); if (active) onUnavailable(); });
    return () => { active = false; window.clearTimeout(timeout); loaded?.dispose(); };
  }, [imageUrl, invalidate, onUnavailable]);
  useEffect(() => {
    const lost = (event: Event): void => { event.preventDefault(); onUnavailable(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onUnavailable]);
  useEffect(() => { invalidate(); }, [rotation, reduced, invalidate]);
  useFrame((state, delta) => {
    if (root.current === null) return;
    const target = -0.12 + rotation;
    root.current.rotation.y = reduced ? target : THREE.MathUtils.damp(root.current.rotation.y, target, 7, Math.min(delta, 0.05));
    if (Math.abs(root.current.rotation.y - target) > 0.001) state.invalidate();
  });
  const width = 8.4, height = width / aspect;
  return <group ref={root} rotation={[0, -0.12, 0]}>
    <RoundedBox args={[width + 0.18, height + 0.18, 0.16]} radius={0.06} smoothness={3} position={[0, 0, -0.1]}>
      <meshStandardMaterial color="#323637" roughness={0.4} metalness={0.55} />
    </RoundedBox>
    {capture !== null && <mesh position={[0, 0, 0.01]}><planeGeometry args={[width, height]} /><meshBasicMaterial map={capture} toneMapped={false} /></mesh>}
  </group>;
}

export function InspectionScene(props: Props): React.JSX.Element {
  return <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 0, 12.8], fov: 43 }} gl={{ antialias: true, alpha: true }}>
    <ambientLight intensity={1.4} /><directionalLight position={[-4, 8, 6]} intensity={3} />
    <CapturedWebsite {...props} />
  </Canvas>;
}

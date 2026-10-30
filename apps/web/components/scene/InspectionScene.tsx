"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Line, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { InspectionPhase } from "../inspection-stage";
import { usePrefersReducedMotion } from "./use-reduced-motion";

interface Props {
  phase: InspectionPhase;
  imageUrl: string | null;
  rotation: number;
  expanded: boolean;
  sourceLabel: string | null;
  onUnavailable: () => void;
}

const ACCENT = "#ff603e";

/** A deliberately illustrative page texture, never a pretend scan result. */
function createPreview(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 1000;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Canvas unavailable");
  const rect = (x: number, y: number, w: number, h: number, color: string, radius = 0): void => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  };
  const text = (value: string, x: number, y: number, size: number, color: string, weight = 400): void => {
    ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillStyle = color; ctx.fillText(value, x, y);
  };
  rect(0, 0, 1600, 1000, "#f3eee5");
  rect(0, 0, 1600, 84, "#e8e3dc");
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(42 + i * 26, 42, 7, 0, Math.PI * 2); ctx.fillStyle = ["#ff603e", "#bab4ac", "#bab4ac"][i] ?? "#bab4ac"; ctx.fill(); }
  rect(520, 24, 560, 36, "#f3eee5", 8); text("your website", 700, 49, 19, "#807a72");
  text("FORM & FIELD", 80, 150, 23, "#1c2825", 700);
  text("Objects", 1020, 150, 20, "#59605b"); text("Our approach", 1150, 150, 20, "#59605b"); text("Bag (0)", 1390, 150, 20, "#59605b");
  rect(80, 186, 1440, 1, "#d3d0c8");
  text("CONSIDERED OBJECTS. EVERYDAY LIFE.", 80, 275, 17, "#817b70", 600);
  text("Made for", 75, 396, 112, "#26372e", 600); text("everyone.", 75, 510, 112, "#26372e", 600);
  text("Thoughtful forms. A little more human.", 82, 578, 24, "#777970");
  rect(80, 635, 245, 64, "#283b30", 32); text("Explore collection", 110, 675, 22, "#f3eee5", 600);
  rect(348, 635, 64, 64, "#e5dfd3", 32); text("+", 367, 678, 34, "#283b30");
  rect(835, 235, 680, 560, "#d9d6ca", 12);
  const gradient = ctx.createLinearGradient(900, 250, 1460, 760); gradient.addColorStop(0, "#e6e2d7"); gradient.addColorStop(1, "#b6baa6"); ctx.fillStyle = gradient; ctx.fillRect(850, 250, 650, 530);
  ctx.save(); ctx.translate(1165, 540); ctx.rotate(-0.16);
  ctx.shadowColor = "#394a3c66"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 28;
  rect(-142, -170, 260, 335, "#47614a", 58); ctx.shadowBlur = 0;
  rect(-118, -150, 215, 25, "#789273", 12);
  ctx.strokeStyle = "#283b30"; ctx.lineWidth = 28; ctx.beginPath(); ctx.ellipse(133, -24, 60, 85, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.restore(); text("01 / EVERYDAY ESSENTIALS", 870, 759, 16, "#5e685a");
  rect(80, 864, 1440, 1, "#d3d0c8");
  text("Designed with care.", 80, 921, 25, "#26372e"); text("Built to belong.", 680, 921, 25, "#26372e"); text("A better everyday.", 1190, 921, 25, "#26372e");
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function WebsiteObject({ phase, imageUrl, rotation, expanded, onUnavailable }: Props): React.JSX.Element {
  const root = useRef<THREE.Group>(null);
  const layer = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  const { invalidate, pointer } = useThree();
  const reduced = usePrefersReducedMotion();
  const preview = useMemo(() => createPreview(), []);
  const [capture, setCapture] = useState<THREE.Texture | null>(null);
  const [aspect, setAspect] = useState(1.6);
  const phaseColor = phase === "verified" ? "#c5f67a" : ACCENT;
  const separated = expanded || phase === "source" || phase === "repair";

  useEffect(() => () => preview.dispose(), [preview]);
  useEffect(() => {
    setCapture(null); setAspect(1.6);
    if (imageUrl === null) return;
    let active = true;
    let loadedTexture: THREE.Texture | null = null;
    new THREE.TextureLoader().setCrossOrigin("anonymous").load(imageUrl, (texture) => {
      loadedTexture = texture;
      if (!active) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      const img = texture.image as { width: number; height: number };
      setAspect(img.width / Math.max(img.height, 1)); setCapture(texture); invalidate();
    }, undefined, () => { if (active) onUnavailable(); });
    return () => { active = false; loadedTexture?.dispose(); };
  }, [imageUrl, invalidate, onUnavailable]);

  useEffect(() => { invalidate(); }, [phase, rotation, expanded, reduced, invalidate]);

  const width = 8.4;
  const height = width / aspect;
  useFrame((state, delta) => {
    const group = root.current;
    if (group === null) return;
    const dt = Math.min(delta, 0.05);
    const targetY = phase === "source" ? -0.66 : phase === "inspect" ? -0.17 : phase === "verified" ? -0.08 : -0.48;
    const targetX = phase === "source" ? 0.08 : phase === "inspect" ? 0.04 : -0.12;
    const targetZ = phase === "rejected" ? -0.11 : 0.035;
    const targetScale = phase === "inspect" ? 1.14 : phase === "source" ? 0.9 : 1;
    const damp = (current: number, target: number): number => reduced ? target : THREE.MathUtils.damp(current, target, 5, dt);
    group.rotation.x = damp(group.rotation.x, targetX + (reduced ? 0 : pointer.y * 0.035));
    group.rotation.y = damp(group.rotation.y, targetY + rotation + (reduced ? 0 : pointer.x * 0.065));
    group.rotation.z = damp(group.rotation.z, targetZ);
    group.scale.setScalar(damp(group.scale.x, targetScale));
    if (layer.current !== null) {
      layer.current.position.x = damp(layer.current.position.x, separated ? -0.65 : 0);
      layer.current.position.y = damp(layer.current.position.y, separated ? 0.35 : 0);
      layer.current.position.z = damp(layer.current.position.z, separated ? -1.35 : -0.16);
    }
    const moving = Math.abs(group.rotation.y - targetY - rotation - (reduced ? 0 : pointer.x * 0.065)) > 0.001
      || Math.abs(group.rotation.x - targetX - (reduced ? 0 : pointer.y * 0.035)) > 0.001
      || Math.abs(group.rotation.z - targetZ) > 0.001
      || Math.abs(group.scale.x - targetScale) > 0.001
      || (layer.current !== null && (
        Math.abs(layer.current.position.x - (separated ? -0.65 : 0)) > 0.001
        || Math.abs(layer.current.position.y - (separated ? 0.35 : 0)) > 0.001
        || Math.abs(layer.current.position.z - (separated ? -1.35 : -0.16)) > 0.001));
    if (scan.current !== null && phase === "scan" && !reduced) {
      scan.current.position.y = Math.sin(state.clock.elapsedTime * 1.15) * height * 0.43;
      state.invalidate();
    }
    if (moving) state.invalidate();
  });

  const texture = capture ?? (imageUrl === null ? preview : null);
  const outline: [number, number, number][] = [[-width / 2, height / 2, 0], [width / 2, height / 2, 0], [width / 2, -height / 2, 0], [-width / 2, -height / 2, 0], [-width / 2, height / 2, 0]];
  return (
    <group ref={root} position={[0, 0.1, 0]} rotation={[-0.12, -0.48, 0.035]}>
      <group ref={layer} position={[0, 0, -0.16]}>
        <RoundedBox args={[width + 0.14, height + 0.14, 0.07]} radius={0.08} smoothness={4}>
          <meshStandardMaterial color="#242a2b" roughness={0.38} metalness={0.75} transparent opacity={separated ? 0.65 : 1} />
        </RoundedBox>
        <Line points={outline} color={phaseColor} lineWidth={0.8} transparent opacity={0.65} />
        {separated && <group position={[-0.45, 0.2, -0.7]}>
          <mesh><planeGeometry args={[width, height, 6, 4]} /><meshBasicMaterial color="#93a694" wireframe transparent opacity={0.35} /></mesh>
          <Line points={outline} color="#b8ccb0" lineWidth={0.8} transparent opacity={0.55} />
        </group>}
      </group>
      <RoundedBox args={[width + 0.28, height + 0.28, 0.22]} radius={0.12} smoothness={4} position={[0, 0, -0.1]} castShadow>
        <meshStandardMaterial color="#323637" roughness={0.25} metalness={0.8} />
      </RoundedBox>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[width, height]} />
        {texture !== null ? <meshBasicMaterial key={texture.uuid} map={texture} toneMapped={false} /> : <meshBasicMaterial key="loading" color="#292e2b" />}
      </mesh>
      {phase === "scan" && <mesh ref={scan} position={[0, 0, 0.075]}>
        <planeGeometry args={[width, 0.035]} /><meshBasicMaterial color={ACCENT} transparent opacity={0.85} toneMapped={false} />
      </mesh>}
      {imageUrl === null && phase !== "standby" && <group position={[-2.15, -0.86, 0.1]}>
        <Line points={[[-0.25, -0.25, 0], [0.25, -0.25, 0], [0.25, 0.25, 0], [-0.25, 0.25, 0], [-0.25, -0.25, 0]]} color={phaseColor} lineWidth={2} />
        <Line points={[[0.25, 0, 0], [1, 0, 0.6], [1.65, 0, 0.6]]} color={phaseColor} lineWidth={1} />
      </group>}
      <Line points={[[-width / 2 - 0.35, -height / 2 - 0.3, 0], [width / 2 + 0.35, -height / 2 - 0.3, 0]]} color="#5c6260" lineWidth={0.6} />
      <mesh position={[-width / 2 - 0.35, -height / 2 - 0.3, 0]}><sphereGeometry args={[0.035, 12, 12]} /><meshBasicMaterial color={phaseColor} toneMapped={false} /></mesh>
    </group>
  );
}

export function InspectionScene(props: Props): React.JSX.Element {
  return (
    <Canvas frameloop="demand" dpr={[1, 1.75]} shadows camera={{ position: [0, 0.8, 11.8], fov: 43 }} gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", props.onUnavailable, { once: true });
      }} fallback={<div>3D is unavailable. Use the page controls to continue.</div>}>
      <ambientLight intensity={1.1} />
      <directionalLight position={[-4, 8, 6]} intensity={4} color="#f3ece2" />
      <pointLight position={[5, 2, 3]} intensity={18} color="#ff805d" />
      <pointLight position={[-5, -1, -2]} intensity={12} color="#b1d2d5" />
      <WebsiteObject {...props} />
      <ContactShadows position={[0, -3.6, 0]} opacity={0.65} scale={18} blur={2.8} far={8} resolution={256} color="#000000" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.65, 0]}>
        <circleGeometry args={[6.7, 96]} /><meshStandardMaterial color="#15191a" roughness={0.6} metalness={0.35} transparent opacity={0.75} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.63, 0]}>
        <ringGeometry args={[5.2, 5.21, 96]} /><meshBasicMaterial color="#505856" transparent opacity={0.6} />
      </mesh>
    </Canvas>
  );
}

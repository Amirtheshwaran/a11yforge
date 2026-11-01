"use client";

import { Component, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { TourChapter, TourModel } from "../../lib/tour-model";
import { tourSegment } from "../../lib/tour-model";
import { highlightToPlane } from "../../lib/scene-model";
import { fitCaptureDistance, followProgress } from "../../lib/tour-motion";

export interface TourMotion {
  target: number;
  current: number;
  reduced: boolean;
  wake: (() => void) | null;
  present: ((progress: number) => void) | null;
}
interface Props { model: TourModel; motion: RefObject<TourMotion>; onFail: () => void; onReady: () => void; onSelect: (findingId: string) => void }

class SceneBoundary extends Component<{ children: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void { this.props.onFail(); }
  render(): ReactNode { return this.state.failed ? null : this.props.children; }
}

function codeTexture(path: string, text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 1200;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Code canvas unavailable");
  ctx.fillStyle = "#18181b"; ctx.fillRect(0, 0, 1400, 1200);
  ctx.fillStyle = "#b7b3a8"; ctx.font = "24px monospace"; ctx.fillText(path, 52, 62);
  ctx.fillStyle = "#333337"; ctx.fillRect(0, 96, 1400, 2);
  ctx.font = "21px monospace";
  text.split("\n").slice(0, 38).forEach((line, index) => {
    ctx.fillStyle = line.startsWith("+") ? "#a6cf9c" : line.startsWith("-") ? "#f0a29b" : "#c7c7c3";
    ctx.fillText(line.slice(0, 100), 44, 143 + index * 26);
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

interface Frame { x: number; y: number; distance: number; rotationX: number; rotationY: number; source: number; height: number }
function frameFor(chapter: TourChapter, texture: THREE.Texture | undefined, aspect: number, mobile: boolean): Frame {
  const img = texture?.image as { width: number; height: number } | undefined;
  const height = img === undefined ? 5.625 : 10 * img.height / img.width;
  const home = fitCaptureDistance(10, height, aspect, mobile ? 43 : 40, mobile ? 0.88 : 0.52, mobile ? 0.82 : 0.68);
  const hasSource = chapter.source !== null ? 1 : 0;
  let x = 0, y = 0, distance = home;
  if (chapter.highlight !== null) {
    const measured = highlightToPlane(chapter.highlight, { width: 10, height });
    x = measured.center.x; y = measured.center.y;
    distance = Math.min(home, Math.max(6.5, measured.rect.height * 2.5, measured.rect.width / Math.max(0.5, aspect * (mobile ? 0.5 : 0.37))));
  }
  if (chapter.kind === "interaction" && chapter.focusSteps.length > 1) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const step of chapter.focusSteps) if (step.box !== null) {
      const { rect } = highlightToPlane(step.box, { width: 10, height });
      minX = Math.min(minX, rect.x); maxX = Math.max(maxX, rect.x + rect.width);
      minY = Math.min(minY, rect.y); maxY = Math.max(maxY, rect.y + rect.height);
    }
    if (Number.isFinite(minX)) {
      x = (minX + maxX) / 2; y = (minY + maxY) / 2;
      distance = Math.min(home, Math.max(7, (maxY - minY) * 2.3, (maxX - minX) / Math.max(0.5, aspect * 0.37)));
    }
  }
  if (hasSource > 0) distance = fitCaptureDistance(15.8, Math.max(height, 5), aspect, mobile ? 43 : 40, mobile ? 0.9 : 0.67, mobile ? 0.82 : 0.68);
  return {
    x, y, distance, height, source: hasSource,
    rotationX: mobile ? 0 : chapter.kind === "overview" ? -0.035 : 0.018,
    rotationY: mobile ? 0.015 : hasSource > 0 ? -0.22 : chapter.kind === "overview" ? -0.12 : -0.045,
  };
}

function Marker({ chapterIndex, box, number, findingId, height, motion, onSelect, focused }: {
  chapterIndex: number; box: TourChapter["markers"][number]["box"]; number: number; findingId: string;
  height: number; motion: RefObject<TourMotion>; onSelect: Props["onSelect"]; focused: boolean;
}): React.JSX.Element {
  const mesh = useRef<THREE.Mesh>(null);
  const outline = useRef<THREE.Line>(null);
  const geometry = useMemo(() => {
    const { rect } = highlightToPlane(box, { width: 10, height });
    const corners = [rect.x, rect.y, 0.055, rect.x + rect.width, rect.y, 0.055,
      rect.x + rect.width, rect.y + rect.height, 0.055, rect.x, rect.y + rect.height, 0.055, rect.x, rect.y, 0.055];
    const line = new THREE.BufferGeometry(); line.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3)); return line;
  }, [box, height]);
  const line = useMemo(() => new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#e5a93c", transparent: true, depthTest: false })), [geometry]);
  useEffect(() => () => { geometry.dispose(); line.material.dispose(); }, [geometry, line]);
  const { center } = highlightToPlane(box, { width: 10, height });
  useFrame(() => {
    const proximity = focused ? Math.max(0, 1 - Math.abs(motion.current.current - chapterIndex)) : 0;
    const material = mesh.current?.material as THREE.MeshBasicMaterial | undefined;
    if (material !== undefined) material.opacity = 0.2 + 0.8 * proximity;
    if (outline.current !== null) {
      const mat = outline.current.material as THREE.LineBasicMaterial;
      mat.opacity = proximity * 0.95;
      outline.current.geometry.setDrawRange(0, Math.max(0, Math.ceil(proximity * 5)));
    }
  });
  return <group>
    <primitive ref={outline} object={line} renderOrder={10} />
    <mesh ref={mesh} renderOrder={11} position={[center.x, center.y, 0.085]} onClick={(event) => { event.stopPropagation(); onSelect(findingId); }} userData={{ findingId, number }}>
      <circleGeometry args={[0.055, 20]} /><meshBasicMaterial color="#e5a93c" transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

function MeasuredFocusPath({ chapter, progress, height, motion }: { chapter: TourChapter; progress: number; height: number; motion: RefObject<TourMotion> }): React.JSX.Element | null {
  const path = useMemo(() => chapter.focusSteps.flatMap((step) => step.box === null ? [] : [highlightToPlane(step.box, { width: 10, height }).center]), [chapter, height]);
  const geometry = useMemo(() => {
    const value = new THREE.BufferGeometry();
    value.setAttribute("position", new THREE.Float32BufferAttribute(path.flatMap((point) => [point.x, point.y, 0.1]), 3)); return value;
  }, [path]);
  const line = useMemo(() => new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: chapter.outcome === "verified" ? "#8bc89c" : "#e5a93c", transparent: true, depthTest: false, depthWrite: false })), [geometry, chapter.outcome]);
  const head = useRef<THREE.Mesh>(null);
  const traveled = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => { traveled.current = 0; }, [chapter.id]);
  useEffect(() => () => { geometry.dispose(); line.material.dispose(); }, [geometry, line]);
  useFrame((state, delta) => {
    if (path.length < 2 || head.current === null) return;
    traveled.current = motion.current.reduced ? path.length - 1 : progress < 0.1 ? 0 : Math.min(path.length - 1, traveled.current + Math.min(delta, 0.05) * 1.3);
    const from = Math.floor(traveled.current), to = Math.min(path.length - 1, from + 1);
    const a = path[from], b = path[to];
    if (a === undefined || b === undefined) return;
    const t = traveled.current - from;
    tmp.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.12); head.current.position.copy(tmp);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i <= from; i++) { const point = path[i]; if (point !== undefined) positions.setXYZ(i, point.x, point.y, 0.1); }
    if (to > from) positions.setXYZ(to, tmp.x, tmp.y, 0.1);
    positions.needsUpdate = true;
    geometry.setDrawRange(0, Math.min(path.length, from + 2));
    (head.current.material as THREE.MeshBasicMaterial).color.set(chapter.outcome === "verified" ? "#8bc89c" : traveled.current >= path.length - 1 && chapter.focusSteps.at(-1)?.failed ? "#f26a5b" : "#e5a93c");
    if (traveled.current < path.length - 1 && progress >= 0.1) state.invalidate();
  });
  if (path.length < 2) return null;
  return <group><primitive object={line} renderOrder={12} /><mesh ref={head} renderOrder={13}><sphereGeometry args={[0.07, 16, 16]} /><meshBasicMaterial color={chapter.outcome === "verified" ? "#8bc89c" : "#e5a93c"} transparent depthTest={false} depthWrite={false} /></mesh></group>;
}

/** The only writer of camera and object transforms in the tour. No orbit controls or camera tweens. */
function CameraRig({ model, motion, textures, root, source, frontA, frontB, frame, onFrame }: {
  model: TourModel; motion: RefObject<TourMotion>; textures: ReadonlyMap<string, THREE.Texture>;
  root: RefObject<THREE.Group | null>; source: RefObject<THREE.Group | null>;
  frontA: RefObject<THREE.Mesh | null>; frontB: RefObject<THREE.Mesh | null>; frame: RefObject<THREE.Mesh | null>;
  onFrame: (from: number, to: number, mix: number) => void;
}): null {
  const { camera, size, invalidate } = useThree();
  const mobile = size.width < 1000;
  const aspect = size.width / Math.max(size.height, 1);
  const poses = useMemo(() => model.chapters.map((chapter) => frameFor(chapter, chapter.imageUrl === null ? undefined : textures.get(chapter.imageUrl), aspect, mobile)), [model, textures, aspect, mobile]);
  const destination = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(), []);
  const initialized = useRef(false);
  const segment = useRef({ from: 0, to: 0, mix: 0 });
  useEffect(() => {
    motion.current.wake = invalidate; invalidate();
    return () => { if (motion.current.wake === invalidate) motion.current.wake = null; };
  }, [motion, invalidate]);
  useFrame((state, delta) => {
    const rig = root.current;
    if (rig === null) return;
    const snap = motion.current.reduced || !initialized.current;
    motion.current.current = followProgress(motion.current.current, motion.current.target, delta, snap);
    const { from, to, mix } = tourSegment(motion.current.current, poses.length, segment.current);
    const a = poses[from], b = poses[to];
    if (a === undefined || b === undefined) return;
    const lerp = THREE.MathUtils.lerp;
    const distance = lerp(a.distance, b.distance, mix);
    const sourceAmount = lerp(a.source, b.source, mix);
    const height = lerp(a.height, b.height, mix);
    rig.rotation.x = lerp(a.rotationX, b.rotationX, mix);
    rig.rotation.y = lerp(a.rotationY, b.rotationY, mix);
    rig.position.x = -sourceAmount * 1.8;
    rig.updateMatrixWorld();
    center.set(lerp(a.x, b.x, mix), lerp(a.y, b.y, mix), 0).applyMatrix4(rig.matrixWorld);
    // Reserve a stable editorial lane. The website stays recognizable beside its explanation.
    const overviewAmount = Math.max(0, 1 - motion.current.current);
    const offset = mobile ? 0 : lerp(0.21, -0.21, overviewAmount) * distance * aspect * 0.65;
    target.copy(center); target.x += offset + sourceAmount * (mobile ? 1.9 : 1.1); target.y += mobile ? 0 : overviewAmount * 0.25;
    destination.copy(target); destination.z += distance;
    destination.y += Math.sin(mix * Math.PI) * (mobile ? 0 : 0.18);
    camera.position.copy(destination); camera.lookAt(target);
    const perspective = camera as THREE.PerspectiveCamera;
    const desiredFov = mobile ? 43 : 40;
    if (perspective.fov !== desiredFov) { perspective.fov = desiredFov; perspective.updateProjectionMatrix(); }
    if (frontA.current !== null) frontA.current.scale.y = height;
    if (frontB.current !== null) frontB.current.scale.y = height;
    if (frame.current !== null) frame.current.scale.y = height / 5.625;
    if (source.current !== null) {
      source.current.position.set(lerp(0, 5.5, sourceAmount), 0.2, lerp(-0.55, 1, sourceAmount));
      source.current.rotation.y = -0.09 * sourceAmount;
      source.current.scale.setScalar(0.8 + 0.2 * sourceAmount);
      source.current.visible = sourceAmount > 0.005;
    }
    onFrame(from, to, mix);
    motion.current.present?.(motion.current.current);
    const moving = Math.abs(motion.current.target - motion.current.current) > 0.00001;
    initialized.current = true;
    if (moving) state.invalidate();
  });
  return null;
}

function Contents({ model, motion, textures, codes, onSelect }: Omit<Props, "onFail" | "onReady"> & {
  textures: ReadonlyMap<string, THREE.Texture>; codes: ReadonlyMap<string, THREE.Texture>;
}): React.JSX.Element {
  const root = useRef<THREE.Group>(null), source = useRef<THREE.Group>(null);
  const frontA = useRef<THREE.Mesh>(null), frontB = useRef<THREE.Mesh>(null), frame = useRef<THREE.Mesh>(null);
  const code = useRef<THREE.Mesh>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const first = model.chapters[0];
  const initial = first?.imageUrl == null ? undefined : textures.get(first.imageUrl);
  const activeChapter = model.chapters[active] ?? first;
  const img = (activeChapter?.imageUrl == null ? initial : textures.get(activeChapter.imageUrl))?.image as { width: number; height: number } | undefined;
  const height = img === undefined ? 5.625 : 10 * img.height / img.width;
  const markerList = useMemo(() => activeChapter?.markers.map((marker) => ({ ...marker,
    chapterIndex: model.chapters.findIndex((chapter) => chapter.finding?.findingId === marker.finding.findingId),
    focused: model.chapters.find((chapter) => chapter.finding?.findingId === marker.finding.findingId)?.highlight === marker.box,
  })) ?? [], [model, activeChapter]);
  const onFrame = (from: number, to: number, mix: number): void => {
    const a = model.chapters[from], b = model.chapters[to];
    if (a === undefined || b === undefined) return;
    if (frontA.current !== null && frontB.current !== null) {
      const ma = frontA.current.material as THREE.MeshBasicMaterial, mb = frontB.current.material as THREE.MeshBasicMaterial;
      ma.map = a.imageUrl === null ? initial ?? null : textures.get(a.imageUrl) ?? null;
      mb.map = b.imageUrl === null ? initial ?? null : textures.get(b.imageUrl) ?? null;
      ma.opacity = 1; mb.opacity = a.imageUrl === b.imageUrl ? 0 : mix;
    }
    const chosen = mix < 0.5 ? from : to;
    if (chosen !== activeRef.current) { activeRef.current = chosen; setActive(chosen); }
    const sourceChapter = a.source !== null ? a : b;
    if (code.current !== null && sourceChapter.source !== null) {
      (code.current.material as THREE.MeshBasicMaterial).map = codes.get(sourceChapter.source.text) ?? null;
    }
  };
  return <>
    <color attach="background" args={["#0b0b0d"]} />
    <ambientLight intensity={1.4} /><directionalLight position={[-5, 7, 8]} intensity={3} color="#f5f2ea" />
    <pointLight position={[7, 2, 5]} intensity={14} color="#c8c6c3" />
    <group ref={root}>
      <RoundedBox ref={frame} args={[10.18, 5.805, 0.18]} position={[0, 0, -0.1]} radius={0.06} smoothness={3}>
        <meshStandardMaterial color="#3a393a" metalness={0.65} roughness={0.3} />
      </RoundedBox>
      <mesh ref={frontA} position={[0, 0, 0.005]} scale={[1, 5.625, 1]}><planeGeometry args={[10, 1]} /><meshBasicMaterial map={initial ?? null} toneMapped={false} transparent /></mesh>
      <mesh ref={frontB} position={[0, 0, 0.008]} scale={[1, 5.625, 1]}><planeGeometry args={[10, 1]} /><meshBasicMaterial map={initial ?? null} toneMapped={false} transparent opacity={0} depthWrite={false} /></mesh>
      {markerList.map((marker) => <Marker key={`${marker.finding.findingId}:${marker.box.selector}:${marker.box.x}:${marker.box.y}`} {...marker} findingId={marker.finding.findingId} number={marker.number} height={height} motion={motion} onSelect={onSelect} />)}
      {activeChapter?.highlight !== null && activeChapter?.highlight !== undefined && activeChapter.finding === null && <Marker chapterIndex={active} box={activeChapter.highlight} number={0} findingId="" height={height} motion={motion} onSelect={onSelect} focused />}
      {activeChapter !== undefined && <MeasuredFocusPath chapter={activeChapter} height={height} progress={Math.max(0, 1 - Math.abs(motion.current.current - active))} motion={motion} />}
      <group ref={source} visible={false}>
        <Line points={[[-3.6, -0.65, -0.8], [-3.05, -0.65, -0.4], [-2.78, -0.65, 0.01]]} color="#e5a93c" lineWidth={1} transparent opacity={0.6} />
        <RoundedBox args={[5.7, 4.95, 0.12]} radius={0.06} smoothness={3} position={[0, 0, -0.09]}><meshStandardMaterial color="#454843" metalness={0.5} roughness={0.4} /></RoundedBox>
        <mesh ref={code}><planeGeometry args={[5.55, 4.76]} /><meshBasicMaterial map={codes.values().next().value ?? null} toneMapped={false} /></mesh>
      </group>
    </group>
    <CameraRig model={model} motion={motion} textures={textures} root={root} source={source} frontA={frontA} frontB={frontB} frame={frame} onFrame={onFrame} />
  </>;
}

function RendererHealth({ textures, codes, onReady, onFail }: { textures: ReadonlyMap<string, THREE.Texture>; codes: ReadonlyMap<string, THREE.Texture>; onReady: () => void; onFail: () => void }): null {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const lost = (event: Event): void => { event.preventDefault(); onFail(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    for (const texture of [...textures.values(), ...codes.values()]) gl.initTexture(texture);
    invalidate();
    const frame = requestAnimationFrame(onReady);
    return () => { cancelAnimationFrame(frame); gl.domElement.removeEventListener("webglcontextlost", lost); };
  }, [gl, textures, codes, onReady, onFail, invalidate]);
  return null;
}

function SceneContent(props: Props): React.JSX.Element {
  const [textures, setTextures] = useState<ReadonlyMap<string, THREE.Texture> | null>(null);
  const codes = useMemo(() => {
    const map = new Map<string, THREE.Texture>();
    for (const chapter of props.model.chapters) if (chapter.source !== null && !map.has(chapter.source.text)) map.set(chapter.source.text, codeTexture(chapter.source.path, chapter.source.text));
    return map;
  }, [props.model]);
  useEffect(() => () => { for (const texture of codes.values()) texture.dispose(); }, [codes]);
  useEffect(() => {
    let live = true;
    const loaded: THREE.Texture[] = [];
    const urls = [...new Set(props.model.chapters.flatMap((chapter) => chapter.imageUrl === null ? [] : [chapter.imageUrl]))];
    if (urls.length === 0) { props.onFail(); return; }
    // A stalled image must not hold the entire tour in its loading state forever.
    const timeout = window.setTimeout(() => { if (live) props.onFail(); }, 8000);
    const loader = new THREE.TextureLoader(); loader.setCrossOrigin("anonymous");
    void Promise.all(urls.map(async (url) => {
      const texture = await loader.loadAsync(url);
      if (!live) { texture.dispose(); throw new Error("Tour texture load cancelled"); }
      loaded.push(texture);
      const img = texture.image as HTMLImageElement;
      if (typeof img.decode === "function") await img.decode();
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
      return [url, texture] as const;
    })).then((entries) => {
      window.clearTimeout(timeout);
      if (!live) { for (const texture of loaded) texture.dispose(); return; }
      setTextures(new Map(entries));
    }).catch(() => { window.clearTimeout(timeout); if (live) props.onFail(); });
    return () => { live = false; window.clearTimeout(timeout); for (const texture of loaded) texture.dispose(); };
  }, [props.model, props.onReady, props.onFail]);
  if (textures === null) return <div className="tour-loading" role="status">Preparing the recorded website…</div>;
  return <Canvas frameloop="demand" dpr={[1, window.matchMedia("(max-width: 999px)").matches ? 1.25 : 1.5]} camera={{ position: [0, 0, 16], fov: 40, near: 0.1, far: 150 }}
      gl={{ antialias: true, alpha: false, powerPreference: "default" }}>
      <RendererHealth textures={textures} codes={codes} onReady={props.onReady} onFail={props.onFail} />
      <Contents model={props.model} motion={props.motion} textures={textures} codes={codes} onSelect={props.onSelect} />
    </Canvas>;
}

export function SpatialScene(props: Props): React.JSX.Element {
  return <SceneBoundary onFail={props.onFail}><SceneContent {...props} /></SceneBoundary>;
}

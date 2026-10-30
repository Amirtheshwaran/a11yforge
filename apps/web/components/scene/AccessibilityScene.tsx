"use client";

import { Component, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  cameraHomeFor,
  type CameraRequest,
  type FindingSceneNode,
  type FocusPathModel,
  type PlaneSize,
} from "../../lib/scene-model";
import { WebsitePlane } from "./WebsitePlane";
import { FindingMarker } from "./FindingMarker";
import { ElementOutline } from "./ElementOutline";
import { FocusPath } from "./FocusPath";
import { ScanIndicator } from "./ScanIndicator";
import { SceneCameraController } from "./SceneCameraController";
import { usePrefersReducedMotion } from "./use-reduced-motion";

/**
 * The 3D accessibility map: the tested page as a plane, real findings as
 * spatial markers, keyboard failures as focus paths. Rendered on demand —
 * frames are produced only for interaction and animation, never idly.
 *
 * WebGL failure (or a texture outage) never blanks the product: the error
 * boundary reports up and the parent swaps in the 2D evidence fallback.
 */

export interface AccessibilitySceneProps {
  textureUrl: string | null;
  plane: PlaneSize;
  nodes: FindingSceneNode[];
  selectedNode: FindingSceneNode | null;
  selectedIssueLabel: string | null;
  focusPath: FocusPathModel | null;
  showFocusPath: boolean;
  focusActiveSeq: number;
  focusPlaying: boolean;
  scanning: boolean;
  cameraRequest: CameraRequest | null;
  resetNonce: number;
  onSelectNode: (findingId: string, highlightIndex: number) => void;
  onWebGLFail: () => void;
}

class SceneErrorBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  constructor(props: { onFail: () => void; children: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.props.onFail();
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function SceneContents(props: Omit<AccessibilitySceneProps, "onWebGLFail">): React.JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const anySelected = props.nodes.some((node) => node.selected);

  return (
    <>
      <color attach="background" args={["#101611"]} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[-4, 7, 5]} intensity={3} color="#fff0df" />
      <pointLight position={[5, 1, 2]} intensity={12} color="#f1916e" />
      <WebsitePlane textureUrl={props.textureUrl} plane={props.plane} />
      {props.nodes.map((node) => (
        <FindingMarker
          key={node.key}
          node={node}
          issueLabel={node.selected ? props.selectedIssueLabel : null}
          dimmed={anySelected}
          reducedMotion={reducedMotion}
          onSelect={props.onSelectNode}
        />
      ))}
      {props.selectedNode !== null && <ElementOutline rect={props.selectedNode.rect} />}
      {props.showFocusPath && props.focusPath !== null && props.focusPath.nodes.length > 0 && (
        <FocusPath
          path={props.focusPath}
          activeSeq={props.focusActiveSeq}
          playing={props.focusPlaying && !reducedMotion}
          reducedMotion={reducedMotion}
        />
      )}
      {props.scanning && <ScanIndicator plane={props.plane} reducedMotion={reducedMotion} />}
      <SceneCameraController
        request={props.cameraRequest}
        resetNonce={props.resetNonce}
        plane={props.plane}
        reducedMotion={reducedMotion}
      />
      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        minDistance={2}
        maxDistance={32}
        minPolarAngle={0.9}
        maxPolarAngle={1.75}
        minAzimuthAngle={-0.75}
        maxAzimuthAngle={0.75}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function AccessibilityScene(props: AccessibilitySceneProps): React.JSX.Element {
  const home = cameraHomeFor(props.plane);
  return (
    <SceneErrorBoundary onFail={props.onWebGLFail}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: home.position, fov: 40, near: 0.1, far: 120 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 1);
        }}
      >
        <SceneContents {...props} />
      </Canvas>
    </SceneErrorBoundary>
  );
}

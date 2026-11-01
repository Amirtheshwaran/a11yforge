"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, type ReactNode, useCallback, useRef, useState } from "react";

export type InspectionPhase = "inspect" | "source";
export interface InspectionStageProps {
  phase?: InspectionPhase;
  imageUrl?: string | null;
  label?: string;
  sourceLabel?: string | null;
  className?: string;
}

const Scene = dynamic(() => import("./scene/InspectionScene").then((module) => module.InspectionScene), {
  ssr: false,
  loading: () => <div className="inspection-loading" role="status">Loading the page capture…</div>,
});

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void { this.props.onFail(); }
  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function InspectionStage(props: InspectionStageProps): React.JSX.Element {
  if (props.imageUrl == null) return <section className={`inspection-stage inspection-empty ${props.className ?? ""}`} aria-label="Website capture unavailable">
    <h2>No page capture available.</h2>
    <p>Open a finding from a website check to inspect its recorded page.</p>
    <Link href="/#check-site">Check a website</Link>
  </section>;
  return <CapturedInspection key={props.imageUrl} {...props} imageUrl={props.imageUrl} />;
}

function CapturedInspection({ phase = "inspect", imageUrl, label = "Captured website", sourceLabel = null, className = "" }: InspectionStageProps & { imageUrl: string }): React.JSX.Element {
  const [rotation, setRotation] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const drag = useRef<{ x: number; rotation: number } | null>(null);
  const fallback = <div className="inspection-fallback">
    {imageFailed ? <p>The recorded page image could not load.</p> : <img src={imageUrl} alt="Captured website evidence" onError={() => setImageFailed(true)} />}
    <p>Use the measured evidence and source details below.</p>
  </div>;
  return <section className={`inspection-stage ${className}`} aria-label={label} data-phase={phase}>
    <div className="inspection-stage-top">{label}</div>
    <div className="inspection-canvas" aria-hidden="true"
      onPointerDown={(event) => { drag.current = { x: event.clientX, rotation }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => { if (drag.current !== null) setRotation(drag.current.rotation + (event.clientX - drag.current.x) * 0.004); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      {unavailable ? fallback : <SceneBoundary fallback={fallback} onFail={onUnavailable}>
        <Scene imageUrl={imageUrl} rotation={rotation} onUnavailable={onUnavailable} />
      </SceneBoundary>}
    </div>
    <div className="inspection-stage-bottom">
      <div><span className="inspection-caption-label">{sourceLabel === null ? "Browser capture" : "Source candidate"}</span>{sourceLabel !== null && <p>{sourceLabel}</p>}</div>
      {!unavailable && <div className="inspection-tools" role="group" aria-label="3D view controls">
        <button type="button" onClick={() => setRotation((value) => value - 0.3)} aria-label="Rotate website left">↶</button>
        <button type="button" onClick={() => setRotation((value) => value + 0.3)} aria-label="Rotate website right">↷</button>
        <button type="button" onClick={() => setRotation(0)} aria-label="Reset 3D view">⌖</button>
      </div>}
    </div>
  </section>;
}

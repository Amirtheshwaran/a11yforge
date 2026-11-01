"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useCallback, useRef, useState } from "react";

export type InspectionPhase = "standby" | "scan" | "inspect" | "source" | "repair" | "rejected" | "verified";

export interface InspectionStageProps {
  phase?: InspectionPhase;
  imageUrl?: string | null;
  label?: string;
  sourceLabel?: string | null;
  className?: string;
}

const Scene = dynamic(() => import("./scene/InspectionScene").then((module) => module.InspectionScene), {
  ssr: false,
  loading: () => <div className="inspection-loading"><span />Preparing the inspection space</div>,
});

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(): void { this.props.onFail(); }
  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}

const PHASE_LABELS: Record<InspectionPhase, string> = {
  standby: "Your website, in a new dimension",
  scan: "Look beneath the surface",
  inspect: "Bring the problem into focus",
  source: "Find the code behind the surface",
  repair: "A small change. A real difference.",
  rejected: "A failed check stops the repair",
  verified: "The evidence decides",
};

/** Presentation geometry never supplies findings or verification results. */
export function InspectionStage({ phase = "standby", imageUrl = null, label, sourceLabel = null, className = "" }: InspectionStageProps): React.JSX.Element {
  const [rotation, setRotation] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const onUnavailable = useCallback(() => setUnavailable(true), []);
  const drag = useRef<{ x: number; rotation: number } | null>(null);
  const fallback = (
    <div className="inspection-fallback">
      {imageUrl !== null ? <img src={imageUrl} alt="Captured website evidence" /> : (
        <div className="inspection-flat-page"><span>YOUR WEBSITE</span><strong>A better experience<br />starts here.</strong><div /><div /><div /></div>
      )}
      <p>Review the same information using the page controls.</p>
    </div>
  );
  return (
    <section className={`inspection-stage ${className}`} aria-label={label ?? "Interactive 3D website inspection"} data-phase={phase}>
      <div className="inspection-stage-top"><span className="inspection-status-dot" />{label ?? "Interactive preview · illustrative website"}<span className="inspection-axis">X / Y / Z</span></div>
      <div className="inspection-canvas" aria-hidden="true"
        onPointerDown={(event) => { drag.current = { x: event.clientX, rotation }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (drag.current !== null) setRotation(drag.current.rotation + (event.clientX - drag.current.x) * 0.004); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {unavailable ? fallback : (
          <SceneBoundary fallback={fallback} onFail={onUnavailable}>
            <Scene phase={phase} imageUrl={imageUrl} rotation={rotation} expanded={expanded} sourceLabel={sourceLabel} onUnavailable={onUnavailable} />
          </SceneBoundary>
        )}
      </div>
      <div className="inspection-stage-bottom">
        <div><span className="inspection-caption-label">{phase === "source" || phase === "repair" ? sourceLabel ?? "PAGE STRUCTURE / SOURCE LAYER" : "INSPECTION SPACE"}</span><p>{PHASE_LABELS[phase]}</p></div>
        {!unavailable && <div className="inspection-tools" role="group" aria-label="3D view controls">
          <button type="button" onClick={() => setRotation((value) => value - 0.3)} aria-label="Rotate website left">↶</button>
          <button type="button" onClick={() => setRotation((value) => value + 0.3)} aria-label="Rotate website right">↷</button>
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-pressed={expanded} aria-label="Separate website layers">{expanded ? "−" : "+"}</button>
          <button type="button" onClick={() => { setRotation(0); setExpanded(false); }} aria-label="Reset 3D view">⌖</button>
        </div>}
      </div>
    </section>
  );
}

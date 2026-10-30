"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion, pulse } from "../lib/motion";

export interface ReplayBeat {
  label: string;
  headline: string;
  detail: string;
  targetId: string;
  targetLabel: string;
}

/**
 * Recorded-demo replay: play/pause + scrubber move the theatre through the
 * real repair arc (failure → trace → repair → rejection → revision →
 * verified). Each beat jumps to the recorded artifact section below, so the
 * replay never invents content — it navigates real evidence.
 */
export function DemoReplay({ beats, onBeatChange }: { beats: ReplayBeat[]; onBeatChange?: (index: number) => void }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const beat = beats[Math.min(index, beats.length - 1)];

  useEffect(() => {
    onBeatChange?.(index);
  }, [index, onBeatChange]);

  useEffect(() => {
    if (!playing || beats.length < 2) return;
    if (prefersReducedMotion()) {
      setPlaying(false);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % beats.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [playing, beats.length]);

  if (beat === undefined) return <></>;

  function goToBeat(next: number): void {
    setIndex(next);
    setPlaying(false);
    const target = document.getElementById(beats[next]?.targetId ?? "");
    target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }

  return (
    <div className="demo-theatre" aria-label="Recorded repair replay">
      <div className="demo-stage" aria-live="polite">
        <span className="mono-label">
          <span className="dot-live" aria-hidden="true">● </span>
          Recorded real repair — {beat.label}
        </span>
        <p className="display-3" style={{ maxWidth: "22ch" }} key={index}>
          {beat.headline}
        </p>
        <p className="lede-xl" style={{ textAlign: "center" }}>
          {beat.detail}
        </p>
        <button
          type="button"
          className="forge-scan-btn"
          onClick={(event) => {
            const target = document.getElementById(beat.targetId);
            target?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
            void pulse(event.currentTarget);
          }}
        >
          {beat.targetLabel}
          <span className="arrow" aria-hidden="true">↓</span>
        </button>
      </div>
      <div className="demo-scrub">
        <button
          type="button"
          className="issue-nav-btn"
          onClick={() => setPlaying((value) => !value)}
          aria-pressed={playing}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <input
          type="range"
          min={0}
          max={beats.length - 1}
          step={1}
          value={index}
          onChange={(event) => goToBeat(Number(event.target.value))}
          aria-label="Replay position"
          aria-valuetext={beat.label}
        />
        <span className="t">
          {String(index + 1).padStart(2, "0")} / {String(beats.length).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

export interface AfterShot {
  src: string;
  alt: string;
  caption: string;
}

/**
 * Before/after: one fluid plane toggled between states — never two static
 * cards. Renders only real recorded screenshots with their verdicts.
 */
export function BeforeAfter({
  before,
  after,
  beforeNote,
  afterNote,
}: {
  before: AfterShot | null;
  after: AfterShot | null;
  beforeNote: string;
  afterNote: string;
}): React.JSX.Element {
  const [side, setSide] = useState<"before" | "after">("before");
  const shot = side === "before" ? before : after;
  return (
    <div className="before-after">
      <div className="before-after-bar" role="group" aria-label="Before or after repair">
        <button type="button" aria-pressed={side === "before"} onClick={() => setSide("before")}>
          Before
        </button>
        <button
          type="button"
          aria-pressed={side === "after"}
          onClick={() => setSide("after")}
          disabled={after === null}
        >
          After
        </button>
      </div>
      <div className="before-after-body" aria-live="polite" key={side}>
        {shot !== null ? (
          <>
            <img src={shot.src} alt={shot.alt} style={{ maxWidth: "100%", height: "auto" }} />
            <p className="mono-label">{shot.caption}</p>
          </>
        ) : (
          <p className="help">Screenshot unavailable for this state.</p>
        )}
        <p style={{ margin: 0, maxWidth: "52ch" }}>{side === "before" ? beforeNote : afterNote}</p>
      </div>
    </div>
  );
}

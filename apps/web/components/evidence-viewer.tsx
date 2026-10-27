"use client";

import { useState } from "react";
import type { ElementHighlight } from "@a11yforge/shared";
import { Button } from "@/components/ui/button";
import { dimCutoutClip, isDrawableHighlight, toPercentBox } from "@/lib/overlay";
import { cn } from "@/lib/utils";

/**
 * A11yForge-specific evidence viewer: real screenshot with a measured
 * element highlight. Coordinates render as percentages so the overlay
 * stays aligned at any display size. The highlight is visual only — the
 * caption below always names the shown item for screen readers.
 */
export function EvidenceViewer({
  src,
  alt,
  highlights,
  selectedIndex,
  onSelect,
  caption,
}: {
  src: string;
  alt: string;
  highlights: ElementHighlight[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  caption?: string;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const drawable = highlights.filter(isDrawableHighlight);
  const active = drawable[selectedIndex] ?? null;
  const percent = active === null ? null : toPercentBox(active);

  function move(delta: number): void {
    if (drawable.length === 0) return;
    const next = (selectedIndex + delta + drawable.length) % drawable.length;
    onSelect(next);
  }

  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
    }
  }

  return (
    <figure>
      <div
        data-evidence-viewer="true"
        className="relative overflow-hidden rounded-md border border-linesoft bg-sunken"
        onKeyDown={onKeyDown}
        aria-label={active !== null ? `Evidence viewer: showing ${active.label}` : "Evidence viewer"}
      >
        {failed ? (
          <p className="help px-4 py-8 text-center" role="img" aria-label="Screenshot unavailable">
            Screenshot unavailable — the recorded image could not be loaded.
          </p>
        ) : (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        )}
        {!failed && percent !== null && active !== null && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-black/60"
              style={{ clipPath: dimCutoutClip(percent) }}
            />
            <div
              aria-hidden="true"
              data-highlight="true"
              className="pointer-events-none absolute border-2 border-ink"
              style={{
                left: `${percent.left}%`,
                top: `${percent.top}%`,
                width: `${percent.width}%`,
                height: `${percent.height}%`,
              }}
            />
            <div
              aria-hidden="true"
              className="absolute flex max-w-[75%] items-center gap-2"
              style={{
                left: `${percent.left}%`,
                top: `${percent.top}%`,
                transform: "translate(-12px, -50%)",
              }}
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full border border-ink bg-ink px-1 font-mono text-[12px] font-bold text-canvas">
                {selectedIndex + 1}
              </span>
              <span className="truncate rounded-[4px] border border-line bg-overlay px-2 py-1 font-mono text-[12px] text-ink">
                {active.label}
              </span>
            </div>
          </>
        )}
      </div>
      <figcaption className="help px-1 py-2">
        {caption !== undefined && <span>{caption} </span>}
        {active !== null && drawable.length > 0 && (
          <span>
            Affected item {selectedIndex + 1} of {drawable.length}: {active.label}.
          </span>
        )}
      </figcaption>
      {drawable.length > 1 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Affected items"
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => move(-1)}
            aria-label="Previous affected item"
          >
            ← Previous
          </Button>
          <div className={cn("flex flex-wrap items-center gap-1")} role="group" aria-label="Go to affected item">
            {drawable.map((highlight, index) => (
              <Button
                key={`${highlight.x}-${highlight.y}-${index}`}
                type="button"
                size="sm"
                variant={index === selectedIndex ? "default" : "secondary"}
                aria-pressed={index === selectedIndex}
                aria-label={`Affected item ${index + 1} of ${drawable.length}: ${highlight.label}`}
                onClick={() => onSelect(index)}
              >
                {index + 1}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => move(1)}
            aria-label="Next affected item"
          >
            Next →
          </Button>
        </div>
      )}
    </figure>
  );
}

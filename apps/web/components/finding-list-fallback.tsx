"use client";

import type { ExplorationFinding } from "@a11yforge/shared";
import { Button } from "@/components/ui/button";
import { EvidenceViewer } from "@/components/evidence-viewer";
import { drawableHighlights } from "../lib/overlay";
import { explorationShotSrc } from "../lib/api";
import {
  humanFindingOf,
  severityWordOf,
  tierOfSeverity,
} from "../lib/human-copy";

/**
 * Compact textual equivalent of the 3D map: every marker has a button
 * here, and when WebGL is unavailable this component also carries the
 * full 2D screenshot/highlight evidence experience.
 */

export interface FindingListFallbackProps {
  findings: ExplorationFinding[];
  selectedFindingId: string | null;
  onSelect: (findingId: string) => void;
  compact?: boolean;
}

export function FindingListFallback({
  findings,
  selectedFindingId,
  onSelect,
  compact = false,
}: FindingListFallbackProps): React.JSX.Element {
  if (findings.length === 0) {
    return <p className="help">No problems to list.</p>;
  }
  return (
    <ol aria-label="All problems" style={{ display: "grid", gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
      {findings.map((finding, index) => {
        const human = humanFindingOf(finding);
        const active = finding.findingId === selectedFindingId;
        const tier = tierOfSeverity(finding.severity);
        const shortTitle = human.title.length > 60 ? `${human.title.slice(0, 57)}…` : human.title;
        return (
          <li key={finding.findingId}>
            <Button
              size="sm"
              variant={active ? "default" : "secondary"}
              aria-current={active ? "true" : undefined}
              aria-label={`Issue ${index + 1} of ${findings.length}: ${human.title}. ${severityWordOf(finding.severity)}${tier === 0 ? ", needs attention first" : ""}`}
              onClick={() => onSelect(finding.findingId)}
              className="w-full justify-start"
            >
              <span aria-hidden="true" className="font-mono">
                {index + 1}
              </span>{" "}
              {compact ? shortTitle : human.title}
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

interface EvidenceFallbackProps {
  runId: string;
  finding: ExplorationFinding;
  elementIndex: number;
  onElementSelect: (index: number) => void;
}

/** 2D evidence experience when the 3D scene cannot run. */
export function EvidenceFallback({
  runId,
  finding,
  elementIndex,
  onElementSelect,
}: EvidenceFallbackProps): React.JSX.Element {
  const human = humanFindingOf(finding);
  const drawable = drawableHighlights(finding.highlights);
  const shot = finding.screenshots[0] ?? null;
  if (shot === null || drawable.length === 0) {
    return (
      <p className="help" style={{ color: "var(--ink-dim)" }}>
        We found this problem but could not visually locate it in the
        captured screenshot.
      </p>
    );
  }
  return (
    <EvidenceViewer
      src={explorationShotSrc(runId, shot)}
      alt={`Screenshot from the test showing where: ${human.title}`}
      highlights={drawable}
      selectedIndex={Math.min(elementIndex, drawable.length - 1)}
      onSelect={onElementSelect}
      caption="This is the exact element to look at."
    />
  );
}

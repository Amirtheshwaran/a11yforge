"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExplorationFinding } from "@a11yforge/shared";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import type { RepairState } from "../lib/scene-model";
import {
  affectedCountOf,
  fixGuidanceOf,
  humanFindingOf,
  humanStepsOf,
  ruleSlugOf,
  severityWordOf,
  shortPageOf,
  storyboardOf,
} from "../lib/human-copy";

/**
 * Guided issue navigation in HTML: every marker action in the 3D scene
 * has an equivalent control here, so the product works fully without
 * touching the canvas. Plain language first, jargon behind disclosure.
 */

function FindingTechnicalDetails({ finding }: { finding: ExplorationFinding }): React.JSX.Element {
  const slug = ruleSlugOf(finding);
  return (
    <div className="finding-evidence">
      {slug !== null && (
        <p className="badge-mono" style={{ margin: "0 0 8px" }}>
          Check: {slug}
        </p>
      )}
      <h4>How it was checked</h4>
      <ol>
        {finding.howReproduced.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {finding.standardReferences.length > 0 && (
        <p className="std-refs">
          Standards:{" "}
          {finding.standardReferences.map((ref, index) => (
            <span key={index}>
              {index > 0 && ", "}
              <a href={ref} target="_blank" rel="noreferrer">
                {ref}
              </a>
            </span>
          ))}
        </p>
      )}
      <p className="std-refs">
        Probe: {finding.probeId} · Finding: {finding.findingId}
      </p>
    </div>
  );
}

const REPAIR_WORDS: Record<RepairState, string> = {
  unresolved: "Not yet repaired",
  repairing: "Repair in progress",
  verifying: "Checking the repair",
  verified: "Repaired and checked",
  rejected: "Repair did not pass",
  unverifiable: "Could not check automatically",
};

export interface IssueWalkthroughProps {
  finding: ExplorationFinding;
  runId: string;
  position: number;
  total: number;
  developer: boolean;
  elementCount: number;
  elementIndex: number;
  onElementSelect: (index: number) => void;
  storyIndex: number;
  onStorySelect: (index: number) => void;
  storyPlaying: boolean;
  onTogglePlay: () => void;
  isKeyboard: boolean;
  hasDrawableGeometry: boolean;
  repairState: RepairState;
  sourceFile: string | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onResetView: () => void;
}

export function IssueWalkthrough(props: IssueWalkthroughProps): React.JSX.Element {
  const { finding } = props;
  const human = humanFindingOf(finding);
  const count = affectedCountOf(finding);
  const steps = humanStepsOf(finding);
  const board = storyboardOf(finding);
  const [showFix, setShowFix] = useState(false);
  const headingId = `issue-title-${finding.findingId}`;

  function showMe(): void {
    if (props.isKeyboard) {
      props.onStorySelect(props.storyIndex);
    } else {
      props.onElementSelect(props.elementIndex);
    }
  }

  return (
    <div>
      <p className="mono-label" aria-live="polite">
        {severityWordOf(finding.severity)}
        {props.repairState !== "unresolved" && ` · ${REPAIR_WORDS[props.repairState]}`}
      </p>
      <h3 id={headingId} tabIndex={-1} className="issue-title outline-none">
        {human.title}
      </h3>
      <p className="issue-why">{human.why}</p>
      <p className="issue-where">
        Affected area: <code>{props.developer ? finding.pageUrl : shortPageOf(finding.pageUrl)}</code>
      </p>
      {!props.hasDrawableGeometry && (
        <p className="help" style={{ color: "var(--ink-dim)" }}>
          We found this problem but could not place it on the 3D map, so it
          has no spatial marker. Everything below still applies.
        </p>
      )}
      {count !== null && (
        <p className="font-mono text-[11px] text-inkdim">
          Affected: {count} {human.noun}
          {count === 1 ? "" : "s"}
        </p>
      )}

      {props.elementCount > 1 && (
        <div role="group" aria-label="Affected items" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 }}>
          <p className="badge-mono" aria-live="polite">
            Affected item {Math.min(props.elementIndex, props.elementCount - 1) + 1} of {props.elementCount}
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={props.elementIndex <= 0}
            onClick={() => props.onElementSelect(props.elementIndex - 1)}
            aria-label="Previous affected item"
          >
            ← Previous item
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={props.elementIndex >= props.elementCount - 1}
            onClick={() => props.onElementSelect(props.elementIndex + 1)}
            aria-label="Next affected item"
          >
            Next item →
          </Button>
        </div>
      )}

      {props.isKeyboard && (
        <>
          <h4>What happened</h4>
          <ol className="finding-steps">
            {board.map((step, index) => (
              <li key={index} aria-current={index === props.storyIndex ? "step" : undefined}>
                {step.marker !== "start" && <span aria-hidden="true">↓ Tab </span>}
                <Button
                  variant="link"
                  className="h-auto p-0 text-left text-sm"
                  onClick={() => props.onStorySelect(index)}
                  aria-label={`Show step ${index + 1} of ${board.length} in the scene`}
                >
                  {step.text}
                </Button>
                {step.marker === "problem" && " ✕"}
              </li>
            ))}
          </ol>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            <Button size="sm" variant="secondary" onClick={props.onTogglePlay} aria-pressed={props.storyPlaying}>
              {props.storyPlaying ? "Pause evidence" : "Play evidence"}
            </Button>
            <p className="badge-mono" aria-live="polite">
              Step {Math.min(props.storyIndex, board.length - 1) + 1} of {board.length}
              {board.length > 1 && props.storyIndex >= board.length - 1 ? " — Failure" : ""}
            </p>
          </div>
        </>
      )}

      {props.developer && steps.length > 0 && !props.isKeyboard && (
        <>
          <h4>How it was checked</h4>
          <ol className="finding-steps">
            {steps.slice(0, 6).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </>
      )}

      <div className="issue-actions" role="group" aria-label="Issue actions">
        <Button size="sm" onClick={showMe}>
          Show me
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowFix((v) => !v)} aria-expanded={showFix}>
          How do I fix this?
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link
            href={`/connect?run=${encodeURIComponent(props.runId)}&finding=${encodeURIComponent(finding.findingId)}`}
          >
            {props.sourceFile !== null ? "Fix this" : "Connect source"}
          </Link>
        </Button>
      </div>
      {showFix && (
        <div className="proof-note">
          <span className="mono-label">How to fix</span>
          {fixGuidanceOf(finding)}
        </div>
      )}

      {props.sourceFile !== null && (
        <div aria-label="Source information">
          <p className="mono-label">Responsible code located</p>
          <p className="source-file">
            <code>{props.sourceFile}</code>
          </p>
          <p className="help" style={{ color: "var(--ink-dim)" }}>
            The marker shows the browser problem; this panel shows the code.
            Web-based repair is not available yet. The connect page offers
            local source inspection and a recorded verified repair.
          </p>
        </div>
      )}

      <Accordion type="single" collapsible>
        <AccordionItem value={`walk-technical-${finding.findingId}`}>
          <AccordionTrigger>Developer details</AccordionTrigger>
          <AccordionContent>
            <FindingTechnicalDetails finding={finding} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="issue-nav" role="group" aria-label="Issue navigation">
        <button
          type="button"
          className="issue-nav-btn"
          disabled={!props.hasPrevious}
          onClick={props.onPrevious}
          aria-label="Previous issue"
        >
          ← Prev
        </button>
        <button
          type="button"
          className="issue-nav-btn"
          onClick={props.onResetView}
        >
          Reset view
        </button>
        <button
          type="button"
          className="issue-nav-btn"
          disabled={!props.hasNext}
          onClick={props.onNext}
          aria-label="Next issue"
        >
          Next issue →
        </button>
      </div>
    </div>
  );
}

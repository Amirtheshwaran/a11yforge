"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadArtifact, fetchArtifactText } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A11yForge-specific UI — intentionally custom, not shadcn primitives:
 * stage step lists, run verdicts, evidence viewers, trace lists, diff
 * viewer, screenshot grids, metadata grids. Generic controls (buttons,
 * inputs, cards, alerts, badges, tables, tabs) come from
 * `@/components/ui/*` at the call sites.
 */

// ---------------------------------------------------------------------------
// Stage steps (exploration stages, source-connection steps)
// ---------------------------------------------------------------------------

export interface StageStep {
  id: string;
  label: string;
  state: "done" | "running" | "pending";
}

export function StageSteps({
  steps,
  ariaLabel,
}: {
  steps: StageStep[];
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <ol className="progress-steps" aria-label={ariaLabel}>
      {steps.map((step) => (
        <li
          key={step.id}
          className={
            step.state === "done"
              ? "step-done"
              : step.state === "running"
                ? "step-current"
                : undefined
          }
          aria-current={step.state === "running" ? "step" : undefined}
        >
          {step.label}
          {step.state === "done" ? " — done" : step.state === "running" ? " — in progress" : ""}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Run status + gate verdicts (glyph-plus-text, never color-only)
// ---------------------------------------------------------------------------

export function RunStatusBadge({ status }: { status: string }): React.JSX.Element {
  const variant =
    status === "ACCEPTED" ? "solid" : status === "EVIDENCE" ? "default" : "outline";
  return (
    <Badge variant={variant} role="status" aria-label={`Run status: ${status}`}>
      {status}
    </Badge>
  );
}

export function VerdictMark({
  pass,
  children,
}: {
  pass: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Badge variant={pass ? "solid" : "outline"}>
      {pass ? "PASS" : "FAIL"} {children}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Unified diff viewer (bounded, keyboard-scrollable)
// ---------------------------------------------------------------------------

export function DiffView({
  url,
  label,
}: {
  url: string | null;
  label: string;
}): React.JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    if (url === null) return;
    fetchArtifactText(url)
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError("Diff artifact unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (url === null) return <p className="text-inkdim">No diff recorded for this attempt.</p>;
  if (error !== null) return <Alert variant="destructive">{error}</Alert>;
  if (text === null)
    return (
      <div role="status" aria-label={`Loading ${label}`}>
        <Skeleton className="h-24 w-full" />
        <p className="loading">Loading diff…</p>
      </div>
    );

  const lines = text.split("\n");
  const shown = lines.slice(0, 120);
  return (
    <>
      <pre
        className="diff"
        aria-label={`${label}: unified diff, added lines start with plus, removed lines with minus`}
        tabIndex={0}
      >
        {shown.map((line, i) => {
          const cls =
            line.startsWith("+") && !line.startsWith("+++")
              ? "line add"
              : line.startsWith("-") && !line.startsWith("---")
                ? "line del"
                : line.startsWith("@@")
                  ? "line hunk"
                  : "line";
          return (
            <span key={i} className={cls}>
              {line === "" ? " " : line}
              {"\n"}
            </span>
          );
        })}
      </pre>
      {lines.length > shown.length && (
        <p className="text-inkdim">
          Showing {shown.length} of {lines.length} diff lines (bounded view).
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Patch download (real artifact endpoint via blob; never synthesized)
// ---------------------------------------------------------------------------

export function DownloadPatchButton({
  url,
  filename,
  label,
}: {
  url: string;
  filename: string;
  label: string;
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDownload(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await downloadArtifact(url, filename);
    } catch {
      setError("Patch download failed — the artifact may have expired.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void onDownload()}
        disabled={busy}
      >
        {busy ? "Preparing download…" : label}
      </Button>
      {error !== null && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline stage list (live + recorded runs)
// ---------------------------------------------------------------------------

export interface PipelineStage {
  id: string;
  label: string;
  detail?: string | undefined;
  mark: string;
  word: string;
  tone: "success" | "failed" | "current" | "pending";
}

export function PipelineStages({
  stages,
  ariaLabel,
}: {
  stages: PipelineStage[];
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <ol className="pipeline" aria-label={ariaLabel}>
      {stages.map((stage) => (
        <li key={stage.id}>
          <span className="stage-mark" data-status={stage.tone} aria-hidden="true">
            {stage.mark}
          </span>
          <span>
            <span className="stage-label">{stage.label}</span>{" "}
            <span className="stage-state" data-status={stage.tone}>
              {stage.word}
            </span>
            {stage.detail !== undefined && <div className="stage-detail">{stage.detail}</div>}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Keyboard interaction trace (focus progression, Tab by Tab)
// ---------------------------------------------------------------------------

export interface FocusTraceStep {
  seq: number;
  selector: string;
  insideModal: boolean;
}

export function FocusTraceList({ steps }: { steps: FocusTraceStep[] }): React.JSX.Element {
  return (
    <ScrollArea className="max-h-80">
      <ol className="trace" aria-label="Focus progression, Tab by Tab">
        {steps.map((step) => (
          <li key={step.seq} className={step.insideModal ? "" : "escaped"}>
            <span className="seq">Tab {step.seq}</span>
            <span>{step.selector}</span>
            <span className={cn("where", step.insideModal ? "in" : "out")}>
              {step.insideModal ? "INSIDE ✓" : "ESCAPED ✕"}
            </span>
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Before/after screenshot evidence grid
// ---------------------------------------------------------------------------

export interface EvidenceShot {
  src: string;
  alt: string;
  caption: string;
}

export function EvidenceShots({ shots }: { shots: EvidenceShot[] }): React.JSX.Element | null {
  if (shots.length === 0) return null;
  return (
    <div className="shots">
      {shots.map((shot) => (
        <figure key={shot.src}>
          <img src={shot.src} alt={shot.alt} loading="lazy" />
          <figcaption>{shot.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata grid (run metadata, connection target, execution profile)
// ---------------------------------------------------------------------------

export function MetaGrid({
  entries,
  ariaLabel,
}: {
  entries: { term: string; value: React.ReactNode }[];
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <dl className="meta-grid" aria-label={ariaLabel}>
      {entries.map((entry) => (
        <div className="meta-cell" key={entry.term}>
          <dt>{entry.term}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}

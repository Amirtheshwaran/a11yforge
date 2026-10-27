import type { LiveRunEvent, LiveRunStatus } from "./api";

/**
 * Centralized live-run evidence folding (single owner).
 *
 * Folds the SSE event stream into progressive evidence summaries for the
 * live panel. Best-effort display only: the status poll and persisted run
 * remain authoritative, and unknown event types are ignored.
 */
export interface LiveEvidence {
  findings: string | null;
  escape: string | null;
  diagnosis: string | null;
  diagnosisMeta: string | null;
  source: string | null;
  proposal: string | null;
}

/** Fold the live event stream into progressive evidence summaries. */
export function foldLiveEvidence(events: LiveRunEvent[]): LiveEvidence {
  const out: LiveEvidence = {
    findings: null,
    escape: null,
    diagnosis: null,
    diagnosisMeta: null,
    source: null,
    proposal: null,
  };
  for (const event of events) {
    const meta = event.metadata as Record<string, unknown>;
    if (event.type === "scanner-completed") {
      const findings = typeof meta["findings"] === "number" ? meta["findings"] : null;
      const rules = Array.isArray(meta["rules"])
        ? meta["rules"].filter((r): r is string => typeof r === "string")
        : [];
      out.findings =
        findings !== null
          ? `${findings} finding${findings === 1 ? "" : "s"} across ${rules.length} rule${rules.length === 1 ? "" : "s"}${rules.length > 0 ? `: ${rules.join(", ")}` : ""}`
          : event.message;
    } else if (event.type === "focus-escape-detected") {
      const step = typeof meta["step"] === "number" ? `step ${meta["step"]}` : "a Tab press";
      const actual = typeof meta["actualFocus"] === "string" ? meta["actualFocus"] : "outside the dialog";
      out.escape = `${step} → ${actual}`;
    } else if (event.type === "diagnosis-completed") {
      const title = /Diagnosed:\s*(.*)/.exec(event.message)?.[1] ?? event.message;
      out.diagnosis = title;
      const parts: string[] = [];
      for (const key of ["issueType", "severity", "confidence"] as const) {
        const value = meta[key];
        if (typeof value === "string" || typeof value === "number") parts.push(`${key}: ${value}`);
      }
      out.diagnosisMeta = parts.length > 0 ? parts.join(" · ") : null;
    } else if (event.type === "source-candidate-selected") {
      const file = typeof meta["file"] === "string" ? meta["file"] : null;
      const score = typeof meta["score"] === "number" ? ` · score ${meta["score"]}` : "";
      out.source = file !== null ? `${file}${score}` : event.message;
    } else if (event.type === "repair-proposal-completed") {
      const files = Array.isArray(meta["targetFiles"])
        ? meta["targetFiles"].filter((f): f is string => typeof f === "string")
        : [];
      const editCount = typeof meta["edits"] === "number" ? meta["edits"] : null;
      const edits = editCount !== null ? ` · ${editCount} edit${editCount === 1 ? "" : "s"}` : "";
      out.proposal = files.length > 0 ? `${files.join(", ")}${edits}` : event.message;
    }
  }
  return out;
}

export function formatTokens(usage: LiveRunStatus["usage"]): string {
  const parts = [`in ${usage.inputTokens ?? "n/a"}`, `out ${usage.outputTokens ?? "n/a"}`];
  if (usage.reasoningTokens !== null && usage.reasoningTokens !== undefined) {
    parts.push(`reasoning ${usage.reasoningTokens}`);
  }
  return parts.join(" · ");
}

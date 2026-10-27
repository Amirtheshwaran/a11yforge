import type { Page } from "playwright";
import {
  ProbeResultSchema,
  type ActionStep,
  type PageSurface,
  type ProbeResult,
  type ProbeStatus,
} from "@a11yforge/shared";

/**
 * Phase 8 — generic probe architecture.
 *
 * An `AccessibilityProbe` declares when it applies from discovered runtime
 * semantics (`applicable`) and executes only against live browser state
 * (`execute`). Probes never guess: element existence, focus behavior,
 * dialog presence, and assertion outcomes all come from the real page.
 * No model calls happen anywhere in this layer.
 */

export interface ProbeScreenshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProbeContext {
  targetId: string;
  page: Page;
  pageUrl: string;
  surface: PageSurface;
  maxTabSteps: number;
  /** Capture a bounded screenshot; returns the artifact file name or null. */
  captureScreenshot: (label: string, highlight?: ProbeScreenshot | null) => Promise<string | null>;
  /** Throws when the user cancelled the run — probes must stop promptly. */
  checkCancelled: () => void;
}

export interface AccessibilityProbe {
  id: string;
  /** True when the discovered surface exposes the semantics this probe needs. */
  applicable: (surface: PageSurface) => boolean;
  execute: (ctx: ProbeContext) => Promise<ProbeResult>;
}

export function newTraceRecorder(pageUrl: string): {
  steps: ActionStep[];
  record: (action: string, detail?: string) => void;
} {
  const steps: ActionStep[] = [];
  return {
    steps,
    record: (action: string, detail = "") => {
      steps.push({
        seq: steps.length,
        action,
        detail,
        pageUrl,
        timestamp: new Date().toISOString(),
      });
    },
  };
}

export function buildProbeResult(input: {
  probeId: string;
  targetId: string;
  pageUrl: string;
  status: ProbeStatus;
  title: string;
  humanSummary: string;
  severity?: ProbeResult["severity"];
  evidence?: ProbeResult["evidence"];
  actionTrace?: ActionStep[];
  screenshots?: string[];
  standardReferences?: string[];
  startedAt: string;
}): ProbeResult {
  return ProbeResultSchema.parse({
    severity: "info",
    evidence: [],
    actionTrace: [],
    screenshots: [],
    standardReferences: [],
    ...input,
    completedAt: new Date().toISOString(),
  });
}

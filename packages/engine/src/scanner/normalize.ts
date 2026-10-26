import type { AxeResults } from "axe-core";
import {
  AccessibilityScanResultSchema,
  type AccessibilityScanResult,
} from "@a11yforge/shared";

/**
 * Normalize raw axe-core results into compact per-node findings.
 *
 * One axe violation affecting N DOM nodes becomes N findings. Each finding
 * carries the rule metadata plus its own selector, HTML fragment, and
 * failure summary. This per-node shape is deliberate: Phase 4 source
 * tracing maps one failing node to the component that renders it, and
 * before/after verification diffs stay exact.
 */

const MAX_HTML_CHARS = 500;

export interface NormalizeInput {
  axeResults: AxeResults;
  pageUrl: string;
  scanId: string;
  startedAt: string;
  completedAt: string;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}…`;
}

export function normalizeAxeResults(
  input: NormalizeInput,
): AccessibilityScanResult {
  const { axeResults, pageUrl, scanId, startedAt, completedAt } = input;

  const result: AccessibilityScanResult = {
    scanId,
    pageUrl,
    startedAt,
    completedAt,
    findings: axeResults.violations.flatMap((violation) =>
      violation.nodes.map((node, nodeIndex) => ({
        id: `${violation.id}#${nodeIndex}`,
        ruleId: violation.id,
        impact: violation.impact ?? null,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        pageUrl,
        selector: node.target.map(String).join(" "),
        html: truncate(node.html, MAX_HTML_CHARS),
        failureSummary: node.failureSummary ?? "",
      })),
    ),
  };

  // Reject our own bugs loudly: never emit evidence that fails the schema.
  return AccessibilityScanResultSchema.parse(result);
}

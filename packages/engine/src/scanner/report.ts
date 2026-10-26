import type { AccessibilityScanResult } from "@a11yforge/shared";

/**
 * Human-readable terminal summary of a scan. Evidence only: rule ids,
 * impact, selectors, and HTML fragments. No interpretation or advice.
 */

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function formatTerminalSummary(
  result: AccessibilityScanResult,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge Accessibility Scan");
  lines.push("");
  lines.push("Target:");
  lines.push(result.pageUrl);
  lines.push("");

  const findingCount = result.findings.length;
  const ruleIds = new Set(result.findings.map((f) => f.ruleId));
  lines.push(
    `${findingCount} ${pluralize(findingCount, "finding", "findings")} ` +
      `(${ruleIds.size} ${pluralize(ruleIds.size, "rule", "rules")}) detected`,
  );

  if (findingCount === 0) {
    lines.push("");
    lines.push("No violations detected.");
    return lines.join("\n");
  }

  for (const finding of result.findings) {
    lines.push("");
    lines.push(
      `[${finding.impact ?? "unknown impact"}] ${finding.ruleId} (${finding.id})`,
    );
    lines.push(`Help: ${finding.help}`);
    lines.push(`Selector: ${finding.selector}`);
    lines.push(`Element: ${finding.html}`);
    if (finding.failureSummary) {
      lines.push(`Failure: ${finding.failureSummary}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

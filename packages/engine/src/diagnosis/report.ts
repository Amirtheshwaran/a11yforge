import type {
  AccessibilityDiagnosis,
  ModelUsage,
} from "@a11yforge/shared";

/**
 * Human-readable terminal report for a completed AI diagnosis.
 * Evidence only plus model interpretation — never chain-of-thought or hidden
 * reasoning, which the provider does not expose.
 */
export function formatDiagnosisSummary(
  diagnosis: AccessibilityDiagnosis,
  usage: ModelUsage,
  model: string,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge AI Diagnosis");
  lines.push("");
  lines.push("Issue:");
  lines.push(diagnosis.title);
  lines.push("");
  lines.push("Severity:");
  lines.push(diagnosis.severity);
  lines.push("");
  lines.push("Confidence:");
  lines.push(String(diagnosis.confidence));
  lines.push("");
  lines.push("Observed failure:");
  lines.push(diagnosis.observedFailure);
  lines.push("");
  lines.push("Likely cause:");
  lines.push(diagnosis.likelyCause);
  lines.push("");
  lines.push("Recommended repair strategy:");
  lines.push(diagnosis.recommendedRepairStrategy);
  lines.push("");
  lines.push("Evidence:");
  for (const id of diagnosis.evidenceIds) {
    lines.push(id);
  }
  lines.push("");
  lines.push("Source context required:");
  lines.push(diagnosis.needsSourceContext ? "yes" : "no");
  lines.push("");
  lines.push("Model:");
  lines.push(model);
  lines.push("");
  lines.push("Usage:");
  lines.push(
    `input ${usage.inputTokens ?? "n/a"} output ${usage.outputTokens ?? "n/a"}`,
  );
  lines.push("");
  return lines.join("\n");
}

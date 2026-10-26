import { relative } from "node:path";
import type {
  FocusObservation,
  KeyboardScenarioResult,
} from "@a11yforge/shared";
import { findWorkspaceRoot } from "../scanner/workspace.js";

/**
 * Human-readable terminal report for a keyboard scenario run. Evidence
 * only: the deterministic focus sequence, the assertion verdict, and where
 * the artifacts live. No interpretation or advice.
 */

function describeObservation(observation: FocusObservation): string {
  const label = observation.accessibleName || observation.selector;
  const key = observation.key ?? "open";
  if (observation.insideModal) {
    return `✓ ${key} -> ${label} (${observation.selector})`;
  }
  return `✗ ${key} -> focus escaped dialog (${observation.selector})`;
}

export function formatInteractionSummary(
  result: KeyboardScenarioResult,
  runDir: string,
): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("A11yForge Interaction Test");
  lines.push("");
  lines.push("Scenario:");
  lines.push(result.scenarioId);
  lines.push("");
  for (const observation of result.observations) {
    if (observation.action === "modal-open") {
      lines.push(`✓ Opened checkout modal (${observation.selector} focused)`);
    } else {
      lines.push(describeObservation(observation));
    }
  }
  lines.push("");

  const assertion = result.assertions[0];
  if (assertion && !assertion.passed) {
    lines.push("ASSERTION FAILED");
    lines.push(assertion.assertion);
    lines.push("");
    lines.push("Expected:");
    lines.push(`focus inside ${assertion.expectedRegion}`);
    lines.push("");
    lines.push("Actual:");
    lines.push(`focus on ${assertion.actualFocus}`);
  } else if (assertion) {
    lines.push("ASSERTION PASSED");
    lines.push(assertion.assertion);
  } else {
    lines.push("No assertions evaluated.");
  }
  lines.push("");
  lines.push("Evidence:");
  // Display the run dir relative to the workspace root (the CLI runs from
  // the engine package directory, so cwd-relative paths would start with
  // `../../`). Fall back to the absolute path if the root is unreachable.
  let evidence = runDir;
  try {
    evidence = relative(findWorkspaceRoot(), runDir) || runDir;
  } catch {
    evidence = runDir;
  }
  lines.push(evidence);
  lines.push("");
  return lines.join("\n");
}

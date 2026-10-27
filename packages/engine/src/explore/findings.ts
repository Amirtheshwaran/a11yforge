import type { ExplorationFinding, FindingCategory, ProbeResult } from "@a11yforge/shared";

/**
 * Phase 8 — generic finding projection.
 *
 * Turns deterministic probe results into human-readable findings using fixed
 * copy templates keyed by evidence kind — no model calls. The mapping is
 * deliberately conservative: only failed interaction assertions become
 * confirmed failures, axe violations stay automated findings, and anything
 * untested is reported as not tested rather than passed.
 */

const WHY_IT_MATTERS: Record<string, string> = {
  "axe-violation":
    "Automated checks flag patterns known to block real people — missing names, broken relationships, and unreadable contrast lock users out of content and controls.",
  "keyboard-focus-anomaly":
    "People who navigate by keyboard can only use what focus can reach safely. Focus that lands where assistive technology cannot follow leaves them stranded.",
  "dialog-focus-escape":
    "Keyboard users can accidentally interact with the page behind an active dialog, and screen reader users can lose track of where they are.",
  "dialog-missing-name":
    "Without a name, screen reader users hear no context for what the dialog is or what they are supposed to do in it.",
  "unnamed-control":
    "Without an accessible name, screen reader users hear only the control type with no indication of what to enter or choose.",
  "tab-missing-name":
    "Tabs without names announce as nothing useful, so keyboard and screen reader users cannot tell the sections apart.",
  "tab-broken-panel-ref":
    "When a tab claims to control a panel that does not exist, assistive technology cannot expose the relationship and users lose the content.",
  "disclosure-stuck-open":
    "Users can get stuck with content revealed or focus stranded when a control will not return to its initial state.",
};

const GENERIC_WHY =
  "This pattern is known to block keyboard and screen reader users from perceiving or operating the page.";

function whyItMatters(kind: string): string {
  return WHY_IT_MATTERS[kind] ?? GENERIC_WHY;
}

function impactSeverity(impact: string | null): ExplorationFinding["severity"] {
  if (impact === "critical") return "critical";
  if (impact === "serious") return "serious";
  if (impact === "moderate") return "moderate";
  if (impact === "minor") return "minor";
  return "info";
}

/** Render an action trace as plain-language reproduction steps. */
export function traceToSteps(pageUrl: string, result: ProbeResult): string[] {
  const steps: string[] = [`Opened ${pageUrl} in a real browser.`];
  for (const step of result.actionTrace) {
    if (step.action === "axe-scan-started" || step.action === "axe-scan-finished") continue;
    if (step.detail !== "") steps.push(step.detail);
    else steps.push(step.action);
  }
  return steps.slice(0, 20);
}

interface HighlightBox {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Present on newer runs: steps at another scroll offset do not align. */
  scrollY?: number;
}

function isHighlightBox(value: unknown): value is HighlightBox {
  if (typeof value !== "object" || value === null) return false;
  const box = value as Record<string, unknown>;
  return (
    typeof box["x"] === "number" &&
    typeof box["y"] === "number" &&
    typeof box["width"] === "number" &&
    typeof box["height"] === "number" &&
    typeof box["viewportWidth"] === "number" &&
    typeof box["viewportHeight"] === "number" &&
    box["width"] > 0 &&
    box["height"] > 0
  );
}

function projectAxeRule(
  result: ProbeResult,
  ruleId: string,
  index: number,
): ExplorationFinding {
  const nodes = result.evidence.filter(
    (entry) => entry.kind === "axe-violation" && (entry.data["ruleId"] as string) === ruleId,
  );
  const first = nodes[0];
  const help = (first?.data["help"] as string) ?? ruleId;
  const helpUrl = (first?.data["helpUrl"] as string) ?? "";
  const impact = (first?.data["impact"] as string | null) ?? null;
  const selectors = nodes.slice(0, 3).map((entry) => (entry.data["selector"] as string) || "the page");
  const screenshot = result.screenshots[0] ?? "";
  const highlights =
    screenshot === ""
      ? []
      : nodes.flatMap((entry) => {
          const box = entry.data["box"];
          const label = entry.data["boxLabel"];
          if (!isHighlightBox(box) || typeof label !== "string" || label === "") return [];
          return [
            {
              screenshot,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              viewportWidth: box.viewportWidth,
              viewportHeight: box.viewportHeight,
              label,
              selector: (entry.data["selector"] as string) ?? "",
            },
          ];
        });
  return {
    findingId: `${result.probeId}-${ruleId}-${index}`,
    category: "automated-finding",
    title: `Automated check: ${help}`,
    whatHappened:
      `An automated accessibility check (${ruleId}) failed on ${nodes.length} ` +
      `${nodes.length === 1 ? "element" : "elements"}${selectors[0] !== "the page" ? `, including ${selectors.join(", ")}` : ""}.`,
    whyItMatters: whyItMatters("axe-violation"),
    howReproduced: [
      `Opened ${result.pageUrl} in a real browser.`,
      `Ran the automated "${ruleId}" check inside the page.`,
      ...nodes.slice(0, 5).map(
        (entry) => `Flagged: ${(entry.data["selector"] as string) || "the page"}.`,
      ),
    ],
    pageUrl: result.pageUrl,
    severity: impactSeverity(impact),
    probeId: result.probeId,
    screenshots: result.screenshots,
    standardReferences: helpUrl === "" ? result.standardReferences : [helpUrl],
    highlights,
  };
}

function projectSingle(
  result: ProbeResult,
  category: FindingCategory,
  index: number,
): ExplorationFinding {
  const kind = result.evidence[0]?.kind ?? "observation";
  const anomaly = result.evidence[0]?.kind === "keyboard-focus-anomaly" ? result.evidence[0] : null;
  const screenshot = result.screenshots[0] ?? "";
  const anomalyBox = anomaly?.data["box"];
  const anomalyName = anomaly?.data["name"];
  const anomalyRole = anomaly?.data["role"];
  const anomalyLabel =
    typeof anomalyName === "string" && anomalyName !== "" && typeof anomalyRole === "string" && anomalyRole !== ""
      ? `"${anomalyName}" ${anomalyRole}`
      : typeof anomalyRole === "string" && anomalyRole !== ""
        ? anomalyRole
        : "focused element";
  const anomalySelector =
    typeof anomaly?.data["selector"] === "string" ? (anomaly?.data["selector"] as string) : "";
  // Recorded focus sequence, in traversal order: only steps measured at
  // the failure shot's scroll position align to it. Steps without scroll
  // data (older runs) attach as before so legacy evidence keeps working.
  const finalScrollY =
    isHighlightBox(anomalyBox) && typeof anomalyBox.scrollY === "number" ? anomalyBox.scrollY : null;
  const recorded = anomaly?.data["focusSteps"];
  const sequence =
    screenshot === "" || !Array.isArray(recorded)
      ? []
      : recorded.flatMap((step: unknown) => {
          if (typeof step !== "object" || step === null) return [];
          const entry = step as Record<string, unknown>;
          if (typeof entry["label"] !== "string" || entry["label"] === "") return [];
          const box: unknown = entry["box"];
          if (!isHighlightBox(box)) return [];
          if (
            finalScrollY !== null &&
            typeof box["scrollY"] === "number" &&
            Math.abs(box["scrollY"] - finalScrollY) > 2
          ) {
            return [];
          }
          return [
            {
              screenshot,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              viewportWidth: box.viewportWidth,
              viewportHeight: box.viewportHeight,
              label: entry["label"],
              selector: typeof entry["selector"] === "string" ? (entry["selector"] as string) : "",
            },
          ];
        });
  const highlights =
    sequence.length > 0
      ? sequence
      : screenshot === "" || !isHighlightBox(anomalyBox)
        ? []
        : [
            {
              screenshot,
              x: anomalyBox.x,
              y: anomalyBox.y,
              width: anomalyBox.width,
              height: anomalyBox.height,
              viewportWidth: anomalyBox.viewportWidth,
              viewportHeight: anomalyBox.viewportHeight,
              label: anomalyLabel,
              selector: anomalySelector,
            },
          ];
  return {
    findingId: `${result.probeId}-${index}`,
    category,
    title: result.title,
    whatHappened: result.humanSummary,
    whyItMatters: whyItMatters(kind),
    howReproduced: traceToSteps(result.pageUrl, result),
    pageUrl: result.pageUrl,
    severity: result.severity,
    probeId: result.probeId,
    screenshots: result.screenshots,
    standardReferences: result.standardReferences,
    highlights,
  };
}

/** Project probe results into human-readable findings. Pure and total. */
export function projectFindings(results: ProbeResult[]): ExplorationFinding[] {
  const findings: ExplorationFinding[] = [];
  let index = 0;
  for (const result of results) {
    if (result.status === "passed" || result.status === "not-applicable") continue;
    if (result.status === "failed" && result.probeId === "page-axe-scan") {
      const ruleIds = [
        ...new Set(
          result.evidence
            .filter((entry) => entry.kind === "axe-violation")
            .map((entry) => entry.data["ruleId"] as string),
        ),
      ];
      for (const ruleId of ruleIds) {
        findings.push(projectAxeRule(result, ruleId, index));
        index += 1;
      }
      continue;
    }
    if (result.status === "failed") {
      findings.push(projectSingle(result, "confirmed-failure", index));
      index += 1;
    } else if (result.status === "observed") {
      findings.push(projectSingle(result, "observation", index));
      index += 1;
    } else {
      // not-tested / inconclusive: report the gap honestly.
      findings.push(projectSingle(result, "not-tested", index));
      index += 1;
    }
  }
  return findings;
}

import type {
  ProbeResult,
  ReproAction,
  ReproElementRef,
  ReproductionPlan,
} from "@a11yforge/shared";

/**
 * Phase 9 — generic reproduction plans and verification replay.
 *
 * The repair is tested against the failure that created it: a
 * ReproductionPlan persisted from Phase 8 evidence (page route,
 * browser actions, assertions) is replayed against the repaired
 * application at the SAME relative location under a different origin.
 * No fixture selectors, no model-generated browser scripts.
 */

export class AmbiguousElementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousElementError";
  }
}

/** Minimal page surface needed for deterministic re-resolution. */
export interface ResolvablePage {
  findById(id: string): Promise<number>;
  findByDataAttribute(attr: string): Promise<number>;
  findByRoleAndName(role: string, name: string): Promise<number>;
  findBySelector(selector: string): Promise<number>;
}

/**
 * Build a reproduction plan from the probe result that produced a
 * finding. Actions derive from the recorded action trace; assertions
 * from the probe title/evidence; the page path from the observed URL.
 */
export function buildReproductionPlan(args: {
  planId: string;
  findingId: string;
  probe: ProbeResult;
}): ReproductionPlan {
  const { planId, findingId, probe } = args;
  const pagePath = relativePagePath(probe.pageUrl);
  const actions: ReproAction[] = [];
  let seq = 0;
  const push = (action: Omit<ReproAction, "seq">): void => {
    actions.push({ ...action, seq: seq++ });
  };

  for (const step of probe.actionTrace) {
    const text = `${step.action} ${step.detail}`.toLowerCase();
    if (/navigat|goto|opened|loaded/.test(text)) {
      push({ action: "navigate", key: "", target: null, detail: step.detail });
    } else if (/shift\+tab|shift-tab/.test(text)) {
      push({ action: "shift-tab", key: "Shift+Tab", target: null, detail: step.detail });
    } else if (/\btab\b/.test(text) && /press|key/.test(text)) {
      push({ action: "tab", key: "Tab", target: null, detail: step.detail });
    } else if (/escape/.test(text)) {
      push({ action: "press-key", key: "Escape", target: null, detail: step.detail });
    } else if (/click|activat|press/.test(text)) {
      push({ action: "safe-click", key: "", target: null, detail: step.detail });
    } else if (/focus/.test(text)) {
      push({ action: "focus", key: "", target: null, detail: step.detail });
    }
  }
  if (actions.length === 0) {
    push({ action: "inspect", key: "", target: null, detail: "Re-check the reported element." });
  }

  const assertions = [probe.title];
  for (const item of probe.evidence.slice(0, 5)) {
    const data = item.data as Record<string, unknown>;
    if (typeof data.ruleId === "string" && data.ruleId !== "") {
      assertions.push(`axe rule ${data.ruleId} reports no violation on the affected element`);
      break;
    }
  }
  const axeRules = probe.evidence
    .map((item) => (item.data as Record<string, unknown>).ruleId)
    .filter((r): r is string => typeof r === "string" && r !== "")
    .slice(0, 5);

  return {
    planId,
    findingId,
    pageUrl: probe.pageUrl,
    pagePath,
    initialConditions: [`Start at the application root of the verified build.`],
    actions,
    assertions,
    axeRules,
  };
}

/** `/settings/profile?tab=a11y` from `https://example.com/settings/profile?tab=a11y`. */
export function relativePagePath(pageUrl: string): string {
  try {
    const parsed = new URL(pageUrl);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return path === "" ? "/" : path;
  } catch {
    return "/";
  }
}

/**
 * Map the original failure location onto the verification origin.
 * The relative location is preserved; only the origin changes. Never
 * silently tests a different page: callers fail when the repaired app
 * cannot serve that location.
 */
export function verificationUrlFor(
  plan: ReproductionPlan,
  verificationOrigin: string,
): string {
  const origin = verificationOrigin.replace(/\/+$/, "");
  return `${origin}${plan.pagePath.startsWith("/") ? plan.pagePath : `/${plan.pagePath}`}`;
}

/**
 * Deterministically re-resolve an element in the repaired DOM.
 * Tries stable references in safety order; ambiguous matches fail
 * instead of letting anything guess.
 */
export async function resolveElement(
  page: ResolvablePage,
  ref: ReproElementRef,
): Promise<void> {
  if (ref.elementId !== "") {
    const count = await page.findById(ref.elementId);
    if (count === 1) return;
    if (count > 1) {
      throw new AmbiguousElementError(
        `Element id "${ref.elementId}" matched ${String(count)} nodes in the repaired page.`,
      );
    }
  }
  if (ref.dataAttribute !== "") {
    const count = await page.findByDataAttribute(ref.dataAttribute);
    if (count === 1) return;
    if (count > 1) {
      throw new AmbiguousElementError(
        `Data attribute "${ref.dataAttribute}" matched ${String(count)} nodes in the repaired page.`,
      );
    }
  }
  if (ref.role !== "" && ref.accessibleName !== "") {
    const count = await page.findByRoleAndName(ref.role, ref.accessibleName);
    if (count === 1) return;
    if (count > 1) {
      throw new AmbiguousElementError(
        `Role "${ref.role}" with name "${ref.accessibleName}" matched ${String(count)} nodes in the repaired page.`,
      );
    }
  }
  if (ref.replaySelector !== "") {
    const count = await page.findBySelector(ref.replaySelector);
    if (count === 1) return;
    if (count > 1) {
      throw new AmbiguousElementError(
        "The repaired page matched several elements for the recorded reference.",
      );
    }
  }
  throw new AmbiguousElementError(
    "The recorded element could not be re-resolved in the repaired page.",
  );
}

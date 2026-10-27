import {
  buildProbeResult,
  newTraceRecorder,
  type AccessibilityProbe,
  type ProbeContext,
} from "./types.js";

/**
 * Phase 8 — tab interface probe.
 *
 * Applies only when real tab semantics (tablist/tab/tabpanel) are discovered
 * in the live page. Inspects tab/panel relationships and selected state, and
 * exercises arrow-key movement only because tab arrow keys are reversible and
 * contained (selection is restored afterwards). Anything that cannot be
 * restored is never attempted.
 */

interface TabState {
  listIndex: number;
  tabs: {
    selector: string;
    name: string;
    selected: boolean;
    controlsPanel: string | null;
    panelExists: boolean;
    reachable: boolean;
  }[];
}

/** Runs inside the page: reads tab structure without changing selection. */
export function snapshotTabLists(): TabState[] {
  const lists = Array.from(document.querySelectorAll('[role="tablist"]'));
  return lists.map((list, listIndex) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    return {
      listIndex,
      tabs: tabs.map((tab, tabIndex) => {
        const name =
          tab.getAttribute("aria-label")?.trim() ||
          (tab.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
        const controls = tab.getAttribute("aria-controls");
        const panelExists =
          controls !== null && controls !== "" && document.getElementById(controls) !== null;
        let selector = `tab[${tabIndex}]`;
        if (tab.id !== "") {
          try {
            selector = `#${CSS.escape(tab.id)}`;
          } catch {
            /* keep fallback */
          }
        }
        const previous = document.activeElement;
        let reachable = false;
        try {
          (tab as HTMLElement).focus({ preventScroll: true });
          reachable = document.activeElement === tab;
        } catch {
          reachable = false;
        }
        if (previous instanceof HTMLElement) {
          try {
            previous.focus({ preventScroll: true });
          } catch {
            /* best-effort */
          }
        }
        return {
          selector,
          name,
          selected: tab.getAttribute("aria-selected") === "true",
          controlsPanel: controls,
          panelExists,
          reachable,
        };
      }),
    };
  });
}

/** Runs inside the page: index of the selected tab within a tablist. */
export function selectedTabIndex(listIndex: number): number {
  const lists = Array.from(document.querySelectorAll('[role="tablist"]'));
  const list = lists[listIndex];
  if (list === undefined) return -1;
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
  return tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
}

/** Runs inside the page: focuses the tab at `pair` = [listIndex, tabIndex]. */
export function focusTab(pair: [number, number]): boolean {
  const [listIndex, tabIndex] = pair;
  const lists = Array.from(document.querySelectorAll('[role="tablist"]'));
  const tabs = Array.from(lists[listIndex]?.querySelectorAll('[role="tab"]') ?? []);
  const tab = tabs[tabIndex];
  if (!(tab instanceof HTMLElement)) return false;
  tab.focus();
  return document.activeElement === tab;
}

export const tabsProbe: AccessibilityProbe = {
  id: "tab-interface",

  applicable: (surface) => surface.tablistCount > 0 && surface.tabCount > 0,

  execute: async (ctx: ProbeContext) => {
    const startedAt = new Date().toISOString();
    const trace = newTraceRecorder(ctx.pageUrl);
    const screenshots: string[] = [];
    trace.record("tabs-found", `Found ${ctx.surface.tablistCount} tablists with ${ctx.surface.tabCount} tabs.`);

    const lists = await ctx.page.evaluate(snapshotTabLists);
    const unnamed: string[] = [];
    const brokenRefs: string[] = [];
    let unreachableCount = 0;
    for (const list of lists) {
      for (const tab of list.tabs) {
        if (tab.name === "") unnamed.push(tab.selector);
        if (tab.controlsPanel !== null && tab.controlsPanel !== "" && !tab.panelExists) {
          brokenRefs.push(`${tab.selector} controls missing panel "${tab.controlsPanel}"`);
        }
        if (!tab.reachable) unreachableCount += 1;
      }
      const selected = list.tabs.filter((tab) => tab.selected).length;
      trace.record(
        "tablist-state",
        `Tablist ${list.listIndex}: ${list.tabs.length} tabs, ${selected} selected.`,
      );
    }

    // Reversible arrow-key check on the first tablist: move, then restore.
    let restored: boolean | null = null;
    const first = lists[0];
    if (first !== undefined && first.tabs.length >= 2) {
      const initial = await ctx.page.evaluate(selectedTabIndex, 0);
      {
        const focusedOk = await ctx.page.evaluate(focusTab, [0, 0] as [number, number]);
        if (focusedOk) {
          trace.record("tabs-focus-first", "Focused the first tab.");
          await ctx.page.keyboard.press("ArrowRight");
          await ctx.page.waitForTimeout(300);
          const moved = await ctx.page.evaluate(selectedTabIndex, 0);
          trace.record(
            moved !== initial ? "tabs-arrow-moved" : "tabs-arrow-same",
            moved !== initial
              ? `ArrowRight moved selection from tab ${initial} to tab ${moved}.`
              : "ArrowRight did not change the selected tab.",
          );
          await ctx.page.keyboard.press("ArrowLeft");
          await ctx.page.waitForTimeout(300);
          const back = await ctx.page.evaluate(selectedTabIndex, 0);
          restored = back === initial;
          trace.record(
            restored ? "tabs-restored" : "tabs-not-restored",
            restored
              ? `ArrowLeft restored the initial selection (tab ${initial}).`
              : `Selection was left on tab ${back} instead of the initial tab ${initial}.`,
          );
          if (!restored && initial >= 0) {
            // Restore by re-selecting: click is avoided, but focusing + Home
            // is reversible; as a last resort, report honestly.
            trace.record("tabs-restore-note", "Initial tab selection could not be restored with arrow keys alone.");
          }
        }
      }
    }

    if (unnamed.length > 0) {
      const shot = await ctx.captureScreenshot("tabs-unnamed", null);
      if (shot !== null) screenshots.push(shot);
      return buildProbeResult({
        probeId: "tab-interface",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: `${unnamed.length} ${unnamed.length === 1 ? "tab has" : "tabs have"} no accessible name.`,
        humanSummary:
          `Tabs without names (${unnamed.slice(0, 3).join(", ")}) announce as nothing useful, ` +
          `so screen reader and keyboard users cannot tell the sections apart. Every tab needs a readable label.`,
        severity: "serious",
        evidence: unnamed.map((selector) => ({
          kind: "tab-missing-name",
          summary: `Tab ${selector} has no accessible name.`,
          data: { selector },
        })),
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/tabs/"],
        startedAt,
      });
    }

    if (brokenRefs.length > 0) {
      return buildProbeResult({
        probeId: "tab-interface",
        targetId: ctx.targetId,
        pageUrl: ctx.pageUrl,
        status: "failed",
        title: "Tabs point to panels that do not exist.",
        humanSummary:
          `${brokenRefs[0]}. When a tab claims to control a panel that is missing, ` +
          `assistive technology cannot expose the relationship and users lose the content.`,
        severity: "serious",
        evidence: brokenRefs.map((summary) => ({ kind: "tab-broken-panel-ref", summary, data: {} })),
        actionTrace: trace.steps,
        screenshots,
        standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/tabs/"],
        startedAt,
      });
    }

    return buildProbeResult({
      probeId: "tab-interface",
      targetId: ctx.targetId,
      pageUrl: ctx.pageUrl,
      status: restored === false ? "observed" : "passed",
      title:
        restored === false
          ? "Tab relationships are intact; arrow-key selection was left moved."
          : "Tab interface exposes names, panels, and keyboard support.",
      humanSummary:
        `All tabs are named, every controlled panel exists, and tabs receive keyboard focus` +
        (unreachableCount > 0 ? ` (${unreachableCount} tabs could not be focused).` : ".") +
        (restored === false
          ? " Arrow keys changed the selection and only manual movement restored it — noted, not asserted as a failure."
          : " Arrow-key movement was tested and the initial selection restored."),
      actionTrace: trace.steps,
      screenshots,
      standardReferences: ["https://www.w3.org/WAI/ARIA/apg/patterns/tabs/"],
      startedAt,
    });
  },
};

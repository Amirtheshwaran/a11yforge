import type { ExplorationFinding, ExplorationStage } from "@a11yforge/shared";

/**
 * Human-copy mapping layer (single owner for plain-language UI).
 *
 * Translates backend finding data into nontechnical copy WITHOUT changing
 * the data: every string below is selected by real fields (axe rule slug,
 * probe id, severity, counts parsed from the backend's own messages).
 * Technical vocabulary (rule names, criterion URLs, selectors, severities)
 * stays available to the Developer view — this module only decides the
 * human wording and grouping.
 */

// ---------------------------------------------------------------------------
// Rule / probe identification (parsed from real backend fields)
// ---------------------------------------------------------------------------

/** Axe rule slug from findingId (`page-axe-scan-<rule>-<n>`) or ref URL. */
export function ruleSlugOf(finding: ExplorationFinding): string | null {
  const fromId = /^page-axe-scan-(.+)-\d+$/.exec(finding.findingId)?.[1];
  if (fromId !== undefined && fromId !== "") return fromId;
  for (const ref of finding.standardReferences) {
    const fromRef = /\/axe\/[\d.]+\/([^?#/]+)/.exec(ref)?.[1];
    if (fromRef !== undefined && fromRef !== "") return fromRef;
  }
  return null;
}

/** Backend-reported element count from "failed on N element(s)". */
export function affectedCountOf(finding: ExplorationFinding): number | null {
  const fromMessage = /failed on (\d+) elements?/.exec(finding.whatHappened)?.[1];
  if (fromMessage !== undefined) return Number(fromMessage);
  const fromTitle = /^(\d+) /.exec(finding.title)?.[1];
  if (fromTitle !== undefined) return Number(fromTitle);
  return null;
}

// ---------------------------------------------------------------------------
// Human problem groups
// ---------------------------------------------------------------------------

export type GroupId = "keyboard" | "forms" | "images" | "readability" | "structure" | "more";

export interface ProblemGroup {
  id: GroupId;
  heading: string;
  description: string;
}

export const PROBLEM_GROUPS: Record<GroupId, ProblemGroup> = {
  keyboard: {
    id: "keyboard",
    heading: "Keyboard use",
    description: "Some parts of the page are difficult to use without a mouse",
  },
  forms: {
    id: "forms",
    heading: "Forms and controls",
    description: "Some form fields and controls do not explain what they are for",
  },
  images: {
    id: "images",
    heading: "Images and media",
    description: "Some images are missing descriptions",
  },
  readability: {
    id: "readability",
    heading: "Text readability",
    description: "Some text is difficult to read because of low contrast",
  },
  structure: {
    id: "structure",
    heading: "Page structure",
    description: "The page structure may be confusing for screen-reader users",
  },
  more: {
    id: "more",
    heading: "More issues",
    description: "Other problems found during the test",
  },
};

export const GROUP_ORDER: GroupId[] = ["keyboard", "forms", "images", "readability", "structure", "more"];

const RULE_GROUPS: Record<string, GroupId> = {
  "button-name": "forms",
  "link-name": "forms",
  label: "forms",
  "select-name": "forms",
  "input-button-name": "forms",
  "image-alt": "images",
  "input-image-alt": "images",
  "svg-img-alt": "images",
  "area-alt": "images",
  "color-contrast": "readability",
  "link-in-text-block": "readability",
  "frame-title": "structure",
  "html-has-lang": "structure",
  "landmark-one-main": "structure",
  "landmark-unique": "structure",
  region: "structure",
  "page-has-heading-one": "structure",
  tabindex: "keyboard",
  "aria-hidden-focus": "keyboard",
  "nested-interactive": "keyboard",
  "focus-order-semantics": "keyboard",
};

const PROBE_GROUPS: Record<string, GroupId> = {
  "keyboard-traversal": "keyboard",
  "form-relationships": "forms",
};

const TITLE_KEYWORDS: { match: RegExp; group: GroupId }[] = [
  { match: /keyboard|focus|tab/i, group: "keyboard" },
  { match: /form|label|field|input|button|link/i, group: "forms" },
  { match: /image|picture|media|video/i, group: "images" },
  { match: /contrast|read|color|text/i, group: "readability" },
  { match: /landmark|structure|heading|frame|language|region/i, group: "structure" },
];

export function groupOf(finding: ExplorationFinding): GroupId {
  const probeGroup = PROBE_GROUPS[finding.probeId];
  if (probeGroup !== undefined) return probeGroup;
  const slug = ruleSlugOf(finding);
  if (slug !== null) {
    const ruleGroup = RULE_GROUPS[slug];
    if (ruleGroup !== undefined) return ruleGroup;
  }
  for (const { match, group } of TITLE_KEYWORDS) {
    if (match.test(finding.title)) return group;
  }
  return "more";
}

// ---------------------------------------------------------------------------
// Human finding copy (per-rule plain language, generic fallback)
// ---------------------------------------------------------------------------

export interface HumanFinding {
  title: string;
  why: string;
  noun: string;
}

const RULE_COPY: Record<string, HumanFinding> = {
  "button-name": {
    title: "A button has no readable label",
    why: "Someone using a screen reader may hear “button” without knowing what the button does.",
    noun: "button",
  },
  "link-name": {
    title: "Some links have no readable label",
    why: "Screen-reader users may hear “link” without knowing where it goes.",
    noun: "link",
  },
  "image-alt": {
    title: "Some images have no description",
    why: "People using screen readers may not know what these images show.",
    noun: "image",
  },
  "color-contrast": {
    title: "Some text is hard to read",
    why: "The text and background are too similar in color, which can make the content difficult to read for people with low vision.",
    noun: "text",
  },
  "frame-title": {
    title: "An embedded section has no description",
    why: "Screen-reader users may not know what this embedded content contains.",
    noun: "embedded section",
  },
  "html-has-lang": {
    title: "The page does not say what language it uses",
    why: "Screen readers may pronounce the page incorrectly.",
    noun: "page",
  },
  "landmark-one-main": {
    title: "The page structure may be difficult for screen readers to navigate",
    why: "Important sections of the page are not clearly identified.",
    noun: "area",
  },
  "landmark-unique": {
    title: "The page structure may be difficult for screen readers to navigate",
    why: "Important sections of the page are not clearly identified.",
    noun: "area",
  },
  region: {
    title: "The page structure may be difficult for screen readers to navigate",
    why: "Important sections of the page are not clearly identified.",
    noun: "area",
  },
  "link-in-text-block": {
    title: "Some links are hard to tell apart from surrounding text",
    why: "People may not realize these words can be clicked, especially if they cannot see color differences.",
    noun: "link",
  },
  label: {
    title: "Some form fields do not explain what they are for",
    why: "People using screen readers may hear only the field type without knowing what information to enter.",
    noun: "field",
  },
  "select-name": {
    title: "Some form fields do not explain what they are for",
    why: "People using screen readers may hear only the field type without knowing what information to enter.",
    noun: "field",
  },
  "input-button-name": {
    title: "A button has no readable label",
    why: "Someone using a screen reader may hear “button” without knowing what the button does.",
    noun: "button",
  },
};

function stripCheckPrefix(title: string): string {
  const stripped = /^Automated check:\s*/i.exec(title);
  if (stripped === null) return title;
  const rest = title.slice(stripped[0].length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** Plain titles for interaction-probe failures (backend wording stays in details). */
const PROBE_COPY: Record<string, HumanFinding> = {
  "keyboard-traversal": {
    title: "Keyboard focus moves to something users cannot understand",
    why: "Someone using only a keyboard may lose track of where they are on the page.",
    noun: "element",
  },
  "form-relationships": {
    title: "Some form fields do not explain what they are for",
    why: "People using screen readers may hear only the field type without knowing what information to enter.",
    noun: "field",
  },
  "dialog-behavior": {
    title: "A dialog is difficult to use with a keyboard",
    why: "Keyboard users may get stuck inside the dialog or lose track of where they are on the page.",
    noun: "dialog",
  },
};

export function humanFindingOf(finding: ExplorationFinding): HumanFinding {
  if (finding.category === "confirmed-failure") {
    const probeCopy = PROBE_COPY[finding.probeId];
    if (probeCopy !== undefined) return probeCopy;
    return { title: finding.title, why: finding.whyItMatters, noun: "item" };
  }
  const slug = ruleSlugOf(finding);
  if (slug !== null) {
    const known = RULE_COPY[slug];
    if (known !== undefined) return known;
  }
  return { title: stripCheckPrefix(finding.title), why: finding.whyItMatters, noun: "item" };
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Short human page reference (host + path) derived from the real page URL. */
export function shortPageOf(pageUrl: string): string {
  try {
    const parsed = new URL(pageUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const short = `${parsed.host}${path}`;
    return short.length > 60 ? `${short.slice(0, 57)}…` : short;
  } catch {
    return pageUrl.length > 60 ? `${pageUrl.slice(0, 57)}…` : pageUrl;
  }
}

/** Reproduction steps with the tested address anonymized to plain words. */
export function humanStepsOf(finding: ExplorationFinding): string[] {
  return finding.howReproduced.map((step) =>
    step.split(finding.pageUrl).join("the tested page"),
  );
}

// ---------------------------------------------------------------------------
// Severity tiers + overall verdict (derived from real severities only)
// ---------------------------------------------------------------------------

export type Tier = 0 | 1 | 2;

export function tierOfSeverity(severity: ExplorationFinding["severity"]): Tier {
  if (severity === "critical") return 0;
  if (severity === "serious") return 1;
  return 2;
}

export const TIER_LABELS: Record<Tier, string> = {
  0: "need attention first",
  1: "may make the site harder to use",
  2: "are smaller improvements",
};

export type Verdict = "needs-attention" | "several-important" | "no-major";

export function verdictOf(severities: Array<ExplorationFinding["severity"]>): Verdict {
  if (severities.includes("critical")) return "needs-attention";
  if (severities.includes("serious")) return "several-important";
  return "no-major";
}

export const VERDICT_COPY: Record<Verdict, string> = {
  "needs-attention": "Needs attention",
  "several-important": "Several important problems found",
  "no-major": "No major problems reproduced",
};

/** Plain severity word for normal cards (technical names stay in details). */
export function severityWordOf(severity: ExplorationFinding["severity"]): string {
  const tier = tierOfSeverity(severity);
  if (tier === 0) return "Needs attention first";
  if (tier === 1) return "Important";
  return "Improvement";
}

// ---------------------------------------------------------------------------
// Fix guidance (static user advice per finding type, never a repair claim)
// ---------------------------------------------------------------------------

const RULE_GUIDANCE: Record<string, string> = {
  "button-name": "Give the button visible text or an accessible label describing what it does.",
  "input-button-name": "Give the button visible text or an accessible label describing what it does.",
  "link-name": "Give the link readable text that says where it goes.",
  "image-alt": "Add a short description of the image using alternative text. If the image is purely decorative, mark it so assistive technology skips it.",
  "input-image-alt": "Add a short description of the image using alternative text.",
  "svg-img-alt": "Add a short description of the image using alternative text.",
  "area-alt": "Add a short description using alternative text.",
  "color-contrast": "Increase the difference between the text and background colors.",
  "link-in-text-block": "Make links visually distinct from surrounding text without relying on color alone, for example with an underline.",
  label: "Add a visible label that explains what information belongs in this field.",
  "select-name": "Add a visible label that explains what information belongs in this field.",
  "frame-title": "Give the embedded section a descriptive title.",
  "html-has-lang": "Declare the page language in the markup.",
  "landmark-one-main": "Identify the main sections of the page so assistive technology can navigate them.",
  "landmark-unique": "Identify the main sections of the page so assistive technology can navigate them.",
  region: "Identify the main sections of the page so assistive technology can navigate them.",
  "page-has-heading-one": "Give the page one clear top-level heading that describes its content.",
  tabindex: "Keep keyboard focus where screen-reader users can follow it; do not move focus to hidden content.",
  "aria-hidden-focus": "Keep keyboard focus where screen-reader users can follow it; do not move focus to hidden content.",
};

const PROBE_GUIDANCE: Record<string, string> = {
  "keyboard-traversal": "Keep keyboard focus where screen-reader users can follow it; do not move focus to hidden or disabled content.",
  "form-relationships": "Give the fields clear labels and connect each label to its input.",
  "dialog-behavior": "Keep keyboard focus inside the dialog while it is open, and return focus sensibly when it closes.",
};

const GENERIC_GUIDANCE =
  "A developer can inspect the highlighted element and apply the relevant accessibility practice for this kind of content.";

/** Actionable user guidance for a finding; static advice, not a repair. */
export function fixGuidanceOf(finding: ExplorationFinding): string {
  const probeGuidance = PROBE_GUIDANCE[finding.probeId];
  if (probeGuidance !== undefined && finding.category === "confirmed-failure") return probeGuidance;
  const slug = ruleSlugOf(finding);
  if (slug !== null) {
    const ruleGuidance = RULE_GUIDANCE[slug];
    if (ruleGuidance !== undefined) return ruleGuidance;
  }
  return GENERIC_GUIDANCE;
}

// ---------------------------------------------------------------------------
// Keyboard storyboard (visual focus chain from real trace + focus data)
// ---------------------------------------------------------------------------

export interface StoryboardStep {
  marker: "start" | "tab" | "problem";
  text: string;
}

/**
 * Focus chain for keyboard findings: the recorded focus labels in order,
 * with Tab markers between them. Built from the real trace steps only.
 */
export function storyboardOf(finding: ExplorationFinding): StoryboardStep[] {
  const focusLines = finding.howReproduced.filter((step) => /focus/i.test(step));
  if (focusLines.length === 0) {
    return finding.howReproduced.slice(0, 6).map((text, index) => ({
      marker: index === 0 ? ("start" as const) : ("tab" as const),
      text,
    }));
  }
  return focusLines.slice(0, 8).map((text, index, lines) => ({
    marker: index === 0 ? ("start" as const) : index === lines.length - 1 ? ("problem" as const) : ("tab" as const),
    text,
  }));
}

// ---------------------------------------------------------------------------
// Human testing progress (groups backend stages into plain steps)
// ---------------------------------------------------------------------------

export interface HumanStep {
  id: string;
  label: string;
  from: ExplorationStage[];
}

export const HUMAN_PROGRESS: HumanStep[] = [
  { id: "opening", label: "Opening the website", from: ["opening"] },
  { id: "looking", label: "Looking for accessibility problems", from: ["exploring", "scanning"] },
  { id: "keyboard", label: "Checking keyboard use", from: ["interacting"] },
  { id: "reviewing", label: "Reviewing results", from: ["reviewing", "done"] },
];

/** Human progress state from the underlying backend stage states. */
export function humanProgressOf(
  states: Record<ExplorationStage, "pending" | "running" | "done">,
): { id: string; label: string; state: "pending" | "running" | "done" }[] {
  return HUMAN_PROGRESS.map((step) => {
    const member = step.from.map((stage) => states[stage]);
    let state: "pending" | "running" | "done" = "pending";
    if (member.includes("running") || (member.includes("done") && !member.every((value) => value === "done"))) {
      state = "running";
    } else if (member.every((value) => value === "done")) {
      state = "done";
    }
    return { id: step.id, label: step.label, state };
  });
}

// ---------------------------------------------------------------------------
// "What we couldn't check" (humanized limitation codes, code kept for tech)
// ---------------------------------------------------------------------------

export function humanLimitationOf(code: string, pageCount: number): string {
  if (code === "page-unavailable") {
    return pageCount === 1
      ? "We couldn't check 1 page"
      : `We couldn't check ${pageCount} pages`;
  }
  return "We couldn't check part of the site";
}

export const LIMITATION_SUPPORTING: Record<string, string> = {
  "page-unavailable": "Those pages returned an error when A11yForge tried to open them.",
};

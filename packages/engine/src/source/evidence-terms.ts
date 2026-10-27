import type { PageSurface, ProbeResult } from "@a11yforge/shared";

/**
 * Phase 9 — deterministic evidence fingerprints and search terms.
 *
 * Search terms come ONLY from browser evidence observed in Phase 8:
 * element ids, accessible names, roles, text, aria attributes, class
 * tokens, stable data-* values, bounded outerHTML, nearby context, and
 * the page route. The model is never asked what to search for.
 */

export interface EvidenceFingerprint {
  /** Which evidence produced this fingerprint (probe kind / surface). */
  kind: string;
  elementId: string;
  accessibleName: string;
  role: string;
  text: string;
  ariaLabel: string;
  ariaControls: string;
  ariaDescribedBy: string;
  classTokens: string[];
  dataAttributes: string[];
  outerHtml: string;
  nearbyText: string;
  pageRoute: string;
}

export interface WeightedTerm {
  term: string;
  /** Evidence kinds this term was observed in (for match reasons). */
  kinds: string[];
}

const MAX_TERM_LENGTH = 64;
const MIN_TERM_LENGTH = 2;
const MAX_TERMS = 40;

/**
 * Generic English stop-words: prose glue that matches everywhere and
 * explains nothing about source location. Language-level, never
 * application specific. Dropped at generation, not merely down-weighted.
 */
export const EVIDENCE_STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "by", "of", "on", "in", "to", "for", "with", "and", "or", "as",
  "at", "from", "it", "its", "this", "that", "these", "those",
  "you", "your", "we", "they", "he", "she", "me", "us", "them",
  "have", "has", "had", "do", "does", "did", "will", "would",
  "should", "must", "can", "cannot", "one", "all", "page",
  "element", "attribute", "ensure", "not", "no",
]);

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function classTokensOf(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(/[\s_]+/).filter((t) => t.length >= MIN_TERM_LENGTH);
}

/** Split free text into identifier-like tokens (letters/digits/`-`/`_`). */
function identifierTokens(text: string): string[] {
  const found = text.match(/[A-Za-z][A-Za-z0-9_-]{1,63}/g) ?? [];
  return found.filter(
    (t) => t.length >= MIN_TERM_LENGTH && t.length <= MAX_TERM_LENGTH,
  );
}

function pageRouteOf(pageUrl: string): string {
  try {
    const parsed = new URL(pageUrl);
    return `${parsed.pathname}${parsed.search}`.slice(0, 200);
  } catch {
    return "";
  }
}

/**
 * Collect fingerprints from one probe result plus optional related
 * surface element references. Reads only documented evidence-data keys
 * (`selector`, `html`, `ruleId`, …) and surface ref fields generically:
 * any string value is scanned for identifier-like tokens, so new probe
 * kinds work without code changes.
 */
export function collectFingerprints(args: {
  probe: ProbeResult;
  surfaces?: PageSurface[];
}): EvidenceFingerprint[] {
  const { probe, surfaces = [] } = args;
  const out: EvidenceFingerprint[] = [];
  const route = pageRouteOf(probe.pageUrl);

  for (const item of probe.evidence) {
    const data = item.data as Record<string, unknown>;
    const selector = asText(data.selector);
    const html = asText(data.html ?? data.outerHtml ?? data.outerHTML);
    const idFromSelector = /#([A-Za-z0-9_-]+)/.exec(selector)?.[1] ?? "";
    const idAttr = asText(data.elementId ?? data.id);
    out.push({
      kind: String(item.kind),
      elementId: idFromSelector || idAttr,
      accessibleName: asText(data.accessibleName ?? data.name),
      role: asText(data.role),
      text: asText(data.text ?? data.help),
      ariaLabel: asText(data.ariaLabel ?? data["aria-label"]),
      ariaControls: asText(data.ariaControls ?? data["aria-controls"]),
      ariaDescribedBy: asText(
        data.ariaDescribedBy ?? data["aria-describedby"],
      ),
      classTokens: classTokensOf(
        data.classTokens ?? data.class ?? data.className,
      ),
      dataAttributes: [
        asText(data.dataAttribute),
        ...Object.entries(data)
          .filter(([k]) => k.startsWith("data-"))
          .map(([, v]) => asText(v)),
      ].filter((s) => s.length > 0),
      outerHtml: html.slice(0, 2000),
      nearbyText: asText(data.nearbyText ?? data.failureSummary).slice(0, 500),
      pageRoute: route,
    });
  }

  // Surface refs: role + accessible name + id + data attribute + fingerprint.
  for (const surface of surfaces) {
    if (surface.pageUrl !== probe.pageUrl) continue;
    const refs = [
      ...surface.controls.map((c) => c.ref),
      ...surface.dialogs,
    ];
    for (const ref of refs) {
      if (ref.elementId === "" && ref.accessibleName === "") continue;
      out.push({
        kind: "surface-ref",
        elementId: ref.elementId,
        accessibleName: ref.accessibleName,
        role: ref.role,
        text: "",
        ariaLabel: "",
        ariaControls: "",
        ariaDescribedBy: "",
        classTokens: [],
        dataAttributes: ref.dataAttribute === "" ? [] : [ref.dataAttribute],
        outerHtml: ref.fingerprint.slice(0, 2000),
        nearbyText: "",
        pageRoute: route,
      });
    }
  }
  return out;
}

/**
 * Generate deterministic search terms from fingerprints.
 * Pure function of the evidence: sorted, de-duplicated, bounded.
 */
export function generateSearchTerms(
  fingerprints: EvidenceFingerprint[],
): WeightedTerm[] {
  const byTerm = new Map<string, Set<string>>();
  const add = (term: string, kind: string): void => {
    const clean = term.trim();
    if (
      clean.length < MIN_TERM_LENGTH ||
      clean.length > MAX_TERM_LENGTH ||
      /^\d+$/.test(clean) ||
      EVIDENCE_STOPWORDS.has(clean.toLowerCase())
    ) {
      return;
    }
    let kinds = byTerm.get(clean);
    if (kinds === undefined) {
      kinds = new Set<string>();
      byTerm.set(clean, kinds);
    }
    kinds.add(kind);
  };

  for (const fp of fingerprints) {
    if (fp.elementId !== "") add(fp.elementId, `${fp.kind}:id`);
    if (fp.accessibleName !== "") {
      for (const token of identifierTokens(fp.accessibleName)) {
        add(token, `${fp.kind}:name`);
      }
      if (/^[A-Za-z0-9_-]{2,64}$/.test(fp.accessibleName.trim())) {
        add(fp.accessibleName.trim(), `${fp.kind}:name-exact`);
      }
    }
    if (fp.ariaLabel !== "") {
      for (const token of identifierTokens(fp.ariaLabel)) {
        add(token, `${fp.kind}:aria-label`);
      }
      if (/^[A-Za-z0-9 _-]{2,64}$/.test(fp.ariaLabel.trim())) {
        add(fp.ariaLabel.trim(), `${fp.kind}:aria-label-exact`);
      }
    }
    if (fp.ariaControls !== "") {
      add(fp.ariaControls.replace(/^#/, ""), `${fp.kind}:aria-controls`);
    }
    if (fp.ariaDescribedBy !== "") {
      for (const id of fp.ariaDescribedBy.split(/\s+/)) {
        if (id !== "") add(id.replace(/^#/, ""), `${fp.kind}:aria-describedby`);
      }
    }
    for (const token of fp.classTokens) {
      for (const part of token.split("-")) {
        if (part.length >= 4) add(part, `${fp.kind}:class`);
      }
      if (token.length >= 4 && token.includes("-")) {
        add(token, `${fp.kind}:class-exact`);
      }
    }
    for (const attr of fp.dataAttributes) {
      const match = /^([A-Za-z0-9_:-]+)(=(.*))?$/.exec(attr);
      if (match?.[1] !== undefined) add(match[1], `${fp.kind}:data-attr`);
      const value = match?.[3];
      if (value !== undefined && /^[A-Za-z0-9_-]{2,64}$/.test(value)) {
        add(value, `${fp.kind}:data-value`);
      }
    }
    for (const token of identifierTokens(fp.outerHtml)) {
      add(token, `${fp.kind}:html`);
    }
    for (const token of identifierTokens(fp.text)) {
      add(token, `${fp.kind}:text`);
    }
    for (const token of identifierTokens(fp.nearbyText)) {
      add(token, `${fp.kind}:context`);
    }
  }

  return [...byTerm.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(0, MAX_TERMS)
    .map(([term, kinds]) => ({
      term,
      kinds: [...kinds].sort(),
    }));
}

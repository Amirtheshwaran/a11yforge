/**
 * Phase 9 — generic deterministic term weighting.
 *
 * Not all evidence terms are equally useful. Weight comes from two
 * generic signals only: the evidence kind the term was observed in
 * (element ids and data attributes are more identifying than prose
 * tokens) and corpus rarity (a term appearing once in the repository
 * is more discriminative than one appearing 400 times). No
 * application-specific weights are encoded.
 */

/**
 * Generic low-signal tokens: common HTML/ARIA vocabulary that matches
 * everywhere. This list is language-level (elements, roles, generic
 * actions) — never application, route, or fixture specific.
 */
export const WEAK_TERMS: ReadonlySet<string> = new Set([
  "button",
  "close",
  "menu",
  "submit",
  "main",
  "dialog",
  "form",
  "input",
  "label",
  "link",
  "open",
  "save",
  "cancel",
  "next",
  "back",
  "continue",
  "email",
  "name",
  "text",
  "title",
  "content",
  "header",
  "footer",
  "nav",
  "section",
  "article",
  "div",
  "span",
  "image",
  "img",
  "icon",
  "true",
  "false",
  "null",
  "required",
  "invalid",
  "expanded",
  "selected",
  "checked",
  "disabled",
  "hidden",
  "active",
  "selected",
  "dialogue",
]);

/** Evidence-kind base weights (identifying power, not app knowledge). */
function kindBaseWeight(kind: string): number {
  if (kind.endsWith(":id")) return 3;
  if (kind.endsWith(":data-attr") || kind.endsWith(":data-value")) return 3;
  if (kind.endsWith(":name-exact") || kind.endsWith(":aria-label-exact")) {
    return 2.5;
  }
  if (kind.endsWith(":aria-controls") || kind.endsWith(":aria-describedby")) {
    return 2.5;
  }
  if (kind.endsWith(":name") || kind.endsWith(":aria-label")) return 2;
  if (kind.endsWith(":class-exact")) return 1.5;
  if (kind.endsWith(":class")) return 1;
  if (kind.endsWith(":html")) return 1;
  return 0.5;
}

/**
 * Deterministic weight for one term.
 *
 * @param kinds evidence kinds the term was observed in.
 * @param filesWithTerm number of repository files containing the term.
 * @param totalFiles number of indexed repository files.
 */
export function weightTerm(
  kinds: string[],
  filesWithTerm: number,
  totalFiles: number,
): number {
  const base = Math.max(...kinds.map(kindBaseWeight), 0.5);
  // Rarity: 1 + log(total / (1 + filesWithTerm)), floored at 1.
  const safeTotal = Math.max(totalFiles, 1);
  const rarity = 1 + Math.log(safeTotal / (1 + Math.max(filesWithTerm, 0)));
  return base * Math.max(rarity, 1);
}

/** Terms in the generic weak vocabulary, capped regardless of rarity. */
export function isWeakTerm(term: string): boolean {
  return WEAK_TERMS.has(term.toLowerCase());
}

/** Cap a weak term's contribution (it still counts, just weakly). */
export function capWeakWeight(term: string, weight: number): number {
  return isWeakTerm(term) ? Math.min(weight, 1.5) : weight;
}

import type {
  AccessibilityDiagnosis,
  EvidenceBundle,
} from "@a11yforge/shared";

/**
 * Phase 4 deterministic search-term extraction.
 *
 * Terms come ONLY from facts already known: selectors recorded in the
 * evidence bundle (modal region, focused elements) plus `#id` tokens stated
 * in the diagnosis text. No model is asked which files to search — the model
 * never searches the repository at all; it receives only the source context
 * this locator selects.
 *
 * Rules:
 * - `#foo` in any evidence selector or diagnosis field yields term `foo`.
 * - Evidence accessible names contribute their `#`-free text only when they
 *   already look like identifiers (letters, digits, `-`, `_`); free prose
 *   ("Shipping info") is ignored to avoid flooding the search.
 * - Terms shorter than 2 characters are dropped.
 * - Output is de-duplicated and sorted lexically, so repeated traces of the
 *   same inputs produce identical term lists.
 */
const ID_TOKEN_PATTERN = /#([A-Za-z0-9_-]+)/g;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{2,}$/;

function collectIdTokens(text: string, into: Set<string>): void {
  ID_TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ID_TOKEN_PATTERN.exec(text)) !== null) {
    const token = match[1];
    if (token !== undefined && token.length >= 2) {
      into.add(token);
    }
  }
}

export function extractSearchTerms(
  diagnosis: AccessibilityDiagnosis,
  bundle: EvidenceBundle,
): string[] {
  const terms = new Set<string>();

  // Selectors recorded by deterministic evidence: the strongest terms.
  collectIdTokens(bundle.expectedRegion, terms);
  collectIdTokens(bundle.actualFocus, terms);
  for (const item of bundle.items) {
    if (item.selector !== undefined) {
      collectIdTokens(item.selector, terms);
    }
    if (
      item.accessibleName !== undefined &&
      IDENTIFIER_PATTERN.test(item.accessibleName)
    ) {
      terms.add(item.accessibleName);
    }
    if (item.html !== undefined) {
      collectIdTokens(item.html, terms);
    }
  }

  // Ids restated in the diagnosis text (observed facts + strategy).
  collectIdTokens(diagnosis.observedFailure, terms);
  collectIdTokens(diagnosis.likelyCause, terms);
  collectIdTokens(diagnosis.recommendedRepairStrategy, terms);
  collectIdTokens(diagnosis.title, terms);
  collectIdTokens(diagnosis.summary, terms);

  return [...terms].sort();
}

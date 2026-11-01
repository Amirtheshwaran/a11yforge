# Evidence integrity audit

This audit covers production UI output and the source-inspection path. It
checks whether displayed results follow recorded browser and engine evidence.
It does not certify authorship or claim that a text search can prove the
absence of every misleading output.

## Removed or corrected

- Source inspection no longer constructs an illustrative storefront when a
  screenshot is missing. It displays an empty state, without mounting a 3D
  canvas. Two unused storefront and issue-marker prototypes were deleted.
- A selected finding uses its registered screenshot or a registered capture
  of its own page. An invalid finding cannot borrow another finding's image.
  Missing coordinates remain missing. Live tour chapters follow the same
  page-provenance restriction.
- Source candidates are described as ranked matches. The ranking score is
  not presented as a confidence percentage, and literal search is not
  described as AST analysis.
- Source tracing requires the selected finding's probe ID **and** page URL.
  Repeated probe IDs on other pages and unrelated failed checks are rejected.
- Scan and source-connection views no longer derive completion percentages
  from a few coarse frontend steps. Pending results do not display zero
  issues as a completed result. Failed and skipped stages retain those states.
- An empty, inconclusive, or untested set of probes cannot produce a clean
  accessibility verdict. Detailed results display recorded access limitations.
- The unavailable generic repair button was removed. The source-inspection
  CLI no longer claims a generic repair API flow is available when a model
  key is present; it exits with code 3 after inspection and states that no
  repair was proposed or verified.
- Removed invented website input examples, stale development-phase labels,
  and comments that merely narrated the source screen's markup.

## Intentional constants and recorded data

UI labels, animation parameters, schema enums, budgets, ranking thresholds,
and rule guidance remain ordinary application code. They do not establish
that a scanner found an issue or that a repair passed.

The controlled repair demo remains explicitly recorded. Its screenshots,
patch attempts, compiler results, rejection, revision, and verification are
read from saved artifacts. It is not substituted for a live website's scan.
Tests retain controlled inputs and mocks; environment examples retain
configuration instructions. The model integration remains documented.

## Validation

- Repository strict TypeScript and ESLint checks passed.
- All 83 web tests passed, covering screenshot provenance, untested results,
  stage failures/skips, and retired placeholder-content patterns.
- Seventeen focused engine tests passed across source evidence selection,
  search terms, ranking, fixture isolation, and the CLI inspection-only exit
  with a test model key present.
- The production web build passed.
- Browser checks verified the empty source state, a real saved Mars finding
  with its recorded screenshot and measured location, an invalid finding
  without a borrowed image, and the untested verdict for a saved sign-in wall.
- The empty source view was checked at a 390 × 844 browser viewport with no
  horizontal overflow. A fresh scan through the product form showed pending
  results before reporting three browser findings for `https://example.com/`
  (run `exp-1793510620387-a6607677`).

Generic hosted repair execution remains unavailable. Physical mobile-device
testing and public deployment remain separate work; neither is implied by
this audit.

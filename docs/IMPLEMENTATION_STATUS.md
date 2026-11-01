# A11yForge implementation status

Compiled on 1 November 2026. This report brings together the spatial experience,
live exploration, responsive work, documentation, and evidence-integrity cleanup.

## Product flow

The main page explains the app and accepts a website address. The demo page
shows the recorded repair story. A completed live website check opens its own
spatial tour, using evidence collected for that run.

| Area | Completed behavior |
| --- | --- |
| Spatial experience | Continuous scroll-driven chapters, one persistent scene, measured issue framing, screenshot crossfades, and reversible camera movement. |
| Demo | A recorded controlled-target failure, rejected first patch, revision, and verification, with original artifacts and explicitly identified supplemental browser replay geometry. |
| Live exploration | A bounded real-browser crawl, accessibility and interaction probes, page captures, findings, and explicit access limitations. |
| Page coverage | Captures taken before scanning; selectable captured pages, including visible sign-in and HTTP error pages. Saved completed evidence can be loaded after an API restart. |
| Source inspection | A selected finding can be traced into a public repository or trusted local source. Candidate files, snippets, ranking reasons, and ambiguity are displayed. Returning to results preserves the selected finding. |
| Responsive layout | Phone, tablet, landscape, and desktop viewport layouts; touch-sized controls, wrapping navigation, safe-area handling, and readable copy during chapter handoffs. |
| Rendering and motion | On-demand rendering, bounded pixel density, time-based smoothing, screenshot fitting, reduced motion, and full/lightweight spatial rendering. |
| Documentation | README with authentic app screenshots, setup commands, architecture, model configuration, deployment instructions, and explicit limitations. |

## Evidence-integrity cleanup

- Removed generated storefronts, invented source layers, arbitrary issue markers,
  and two unused production prototypes. Source inspection requires a real capture.
- Restricted finding screenshots to registered artifacts associated with the
  finding or its page. Missing findings and coordinates remain missing.
- Corrected source-probe selection to match both probe ID and page URL, preventing
  repeated probe IDs from mixing evidence across crawled pages.
- Presented source results as ranked candidates, rather than proven causes or
  confidence percentages. Removed the incorrect AST-search label.
- Removed derived scan percentages, premature zero-issue results, and the disabled
  generic repair action. Failed, skipped, and untested checks remain explicit.
- Corrected the source-inspection CLI's unavailable repair-flow claim. It reports
  inspection only and exits with code 3 even if a model key is present.
- Removed website input examples, stale phase labels, and markup-narration comments.
  Real limitations replace generic explanatory filler in detailed results.
- Added regression coverage for evidence selection, incomplete checks, stage
  outcomes, retired placeholder content, and the CLI's inspection-only behavior.

Ordinary configuration values, UI labels, animation settings, test inputs, and
recorded demo artifacts remain. These serve their stated purposes; they do not
stand in for live scanner output. The actual model integration remains documented.
See the [evidence integrity audit](evidence-integrity.md).

## Validation

| Check | Result |
| --- | --- |
| `pnpm build` | Passed across all six workspace packages. |
| `pnpm typecheck` | Passed across all workspaces. |
| `pnpm lint` | Passed repository-wide. |
| Web tests | 83 passed; zero failed. |
| Focused engine tests | 17 passed across source provenance, search terms, ranking, fixture isolation, and the source-inspection CLI. |
| Browser checks | Empty and invalid source selections; real Mars screenshot and measured location; untested sign-in-wall results in tour and detail views; empty source layout at 390 × 844. |
| Fresh browser scan | `https://example.com/` produced three findings through the product form; pending UI waited for results. Run: `exp-1793510620387-a6607677`. |

Earlier responsive and spatial validation is recorded in
[the spatial tour notes](spatial-tour.md). Browser viewport checks are not
physical iOS or Android device testing.

## Remaining scope

- Universal coverage is not possible: authentication, CAPTCHA, blocked navigation,
  and inaccessible pages can prevent capture or testing. An available screenshot
  does not establish that protected content was checked.
- Arbitrary-site repair execution is not connected to the public UI or CLI.
  The working live repair loop targets the controlled fixture and requires the
  server's model configuration; the recorded demo requires no model calls.
- Source matching can remain ambiguous. A match alone is not verification.
- A public deployment and physical-device testing remain outstanding. Local
  preview uses web port 3005 and API port 3006.

## Git milestones

All work is kept on `main`. Earlier milestones include continuous spatial tours
(`4e45843`), access-boundary captures (`23125d9`), broader captures and responsive
tours (`68ad080`), readable handoffs and finding restoration (`fb2eb01`), the
remaining fixes merged into main (`55ed9e5`), and the README with authentic previews
(`d1c6b03`). The evidence-integrity cleanup accompanies this report.

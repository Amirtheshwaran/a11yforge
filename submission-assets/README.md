# Submission asset provenance

All PNGs are unaltered captures of the running A11yForge production build. None are
Stitch mockups. Dimensions and SHA-256 digests are in [`manifest.json`](manifest.json),
along with the live scan's run identifier. Screenshots of the recorded repair show
run `2026-10-26T19-04-29-541Z-27affb`.

| File | What it shows | Evidence type |
| --- | --- | --- |
| `screenshots/01-landing.png` | Landing page | Product UI |
| `screenshots/02-live-scan.png` | MarsCommuter scan in progress | Live scan |
| `screenshots/03-spatial-results.png` | Spatial tour opening on the real capture | Live scan |
| `screenshots/04-show-me.png` | Low-contrast heading framed at its measured location | Live scan; the box is measured browser geometry |
| `screenshots/05-source-inspection.png` | Source inspection for that finding, with no repository connected | Live scan; makes no source claim |
| `screenshots/06-first-fix-rejected.png` | First Meta repair rejected, with the compiler's own lines | Recorded real repair |
| `screenshots/07-bounded-revision.png` | One bounded revision | Recorded real repair |
| `screenshots/08-verified.png` | Replay and gates passed | Recorded real repair |
| `screenshots/09-mobile-issue.png` | The same finding at a 390 × 844 browser viewport | Live scan; not a physical device |
| `screenshots/10-webgl-fallback.png` | The tour with WebGL made unavailable | Live scan; browser failure simulated |

`architecture.svg` is an explanatory diagram, not a product screenshot.
`browser-validation.json` is the machine-readable result of the browser QA run.

`video/a11yforge-demo.mp4` is the demo; see [its transcript](video/a11yforge-demo-transcript.md)
and [how it was made](../docs/DEMO_SCRIPT.md#how-this-cut-was-made).

`live-verification-2026-11-01/` holds the 1 November diagnosis verification through Baseten-hosted
Meta Muse Spark Open: the fresh browser scenario and its screenshots, the diagnosis, and the usage
record with the provider request ID. It covers diagnosis only and is separate from the recorded repair.

MarsCommuter's source was not repaired. Do not relabel either kind of evidence as the other.

# Submission asset provenance

All PNGs are unaltered captures of the running A11yForge production UI. They are not Stitch exports. PNG metadata and SHA-256 digests are recorded in `manifest.json`.

| File | What it shows | Evidence type |
| --- | --- | --- |
| `screenshots/01-landing.png` | Current landing and conceptual inspection preview | Product UI; the hero preview is illustrative, not scan proof |
| `screenshots/02-live-results.png` | MarsCommuter scan results | Live deterministic scan, one page, 12 findings, three captured screenshots |
| `screenshots/03-show-me.png` | Selected low-contrast text and measured scene focus | Same live scan |
| `screenshots/04-source-trace.png` | Source trace and patch evidence | Recorded real Broken Shop repair; not MarsCommuter source |
| `screenshots/05-first-fix-rejected.png` | Attempt 1 and TS18048 rejection | Recorded real repair |
| `screenshots/06-verified.png` | Accepted revision and deterministic gate table | Recorded real repair |
| `screenshots/07-mobile-demo.png` | Recorded console at 390px width | Responsive product capture |
| `screenshots/08-webgl-fallback.png` | Real screenshot/details with WebGL disabled | Browser failure simulation; underlying findings are real |
| `screenshots/09-source-connection.png` | Real browser evidence beside a connected repository's ambiguous trace | Live source inspection; deliberately no claim that the unrelated repo caused the website issue |

The live scan identifier is in `browser-validation.json`. The recorded repair is `2026-10-26T19-04-29-541Z-27affb`, validated from the committed bundle. `architecture.svg` is an explanatory vector diagram, not a product screenshot.

The supplementary source-connection capture honestly shows an ambiguous result. Use the recorded source trace for the successful source attribution story. Do not relabel either as a live repair of MarsCommuter.

The API's in-memory registry must remain running to reopen the live scan URL. These PNGs and the committed repair bundle remain available independently. A public deployment URL and finished narrated video are still pending.

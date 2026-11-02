# A11yForge demo script

Hard limit: **3:00**. The finished video runs **2:28**. It is at
[`submission-assets/video/a11yforge-demo.mp4`](../submission-assets/video/a11yforge-demo.mp4),
with a [word-for-word transcript](../submission-assets/video/a11yforge-demo-transcript.md).

The first half is a real scan. The second half is labeled **Recorded real run ·
controlled target** throughout and is never presented as a live repair of the scanned
website. Recording makes zero model calls.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:17 | Title motion, then the four-step pipeline | Most accessibility tools can tell you something is wrong. A11yForge goes further. It finds the problem in a real browser, connects it to source evidence, proposes a repair with Meta models, and refuses to call it fixed until deterministic replay proves it. |
| 0:17–0:33 | Product footage: `https://dequeuniversity.com/demo/mars/` entered, then real scan progress | Here is a live scan of a real public website, Deque's Mars Commuter demo. A real Chromium browser opens it, runs axe, tests the keyboard and forms, and records screenshots and measured positions. This step uses zero model calls. |
| 0:33–0:46 | Product footage: spatial tour, "Some text is hard to read" at its measured location, then an untested 404 page | The results stay attached to the website. Each chapter moves to a measured location on the real page and explains the problem in plain language. Pages it could not test are reported as untested, not as passing. |
| 0:46–0:59 | Product footage: source inspection for that finding, then the labeled recorded demo | A finding can be traced into a connected repository, as ranked candidates, and ambiguity stays visible. For the autonomous repair loop, here is a recorded real run against our controlled regression target. |
| 0:59–1:14 | Product footage: Finding, Interaction, Source and Repair chapters | Keyboard focus escapes an open checkout dialog. Meta's Muse Spark model diagnosed it from the browser evidence, then proposed a bounded, exact edit to the traced source. The browser replay improved: focus stayed in the dialog. |
| 1:14–1:27 | Rejected chapter, with the compiler's own lines and a rejection stamp | But strict TypeScript failed. TS18048: 'last' is possibly undefined. A11yForge rejected its own AI repair. The model cannot overrule the compiler. |
| 1:27–1:46 | Revision chapter, Proof chapter and each gate ticking off | That compiler output became evidence for exactly one bounded revision. The revised repair passed type checking and the build. Then A11yForge replayed the exact original interaction, checked reverse Shift+Tab, and ran accessibility regression checks. Only then was it accepted. |
| 1:46–2:05 | Meta roles beside deterministic tools, with the run's real usage | Meta models do the reasoning: diagnosis, proposal, one revision, and a critic review, each with a fixed schema, inside a hard limit of four calls. Playwright, axe, the compiler, the build and replay establish the facts. Meta reasons. Tools verify. |
| 2:05–2:28 | Failure-to-proof chain, scope cards, close | Accessibility bugs usually arrive as reports, detached from the code and the interaction. A11yForge connects the failure, the evidence, the implementation, the attempted repair, and the proof. Live scanning works on public websites today; the full repair loop runs on a controlled target. Find it. Fix it. Prove it. |

## How this cut was made

- Product footage comes from the real production build, served as the container serves it:
  one port, with no model key. It plays at its real speed inside animated scenes.
- The scan run was `exp-1793649261931-387aedd3`. About 2 seconds of scan waiting are
  removed where it hands over to the results, and a label on screen says so.
- The repair footage plays the committed run `2026-10-26T19-04-29-541Z-27affb`.
- Titles, cards, callouts and diagrams are motion graphics. Their facts come from the
  run's artifacts, including the compiler lines, the gate results and
  `model-usage-summary.json`.
- The narration is an AI-generated voice, and the captions are burned in.

Keep the distinction the narration makes. MarsCommuter's source was not repaired.
A verified outcome covers the tested interaction, not the whole site's conformance.

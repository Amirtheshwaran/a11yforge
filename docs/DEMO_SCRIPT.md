# A11yForge demo script

Hard limit: **3:00**. The finished video runs **2:45**. It is at
[`submission-assets/video/a11yforge-demo.mp4`](../submission-assets/video/a11yforge-demo.mp4),
with a [word-for-word transcript](../submission-assets/video/a11yforge-demo-transcript.md).

The first half is a real scan in real time. The second half is labeled
**Recorded real repair** throughout and is never presented as a live repair of the
scanned website. Recording makes zero model calls.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:19 | Landing, then the website address field | Most accessibility tools can tell you something is wrong. A11yForge goes further. It finds the problem in a real browser, connects it to source evidence, proposes a repair with Meta models, and refuses to call it fixed until deterministic replay proves it. |
| 0:19–0:37 | Type `https://dequeuniversity.com/demo/mars/`, press Enter, watch real progress | Here is a live scan of a real public website, Deque's Mars Commuter demo. A real Chromium browser opens it, runs axe, tests the keyboard and forms, and records screenshots and measured positions. This step uses zero model calls. |
| 0:37–0:52 | Spatial tour: categories, then "Some text is hard to read" framed at its measured location, then an untested 404 page | The results stay attached to the website. Each chapter moves to a measured location on the real page and explains the problem in plain language. Pages it could not test are reported as untested, not as passing. |
| 0:52–1:06 | Source inspection for that finding, then the labeled recorded demo | A finding can be traced into a connected repository, as ranked candidates, and ambiguity stays visible. For the autonomous repair loop, here is a recorded real run against our controlled regression target. |
| 1:06–1:24 | Finding, Interaction, Source, Repair chapters | Keyboard focus escapes an open checkout dialog. Meta's Muse Spark model diagnosed it from the browser evidence, then proposed a bounded, exact edit to the traced source. The browser replay improved: focus stayed in the dialog. |
| 1:24–1:38 | Rejected chapter with the compiler's own lines | But strict TypeScript failed. TS18048: 'last' is possibly undefined. A11yForge rejected its own AI repair. The model cannot overrule the compiler. |
| 1:38–1:58 | Revision chapter, then Proof | That compiler output became evidence for exactly one bounded revision. The revised repair passed type checking and the build. Then A11yForge replayed the exact original interaction, checked reverse Shift+Tab, and ran accessibility regression checks. Only then was it accepted. |
| 1:58–2:18 | Architecture diagram and the run's real Meta usage table | Meta models do the reasoning: diagnosis, proposal, one revision, and a critic review, each with a fixed schema, inside a hard limit of four calls. Playwright, axe, the compiler, the build and replay establish the facts. Meta reasons. Tools verify. |
| 2:18–2:45 | Failure-to-proof chain, limitations, close | Accessibility bugs usually arrive as reports, detached from the code and the interaction. A11yForge connects the failure, the evidence, the implementation, the attempted repair, and the proof. Live scanning works on public websites today; the full repair loop runs on a controlled target. Find it. Fix it. Prove it. |

## How this cut was made

- Footage comes from the real production build, served as the container serves it:
  one port, with no model key.
- The scan is shown in real time with no cuts. The scan run was
  `exp-1793515536914-ee2a56ae`.
- The repair footage plays the committed run
  `2026-10-26T19-04-29-541Z-27affb`.
- The two closing cards are explanatory. The usage table on the first one is read
  from that run's `model-usage-summary.json`.
- The narration is a Windows text-to-speech voice. To replace it, read the
  transcript over the same timings.

Keep the distinction the narration makes. MarsCommuter's source was not repaired.
A verified outcome covers the tested interaction, not the whole site's conformance.

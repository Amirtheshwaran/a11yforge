# A11yForge demo script

Target: **2 minutes 40 seconds**, a proposed editorial duration; official video limits remain unconfirmed. Show the current production UI. Keep the “Recorded real repair” label visible whenever historical artifacts appear.

## Capture setup

- Start the API and web app; verify the recorded demo with `pnpm demo:validate`.
- Use the live MarsCommuter scan for finding explanation. Preserve any coverage warnings.
- Prepare the recorded console separately. Do not claim MarsCommuter's source was repaired.
- Playback and layout checks require no model calls. Do not press “Start Autonomous Repair” just to record the UI.
- Use the numbered assets in `submission-assets/screenshots/` as reference frames.
- Record screen and narration, export a video, upload it, and test its anonymous playback. No finished video is included in this checkout.

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:10 | Landing, website URL | “Most accessibility tools can tell you something is wrong. A11yForge goes further: find it, fix it, prove it.” |
| 0:10–0:30 | Start a **live website scan**; SSE progress and real result | “It opens a real website in a browser, checks its controls and keyboard behavior, and captures evidence. There are no model calls during exploration.” |
| 0:30–0:50 | Category, finding, Show me; briefly open Developer details | “The result stays attached to the website. Here, text and its background are too similar. Show me focuses the measured area, and developer details retain the original evidence.” |
| 0:50–1:08 | Source connection view, then switch explicitly to recorded console/source trace | “A11yForge can connect browser evidence to source. For the complete repair story, I'm switching to a recorded real run against our controlled Broken Shop fixture.” |
| 1:08–1:28 | Recorded timeline: Problem → Code → First fix; attempt 1 diff | “Meta diagnosed a keyboard-focus escape and proposed a small anchored repair. The first change improved browser behavior. But looking better wasn't enough.” |
| 1:28–1:50 | Rejected; attempt 1, TS18048 compiler evidence | “The repair failed strict TypeScript. A11yForge rejected it. The model couldn't overrule the compiler. That failure became evidence for exactly one bounded revision.” |
| 1:50–2:12 | Revision → Verified; attempt 2 and gate table | “The revision passed typecheck and build. A11yForge replayed the original keyboard interaction, checked reverse Shift+Tab, and ran accessibility regression checks. Only then was the repair accepted.” |
| 2:12–2:30 | Architecture graphic | “Meta models reason, propose, revise and critique. Playwright, axe, the compiler, build and replay establish facts and proof. The complete controlled workflow allows at most four model calls.” |
| 2:30–2:40 | Verified proof; close on A11yForge | “Live public-site exploration works today. The full repair loop is demonstrated on a controlled fixture; arbitrary hosted code mutation is disabled. Find it. Fix it. Prove it.” |

## Director notes

The first failure is the central moment. Keep TS18048 legible. Use the timeline's First fix/Rejected beats for attempt 1 and Revision/Verified for attempt 2. If scanning takes longer, shorten the waiting period with an explicit edit; do not fabricate progress or imply recorded inference is live.

Use the source trace from the recorded fixture to demonstrate a successful match. An unrelated public repository is not proof of source attribution for MarsCommuter. A verified outcome establishes the tested interaction, not whole-site conformance.

See [official requirement status](HACKATHON_COMPLIANCE.md) before recording the final export.

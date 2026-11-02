# A11yForge demo transcript

Runtime 2:28. Narrated with an AI-generated voice. The video has burned-in captions.

**0:00** Most accessibility tools can tell you something is wrong. A11yForge goes
further. It finds the problem in a real browser, connects it to source evidence,
proposes a repair with Meta models, and refuses to call it fixed until deterministic
replay proves it.

**0:17** Here is a live scan of a real public website, Deque's Mars Commuter demo. A
real Chromium browser opens it, runs axe, tests the keyboard and forms, and records
screenshots and measured positions. This step uses zero model calls.

**0:33** The results stay attached to the website. Each chapter moves to a measured
location on the real page and explains the problem in plain language. Pages it could
not test are reported as untested, not as passing.

**0:46** A finding can be traced into a connected repository, as ranked candidates, and
ambiguity stays visible. For the autonomous repair loop, here is a recorded real run
against our controlled regression target.

**0:59** Keyboard focus escapes an open checkout dialog. Meta's Muse Spark model
diagnosed it from the browser evidence, then proposed a bounded, exact edit to the traced
source. The browser replay improved: focus stayed in the dialog.

**1:14** But strict TypeScript failed. TS18048: 'last' is possibly undefined. A11yForge
rejected its own AI repair. The model cannot overrule the compiler.

**1:27** That compiler output became evidence for exactly one bounded revision. The
revised repair passed type checking and the build. Then A11yForge replayed the exact
original interaction, checked reverse Shift+Tab, and ran accessibility regression checks.
Only then was it accepted.

**1:46** Meta models do the reasoning: diagnosis, proposal, one revision, and a critic
review, each with a fixed schema, inside a hard limit of four calls. Playwright, axe, the
compiler, the build and replay establish the facts. Meta reasons. Tools verify.

**2:05** Accessibility bugs usually arrive as reports, detached from the code and the
interaction. A11yForge connects the failure, the evidence, the implementation, the
attempted repair, and the proof. Live scanning works on public websites today; the full
repair loop runs on a controlled target. Find it. Fix it. Prove it.

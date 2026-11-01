# Submission copy

Draft for the [portal](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit). The
form is behind sign-in, so its fields and character limits are unconfirmed. Do not paste a pending
value.

## Project name

A11yForge

## Track

Indie Developer

## Theme

Push the Frontier

## One-line pitch

A11yForge observes accessibility failures in a real browser, uses Meta models to propose bounded source repairs, and rejects bad fixes until deterministic replay proves they work.

## Short description

Accessibility reports tell developers something is wrong, but they are detached from the code and the failing interaction. A11yForge finds failures in a real browser, traces them to source, and uses Meta models to propose small repairs. In its recorded real run, the first repair improved keyboard behavior but failed strict TypeScript. A11yForge rejected its own AI repair, used the compiler output for one bounded revision, and replayed the original failure before accepting it.

## Long description

A website can look fine while keyboard and screen-reader users hit barriers. Those bugs usually reach developers as reports, detached from the code and the interaction. And an AI patch that looks right can still break the build. A11yForge connects the user-visible failure to evidence, to the implementation, to an attempted repair, and to proof.

A real Chromium browser explores a public website, runs axe and keyboard and form probes, and records screenshots and measured element locations. No model is involved in that step. Findings appear in plain language in a 3D tour of the real page. Pages that could not be tested are reported as untested, not as passing. A finding can be traced into a connected repository as ranked candidates, and ambiguity stays visible.

Meta models then supply bounded reasoning: a diagnosis, an exact source edit, at most one revision, and a critic review. Each call uses a fixed schema and is validated against the evidence it was given, inside a hard limit of four calls. Meta reasons. Tools verify. The compiler, build, interaction replay and regression gates decide, and no model can overrule them.

The central demonstration is a recorded real repair of a keyboard-focus escape in a controlled regression target. The first Meta repair improved browser behavior, but strict TypeScript failed with TS18048. A11yForge rejected it. That compiler output became evidence for exactly one revision, which passed typecheck and build, the exact original keyboard replay, reverse Shift+Tab traversal, and accessibility regression checks. Only then was it accepted.

Live scanning works on public websites today. The complete repair loop runs on the controlled target, and repair of arbitrary websites is deliberately not connected, because executing a stranger's repository needs isolation a public host cannot safely provide.

Find it. Fix it. Prove it.

## Built during the hackathon

Built during the Meta Global AI Developer Hackathon: real-browser accessibility exploration, evidence provenance, spatial 3D issue tours, Meta-powered bounded repair reasoning, deterministic self-rejection and revision, source inspection, and the recorded verification workflow. The commit-by-commit audit is in docs/HACKATHON_NEW_WORK.md.

## Meta technology used

Meta Model API with `muse-spark-1.3-contributor`, called only from `packages/meta` through strict JSON-schema Chat Completions.

- **Diagnosis:** receives browser evidence and returns the cause, repair strategy, evidence IDs and WCAG criteria.
- **Repair proposal:** receives the diagnosis and traced source and returns exact edits, with rationale and risks.
- **Revision:** at most one. Receives the compiler or verifier failure and returns corrected edits.
- **Critic:** runs only after the deterministic gates pass, and may reject but cannot override a failed gate.

Replies are validated locally and fail closed with no automatic retries. The run is capped at four calls. Exploration and recorded playback make none. The recorded run's real usage is in its committed artifacts. Baseten and open-weight inference are not used.

## Architecture

Next.js web app and Fastify API, with a deterministic engine: Playwright and axe evidence, source tracing, isolated patching, and compiler, build, replay and regression gates. `packages/meta` is the only model caller. One container serves everything from a single port and needs no secrets. Diagram: `submission-assets/architecture.svg`.

## Impact

Developers and teams responsible for accessibility get more than a report: the failure, its evidence, its likely source, an attempted repair, and proof of what was tested. People who rely on keyboards and screen readers benefit when these bugs are fixed with evidence and not guessed at. Because a repair is trusted only after deterministic checks pass, AI-generated fixes become something a team can review with confidence.

## Technical depth

Browser automation with SSRF-guarded targets. Evidence provenance, in which every finding, screenshot and location belongs to a recorded run. Source ranking that keeps ambiguity explicit. Schema-validated model output, with exact-anchor edits applied in isolated workspaces. Compiler and build gates, interaction replay, reverse traversal and accessibility regression checks. Self-rejection, with failure output as bounded revision evidence. The test suite covers these, and CI builds and smoke-tests the container images.

## Links

- Repository: https://github.com/Amirtheshwaran/a11yforge
- Public deployment: **PENDING.** Not deployed yet.
- Demo video: **PENDING.** The file is ready at `submission-assets/video/a11yforge-demo.mp4`, but it needs hosting.

## Known limitations

Repair of arbitrary websites is not connected; the repair loop targets a controlled fixture, and the demo shows it as a recorded real run. Authentication, CAPTCHA, blocked or missing pages can limit scan coverage, and those pages are reported as untested. Source matches can remain ambiguous. A scan is not a full conformance audit. Layouts were tested in browser viewports, not on physical phones.

## Human team members

Amirtheshwaran Navaneethakrishnan (solo, per the Git history). **The entrant must confirm this.** AI tools are not team members.

## Before submitting

```text
[ ] Entrant personally confirmed waiver eligibility
[ ] Entrant confirmed no other human materially contributed
[ ] Fields and character limits checked against the signed-in portal
[ ] Public deployment URL tested and filled in
[ ] Video hosted, playable while signed out, and filled in
```

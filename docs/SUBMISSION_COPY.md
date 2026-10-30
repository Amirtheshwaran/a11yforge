# Submission copy

Prepared October 30, 2026. Character limits are unknown until the authenticated form is inspected. These variants are drafts ready to paste after that check.

## Project name

A11yForge

## One-line pitch

A11yForge observes real browser accessibility failures, uses Meta models to propose bounded repairs, and accepts changes only after deterministic project checks and replay pass.

## Short description

Accessibility findings become useful when developers can safely fix them. A11yForge captures real browser evidence, connects it to source, and uses Meta models to propose small repairs. In its recorded real run, the first repair improved keyboard behavior but failed TypeScript, so A11yForge rejected it, requested one evidence-grounded revision, and replayed the original failure before acceptance.

## Long description

A website can appear usable while keyboard and screen-reader users encounter barriers. A11yForge makes those problems visible through real Playwright exploration, axe checks, interaction probes, screenshots and measured element locations. Users review plain-language findings and can inspect the underlying evidence and source matches.

Meta models supply bounded reasoning: diagnosis, an anchored source repair, an optional revision, and a critic review. They receive deterministic browser, source and verifier evidence and return schema-validated structured outputs. They cannot invent the browser observations or waive a compiler failure.

The strongest demonstration is the committed real repair of a keyboard-focus escape in the controlled Broken Shop fixture. Its first Meta-generated repair improved browser behavior but failed strict TypeScript with TS18048. The system rejected it. That compiler output became evidence for exactly one revision. The revised repair passed typecheck, build, the original keyboard replay, reverse Shift+Tab traversal and accessibility regression checks before acceptance.

The technical contribution is this connection between evidence, bounded source changes, self-rejection and replay. Live exploration works on public websites. The complete automatic repair loop currently targets the controlled fixture; generic source connection and tracing are available, while arbitrary-source repair execution remains unwired in the web UI and CLI.

Find it. Fix it. Prove it.

## Track

Indie Developer Track

## Theme

Push the Frontier

## Meta technology used

Meta Model API through the implemented Chat Completions provider. Default and recorded model: `muse-spark-1.3-contributor`. Four bounded roles: diagnosis, repair proposal, optional single revision and eligible critic; at most four calls in the complete live fixture orchestration. Browser exploration uses zero AI calls.

## Baseten disclosure

No Baseten inference execution or active Baseten configuration was verified in this checkout. The current runtime uses Meta directly. Do not claim Baseten or `meta-models/muse-spark-open-1026` as executed technology.

## Links

- GitHub: https://github.com/Amirtheshwaran/a11yforge
- Public demo URL: PENDING — deploy and verify before pasting.
- Video URL: PENDING — record/upload the narrated walkthrough and verify playback.
- Local recorded demo: http://localhost:3000/console (local only; not a public submission URL).

## Known limitations

Bounded public-site checks do not establish complete accessibility conformance. Authentication and inaccessible routes can prevent coverage. Source matches and geometry can be unavailable. Generic hosted code mutation is disabled, and the generic CLI currently traces source only. The complete autonomous repair demonstration uses a controlled fixture and a clearly labeled recorded real run.

## Participant information

The repository identifies Amirtheshwaran as the owner. Confirm the participant's exact name, contact details, accepted account and any team members in the authenticated form; no personal fields have been submitted.

## Final form checklist

Inspect the authenticated portal's required fields and limits. Confirm participant eligibility and accepted rules. Paste the appropriate descriptions, select the track/theme if requested, add tested links and real screenshots, review the model and limitation disclosures, then submit. Save the confirmation and submission link.

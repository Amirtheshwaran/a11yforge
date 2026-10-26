# A11yForge — Roadmap

## Phase 0 — foundation (this phase)

Clean TypeScript monorepo: Next.js shell, Fastify `/health`, engine/meta/
shared package shells, strict TS, lint, docs. No scanner, no browser, no AI.

## Phase 1 — controlled broken accessibility target + deterministic scanner ✅ COMPLETE

Fixture `fixtures/broken-shop` (React + Vite on :3002) plus a deterministic
Playwright + axe-core scanner in `packages/engine` reporting normalized
`AccessibilityFinding` facts. No AI; output is machine-checkable evidence.

Verified with `pnpm scan:fixture` — 4 findings, 4 rules, every run:

- `button-name` (critical) at `.quantity-decrement`
- `image-alt` (critical) at `img`
- `label` (critical) at `#email`
- `color-contrast` (serious) at `.fine-print`

Normalized artifacts land in `.a11yforge/runs/<scan-id>/scan.json`.
Details: `fixtures/broken-shop/README.md`, `docs/ARCHITECTURE.md`.

## Phase 2 — browser evidence + keyboard testing

Drive the fixture in a real browser: record interaction traces, capture
DOM and accessibility-tree snapshots, and run keyboard-only checks. Produce a
replayable evidence envelope per issue.

## Phase 3 — Meta-powered structured diagnosis

Wire the Meta provider: bounded, schema-validated calls that turn evidence
envelopes into structured diagnoses (issue, location, probable cause). Models
interpret evidence; they never replace it.

## Phase 4 — source tracing + patch generation

Map failing DOM nodes back to the fixture components that render them and
generate minimum safe patches against that source.

## Phase 5 — build/replay/verifier/critic

Rebuild the fixture with the patch, replay the recorded trace, diff
before/after evidence, and let a critic accept or reject the repair. Bounded
retries, then report unrepaired with evidence.

## Phase 6 — observable agent UI

Build the real web dashboard: run timeline, evidence viewer, before/after
diffs, accept/reject verdicts, all streamed from the API.

## Phase 7 — additional accessibility strategies + Meta open-weight critic

More issue strategies beyond the first defect class, and an open-weight Meta
model as an independent second critic on patches and verdicts.

## Phase 8 — demo hardening

Freeze the demo path end to end: seeded fixture, reliable rebuild, recorded
fallback evidence, and a rehearsed narrative — finding, tracing, fixing, and
proving a real issue resolved.

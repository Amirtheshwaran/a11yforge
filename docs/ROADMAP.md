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

## Phase 2 — browser evidence + keyboard testing ✅ COMPLETE

Deterministic keyboard interaction evidence in `packages/engine`
(runner, focus observations, `focus-contained-in-modal` assertion,
run events, screenshots) over a deliberately trap-less checkout modal
in `fixtures/broken-shop` (defect E), with shared Zod schemas in
`packages/shared` (`FocusObservation`, `InteractionAssertion`,
`KeyboardScenarioResult`, `EvidenceType`, scenario definitions).

Verified with `pnpm scenario:fixture` — deterministic every run:

- modal opens, focus lands on `#checkout-modal-close`
- Tab → `#checkout-modal-email` (inside)
- Tab → `#checkout-modal-continue` (inside)
- Tab → `#background-control` (outside, modal still open)
- `focus-contained-in-modal` FAILS at step 3 with evidence in
  `.a11yforge/runs/<run-id>/` (`scenario.json` + exactly 3 PNGs)

Phase 1 intact: `pnpm scan:fixture` still reports all four axe rules
(`button-name`, `image-alt`, `label`, `color-contrast`). No model calls
anywhere in the loop. Details: `fixtures/broken-shop/README.md`,
`docs/ARCHITECTURE.md`.

## Phase 3 — Meta-powered structured diagnosis

Wire the Meta provider: bounded, schema-validated calls that turn evidence
envelopes into structured diagnoses (issue, location, probable cause). Models
interpret evidence; they never replace it.

## Phase 4 — source tracing + patch generation ✅ COMPLETE

Deterministic source locator in `packages/engine` (evidence-derived search
terms, ranked candidates, bounded snippets, sufficiency gate) plus a
schema-constrained Meta repair-proposal call in `packages/meta`
(`accessibility-repair-proposal`, 1 call, 4096 tokens, low reasoning) with
local source-context validation. Shared `RepairProposal` /
`RepairContextBundle` schemas in `packages/shared` (edits anchored by exact
source text, ≤ 2 files / ≤ 4 edits).

Verified with `pnpm trace:fixture` — deterministic, zero model calls:

- search terms from evidence facts (checkout-modal, checkout-modal-close,
  checkout-modal-email, checkout-modal-continue, background-control, …)
- top candidate `src/App.tsx` (score 915, 8 terms), runner-up
  `src/styles.css`; selected context `src/App.tsx` lines 117-187 plus
  `src/styles.css` lines 108-145 (3.3 KB total)
- artifact `.a11yforge/runs/<run-id>/source-trace.json`

`pnpm propose:fixture` consumes that trace with exactly one request; without
`MODEL_API_KEY` it fails before any network attempt (verified). No live
repair-proposal call was made in this phase.

Proposals are NOT trusted or applied until Phase 5 verification: no fixture
source was modified, nothing was rebuilt, and no post-repair replay ran.
Details: `docs/ARCHITECTURE.md`.

## Phase 5 — build/replay/verifier/critic ✅ COMPLETE

Closed autonomous repair loop in `packages/engine/src/verify/` plus a
bounded Meta critic in `packages/meta` (`repair-critic-review`, 1 call,
2048 tokens, low reasoning). Single entry point `pnpm repair:fixture`
consumes the existing scenario/diagnosis/trace/proposal and executes:
validate proposal → isolated workspace (`.a11yforge/workspaces/`,
retained as artifact) → safe apply (exact anchors, deterministic diff)
→ real build → replay of the EXACT `checkout-modal-keyboard` scenario →
fresh baseline vs repaired axe comparison → fixture typecheck →
deterministic acceptance gate → critic ONLY if the gate passes →
ACCEPTED/REJECTED.

First live run (`pnpm repair:fixture`, 2026-10-26): the proposed focus
trap functionally resolved the escape — the replayed scenario cycled 11
Tab presses inside `#checkout-modal` and `focus-contained-in-modal`
flipped to passing with the 4-rule axe baseline preserved — but the
deterministic gate REJECTED the repair (`REGRESSION_FAILED`) because the
proposed handler fails strict `tsc --noEmit` (`TS18048` under
`noUncheckedIndexedAccess`). Per the two-level trust model the critic
was correctly NOT called (1 of 2 model calls spent, on the proposal).
The critic path itself is implemented and covered by mocked tests. The
main fixture source was never mutated. Details: `docs/ARCHITECTURE.md`.

## Phase 5b — verifier-driven repair recovery ✅ COMPLETE

Bounded fix-forward in `packages/engine/src/verify/` (`feedback.ts`,
`validate-revision.ts`, `reverse.ts`, `recover-fixture.ts`) plus the
`accessibility-repair-revision` operation in `packages/meta` and
`RepairFailureFeedback` / `RepairRevisionRequest` / `TYPECHECK_FAILED` /
`MAX_REPAIR_ATTEMPTS = 2` in `packages/shared`. Entry point
`pnpm recover:fixture`: Attempt-1 evidence preserved byte-for-byte,
one feedback-grounded revision, fresh workspace, typecheck-first
verification, forward + reverse keyboard replay, axe baseline
comparison, critic only after all gates.

Verified live (2026-10-26): Attempt 1 rejected (`TS18048`,
`REGRESSION_FAILED`, behaviorally fixed); Attempt 2 added the
`undefined` guard and reached ACCEPTED — critic ACCEPT at 0.82
confidence, 2 of 2 model calls spent, no Proposal #3. A11yForge's first
fully verified and accepted repair. Details: `docs/ARCHITECTURE.md`.

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

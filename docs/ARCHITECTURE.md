# A11yForge — Architecture

Phase 0 foundation. Components marked FUTURE do not exist yet.

## Web (`apps/web`)

Next.js app. Today it is only a development shell. Later it hosts the
observable agent UI: run timeline, evidence viewer, before/after diffs, and
accept/reject verdicts. It never runs repairs itself; it renders engine state
served by the API.

## API (`apps/api`)

Fastify service. Today it exposes only `GET /health`. Later it fronts the
engine: start a repair run, stream run events, fetch evidence and verdicts.
It owns no repair logic; it validates requests with shared schemas and
delegates to the engine.

## Engine (`packages/engine`)

The autonomous repair loop: explore → evidence → diagnose → trace → patch →
build → replay → verify → accept/reject. Owns orchestration, deterministic
tooling adapters (scanner, browser driver, replayer, verifier, critic policy),
and the rule that no patch is accepted without verifying evidence.

## Meta provider (`packages/meta`)

The only place that talks to Meta models. Bounded calls with structured
outputs for two jobs: structured diagnosis from evidence, and critic review
of proposed patches. Never called without deterministic evidence attached;
never allowed open-ended tool use.

## Shared schemas (`packages/shared`)

Single source of truth for cross-boundary shapes: health payloads today;
evidence envelopes, diagnoses, patch proposals, and verdicts in later phases.
Imported by web, API, engine, and meta.

## Phase 1 scanner flow (implemented)

```text
pnpm scan:fixture
  → engine boots fixtures/broken-shop (Vite, :3002) and waits for HTTP 200
  → Playwright launches Chromium, goto(url, waitUntil "load")
  → wait for `main` selector (dev HMR keeps sockets open, so no networkidle)
  → axe-core injected from the local dependency (axe.min.js, no CDN)
  → axe.run analyzed in-page
  → normalize: one violation × N nodes → N AccessibilityFinding records
     (shared Zod schema in packages/shared; per-node shape chosen so Phase 4
     source tracing maps one failing node to the component rendering it)
  → terminal summary printed; normalized result written to
     .a11yforge/runs/<scan-id>/scan.json (git-ignored, future agent input)
  → browser closed in a `finally`; fixture server stopped in a `finally`
```

`pnpm scan -- <url>` runs the same pipeline against any URL without
booting the fixture. `pnpm fixture:dev` serves the fixture alone on :3002.
The scanner collects objective facts only (rule, impact, selector, HTML
fragment, failure summary, URL) — no interpretation, no model calls.

## Phase 2 keyboard flow (implemented)

```text
pnpm scenario:fixture
  → engine boots fixtures/broken-shop (Vite, :3002) and waits for HTTP 200
  → Playwright launches Chromium, goto(url, waitUntil "load")
  → wait for `main` selector (same HMR reasoning as the scanner)
  → scenario runner executes `checkout-modal-keyboard`
     (packages/engine/src/interaction/scenarios.ts — data-driven steps:
     screenshot, click `.proceed-to-checkout`, wait-for `#checkout-modal`,
     screenshot, up to 10 Tab presses; later phases select scenarios by id
     without rewriting the runner)
  → after the modal opens and after every Tab, `document.activeElement`
     is described in-page into a compact FocusObservation
     (seq, action, key, timestamp, URL, selector, tag name, role,
     accessible name, bounded text, tabIndex, disabled, aria-hidden,
     inside-modal flag — no DOM snapshots)
  → deterministic assertion `focus-contained-in-modal`: while the modal is
     open, focus must stay inside the dialog subtree; the first outside
     observation fails with step, pressed key, expected region, actual
     focused selector, and bounded HTML (packages/shared Zod schemas
     validate every boundary)
  → exactly three screenshots: `before-modal.png`, `modal-open.png`,
     `focus-escaped.png` (only the escape press is screenshotted, never
     every Tab)
  → run events recorded in the artifact (`scenario-started`, `page-loaded`,
     `modal-opened`, `key-pressed`, `focus-changed`, `assertion-failed`,
     `screenshot-captured`, `scenario-completed`) — stored, not streamed;
     no SSE, no timeline UI yet
  → terminal report printed; KeyboardScenarioResult written to
     .a11yforge/runs/<run-id>/scenario.json
  → browser closed in a `finally`; fixture server stopped in a `finally`
```

Exit 1 when focus escapes (the intended defect reproduced) or the run
fails; exit 0 only if focus stays contained. Unified evidence categories
live in `packages/shared` (`EvidenceType`: `axe-finding`,
`focus-observation`, `interaction-assertion`, `screenshot`) so Phase 1 and
Phase 2 artifacts share one vocabulary without rewriting the scanner.

## Phase 3 diagnosis flow (implemented)

```text
pnpm diagnose:fixture
  → engine selects the latest completed run with a failed
    focus-contained-in-modal assertion (deterministic lexical order;
    scan-only runs skipped, never a fresh browser run)
  → builds the compact evidence bundle (stable IDs: ev-modal-open,
    ev-focus-step-<seq>, ev-focus-escape, ev-assertion-failed; no events,
    screenshots, axe findings, or page dumps)
  → prints the credit notice (model, operation, evidence count, call budget)
  → meta provider makes EXACTLY ONE request to
    https://api.meta.ai/v1/chat/completions (model muse-spark-1.3-contributor
    unless A11YFORGE_META_MODEL overrides; key from MODEL_API_KEY only)
  → response_format.json_schema constrains decoding to the
    accessibility-diagnosis schema (never a bare "return JSON" prompt)
  → local validation: Zod parse + evidence-ID grounding (unknown IDs fail)
  → persists diagnosis.json + model-usage.json next to source scenario.json
```

Three validation layers: Meta constrained decoding, local Zod validation,
A11yForge evidence-reference validation. Budget: `ModelCallBudget` capped by
`A11YFORGE_MAX_MODEL_CALLS_PER_RUN` (default 1); no retry loop — transport
errors report, malformed results fail. Output budget: `max_tokens: 1500`
(documented in `packages/meta/src/config.ts`). Usage telemetry records only
fields the API exposes (absent token counts stay null, never fabricated).
Shared shapes (`AccessibilityDiagnosis`, `EvidenceBundle`, `ModelUsage`) live
in `packages/shared`; the provider lives in `packages/meta`; bundle
construction and the CLI live in `packages/engine`. No live call runs in
tests or builds — `pnpm diagnose:fixture` without `MODEL_API_KEY` fails
before any network attempt.

## Future browser evidence flow

```text
engine → browser driver → interaction trace + DOM/AX snapshots
       → deterministic scanner + keyboard checks → evidence envelope
       → (evidence only) → meta provider → structured diagnosis
```

Models see evidence, never a live browser. Replays reuse recorded traces so
before/after comparisons are apples-to-apples.

## Future verification loop

```text
patch → build target → replay recorded trace → re-collect evidence
      → verifier diffs before/after → critic accepts or rejects
```

Rejection returns the run to diagnosis with the failed evidence attached. The
loop is bounded: a fixed retry budget, then the issue is reported unrepaired
with full evidence.

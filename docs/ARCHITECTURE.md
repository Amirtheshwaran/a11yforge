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

## Phase 4 source-trace + repair-proposal flow (implemented)

```text
pnpm trace:fixture (free, deterministic — ZERO model calls)
  → engine selects the latest run holding diagnosis.json + scenario.json
    (deterministic lexical order; scan-only and pre-diagnosis runs skipped)
  → search terms derived ONLY from known facts: `#id` tokens in the
    evidence selectors/HTML plus ids restated in the diagnosis text
    (packages/engine/src/trace/search-terms.ts — the model is never asked
    which files to search)
  → local walk of fixtures/broken-shop (local trees only; a future
    repository-adapter seam can add remote sources without changing the
    ranking contract): only .ts/.tsx/.js/.jsx/.css/.html, skipping
    node_modules, dist, .next, coverage, .a11yforge, .git, playwright
    artifacts, lockfiles, binaries, and files over 256 KB; trees beyond
    500 readable files are refused, never silently truncated
  → rank: score = distinctTerms * 100 + occurrences * 5 (ties: matchCount
    desc, filePath asc); the file rendering `#checkout-modal` rises to the
    top without any hard-coded filename
  → bounded snippets (15 context lines, merged windows, at most 3 per file,
    100 lines / 8000 chars each, 24 KB total) with deterministic line
    numbers as evidence references
  → sufficiency gate: top candidate needs ≥ 2 distinct terms, ≥ 3
    occurrences, and ≥ 1 selected snippet — otherwise STOP, no model call
  → terminal rank report printed; SourceTraceResult written to
    .a11yforge/runs/<run-id>/source-trace.json (useful even with no model
    request ever made)

pnpm propose:fixture (exactly ONE paid request, manual, never in tests)
  → loads the existing source-trace artifact; rejects a missing/invalid
    trace ("run pnpm trace:fixture first") or an INSUFFICIENT trace
  → builds the compact RepairContextBundle (diagnosis id, citable evidence
    ids, observed failure, repair strategy, file metadata, bounded
    snippets — no repo, no screenshots, no event history, no secrets)
  → prints the credit notice (model, operation, diagnosis, source counts,
    call budget) and fails BEFORE any network attempt without MODEL_API_KEY
  → meta provider makes EXACTLY ONE request to
    https://api.meta.ai/v1/chat/completions (model muse-spark-1.3-contributor
    unless A11YFORGE_META_MODEL overrides; max_completion_tokens 4096,
    reasoning_effort low; key from MODEL_API_KEY only)
  → response_format.json_schema constrains decoding to the
    accessibility-repair-proposal schema (exact-text anchors, never bare
    prose or line-number-only edits)
  → local validation: Zod parse + evidence-ID grounding + source-context
    validation (target/edit files ⊆ supplied context, originalText inside
    the supplied snippets, non-empty, replacement differs, ≤ 2 files /
    ≤ 4 edits, confined in-root paths, on-disk existence)
  → persists repair-proposal.json + repair-model-usage.json next to the
    source artifacts; prints the compact proposal ending in
    STATUS: PROPOSED — NOT APPLIED
```

Four validation layers for repair: Meta constrained decoding, local Zod
validation, evidence-reference grounding, source-context validation. Budget:
`ModelCallBudget` capped by `A11YFORGE_MAX_MODEL_CALLS_PER_RUN` (default 1);
no retry loop — transport errors report, malformed results fail, rejected
proposals fail. A proposal is never applied, rebuilt, or verified here:
Phase 5 owns application, replay, and the accept/reject verdict.

Shared shapes (`RepairProposal`, `RepairEdit`, `RepairContextBundle`,
`MAX_REPAIR_FILES`, `MAX_REPAIR_EDITS`) live in `packages/shared`; the
repair provider call lives in `packages/meta`; locator, trace, context,
validation, and both CLIs live in `packages/engine`.

## Phase 5 autonomous repair loop (implemented)

```text
pnpm repair:fixture (at most ONE paid request, only after the gate passes)
  → engine selects the latest run holding scenario + diagnosis +
    source-trace + repair-proposal.json (never regenerates any of them)
  → re-validates the proposal against its exact context (refusal → REJECTED)
  → creates an isolated workspace `.a11yforge/workspaces/<repair-id>/`
    (copies only fixture entries needed to build; node_modules symlinked;
    retained as artifact, never auto-deleted)
  → applies every edit inside the workspace only (path containment,
    file exists, originalText exactly once — ambiguous/missing refused)
  → records a deterministic diff (`repair-diff.patch`)
  → runs the real fixture build in the workspace (command, exit, duration,
    bounded output captured; failure → BUILD_FAILED, no second model call)
  → serves the built `dist/` over a local static server and replays the
    EXACT `checkout-modal-keyboard` scenario (failure → VERIFY_FAILED)
  → fresh baseline axe scan of the main fixture vs repaired scan, rule-set
    diffed (new serious/critical or removed baseline defect → REGRESSION_FAILED)
  → fixture typecheck (`tsc --noEmit`) in the workspace
  → deterministic acceptance gate (pure conjunction — no AI): applied
    safely, build passed, same scenario replayed, target assertion flips
    to passing, no new serious/critical axe regressions, typecheck clean
  → ONLY if the gate passes: exactly ONE Meta critic request
    (model muse-spark-1.3-contributor, low reasoning, 2048 tokens,
    bounded CriticInput — measured artifacts only, never the repository)
  → local Zod + evidence-ID validation of the verdict
  → ACCEPTED on critic ACCEPT, REJECTED otherwise
  → terminal report + artifacts in the source run dir
```

Two-level trust model:

1. The deterministic verifier is authoritative. Build outcome, replayed
   assertion, and axe comparison decide eligibility; any failure REJECTS
   without spending the critic call.
2. The AI critic adjudicates ONLY an otherwise passing repair. It cannot
   override deterministic failure — it is never called when the gate
   fails, and a REJECT verdict still rejects.

Lifecycle states (`packages/shared` `RepairLifecycleState`, persisted in
`repair-lifecycle.json`): PROPOSED → APPLYING → APPLIED →
BUILD_FAILED / TYPECHECK_FAILED / VERIFY_FAILED / REGRESSION_FAILED /
VERIFIED → ACCEPTED / REJECTED. Failure states and verdicts are
terminal; VERIFIED is transient (gate passed, critic pending).
`TYPECHECK_FAILED` names compiler failures precisely instead of grouping
them under `REGRESSION_FAILED`; historical artifacts that used the older
label remain readable (the enum only gained a state). The main fixture
source is never mutated: the accepted workspace stays an artifact and the
intentionally broken fixture remains the before-state baseline.

Shared shapes (`RepairLifecycle`, `RepairVerificationResult`,
`CriticInput`, `CriticDecision`) live in `packages/shared`; the critic
provider call lives in `packages/meta` (`critiqueRepairWithMeta`); the
workspace/apply/build/replay/regression/gate/orchestrator modules and
the CLI live in `packages/engine/src/verify/`.

## Phase 5b verifier-driven recovery flow (implemented)

```text
pnpm recover:fixture (at most TWO paid requests, only after Attempt 1 failed)
  → engine selects the latest run holding a terminally FAILED first
    attempt (proposal + diff + replay + verification + lifecycle) that has
    no repair-revision-proposal.json yet (MAX_REPAIR_ATTEMPTS = 2 —
    a run that already revised refuses Proposal #3 outright)
  → Attempt-1 artifacts are NEVER rewritten: feedback and revision live
    in repair-feedback.json / repair-revision-* alongside them
  → builds the compact RepairFailureFeedback bundle (proposal/repair
    ids, previous result, failed stage, compiler command, exit status,
    bounded stderr tail, exact diagnostic codes, affected region,
    original edit, diagnosis, evidence ids, rationale, supplied files)
  → EXACTLY ONE Meta revision request
    (operation accessibility-repair-revision, model
    muse-spark-1.3-contributor, low reasoning — the model receives the
    original context + rejected proposal + verifier feedback, never the
    repository)
  → revision safety: all existing safeguards (exact anchors, evidence
    grounding, file/edit bounds, confinement) PLUS the revision must
    differ, touch no tests or compiler config, and carry no `any`,
    `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `eslint-disable`,
    or noUncheckedIndexedAccess tampering (invalid → REJECTED, no
    workspace, no critic)
  → creates a FRESH isolated workspace from the original broken fixture
    (never a mutated repair workspace; records repair-revision-diff.patch)
  → verification in order: typecheck FIRST (failure → TYPECHECK_FAILED,
    no build/replay/critic) → build → replay of the EXACT
    checkout-modal-keyboard scenario → reverse Shift+Tab traversal check
    (wrap-first-to-last, same assertion, primary scenario untouched) →
    fresh baseline vs revised axe comparison
  → deterministic acceptance gate (same conjunction + reverse contained)
  → ONLY if every gate passes: the SECOND and FINAL Meta call, the
    critic, now also carrying the rejected first proposal and its reason
  → ACCEPTED on critic ACCEPT, REJECTED otherwise
```

Trust model, unchanged and strengthened:

1. The deterministic verifier is authoritative AND controls whether
   additional reasoning is allowed. AI cannot self-certify: the critic
   is never consulted on a failing repair, and the revision call itself
   exists only because the verifier classified a failure the model can
   address.
2. The loop is hard-bounded: one proposal + one revision, then stop.
   `pnpm recover:fixture` on an already-recovered run refuses instead
   of spending a third call.

First live recovery (2026-10-26): Attempt 1's focus trap fixed the
escape but failed `tsc --noEmit` (`TS18048` under
`noUncheckedIndexedAccess`, recorded as `REGRESSION_FAILED`);
`pnpm recover:fixture` built the feedback bundle, the revision added one
guard line (`if (first === undefined || last === undefined) return;`),
and the fresh workspace passed typecheck, build, forward + reverse
replay, and the 4-rule axe baseline — critic ACCEPT (0.82) → ACCEPTED
(2 of 2 model calls spent). Details below; the failed-first artifacts
are preserved in the same run dir.

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

## Phase 6 read-model + observable console (implemented)

```text
.a11yforge/runs/<run-id>/  →  engine read-model  →  API  →  web console
(png/json/patch artifacts)     (RunViewModel)      (typed routes)  (one screen)
```

- `packages/shared/src/runview.ts` — the ONLY shape the UI consumes:
  `RunViewModel` (run, finding, focusTrace, diagnosis, sourceTrace,
  attempts[≤2], verification, critic, pipeline, artifact URLs) plus
  fail-closed helpers: `isAllowedArtifactName` (png/json/patch, no
  traversal, no secret names), `toDisplayPath` (absolute roots reduced to
  repo-relative forms), `containsNoSecrets` (guard before every send).
- `packages/engine/src/runview/read-model.ts` — read-only, inference-free
  projection: parses the existing artifacts with the Phase 2–5 Zod schemas,
  derives the 11-stage pipeline, preserves Attempt 1 (`REGRESSION_FAILED`,
  `TS18048`) alongside the accepted revision, and builds opaque
  `/runs/:id/artifacts/:name` URLs. Missing artifacts throw
  `RunArtifactError` (empty state, never fake data). Zero model calls.
- `apps/api/src/runs.ts` — `GET /runs`, `GET /runs/demo` (newest ACCEPTED,
  else newest presentable run, else 404 guidance), `GET /runs/:runId`,
  `GET /runs/:runId/artifacts/:name` (allow-list + containment + strict
  content types). Runs root resolves from `A11YFORGE_RUNS_DIR` or the
  nearest `.a11yforge/runs`. No repair intelligence, no writes, no
  arbitrary file access.
- `apps/web` — one main run page (dark engineering console): run header +
  status, 11-stage pipeline (failed Attempt 1 preserved), focus-trace
  evidence with escaped step marked, expected-vs-actual, before/after
  assertion table + screenshots, observed-vs-inferred diagnosis, source
  trace with evidence-derived terms, Attempt 1/2 diff viewer (bounded,
  accessible markup), deterministic gates visually separated from the AI
  critic, critic decision + remaining risks. Client-fetched from the API;
  empty state when artifacts are absent; itself axe-clean (0
  serious/critical).

Rejection returns the run to diagnosis with the failed evidence attached. The
loop is bounded: a fixed retry budget, then the issue is reported unrepaired
with full evidence.

## Phase 6.5 live orchestration (implemented)

`POST /runs` starts one controlled autonomous repair against the fixture
(`packages/engine/src/autorun/pipeline.ts` — scan → keyboard → diagnosis →
trace → proposal → verify → critic with real stage timeouts) and returns
immediately; `GET /runs/:runId/status` is pollable and
`GET /runs/:runId/events` streams the real pipeline events over SSE
(`apps/api/src/live-runs.ts`, shapes in `packages/shared/src/live-run.ts`).
No database: the artifact directory stays the source of truth, one run at a
time (second start → 409), missing `MODEL_API_KEY` → 503 with guidance.
The console renders progressive evidence honestly — instant stages display
as instant — and settles finished live runs through the full recorded
console. Recorded and live are never mixed: `LIVE RUN` vs `RECORDED` badges.

## Phase 7 deployment + recorded demo (implemented)

```text
.a11yforge/runs/<accepted-id>/  →  pnpm demo:export  →  demo/accepted-run/
(sanitized: no abs paths,          (manifest: mode=recorded,
 no request IDs, no secrets)        source=real-a11yforge-run, sha256)
        ↓
API read path: local runs when present, else the committed bundle
        ↓
console lands on the RECORDED accepted run with no key, no browser, no disk
```

- `packages/engine/src/demo/bundle.ts` — exporter + validator: requires an
  explicitly named ACCEPTED revision lifecycle, schema-validates every
  artifact the read model consumes, keeps evidence/diffs/usage/before-after
  screenshots, strips request IDs to null and the machine-local source root
  to `fixtures/broken-shop`, and refuses on any absolute path, secret-like
  value, or banned key. Nothing is written unless every check passes;
  `pnpm demo:validate` re-verifies schemas, integrity hashes, evidence
  completeness, and cleanliness. Zero model calls.
- `apps/api/src/runs.ts` — `A11YFORGE_DATA_DIR` runtime root,
  `resolveLiveRunsDir()` for writes, `resolveRunsDirWithSource()` for reads
  (local artifacts when a run exists, else the committed bundle). Live
  `POST /runs` writes only to the writable dir — never into `demo/`.
- `apps/api/src/index.ts` — safe `GET /health` (status/service/version plus
  `modelConfigured`, `demoMode`, `dataDirWritable` booleans; never keys,
  paths, or env values), `A11YFORGE_CORS_ORIGIN`, and startup validation
  that warns but never crashes without credentials.
- `apps/web` — health-driven notices: the exact
  `Live Meta execution unavailable — MODEL_API_KEY not configured` banner
  plus a bundled-recorded explainer; the recorded console is the landing
  state after a clean clone/build.
- `Dockerfile` + `.dockerignore` — pinned Node 20, workspace install and
  build, Playwright Chromium with system deps, non-root user, writable
  `/data/a11yforge` volume, healthcheck on `/health`, no baked secrets.
  `pnpm start` launches web + API in production mode.

Trust model, unchanged: the verifier stays authoritative, the critic stays
advisory on passing repairs, and recorded evidence is never presented as
a live run.

## Phase 8 universal exploration (implemented)

Two layers, kept distinct:

```text
UNIVERSAL EXPLORATION (no source, 0 model calls)
  URL → Browser → semantic surface discovery → accessibility probes
    → deterministic evidence → human-readable findings

OPTIONAL SOURCE REPAIR (source connected; Phases 2–5b, unchanged)
  Evidence → diagnosis → source trace → repair → verifier
    → bounded revision → critic
```

The controlled `broken-shop` fixture is test infrastructure, not the
product. No production explorer behavior is designed around it, and an
automated source scan (`anti-coupling.test.ts`) rejects fixture-specific
identifiers, routes, and target-conditional behavior in generic modules.

```text
paste URL → POST /explorations (SSRF-safe validation, 202 + runId)
  → engine explore/ orchestrator (real Chromium, request-guard routing)
  → same-origin crawl (bounded pages, normalized/deduped links)
  → per page: surface snapshot (roles, names, ARIA states, keyboard order)
  → generic probes (axe → keyboard → dialog → form → tabs → disclosure)
  → findings projection (fixed human-language templates, 0 model calls)
  → run artifacts (.a11yforge/runs/<run-id>/) + SSE stage events
  → product UI (landing → live progress → finding cards + screenshots)
```

- `packages/shared/src/explore.ts` — target, surface, element-ref, probe,
  finding, run, and event schemas plus the finding summary projection.
- `packages/engine/src/explore/` — `target.ts` (SSRF-safe validation:
  http/https only, DNS resolution with private/link-local/loopback/
  reserved rejection unless `A11YFORGE_ALLOW_PRIVATE_TARGETS=true`,
  per-request redirect revalidation with verdict caching), `surface.ts`
  (in-page semantic snapshot + stable element references + navigable-link
  filtering), `probes/` (applicability from runtime semantics; safe-only
  interactions — Tab/Shift+Tab, focus inspection, Escape restoration;
  forms never submitted; unsafe activations reported `not-tested`),
  `findings.ts` (deterministic human copy), `orchestrator.ts`
  (bounded crawl, screenshots with geometry overlays, cancellation via
  AbortSignal, browser always released), `explore-cli.ts`
  (`pnpm explore -- --url …`, the same engine the product uses).
- `apps/api/src/explorations.ts` — `POST /explorations` (202),
  `GET /explorations/:runId`, `GET /explorations/:runId/events` (SSE),
  `GET /explorations/:runId/screenshots/:name` (allow-listed),
  `POST /explorations/:runId/cancel`. Recorded repair data never
  appears here; live failures are reported honestly.
- `apps/web` — `/` is the product landing (one URL field, one action);
  `/explore/:runId` shows live progress, finding cards, screenshots, and
  coverage gaps; `/connect` is the honest source-repair placeholder;
  `/console` hosts the previous forensic console as advanced technical
  evidence (recorded repair demo intact).

Safety model: URL safety is structural (scheme + DNS classification, not
blocklists of names); interaction safety is structural (only reversible
or observational actions — never submit, purchase, delete, upload,
message, or mutate — with popup/dialog semantics and submitter/form
checks gating every activation). `not-tested` is a first-class result.

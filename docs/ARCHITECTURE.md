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

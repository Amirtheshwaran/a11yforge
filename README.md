# A11yForge

Autonomous accessibility engineering for web applications. Hackathon build.

A11yForge does not merely report accessibility issues. It experiences them
(keyboard replays against the real app), traces them to source, patches the
source, rebuilds, replays the exact interaction, and accepts the repair only
when deterministic evidence proves it — rejecting its own work otherwise. See
[docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/ROADMAP.md](docs/ROADMAP.md).

## Why the first rejected repair matters

The demo run's Attempt 1 functionally fixed the focus escape but failed strict
TypeScript (`TS18048`). The deterministic verifier rejected it — no critic
call was spent on a failing repair — and a bounded revision added one guard
line that passed every gate. That rejection is preserved in the console: an
engine that hides its failed repair cannot be trusted with its accepted one.

## How deterministic verification constrains the AI

Two-level trust model: the deterministic verifier is authoritative (build,
replayed assertion, axe regression comparison decide eligibility; any failure
rejects without spending the critic call). The AI critic adjudicates ONLY an
otherwise passing repair — it can never override deterministic failure.

## Quick start

Requires Node.js >= 20 and pnpm.

```sh
pnpm install
pnpm dev
```

- Web shell: http://localhost:3000 (not running until you start it)
- API health: http://localhost:3001/health (not running until you start it)

## Scripts

| Script            | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Run web + API dev servers in parallel     |
| `pnpm build`      | Build every workspace package             |
| `pnpm typecheck`  | Strict `tsc --noEmit` in every workspace  |
| `pnpm lint`       | ESLint across the repo                    |

## Local demo

Requires the accepted repair artifacts on disk (produced by the Phase 2–5
pipeline; never committed — the console renders them, it never fakes them):

```sh
pnpm install
pnpm dev          # web on :3000, API on :3001
```

Open [http://localhost:3000](http://localhost:3000) in a browser. The console
loads the latest accepted run (`GET /runs/demo`): pipeline, focus evidence,
before/after, diagnosis, source trace, both diffs, deterministic gates, and
the critic verdict. With no local artifacts it shows an empty state, never
placeholder data. Zero live model calls are made by this page.

## Layout

```text
apps/
  web/        Next.js development shell (real dashboard comes later)
  api/        Fastify API (GET /health only for now)
packages/
  engine/     Future autonomous repair loop (shell only)
  meta/       Future Meta model provider (shell only)
  shared/     Shared schemas and types
fixtures/     Future controlled broken-accessibility targets
docs/         Project spec, architecture, roadmap
```

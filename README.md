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
pnpm build
```

For a live autonomous repair, export a Meta Model API key (server-side only —
never committed, never sent to the browser):

```sh
export MODEL_API_KEY=<your-key>
```

Then:

```sh
pnpm dev
```

- Web console: http://localhost:3000 (not running until you start it)
- API health: http://localhost:3001/health (not running until you start it)

Open [http://localhost:3000](http://localhost:3000) in a browser and click
**Start Autonomous Repair**. The backend runs the real pipeline against the
Broken Shop fixture (scan → keyboard test → diagnosis → source trace →
proposal → isolated verify → critic) and streams live events to the console:
stages progress, evidence appears as each artifact lands, and the final
verdict becomes ACCEPTED or REJECTED. At most 4 live Meta calls per run
(diagnosis, proposal, at most one bounded revision, critic if eligible);
usage is shown after the run, and no cost is computed. Without
`MODEL_API_KEY` the button explains the missing key instead of crashing.

## Scripts

| Script            | What it does                              |
| ----------------- | ----------------------------------------- |
| `pnpm dev`        | Run web + API dev servers in parallel     |
| `pnpm build`      | Build every workspace package             |
| `pnpm typecheck`  | Strict `tsc --noEmit` in every workspace  |
| `pnpm lint`       | ESLint across the repo                    |

## Local demo

Two views, clearly labeled:

- **LIVE** — start a real autonomous run with the button (requires
  `MODEL_API_KEY`; at most 4 live Meta calls, usage shown afterwards).
- **RECORDED** — the previously completed accepted run (`GET /runs/demo`):
  pipeline, focus evidence, before/after, diagnosis, source trace, both
  diffs, deterministic gates, and the critic verdict. The recorded run stays
  available even if a live attempt hits a transient failure, and it is never
  presented as a current live run.

```sh
pnpm install
pnpm build
pnpm dev          # web on :3000, API on :3001
```

With no local artifacts the recorded view shows an empty state, never
placeholder data. Run artifacts live under `.a11yforge/` (git-ignored).

## Layout

```text
apps/
  web/        Next.js console: live autonomous runs + recorded demo run
  api/        Fastify API: run orchestration (POST /runs, SSE events)
packages/
  engine/     Autonomous repair loop + live-run pipeline orchestration
  meta/       Bounded Meta model caller (diagnosis, proposal, critic)
  shared/     Shared schemas and types (incl. live-run stream shapes)
fixtures/     Controlled broken-accessibility targets (Broken Shop)
docs/         Project spec, architecture, roadmap
```

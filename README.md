# A11yForge

Autonomous accessibility engineering for web applications. Hackathon build.

Phase 0: clean TypeScript monorepo foundation only. No scanner, no browser
automation, no AI repair yet. See [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/ROADMAP.md](docs/ROADMAP.md).

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

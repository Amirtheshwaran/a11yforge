# A11yForge — Agent Instructions

A11yForge is an autonomous accessibility engineer: it finds real accessibility
issues, traces them to source, patches them, rebuilds, replays, and proves the
fix with evidence. These rules are permanent — they apply in every phase.

## Engineering rules

1. **TypeScript-first.** All product code is strict TypeScript. Keep
   `pnpm typecheck` and `pnpm lint` clean; never weaken configs to silence
   them.
2. **Evidence before AI reasoning.** No model call without deterministic
   evidence attached (scanner output, DOM/AX snapshots, replay traces).
   A claim without evidence is a hypothesis, not a result.
3. **Deterministic tools before model inference.** Browsers, scanners, and
   replayers establish facts first; models interpret those facts. Never let a
   model substitute for a measurement you can run.
4. **Structured AI outputs.** Every model call uses a fixed schema and is
   validated on return. Reject and retry (bounded) on schema violations.
5. **Bounded model calls.** Fixed call budgets per run and per phase. No
   open-ended agents, no models with shell access, no unbounded retries.
6. **Minimum safe patches.** Repairs are the smallest change that resolves the
   evidenced issue. No refactors, no unrelated edits, no speculative fixes.
7. **Verification required before accepting a repair.** A patch is accepted
   only when replayed before/after evidence proves the issue resolved. Failed
   verification returns to diagnosis with the evidence attached.
8. **No secrets in source.** API keys and credentials live in environment
   variables or local env files only — never committed, never in code, never
   in docs or fixtures.

## Monorepo

- `apps/web` — Next.js UI (renders engine state, runs no repairs).
- `apps/api` — Fastify service (validates, delegates to engine).
- `packages/engine` — repair loop and deterministic tooling.
- `packages/meta` — the only Meta model caller.
- `packages/shared` — cross-boundary schemas and types.
- `fixtures/` — controlled broken targets. `docs/` — spec, architecture, roadmap.

## Commands

- `pnpm dev` — web + API dev servers. `pnpm build` — build all workspaces.
- `pnpm typecheck` — strict check everywhere. `pnpm lint` — ESLint repo-wide.

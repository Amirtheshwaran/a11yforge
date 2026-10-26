# broken-shop — intentionally inaccessible fixture

> **WARNING: the accessibility bugs in this app are deliberate test fixtures.**
> Do NOT "fix" them. They exist so the Phase 1 deterministic scanner has
> known violations to find. Fixing one silently breaks `pnpm scan:fixture`
> expectations and the engine smoke test
> (`packages/engine/src/scanner/fixture-smoke.test.ts`).

A tiny React + Vite e-commerce product/checkout page served on
`http://localhost:3002` (`pnpm fixture:dev` from the repo root).

## Deliberate defects (all deterministic axe-core violations)

| # | axe rule | Scanner selector | What is wrong |
|---|----------|------------------|---------------|
| A | `button-name` (critical) | `.quantity-decrement` (`src/App.tsx`) | Quantity decrement shows only an `aria-hidden` minus icon: no text, no `aria-label`, no `title`. The increment button is intentionally correct (`aria-label="Increase quantity"`) for contrast. |
| B | `image-alt` (critical) | `img` (`src/App.tsx`) | Product image (`public/product.svg`, locally drawn, no third-party rights issues) has **no `alt` attribute at all**. |
| C | `label` (critical) | `#email` (`src/App.tsx`) | The visual "Email" text is a plain `<div>`, not a `<label>`, and the input deliberately has **no `placeholder`** (axe-core accepts a non-empty placeholder as a label, which would mask this defect). The "Full name" field is intentionally correct (`<label htmlFor>`) for contrast. |
| D | `color-contrast` (serious) | `.fine-print` (`src/App.tsx`, `src/styles.css`) | `#999` on white (measured 2.84:1), below the 4.5:1 requirement for small text. Do not darken it. |

Out of scope for this fixture (belong to later phases): keyboard traps,
modal focus bugs, and any interaction-dependent defects.

## Changing this fixture

If you add, remove, or alter a defect, you must also update:

- this README's table,
- the expected rule list in `docs/ROADMAP.md` (Phase 1),
- `packages/engine/src/scanner/fixture-smoke.test.ts`.

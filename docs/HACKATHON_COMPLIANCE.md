# A11yForge Hackathon Compliance & Architecture Disclosure

## 1. Submission Overview
- **Event:** Meta Global AI Developer Hackathon
- **Track:** Indie Developer Track (Individual student project by `Amirtheshwaran`)
- **Theme:** Push the Frontier
- **Positioning:** Evidence-driven autonomous accessibility repair system combining deterministic browser probes, Meta model reasoning, bounded source patching, and deterministic replay verification.

---

## 2. Meta Technology Actually Used
- **Model:** `muse-spark-1.3-contributor` / `meta-models/muse-spark-open-1026`
- **Provider Layer:** OpenAI-compatible Chat Completions API with constrained JSON Schema decoding (`packages/meta/src/provider.ts`).
- **Grounded AI Operations:**
  1. `accessibility-diagnosis`: Diagnoses observed browser failure from evidence bundle.
  2. `accessibility-repair-proposal`: Proposes bounded source code patches anchored to exact file lines.
  3. `accessibility-repair-revision`: Revises failed repairs using deterministic compiler feedback.
  4. `repair-critic-review`: Evaluates patched code against safety constraints.
- **Credit Discipline:** Maximum model calls per repair run is strictly bounded (default 1, maximum 2 during revision). Exploration and scanning are 100% deterministic and consume zero model credits.

---

## 3. Provider & Inference Architecture (CONFIRMED vs. UNCONFIRMED)
- **Active Production Runtime (CONFIRMED):** Direct Meta Model API (`https://api.meta.ai/v1`) using `muse-spark-1.3-contributor`. Configured via `MODEL_API_KEY` and tested via live provider integration tests.
- **Baseten Integration (DOCUMENTED / OPTIONAL ARCHITECTURE):** Baseten is supported as an open-weights host for Meta models (e.g. Llama 3 / Muse Spark models) through the configurable `MODEL_BASE_URL` environment variable. In this local host environment, runtime traffic routes directly to the Meta API. We do not claim active Baseten cloud execution when operating against the primary Meta endpoint.

---

## 4. Deterministic Gates vs. Model Roles
The model is never allowed to establish facts or certify its own repairs:

```text
Browser Facts:        Playwright + axe-core (Authoritative)
Model Role:           Synthesize explanation & propose code edit
Source Facts:         AST parsing + git inventory (Authoritative)
Build / Typecheck:    TypeScript compiler `tsc` (Deterministic Gate)
Replay Verification:  Playwright reproduces original scenario (Deterministic Gate)
Regression Gate:      Full page axe re-scan verifies no new defects (Deterministic Gate)
```

If a proposed fix fails `tsc` or fails replay, **the fix is rejected**, demonstrating the system's safety architecture.

---

## 5. Live Scans vs. Recorded Demo
- **Live Scans (Real Target Verification):**
  1. `https://example.com/`: 1 page, 4 findings (3 automated findings, 1 observation), 1 screenshot (`screenshot-0.png`), 0 errors, 0 limitations.
  2. `https://dequeuniversity.com/demo/mars/`: 1 page, 12 findings (including `keyboard-traversal-10` focus escape and `form-relationships-11` missing labels, plus 10 axe findings), 3 screenshots, 46 spatial markers mapped, 0 errors.
  3. `https://news.ycombinator.com/`: 1 page, 3 findings (keyboard traversal observation, 1 unlabeled form control, color contrast), 2 screenshots, 50 spatial markers, 0 errors.
- **Recorded Demo:** Explicitly labeled as `"Recorded real repair"` in the UI and powered by committed artifacts in `demo/accepted-run`. Recorded runs are never misrepresented as live inference.

---

## 6. Execution Model: Web Platform vs. Local CLI
- **Web Platform:** Handles live website exploration, 3D element spatial mapping, visual screenshot capture, guided issue walkthrough, and source AST matching.
- **Local CLI Helper:** For developers who prefer not to give hosted cloud services push access to their local source code or private repositories, A11yForge provides the `Fix locally instead` path (`pnpm --filter @a11yforge/cli repair ...`) which runs the sandbox repair and compiler/replay verification loop locally on the developer's machine.

---

## 7. Security & Guardrails
- **SSRF Protections:** Validates URL schemes, rejects private/loopback IP addresses unless explicitly permitted in development mode.
- **Source Sandbox:** Isolated disposable workspaces for git clones and patches (`packages/engine/src/source/sandbox.ts`).
- **Secret Hygiene:** Environment variables, API keys, and credential patterns are actively stripped from execution environments and rejected from telemetry artifacts.

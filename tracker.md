# A11yForge — Project Tracker

## Legend

- ✅ Done
- 🟡 Current / next
- ⬜ Planned
- ⛔ Explicitly deferred

---

# 1. Core roadmap

| Area | Status | Notes |
|---|---:|---|
| Monorepo foundation | ✅ | pnpm workspaces, TS, lint/build |
| Deterministic axe scanner | ✅ | Local axe-core, normalized findings |
| Keyboard interaction evidence | ✅ | Playwright focus tracing |
| Grounded Meta diagnosis | ✅ | Structured output + evidence validation |
| Deterministic source trace architecture | ✅ | Proven on regression fixture |
| Exact-anchor repair proposal | ✅ | Bounded source edits |
| Isolated repair workspace | ✅ | Original fixture preserved |
| Deterministic verification | ✅ | Build/replay/axe gates |
| Bounded repair revision | ✅ | Max 2 attempts |
| AI critic after deterministic success | ✅ | Cannot override verifier |
| Observable technical console | ✅ | Advanced evidence view |
| One-button live orchestration | ✅ | SSE progress |
| Recorded accepted demo | ✅ | Sanitized real run |
| Docker/deployment hardening | ✅ | Non-root container, Playwright |
| Universal URL explorer | ✅ | Arbitrary safe HTTP/HTTPS |
| SSRF-safe target validation | ✅ | Redirect revalidation |
| Same-origin crawl | ✅ | Bounded |
| Semantic surface discovery | ✅ | Framework-independent |
| Generic accessibility probes | ✅ | axe/keyboard/dialog/form/tabs/disclosure |
| Human-facing UX | ✅ | Landing + findings |
| Anti-fixture coupling | ✅ | Generic module scan/tests |
| Generic source connection | 🟡 | Next major phase |
| Generic source inventory | 🟡 | Phase 9 |
| Generic source trace from Phase 8 evidence | 🟡 | Phase 9 |
| Execution-profile discovery | 🟡 | Phase 9 |
| Untrusted source sandbox | 🟡 | Phase 9 |
| Generic repair replay | 🟡 | Phase 9 |
| Patch download | 🟡 | Phase 9 |
| Public deployment | ⬜ | After core Phase 9 |
| Submission/demo polish | ⬜ | After feature freeze |
| Baseten / Muse Spark Open bonus | ⛔ | Only after core is safe |
| GitHub write/PR automation | ⛔ | Not needed for core |
| Private repo OAuth | ⛔ | Not core |
| Multi-user auth | ⛔ | Not core |
| Collaboration | ⛔ | Not core |

---

# 2. Current sprint — Phase 9

## Source connection

- [ ] Define `SourceTarget`.
- [ ] Validate public Git URLs.
- [ ] Shallow clone into runtime data directory.
- [ ] Resolve/persist commit SHA.
- [ ] Disable submodule init.
- [ ] Ensure no hooks execute.
- [ ] Bound timeout and repo size.
- [ ] Cleanup failed/partial clones.
- [ ] Add trusted local-source CLI path.
- [ ] Prevent hosted arbitrary local filesystem browsing.

## Source inventory

- [ ] Deterministic file walk.
- [ ] Ignore `.git`.
- [ ] Ignore dependency/build/cache dirs.
- [ ] Text/binary classification.
- [ ] File-count cap.
- [ ] File-size cap.
- [ ] Total indexed-text cap.
- [ ] Manifest discovery.
- [ ] Lockfile discovery.
- [ ] Script extraction.
- [ ] Canonical symlink checks.
- [ ] Reject symlink escape.

## Generic source search

- [ ] Convert finding evidence into search fingerprints.
- [ ] Extract strong terms.
- [ ] Extract weak terms.
- [ ] Compute repository frequency.
- [ ] Rank rare terms more strongly.
- [ ] Search bounded files.
- [ ] Merge nearby matches.
- [ ] Create bounded snippets.
- [ ] Explain ranking.
- [ ] Produce FOUND.
- [ ] Produce AMBIGUOUS.
- [ ] Produce NOT_FOUND.
- [ ] No model ranking.

## Execution profile

- [ ] Define `ExecutionProfile`.
- [ ] Detect package manager from actual lockfile.
- [ ] Read actual manifest scripts.
- [ ] Record command source-of-fact.
- [ ] Support explicit user command fallback.
- [ ] No model-generated commands.

## Untrusted execution sandbox

- [ ] Disposable workspace.
- [ ] No host home exposure.
- [ ] No `MODEL_API_KEY`.
- [ ] No Git credential inheritance.
- [ ] No Docker socket.
- [ ] Command timeout.
- [ ] Process cleanup.
- [ ] Bounded stdout/stderr.
- [ ] Metadata/private network protection.
- [ ] Safe runtime data mount.
- [ ] Cleanup after completion.

## Repair integration

- [ ] Select one Phase 8 finding.
- [ ] Require reproducible evidence for automatic verified repair.
- [ ] Create bounded diagnosis bundle.
- [ ] Trace source deterministically.
- [ ] Enforce trace sufficiency.
- [ ] Reuse existing Meta diagnosis.
- [ ] Reuse exact-anchor proposal.
- [ ] Preserve hard model-call budget.
- [ ] No new repair architecture.

## Reproduction replay

- [ ] Persist generic `ReproductionPlan`.
- [ ] Map original path/query to repaired origin.
- [ ] Deterministic element re-resolution.
- [ ] Stable ID strategy.
- [ ] data-* fallback.
- [ ] role + accessible-name fallback.
- [ ] DOM fingerprint fallback.
- [ ] Ambiguity fails verification.
- [ ] Replay same actions.
- [ ] Replay same assertions.
- [ ] Capture after screenshot.
- [ ] Compare axe baseline.

## Outcomes

- [ ] VERIFIED.
- [ ] REJECTED.
- [ ] UNVERIFIABLE.
- [ ] Human-readable reason for each.
- [ ] Critic only after deterministic eligibility.

## Product UI

- [ ] Connect-source screen.
- [ ] Source-connected state.
- [ ] Commit/revision display.
- [ ] Source trace result.
- [ ] Bounded code snippet.
- [ ] Repair button.
- [ ] Human live stages.
- [ ] Verified result.
- [ ] Rejected result.
- [ ] Unverifiable result.
- [ ] View patch.
- [ ] Download patch.
- [ ] Technical evidence link.

---

# 3. Security checklist

- [ ] URL SSRF policy still green.
- [ ] Redirect revalidation green.
- [ ] Clone transport validation.
- [ ] Source root containment.
- [ ] Patch root containment.
- [ ] Symlink escape rejection.
- [ ] Secret isolation.
- [ ] No Docker socket.
- [ ] No host filesystem access.
- [ ] Target code never sees Meta credentials.
- [ ] Runtime timeouts.
- [ ] Output limits.
- [ ] Artifact allowlist.
- [ ] No absolute host paths in frontend.
- [ ] No arbitrary file serving.

---

# 4. Anti-hardcoding checklist

Generic production code must contain no special cases for:

- [ ] `broken-shop`
- [ ] checkout
- [ ] checkout-modal
- [ ] background-control
- [ ] expected source files
- [ ] fixture routes
- [ ] fixture labels
- [ ] expected compiler errors
- [ ] external validation domains
- [ ] external validation repo names
- [ ] framework-specific repair conditions

Fixture-specific tests may reference fixture data.

---

# 5. Validation checklist

Before Phase 9 commit:

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] engine tests
- [ ] meta tests
- [ ] API tests
- [ ] frontend tests if present
- [ ] universal URL exploration still works
- [ ] recorded demo still works
- [ ] Docker build still works
- [ ] health endpoint still works
- [ ] fixture repair regression still works
- [ ] A11yForge axe serious/critical = 0

---

# 6. External validation

## Source infrastructure repo 1
- [ ] unrelated public repo
- [ ] clone
- [ ] inventory
- [ ] execution profile
- [ ] trace behavior
- [ ] cleanup
- [ ] no production hardcode

## Source infrastructure repo 2
- [ ] unrelated public repo
- [ ] clone
- [ ] inventory
- [ ] execution profile
- [ ] trace behavior
- [ ] cleanup
- [ ] no production hardcode

## Optional one external end-to-end repair
- [ ] naturally occurring reproducible finding
- [ ] source matches real target
- [ ] isolated repair only
- [ ] max 4 live model calls
- [ ] no push to external repo
- [ ] real outcome recorded
- [ ] no fake success

---

# 7. Submission phase — after core freeze

- [ ] Public deployment.
- [ ] Production smoke test.
- [ ] README screenshots.
- [ ] Architecture visual.
- [ ] 3-minute demo script.
- [ ] 3-minute demo recording.
- [ ] 60-second backup demo.
- [ ] Project one-liner.
- [ ] Submission description.
- [ ] Judging-rubric mapping.
- [ ] X post.
- [ ] Final repo audit.
- [ ] Final secret audit.
- [ ] Final logged-out repo check.
- [ ] Final demo URL check.

---

# 8. Current product statement

Use this consistently:

> **A11yForge tests a website with a real browser, reproduces accessibility failures, and—when source code is connected—repairs the responsible code and replays the same failure to prove whether the fix worked.**

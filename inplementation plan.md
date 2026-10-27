# A11yForge — Implementation Plan

> Filename intentionally preserved as requested.

## 1. Goal

Finish the transition from:

> universal browser testing + fixture-proven repair

to:

> **universal browser testing + generic source-connected repair**

without introducing target-specific assumptions.

The browser-testing half is already general.

The next major milestone is to connect **real browser evidence** to **arbitrary connected source** and reuse the existing repair/verifier architecture.

---

# 2. Current baseline

## Completed

- Monorepo foundation
- Deterministic axe scanner
- Keyboard interaction evidence
- Grounded Meta diagnosis
- Deterministic source trace architecture
- Exact-anchor repair proposals
- Isolated repair workspace
- Deterministic build/replay/regression verification
- Bounded repair revision
- AI critic after deterministic success
- Observable engineering console
- One-button live fixture repair orchestration
- Recorded accepted repair bundle
- Docker/deployment hardening
- Universal arbitrary-URL explorer
- SSRF-safe target validation
- Same-origin bounded crawl
- Semantic surface discovery
- Generic accessibility probes
- Human-facing landing/results UX
- Technical console moved to advanced evidence
- External validation on unrelated public websites
- Anti-fixture-coupling checks

## Not yet generalized

- public Git source connection,
- trusted local source repair CLI,
- generic source inventory,
- generic source trace from Phase 8 browser fingerprints,
- generic execution profile discovery,
- safe isolated execution of arbitrary connected source,
- generic replay of Phase 8 reproduction plans,
- patch download for arbitrary connected source.

---

# 3. Phase 9 workstreams

## Workstream A — Source target foundation

### Deliverables
- `SourceTarget` schema
- public Git connector
- local source connector for trusted CLI
- resolved revision tracking
- controlled workspace paths
- cleanup policy

### Requirements
- no Git hooks,
- no automatic submodules,
- shallow clone,
- timeout,
- size/file bounds,
- no credential leakage,
- no original-source mutation.

### Acceptance
Two unrelated public repos can be cloned/inventoried with no production special cases.

---

## Workstream B — Source inventory

### Deliverables
- bounded file walk,
- manifest detection,
- lockfile detection,
- declared-script extraction,
- text/binary classification,
- symlink containment,
- ignored directory policy.

### Acceptance
Inventory output is deterministic and safe on:
- small repo,
- larger repo,
- symlink escape case,
- binary-heavy repo.

---

## Workstream C — Generic source tracing

### Deliverables
- browser-evidence fingerprint extraction,
- term rarity calculation,
- deterministic term weighting,
- repository search,
- candidate ranking,
- bounded snippets,
- trace status:
  - FOUND
  - AMBIGUOUS
  - NOT_FOUND

### Hard rule
No model chooses the source file.

### Acceptance
Given Phase 8 evidence, source trace explains which real browser fingerprints matched which source regions.

---

## Workstream D — Execution profile

### Deliverables
- generic `ExecutionProfile`
- actual manifest/script-derived commands
- package-manager detection from real lockfiles
- user-command fallback
- no model-generated shell commands

### Initial adapters
Only add adapters justified by real repository standards.

Possible:
- Node/package.json
- static HTML
- simple Python web metadata if straightforward

Do not build a framework encyclopedia.

### Acceptance
Every command includes its source-of-fact.

---

## Workstream E — Untrusted execution sandbox

### Deliverables
- isolated workspace/container for target source,
- no inherited secrets,
- no Git credentials,
- no Docker socket,
- bounded runtime,
- bounded logs,
- cleanup,
- network policy,
- private/metadata blocking.

### Security acceptance
A malicious repo must not be able to:
- read `MODEL_API_KEY`,
- read host home directory,
- access Docker socket,
- write outside workspace,
- escape through symlink,
- run forever.

---

## Workstream F — Generic repair integration

### Deliverables
- connect selected Phase 8 finding,
- build diagnosis bundle,
- deterministic trace sufficiency gate,
- bounded source context,
- existing structured diagnosis,
- existing exact-anchor repair proposal,
- patch artifact.

### Hard rule
Only source files/snippets supplied by deterministic trace can be edited.

---

## Workstream G — Generic verification replay

### Deliverables
- serialize Phase 8 `ReproductionPlan`,
- map original path/query to repaired verification origin,
- deterministic element re-resolution,
- replay same actions,
- rerun original assertion,
- rerun relevant axe checks,
- regression comparison.

### Outcomes
- VERIFIED
- REJECTED
- UNVERIFIABLE

### Hard rule
Build success alone never means verified.

---

## Workstream H — Bounded repair revision

Reuse existing architecture.

### Trigger
Only objective verifier failure.

### Max attempts
2 total.

### Feedback
Only relevant deterministic compiler/build/test/replay evidence.

### Hard rule
No infinite loop.

---

## Workstream I — Product UX

### Source connection screen
Simple Git URL input.

### Source trace screen
Show:
- source connected,
- resolved commit,
- responsible file,
- bounded snippet.

### Repair progress
Human stages:
- Connecting source
- Finding responsible code
- Creating repair
- Building repaired app
- Replaying failure
- Checking regressions
- Done

### Final outcomes
Human copy for:
- Verified
- Rejected
- Unverifiable

### Patch
- View fix
- Download patch

Technical details remain secondary.

---

# 4. Implementation sequence

## Step 1 — Add schemas first

Implement/shared:
- SourceTarget
- SourceInventory
- ExecutionProfile
- SourceTraceResult
- ReproductionPlan extensions if needed
- RepairResult public outcome

Run:
- typecheck
- schema tests

Stop if contracts become fixture-specific.

---

## Step 2 — Git/local source acquisition

Implement:
- public Git validation,
- shallow clone,
- local trusted path adapter,
- revision resolution,
- workspace cleanup.

Test:
- invalid transport,
- timeout,
- partial clone cleanup,
- submodule ignored,
- symlink safety.

---

## Step 3 — Source inventory

Implement bounded deterministic inventory.

Test against unrelated repos.

Do not execute repository code yet.

---

## Step 4 — Evidence fingerprint search

Input:
- one Phase 8 finding
- its evidence
- page route
- stable element refs

Output:
- deterministic terms
- rarity
- matches
- ranked candidates
- snippets

No AI.

---

## Step 5 — Execution profile

Build from:
- package manifests,
- lockfiles,
- declared scripts,
- explicit user commands.

Do not run anything yet.

---

## Step 6 — Sandbox source execution

Create disposable isolated target runtime.

First prove:
- secrets absent,
- host unavailable,
- path isolation,
- timeout,
- process cleanup.

Only after security tests pass may third-party commands execute.

---

## Step 7 — Wire existing model repair flow

Use current:
- Meta config
- structured output
- call budget
- usage telemetry
- exact-anchor validator
- bounded revision
- critic

Do not fork a second repair architecture.

---

## Step 8 — Reproduction replay

Take the selected Phase 8 finding's deterministic plan.

Launch repaired application.

Navigate to equivalent path/query.

Resolve elements deterministically.

Replay.

Persist:
- before
- after
- target assertion
- screenshots
- axe comparison.

---

## Step 9 — Product flow

Connect:
- finding card
- source form
- trace
- repair button
- live events
- result page
- patch download.

Do not expose internal enums as primary copy.

---

## Step 10 — External validation

Use at least:
- 2 unrelated public repositories for clone/inventory/execution-profile infrastructure
- 1 unrelated source-connected workflow where feasible

Do not hard-code validation targets.

Do not manufacture a bug.

---

# 5. Model budget

During implementation:
- use mocks,
- no unnecessary live product calls.

Optional final external repair:
- max 4 calls:
  1. diagnosis
  2. proposal
  3. optional revision
  4. optional critic

No retry for style.

---

# 6. Security gate before live external execution

Do not run untrusted connected repository code until these pass:

- [ ] source root containment
- [ ] symlink escape rejection
- [ ] host secret isolation
- [ ] `MODEL_API_KEY` absent
- [ ] Git credentials absent
- [ ] Docker socket absent
- [ ] command timeout
- [ ] process cleanup
- [ ] output bound
- [ ] network metadata protection
- [ ] disposable workspace cleanup

---

# 7. Product acceptance criteria

Phase 9 is done when:

- [ ] A Phase 8 finding can be selected.
- [ ] Public Git source can connect.
- [ ] Local source can connect through trusted CLI.
- [ ] Inventory is deterministic.
- [ ] Browser evidence creates source-search fingerprints.
- [ ] Source trace returns FOUND / AMBIGUOUS / NOT_FOUND.
- [ ] No model chooses files.
- [ ] Execution commands come from repository facts or user input.
- [ ] Third-party code executes only in isolation.
- [ ] Repair proposal is exact-anchor bounded.
- [ ] Patch download works.
- [ ] Repaired app can launch where supported.
- [ ] Same original failure can be replayed.
- [ ] VERIFIED / REJECTED / UNVERIFIABLE are distinct.
- [ ] No target-specific assumptions exist in generic production modules.
- [ ] Existing universal URL explorer remains green.
- [ ] Existing fixture regression repair remains green.
- [ ] A11yForge UI remains axe-clean.
- [ ] Commit and push complete.

---

# 8. After Phase 9

Feature freeze core architecture.

Next work should be:
1. product polish,
2. public deployment,
3. live demo rehearsal,
4. README visuals,
5. architecture graphic,
6. 3-minute submission video,
7. hackathon submission copy,
8. only then optional bonus-prize work.

Do not add another large architecture phase unless a real product blocker is found.

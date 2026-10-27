# A11yForge — Technical Specification

## 1. Purpose

This document defines the technical architecture for A11yForge as a general web accessibility exploration and source-connected repair system.

It distinguishes:
- **implemented functionality** through universal URL exploration,
- **existing repair-engine capabilities** proven on the internal regression fixture,
- **planned generic source-connection work** required to connect arbitrary browser evidence to arbitrary source.

No production component may depend on target-specific knowledge.

---

## 2. Repository shape

Current monorepo structure is based on pnpm workspaces.

Known major areas:

```text
apps/
  web/          # Next.js product UI
  api/          # Fastify API

packages/
  engine/       # deterministic browser, evidence, trace, verification, orchestration
  meta/         # Meta Model API integration
  shared/       # shared Zod schemas and types

fixtures/
  broken-shop/  # regression fixture only

demo/
  accepted-run/ # sanitized real recorded accepted run
```

The exact internal folder structure may evolve, but the separation of concerns must remain.

---

## 3. High-level architecture

```text
ARBITRARY WEBSITE
       |
       v
UNIVERSAL EXPLORER
       |
       +--> URL safety / redirect guard
       +--> Playwright browser
       +--> same-origin bounded crawl
       +--> semantic surface discovery
       +--> generic accessibility probes
       |
       v
DETERMINISTIC EVIDENCE
       |
       +--> finding projection
       +--> screenshots
       +--> action traces
       +--> reproduction plan
       |
       v
OPTIONAL SOURCE CONNECTION
       |
       +--> Git/local source acquisition
       +--> source inventory
       +--> execution profile
       +--> deterministic source trace
       |
       v
META REASONING
       |
       +--> diagnosis
       +--> repair proposal
       +--> bounded revision
       +--> optional critic
       |
       v
ISOLATED REPAIR WORKSPACE
       |
       +--> exact-anchor patch
       +--> project install/build/test
       +--> repaired application runtime
       |
       v
REPLAY SAME FAILURE
       |
       v
DETERMINISTIC VERIFIER
       |
       +--> target resolved?
       +--> build/typecheck/tests
       +--> same reproduction assertion
       +--> axe regression
       |
       +--> VERIFIED
       +--> REJECTED
       +--> UNVERIFIABLE
```

---

## 4. Universal exploration

### 4.1 Target input

A generic `WebTarget` is created from a submitted URL.

Responsibilities:
- normalize URL,
- enforce scheme,
- resolve host safely,
- enforce SSRF policy,
- assign run ID,
- apply exploration bounds.

### 4.2 SSRF guard

Hosted defaults:
- allow `http:` and `https:`,
- reject embedded credentials,
- reject loopback,
- reject RFC1918/private,
- reject link-local,
- reject metadata endpoints,
- reject reserved/non-routable ranges,
- revalidate every redirect.

Local opt-in:
- `A11YFORGE_ALLOW_PRIVATE_TARGETS=true`

The private-target flag must never be silently enabled in public deployment.

### 4.3 Browser

Playwright is the browser execution layer.

Browser responsibilities:
- navigation,
- screenshot capture,
- active element inspection,
- bounding boxes,
- semantic/DOM inspection,
- keyboard input,
- safe reversible actions.

Browser facts are authoritative.

### 4.4 Crawl

Default exploration:
- same-origin only,
- max ~3 pages,
- dedupe normalized URLs,
- skip mailto/tel/javascript/download links,
- bounded total duration,
- bounded actions per page,
- bounded screenshots.

Subdomains may remain different origins unless a future explicit policy broadens the crawl.

---

## 5. Accessibility surface model

Each visited page yields a bounded semantic surface.

Typical collected facts:

```text
PageSurface
  url
  title
  headings[]
  landmarks[]
  links[]
  buttons[]
  formControls[]
  dialogs[]
  menus[]
  tabs[]
  comboboxes[]
  disclosures[]
  keyboardOrder[]
```

Each interactive element should use a layered stable reference.

Suggested reference strategy:

1. stable `id`
2. stable `data-*`
3. role + accessible name
4. bounded DOM fingerprint/path fallback
5. ordinal when equivalent elements exist

Raw CSS selectors may be generated for execution but should not be the canonical identity.

---

## 6. Probe architecture

Generic interface concept:

```ts
interface AccessibilityProbe {
  id: string;
  applicable(surface: PageSurface): boolean;
  execute(ctx: ProbeContext): Promise<ProbeResult>;
}
```

Production probes must be target-independent.

### Implemented probe categories

#### Page axe scan
- local axe-core injection,
- normalized findings,
- no CDN dependency.

#### Keyboard traversal
- bounded Tab / Shift+Tab,
- active-element trace,
- visible/hidden/disabled focus checks,
- no unsupported interpretation.

#### Dialog behavior
Applicable only when a dialog is actually present/opened safely.

Potential checks:
- accessible name,
- initial focus,
- modal focus containment,
- Shift+Tab containment,
- Escape/focus restoration where deterministic and safe.

#### Form relationships
- accessible names,
- labels,
- required/disabled exposure,
- error relationships where already present,
- reachability,
- no automatic submit.

#### Tabs
- role relationships,
- selected state,
- controlled panels,
- reversible keyboard behavior.

#### Disclosure/popup
- only when semantics indicate a safe reversible interaction,
- unsafe interactions become `not-tested`.

---

## 7. Probe result contract

Core statuses:

```text
passed
failed
observed
not-applicable
not-tested
inconclusive
```

`not-tested` is required for honest coverage reporting.

A finding must not be manufactured from an observation.

---

## 8. Finding projection

User-facing categories:

```text
confirmed-failure
automated-finding
observation
not-tested
```

The product layer converts low-level evidence into human copy without requiring model inference when the assertion type is known.

Example:

Internal:
`focus-contained-in-modal = false`

Human:
> Keyboard focus can leave this dialog while it is still open.

Technical evidence remains available separately.

---

## 9. Reproduction plan

A generic reproducible interaction should be serialized.

Conceptual schema:

```text
ReproductionPlan
  pagePath
  initialConditions[]
  actions[]
  assertions[]
```

Generic action types:

```text
navigate
focus
tab
shift-tab
press-key
safe-click
inspect
```

Actions reference stable element references.

No model-generated browser scripts are allowed.

This plan becomes the verification contract for source-connected repairs.

---

## 10. Source connection — planned Phase 9

### 10.1 Source kinds

- Public Git repository
- Trusted local source directory via CLI

Private OAuth is out of scope for core Phase 9.

### 10.2 Source acquisition

Remote Git:
- shallow clone,
- bounded timeout,
- bounded size,
- no hooks,
- no submodule init,
- controlled runtime directory,
- resolved commit SHA persisted.

Local:
- trusted CLI path only,
- no arbitrary hosted filesystem browsing.

### 10.3 Source inventory

Deterministically collect:
- file tree,
- manifests,
- lockfiles,
- scripts,
- source candidates,
- size/count metadata,
- revision.

Ignore:
- `.git`
- `node_modules`
- build outputs
- caches
- coverage
- binary assets
- archives unless explicitly supported.

Canonicalize symlinks and reject root escapes.

---

## 11. Generic source tracing

### 11.1 Evidence fingerprints

Derive only from real browser evidence:

- IDs
- stable data attributes
- accessible names
- ARIA attributes
- rare text
- stable class tokens
- bounded HTML
- route/path context

### 11.2 Weighting

Deterministic scoring may use:
- exactness,
- rarity,
- number of distinct matched evidence items,
- match proximity,
- multiple evidence fingerprints in one region,
- textual/source-file plausibility.

No LLM ranking.

### 11.3 Outcomes

```text
FOUND
AMBIGUOUS
NOT_FOUND
```

Automatic repair requires a sufficient deterministic trace.

---

## 12. Execution profile

The system must never ask a model to invent shell commands.

Execution facts come from:
- actual manifests,
- lockfiles,
- declared scripts,
- supported standard project metadata,
- explicit user-supplied commands.

Conceptual structure:

```text
ExecutionProfile
  packageManager?
  workingDirectory
  installCommand?
  typecheckCommand?
  buildCommand?
  testCommands[]
  startCommand?
  readiness?
  evidenceSources[]
```

If A11yForge cannot determine a launch profile:

> Source connected, but launch instructions are required to verify repairs.

That leads to `UNVERIFIABLE` rather than fake success.

---

## 13. Untrusted source execution

Connected code is hostile by default.

Never execute arbitrary repository commands on the A11yForge host.

Execution environment requirements:
- disposable workspace,
- isolated filesystem,
- bounded CPU/time/processes where practical,
- bounded logs,
- no host secrets,
- no `MODEL_API_KEY`,
- no Git credentials,
- no Docker socket,
- no sensitive private-network access,
- cleanup on completion.

Installation/runtime network may be selectively enabled, but host/metadata access remains blocked.

---

## 14. Model provider architecture

Meta Model API is used for bounded reasoning operations.

Model:
- Muse Spark 1.3 Contributor by default.

Current reasoning policy:
- low reasoning for runtime diagnosis/repair/critic operations.

Hard run budget:
- up to 4 calls for a source-connected repair:
  1. diagnosis
  2. repair proposal
  3. optional bounded revision
  4. optional critic

No call is spent when a stage is unnecessary.

No model call may establish deterministic browser/source/build facts.

---

## 15. Diagnosis

Input:
- one selected finding,
- deterministic evidence,
- reproduction trace,
- relevant standards metadata,
- bounded source trace if available.

Output:
- structured diagnosis,
- observed failure,
- likely cause,
- repair strategy,
- evidence IDs,
- source-context requirement,
- confidence.

Validation:
- JSON-schema constrained decoding,
- Zod,
- evidence-reference validation.

---

## 16. Repair proposal

Repair proposal remains exact-anchor based.

Conceptual edit:

```text
RepairEdit
  filePath
  originalText
  replacementText
  reason
```

Local validation:
- supplied file only,
- anchor exists,
- anchor unique,
- replacement differs,
- edit/file count bounded,
- path inside source root,
- no ignored/config-bypass targets,
- evidence IDs valid.

---

## 17. Verification

### 17.1 Isolated application

Never patch original source first.

Workflow:
1. fresh workspace,
2. verify exact anchors,
3. apply proposal,
4. install/build/test where available,
5. launch repaired application,
6. map original page path/query to verification origin,
7. replay same reproduction plan,
8. compare assertion,
9. rerun relevant axe checks,
10. classify result.

### 17.2 Outcomes

```text
VERIFIED
REJECTED
UNVERIFIABLE
```

Potential internal lifecycle states can be richer, but these are the primary product outcomes.

### 17.3 Authority

Deterministic verifier is authoritative.

The critic:
- runs only after deterministic eligibility,
- cannot override failure,
- cannot certify an unreplayed target failure.

---

## 18. Bounded revision

At most two repair attempts.

If objective verifier feedback exists:
- compiler error,
- build failure,
- test failure,
- target replay failure,

one compact feedback bundle may be sent for a revision.

No unbounded repair loop.

---

## 19. API architecture

### Implemented exploration API concept

```text
POST /explorations
GET  /explorations/:runId
GET  /explorations/:runId/events
GET  /explorations/:runId/screenshots/:id
```

### Source-connected repair API — planned

Conceptual additions:

```text
POST /runs/:runId/findings/:findingId/source
GET  /source-connections/:sourceId
POST /source-connections/:sourceId/trace
POST /source-connections/:sourceId/repair
GET  /repairs/:repairId/events
GET  /repairs/:repairId/patch
```

Exact routes may follow existing API conventions.

All file/artifact serving must be allowlisted.

---

## 20. SSE

Live events are transport, not truth.

Events reflect actual state transitions.

Human-facing event mapping:

```text
Opening website
Exploring pages
Testing accessibility
Testing keyboard interactions
Reviewing evidence
Connecting source
Finding responsible code
Creating repair
Building repaired app
Replaying failure
Checking regressions
Done
```

Internal events may remain more granular.

---

## 21. Artifact model

Per-run durable artifacts may include:

```text
target.json
exploration.json
surface.json
probe-results.json
findings.json
screenshots/
reproduction-plan.json

source-target.json
source-inventory.json
execution-profile.json
source-trace.json

diagnosis.json
repair-proposal.json
repair-diff.patch
repair-feedback.json
repair-revision-proposal.json

verification.json
repaired-evidence.json
critic-decision.json
model-usage-summary.json
```

No artifact from one run may be silently mixed into another.

---

## 22. UI architecture

### `/`
Human product surface.

### live results
Simple findings and screenshots.

### `/connect`
Source connection for selected finding.

### technical evidence
Existing forensic console remains available under an advanced route/view.

Default UX never leads with:
- evidence IDs,
- model request IDs,
- trace scores,
- token usage,
- raw JSON.

---

## 23. Security boundaries

### Public URL boundary
SSRF guard + redirect revalidation.

### Browser boundary
No arbitrary destructive action.

### Source boundary
Canonical root containment + symlink protection.

### Execution boundary
Disposable isolated environment.

### Model boundary
Only bounded supplied evidence.

### Secret boundary
Model/runtime credentials never inherited by target code.

### Artifact boundary
Allowlisted serving + sanitization.

---

## 24. Deployment

Current production packaging includes:
- Node 20 container base,
- pnpm workspace build,
- Playwright Chromium/system dependencies,
- non-root user,
- writable runtime data directory,
- health endpoint,
- recorded demo fallback.

Production must remain usable without `MODEL_API_KEY` for deterministic exploration and recorded demo.

---

## 25. Testing strategy

### Unit
- URL validation
- source bounds
- ranking
- schema validation
- patch validation
- verifier gates

### Integration
- browser exploration
- SSE ordering
- source inventory
- isolated runtime
- artifact projection

### Regression fixture
The controlled fixture remains the known testbed for deep repair-loop regression.

### External validation
Use unrelated public targets/repositories without adding production special cases.

### Anti-hardcoding
Generic modules are scanned/tested for fixture-specific identifiers and expected paths.

---

## 26. Observability

Persist:
- run IDs,
- operation names,
- stage duration,
- model usage,
- request IDs where safe,
- target-safe error metadata.

Never persist:
- API secrets,
- authorization headers,
- hidden reasoning,
- raw environment dumps.

---

## 27. Failure philosophy

A11yForge must fail visibly and honestly.

Examples:
- target blocked,
- authentication required,
- probe not safe,
- trace ambiguous,
- build instructions missing,
- app cannot launch,
- original failure still reproduces,
- target element cannot be resolved.

None of these are silently converted into success.

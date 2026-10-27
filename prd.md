# A11yForge — Product Requirements Document

## 1. Product summary

**A11yForge finds accessibility failures in real websites, reproduces them with a real browser, and—when source code is connected—repairs the responsible code and proves whether the repair actually worked.**

The core product must be understandable without knowledge of WCAG, browser automation, agent architecture, model APIs, or internal verifier stages.

### Primary user-facing promise

> **Paste a website. A11yForge tests it with a real browser. Connect the source, and it can fix a confirmed issue and prove the fix worked.**

A11yForge is not a dashboard, chatbot, static report generator, or fixture-specific demo.

---

## 2. Problem

Accessibility tooling commonly stops at detection.

Developers receive:
- automated rule violations,
- vague issue descriptions,
- screenshots,
- or audit tickets.

They still have to:
1. reproduce the issue,
2. understand the affected interaction,
3. locate the responsible source,
4. implement a repair,
5. rebuild the application,
6. retest the exact behavior,
7. check for regressions.

That gap between **finding** and **verified repair** is the problem A11yForge solves.

---

## 3. Target users

### Primary
- Front-end engineers
- Full-stack engineers
- Accessibility engineers
- QA engineers
- Product teams maintaining web applications

### Secondary
- Engineering managers
- Design systems teams
- Developer tooling/platform teams
- Agencies auditing client applications

---

## 4. Product principles

1. **Real browser evidence first.**  
   Browser state—not a model guess—determines what exists and what happened.

2. **No target-specific assumptions.**  
   Production exploration and repair logic must not depend on application names, selectors, routes, labels, or frameworks known ahead of time.

3. **AI reasons; deterministic systems verify.**  
   Models may diagnose and propose changes only from supplied evidence. They do not establish browser facts or certify their own repairs.

4. **Honest outcomes beat fake success.**  
   A result may be `verified`, `rejected`, `unverifiable`, `not-tested`, or `inconclusive`.

5. **Safe by default.**  
   Universal exploration must not perform destructive or high-risk actions.

6. **Human-first UX.**  
   Normal users see what failed, where, what A11yForge did, and whether it was fixed. Internal evidence is secondary.

7. **The controlled fixture is test infrastructure only.**  
   It exists to regression-test A11yForge itself.

---

## 5. Current product state

### Implemented

A11yForge already supports:

- Arbitrary safe HTTP/HTTPS URL submission.
- SSRF-safe target validation.
- Same-origin bounded crawling.
- Browser-derived semantic surface discovery.
- axe-core scanning.
- Bounded keyboard traversal.
- Generic probes for dialogs, forms, tabs, disclosures/popups, and page-level accessibility.
- Human-readable findings.
- `passed`, `failed`, `observed`, `not-applicable`, `not-tested`, and `inconclusive` probe outcomes.
- Live progress events.
- Real Playwright screenshots.
- A simple user-facing URL testing flow.
- A separate technical evidence console.
- A full source-connected autonomous repair engine proven on the internal regression fixture:
  - evidence,
  - Meta diagnosis,
  - deterministic source tracing,
  - repair proposal,
  - isolated application,
  - deterministic verification,
  - bounded verifier-driven revision,
  - critic,
  - accepted/rejected lifecycle.
- Recorded real accepted repair demo.
- Production packaging and Docker support.

### Next core milestone

Generalize source-connected repair so the repair engine can operate from **arbitrary Phase 8 browser evidence + connected source**, without fixture or framework assumptions.

---

## 6. Core product flows

### Flow A — Test any website

1. User enters a URL.
2. A11yForge validates the target.
3. A real browser opens the site.
4. A bounded same-origin exploration runs.
5. Semantic UI surfaces are discovered from runtime state.
6. Applicable deterministic probes execute.
7. A11yForge returns human-readable findings and coverage.
8. User may inspect evidence.

### Flow B — Repair with source

1. User selects one reproducible finding.
2. User connects:
   - a public Git repository, or
   - a trusted local source directory through CLI.
3. A11yForge inventories the source deterministically.
4. Browser evidence is converted into deterministic source-search fingerprints.
5. Candidate source regions are ranked without AI.
6. If trace confidence is sufficient:
   - Meta diagnoses from bounded evidence,
   - Meta proposes a bounded exact-anchor repair.
7. The repair is applied only in an isolated workspace.
8. The connected project is built/run in an isolated execution environment.
9. The **same original failure** is replayed.
10. Deterministic regression checks run.
11. Final state is:
   - VERIFIED,
   - REJECTED,
   - or UNVERIFIABLE.
12. User may view/download the patch.

### Flow C — Recorded repair example

A real historical accepted run is bundled so the product remains understandable even without model credentials or live execution support.

It must always be labeled **recorded**, never live.

---

## 7. Functional requirements

### 7.1 Universal URL testing

The product must:
- accept arbitrary reachable HTTP/HTTPS URLs,
- reject unsupported schemes,
- reject unsafe private/reserved targets by default,
- revalidate redirects,
- support explicit private-target opt-in for local development,
- bound pages, actions, duration, and screenshots,
- clean up browsers on completion/cancellation/failure.

### 7.2 Semantic discovery

A11yForge must derive from the actual page:
- titles,
- headings,
- landmarks,
- links,
- buttons,
- form controls,
- dialogs,
- menus,
- tabs/tablists,
- comboboxes,
- disclosures,
- roles,
- accessible names,
- relationships,
- focus order,
- relevant stable attributes,
- bounded DOM evidence.

No model may invent page structure.

### 7.3 Generic probes

At minimum:
- page axe scan,
- keyboard traversal,
- dialog behavior,
- form relationships,
- tab interface behavior,
- disclosure/popup behavior when safe.

Probe applicability must depend on actual runtime semantics.

### 7.4 Finding categories

The product must distinguish:
- confirmed interaction failure,
- automated accessibility finding,
- observation,
- not-tested,
- inconclusive.

### 7.5 Human-readable findings

Each result should answer:
- What is wrong?
- Where did it happen?
- What did A11yForge actually do?
- How can the developer understand/reproduce it?
- Can source be connected for repair?

### 7.6 Source connection

Planned Phase 9 requirements:
- public Git repository connection,
- local source path via trusted CLI,
- resolved revision/commit tracking,
- deterministic source inventory,
- safe bounded clone,
- no submodule execution by default,
- no mutation of original source.

### 7.7 Generic source trace

Source search must derive only from real browser evidence such as:
- IDs,
- roles,
- accessible names,
- aria attributes,
- stable data attributes,
- stable class tokens,
- bounded HTML fingerprints,
- route/path context.

Candidate ranking must be deterministic.

Trace result must support:
- FOUND,
- AMBIGUOUS,
- NOT_FOUND.

### 7.8 Repair

Repair generation must:
- receive only bounded relevant source,
- cite real evidence,
- edit only supplied files,
- use exact source anchors,
- remain small and bounded,
- never weaken compiler/test configuration,
- never delete tests to force success.

### 7.9 Verification

A repair is only VERIFIED if the original selected failure is deterministically shown to be resolved.

Verification may include:
- exact-anchor application,
- install,
- typecheck,
- build,
- project tests,
- application startup,
- same route/path,
- same reproduction plan,
- target assertion,
- axe regression.

The critic cannot override deterministic failure.

### 7.10 Patch export

Source-connected repair must support:
- View fix
- Download patch
- base revision metadata

No automatic push/PR is required in the core product.

---

## 8. UX requirements

### Landing

Primary hierarchy:

1. Product name
2. One-line explanation
3. URL input
4. **Test accessibility**
5. **Try the demo**

Do not expose model/token/run internals on the landing page.

### Live run

Human stages:
- Opening website
- Exploring pages
- Testing accessibility
- Testing keyboard interactions
- Reviewing evidence
- Done

Show a real browser screenshot.

### Results

Top summary:
- issue count,
- confirmed failures,
- automated findings,
- coverage/not-tested information.

Finding card:
- title,
- severity,
- page,
- simple explanation,
- evidence button,
- connect-source CTA.

### Repair result

Successful:
> **Fixed and verified**

Rejected:
> **Repair rejected**

Unverifiable:
> **Repair proposed — verification unavailable**

Technical internals live under **Technical evidence**.

---

## 9. Non-functional requirements

### Security
- SSRF-safe URL handling.
- Redirect revalidation.
- Secret isolation.
- No arbitrary filesystem serving.
- Untrusted source never executes directly on host.
- No Docker socket passed into target workloads.
- Symlink/path containment.
- Command/process/time/output bounds.

### Reliability
- Stage timeouts.
- Cleanup in `finally` paths.
- No uncontrolled model retries.
- Model-call budget per repair run.
- Recorded demo fallback.

### Accessibility
A11yForge itself must:
- be keyboard operable,
- have visible focus,
- use semantic headings/landmarks,
- avoid color-only states,
- keep serious/critical axe findings at zero.

### Performance
- bounded crawl,
- bounded source indexing,
- bounded screenshots,
- bounded model context,
- bounded repair attempts.

---

## 10. Model usage

Meta models are used only where reasoning is required.

Allowed model-powered operations:
- grounded diagnosis,
- repair proposal,
- one bounded repair revision,
- optional critic after deterministic success.

Not model-powered:
- DOM discovery,
- browser facts,
- focus behavior,
- axe findings,
- source file existence,
- source search/ranking,
- build commands,
- test results,
- verification pass/fail.

---

## 11. Success criteria

A11yForge is successful when a developer can:

1. paste an arbitrary site URL,
2. receive real browser-derived accessibility findings,
3. connect source for one reproducible failure,
4. see A11yForge locate relevant code without preconfigured selectors/files,
5. receive a bounded source patch,
6. have the connected application rebuilt/run in isolation,
7. see the same original failure replayed,
8. receive VERIFIED / REJECTED / UNVERIFIABLE,
9. download the exact patch,
10. understand the entire outcome without learning A11yForge internals.

---

## 12. Hackathon positioning

A11yForge should be presented as:

> **An autonomous accessibility engineer—not another accessibility scanner.**

Key differentiation:

> **A scanner reports a problem. A11yForge reproduces it, traces it into source, repairs it, and reruns the original failure to prove whether the AI was right.**

The strongest trust story is the real historical repair in which:
- the first repair fixed browser behavior,
- strict TypeScript rejected it,
- A11yForge rejected its own model-generated code,
- verifier feedback produced one bounded revision,
- the second repair passed deterministic gates,
- only then was it accepted.

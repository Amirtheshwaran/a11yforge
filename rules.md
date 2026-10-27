# A11yForge — Non-Negotiable Engineering Rules

These rules apply to all future work unless explicitly revised in project documentation.

---

# 1. No target-specific production logic

Generic production modules must never depend on:
- target hostname,
- demo app name,
- expected route,
- expected button text,
- expected selector,
- expected source file,
- expected bug,
- expected fix.

The controlled fixture is allowed only in fixture-specific tests/regression infrastructure.

If production code needs:
```ts
if (hostname === ...)
```
to make a target work, the architecture is wrong.

---

# 2. Browser facts come from the browser

AI must never decide:
- what elements exist,
- what role exists,
- what was focused,
- whether a dialog exists,
- what a click did,
- whether an assertion passed,
- which page exists.

These facts come from Playwright/browser state.

---

# 3. Source facts come from the source

AI must never invent:
- filenames,
- directories,
- source text,
- line numbers not supplied,
- package manager,
- build command,
- start command,
- test command,
- framework.

Source inventory and manifests establish these facts.

---

# 4. Source ranking is deterministic

Models do not search or rank the repository.

Source trace must use deterministic evidence:
- IDs,
- accessible names,
- aria attributes,
- stable data attributes,
- rare text,
- stable classes,
- bounded HTML fingerprints,
- route context.

The model only receives source context after the deterministic trace.

---

# 5. AI cannot certify its own repair

A model may:
- diagnose,
- propose,
- revise,
- criticize.

A model may not decide that a repair worked.

The deterministic verifier is authoritative.

---

# 6. The original failure must be replayed

A repair is not VERIFIED because:
- it builds,
- tests pass,
- axe count improves,
- critic likes it,
- code looks correct.

The original selected failure must be replayed and shown resolved.

If it cannot be replayed:
- UNVERIFIABLE.

---

# 7. Honest status is mandatory

Valid product outcomes include:
- confirmed failure,
- automated finding,
- observation,
- not-tested,
- inconclusive,
- VERIFIED,
- REJECTED,
- UNVERIFIABLE.

Never convert uncertainty into green success.

Never say:
> Your site is accessible.

Prefer:
> No failures were reproduced in the interactions A11yForge tested.

---

# 8. Safe exploration only

Universal exploration must never automatically:
- purchase,
- submit destructive forms,
- delete,
- send messages,
- upload,
- create accounts,
- change passwords,
- log out,
- grant permissions,
- download files intentionally,
- perform arbitrary irreversible actions.

When safety cannot be established:
- `not-tested`.

---

# 9. Accessibility standards may be predefined; target behavior may not

It is valid to encode:
- modal focus containment,
- accessible naming requirements,
- form-label relationships,
- tab semantics,
- keyboard navigation invariants.

These are generic standards.

It is not valid to encode:
- “click Checkout,”
- “find #checkout-modal,”
- “expect src/App.tsx.”

---

# 10. No unbounded crawling

Every exploration has bounds:
- pages,
- actions,
- screenshots,
- duration.

Every source index has bounds:
- file count,
- file size,
- total text.

Every model operation has bounds:
- input context,
- output tokens,
- call count.

---

# 11. No unbounded repair loop

Maximum repair attempts:
- 2.

Typical:
1. proposal,
2. one verifier-driven revision.

No “keep asking the model until tests pass.”

---

# 12. Exact-anchor patching

Model repair edits must be applied through verified source anchors.

Before patch:
- file exists,
- path inside source root,
- original text supplied,
- original text occurs exactly once,
- replacement differs.

Ambiguous/missing anchors reject the patch.

---

# 13. Never modify original source before verification

Repairs run in an isolated workspace.

Original connected source remains unchanged.

The user receives:
- verified patch,
- rejected patch evidence,
- or unverifiable patch.

Automatic push/PR is not part of the core trust model.

---

# 14. Untrusted repository code is hostile

Never run connected third-party source directly on the A11yForge host.

Isolation must prevent target code from accessing:
- host home,
- Meta API key,
- Git credentials,
- Docker socket,
- A11yForge secrets,
- unrelated run data.

---

# 15. No secret inheritance

Target build/runtime environment must not inherit:
- `MODEL_API_KEY`,
- provider authorization,
- GitHub credentials,
- cloud credentials,
- full A11yForge environment.

Tests must explicitly verify this boundary.

---

# 16. No model-generated shell commands

Install/build/start/test commands come from:
- actual repository manifests,
- supported standard adapter facts,
- explicit user input.

Never:
> “Ask the model how to run this repo.”

---

# 17. SSRF safety is mandatory

Hosted URL exploration:
- http/https only,
- no credentials in URL,
- DNS classification,
- reject private/loopback/link-local/reserved,
- block metadata,
- revalidate redirects.

Private targets require explicit trusted local-development opt-in.

---

# 18. Symlinks cannot escape source root

Before:
- reading,
- indexing,
- copying,
- patching,

resolve canonical paths.

Reject escape outside connected source root.

---

# 19. No arbitrary file serving

Frontend artifact routes are allowlisted.

Never accept a filesystem path from the user and blindly return it.

Never leak:
- `/home/...`,
- runtime workspace paths,
- secret filenames,
- dotfiles,
- arbitrary repository files.

---

# 20. Recorded is never live

Recorded accepted demo data must be clearly labeled:
- RECORDED
- REAL HISTORICAL RUN

Never stream or animate recorded data while implying a new run is happening.

---

# 21. Product UX is human-first

Default UI should answer:
1. What happened?
2. Where?
3. What did A11yForge do?
4. Can it fix it?
5. Did the fix work?

Do not lead with:
- run IDs,
- evidence IDs,
- trace scores,
- schema names,
- model request IDs,
- token counts,
- lifecycle enums.

Technical details belong behind **Technical evidence**.

---

# 22. Do not make A11yForge look like an AI demo

Avoid:
- chat-first UX,
- fake typing,
- “AI thinking” animations,
- generic AI gradients,
- fake terminal output,
- meaningless agent personas.

The product is:
- browser testing,
- source repair,
- verification.

AI is implementation detail.

---

# 23. A11yForge itself must be accessible

New UI must preserve:
- keyboard operation,
- visible focus,
- correct labels,
- semantic headings,
- landmarks,
- non-color-only status,
- restrained live regions,
- sufficient contrast.

Target:
- 0 serious/critical axe findings.

---

# 24. Preserve evidence provenance

Every important claim should trace back to:
- browser observation,
- axe result,
- source match,
- compiler/build/test output,
- reproduction replay.

Do not make unsupported claims in artifacts or UI.

---

# 25. Separate observed fact from inference

Example:

Observed:
> Focus moved outside the active modal.

Inference:
> The modal implementation likely lacks focus containment.

Never merge these into:
> The source forgot a focus-trap hook.

unless source evidence actually proves it.

---

# 26. Model structured output is validated locally

For model-powered operations:
1. constrained JSON Schema output,
2. local Zod validation,
3. evidence-reference validation,
4. file/source validation where relevant.

Malformed output fails.

No silent second paid call.

---

# 27. Model usage is bounded and observable

Persist:
- model,
- operation,
- input tokens,
- output tokens,
- reasoning tokens where exposed,
- latency,
- request ID where safe.

Never expose the API key.

Never invent usage values.

---

# 28. Deterministic verifier outranks critic

If deterministic verification fails:
- critic is skipped.

A critic cannot change:
- REJECTED → VERIFIED.

The critic only reviews an already-eligible repair.

---

# 29. Existing regression fixture remains intentionally broken

Do not “clean up” the controlled broken fixture.

It exists to prove:
- finding regression,
- source trace regression,
- repair/revision regression,
- verifier regression.

The generic product must not depend on it.

---

# 30. External validation never becomes production special-casing

Do not add:
- external validation domains,
- public repo names,
- expected findings from test sites,

to production code.

Validation fixtures belong in tests/configuration only.

---

# 31. No unsupported universality claims

Allowed:
> Browser testing is framework-independent.

Allowed:
> Source repair is generic when A11yForge can trace the source and operate the project in isolation.

Not allowed:
> A11yForge can automatically fix every website/framework.

Generality must be real, not marketing.

---

# 32. Do not weaken user projects to make repair pass

Forbidden shortcuts:
- disabling TypeScript strictness,
- disabling `noUncheckedIndexedAccess`,
- `any` just to silence type errors,
- `@ts-ignore`,
- `@ts-expect-error` without legitimate supplied context,
- deleting tests,
- skipping failing project checks,
- weakening accessibility assertions.

Verifier feedback must improve the repair, not lower the bar.

---

# 33. Build failures are product information

If:
- install fails,
- build fails,
- test fails,
- runtime cannot start,

show it honestly.

Do not hide the failure in logs.

Do not automatically retry endlessly.

---

# 34. Keep one selected repair target at a time

Do not attempt to auto-fix all findings in a run.

User selects one reproducible issue.

Benefits:
- clear causality,
- bounded model context,
- bounded patch size,
- meaningful replay,
- safer verification.

---

# 35. Patch metadata must preserve provenance

Patch should include/associate:
- source revision,
- finding ID,
- proposal ID,
- repair ID.

A patch without its base revision is not a reliable artifact.

---

# 36. No background promises

Every requested operation must either:
- complete now,
- return a live run that can be observed,
- or fail clearly.

Do not present asynchronous work as magically continuing without an actual automation/runtime mechanism.

---

# 37. Git hygiene

Never commit:
- `.env`,
- API keys,
- `.a11yforge` runtime workspaces,
- browser caches,
- external cloned repos,
- package caches,
- absolute developer paths.

Commit:
- source,
- tests,
- docs,
- intentionally sanitized demo assets.

---

# 38. Core feature freeze rule

After generic source-connected repair works end-to-end:

Stop adding architecture.

Prioritize:
1. usability,
2. reliability,
3. deployment,
4. demo,
5. submission.

Bonus-prize integrations are allowed only after the core product is safe.

---

# 39. One-sentence test

Any new feature should support the product sentence:

> **Paste a website. A11yForge finds accessibility failures with a real browser. Connect the source, and it fixes a confirmed issue and proves whether the repair worked.**

If a feature makes that sentence harder to explain, it is probably not core.

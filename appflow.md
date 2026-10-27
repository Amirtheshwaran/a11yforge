# A11yForge — Application Flow

## 1. Product mental model

The user should understand A11yForge as:

> **Website in → real browser test → issue evidence → optional source connection → repair → replay → verified/rejected.**

The product must never force the user to understand the internal agent architecture.

---

# 2. Primary flow — Test a website

## Screen 1 — Landing

```text
A11yForge

Find. Fix. Prove accessibility.

Paste a website and A11yForge will test it with a real browser.

Website URL
[ https://example.com                         ]

[ Test accessibility ]

Try the demo →
```

### User action
Enters URL and clicks **Test accessibility**.

### System behavior
1. Validate URL.
2. Reject unsafe target if needed.
3. Create exploration run.
4. Open SSE/event connection.
5. Start Playwright exploration.

---

# 3. Live exploration

The user sees a small number of human stages:

```text
✓ Opening website
● Exploring pages
○ Testing accessibility
○ Testing keyboard interactions
○ Reviewing evidence
○ Done
```

### Hero content
Latest real browser screenshot.

### Secondary content
Simple progress facts:
- pages tested,
- controls discovered,
- current page,
- findings so far.

Do not show raw event IDs or model internals.

---

# 4. Exploration result

## Result header

Example:

```text
Accessibility test complete

4 issues found

1 confirmed interaction failure
3 automated findings
2 interactions could not be safely tested
```

If no deterministic failure exists:

```text
No accessibility failures were reproduced
in the interactions A11yForge tested.
```

Never say:
> Your site is accessible.

Always show coverage.

---

# 5. Finding card

Example:

```text
SERIOUS

Keyboard focus can leave this dialog
while it is still open.

Page:
https://site.com/settings

What happened:
After tabbing through the dialog controls,
focus moved behind the dialog.

[ See evidence ]

[ Connect source to repair ]
```

Automated axe finding:

```text
CRITICAL

This image has no text alternative.

Page:
https://site.com/products

[ See evidence ]

[ Connect source to repair ]
```

---

# 6. Evidence expansion

When user clicks **See evidence**:

```text
What A11yForge did

1. Focused the dialog close button
2. Pressed Tab
3. Pressed Tab
4. Pressed Tab

Expected:
Focus stays inside the dialog

Actual:
Focus moved to content behind the dialog
```

Include:
- screenshot,
- focus/action trace,
- relevant element references,
- standards reference if available.

Advanced link:

**View technical evidence**

---

# 7. Source connection

User clicks:

**Connect source to repair**

Screen:

```text
Connect source

A11yForge found a reproducible problem.
Connect the code so it can locate the responsible source.

Public Git repository
[ https://github.com/owner/repo              ]

[ Connect source ]

Testing a local project?
Use the A11yForge CLI.
```

No giant configuration form.

---

# 8. Source connection progress

```text
✓ Source connected
  Commit abc1234

● Finding responsible code...
```

System:
1. clone/copy source into controlled workspace,
2. build deterministic inventory,
3. derive source-search terms from browser evidence,
4. rank source candidates,
5. classify trace.

---

# 9. Source trace outcomes

## FOUND

```text
Responsible code located

src/components/Dialog.tsx

These lines contain identifiers and accessibility
attributes observed during the failing interaction.

[ bounded source snippet ]

[ Repair this issue ]

View source-trace evidence →
```

## AMBIGUOUS

```text
A11yForge found multiple possible source locations.

1. src/components/Dialog.tsx
2. src/features/settings/Modal.tsx

Automatic repair is paused because the source location
is not deterministic enough.
```

No model secretly chooses one.

## NOT_FOUND

```text
A11yForge could not confidently map this browser failure
to the connected source.

You can still download the evidence report.
```

---

# 10. Execution profile state

If A11yForge knows how to operate the repository from actual manifests/scripts:

```text
✓ Verification environment ready
```

If not:

```text
Source connected, but A11yForge needs launch instructions
to verify repairs.

[ Configure verification ]
```

Advanced configuration may accept explicit user commands:
- install,
- build,
- start,
- test.

These commands come from the user, never the model.

---

# 11. Repair start

User clicks:

**Repair this issue**

Human-facing stages:

```text
✓ Understanding failure
✓ Finding responsible code
● Creating repair
○ Building repaired app
○ Replaying failure
○ Checking regressions
○ Done
```

The model never controls the stage display directly; stages map from actual backend state.

---

# 12. Repair proposal

Do not force the user to approve raw AI prose.

Show:

```text
Repair created

1 file changed

src/components/Dialog.tsx

[ View proposed change ]

Verifying automatically...
```

Internally:
- exact anchors validated,
- edit bounds enforced,
- supplied-file constraint enforced.

---

# 13. Verification

User sees:

```text
Verifying repair...

✓ Source patch applied in isolation
✓ Build
● Replaying the original failure
○ Accessibility regression check
```

The product should visually reinforce that the repair is not trusted yet.

---

# 14. Successful outcome

```text
✓ Fixed and verified

Keyboard focus stays inside the dialog.

A11yForge replayed the exact failure against
the repaired application.

✓ Build
✓ Original failure replay
✓ Accessibility regression scan

0 new serious accessibility issues

[ View fix ]
[ Download patch ]
[ Technical evidence ]
```

Optional human-friendly before/after:

```text
BEFORE                      AFTER
Continue                    Continue
   ↓                           ↓
Background page ✕           Close ✓
```

---

# 15. Rejected outcome

```text
Repair rejected

A11yForge did not approve this repair because
it failed verification.

Reason:
The original accessibility failure still occurs.

[ View attempted fix ]
[ Technical evidence ]
```

Other reasons:
- build failed,
- compiler failed,
- tests failed,
- repaired app failed to launch,
- replay target became ambiguous.

No green success styling.

---

# 16. Unverifiable outcome

```text
Repair proposed — verification unavailable

A11yForge found the relevant source and created a patch,
but could not launch this project in the verification environment.

[ Download patch ]
[ Configure verification ]
[ Technical evidence ]
```

Never show VERIFIED.

---

# 17. Bounded repair recovery

If first repair fails an objective gate and bounded revision is eligible:

User sees:

```text
First repair rejected

The repair fixed the browser behavior but failed the project's
TypeScript checks.

A11yForge is using the compiler feedback to make one bounded revision.

● Revising repair...
```

Only one revision is allowed.

The user does not need to see compiler internals unless they open details.

---

# 18. Recorded full repair demo

Landing secondary action:

**Try the demo**

or:

**See a full verified repair**

This loads a real historical accepted run.

It must display:

```text
RECORDED REAL RUN
```

Never:
```text
LIVE
```

The recorded flow demonstrates:
- detected failure,
- first rejected repair,
- verifier feedback,
- second repair,
- deterministic success,
- critic accept.

---

# 19. Technical evidence flow

Advanced users can open:

**Technical evidence**

This view may show:
- raw evidence,
- probe results,
- source-search terms,
- source ranking,
- model diagnosis,
- repair proposal,
- exact diff,
- failed first attempt,
- compiler output,
- bounded revision,
- verification gates,
- critic,
- token usage.

This is not the normal product surface.

---

# 20. CLI flow

## Explore

```bash
a11yforge explore --url https://example.com
```

Output:

```text
Opening website...
Exploring pages...
Testing accessibility...
Testing keyboard interactions...

3 issues found.
1 confirmed interaction failure.

Run: run_...
```

## Repair from local source

```bash
a11yforge repair \
  --run run_... \
  --finding finding_... \
  --source .
```

## Repair from public Git

```bash
a11yforge repair \
  --run run_... \
  --finding finding_... \
  --git https://github.com/owner/repo
```

CLI and web must call the same engine.

---

# 21. Error states

## Invalid URL
> Enter a valid HTTP or HTTPS URL.

## Unsafe/private target
> This address is not available from the hosted explorer.

## Login required
> This page requires authentication, so A11yForge could not inspect the protected content.

## Bot protection
> The site blocked automated browser access.

## Exploration cancelled
> Test cancelled. Partial results were preserved.

## Source clone failed
> A11yForge could not retrieve this repository.

## Trace ambiguous
> Multiple source regions match the browser evidence. Automatic repair was paused.

## Build configuration unavailable
> Source is connected, but verification setup is required.

## Model unavailable
> The browser evidence remains available. Repair reasoning could not be completed.

---

# 22. Information hierarchy

Always prioritize:

1. Outcome
2. What happened
3. Evidence
4. Fix/next action
5. Technical internals

Never prioritize:
1. run IDs
2. evidence IDs
3. token counts
4. model operation names
5. internal lifecycle names

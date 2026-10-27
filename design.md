# A11yForge — Product Design Specification

## 1. Design objective

A11yForge must feel like a **developer product that happens to use AI**, not an AI demo.

The visual design should communicate:
- clarity,
- evidence,
- trust,
- verification,
- progress.

It should not communicate:
- mysterious AI magic,
- chatbot behavior,
- dense observability software,
- hackathon dashboard.

---

## 2. Core design rule

A normal developer should understand the product within 10 seconds.

Primary message:

> **Find. Fix. Prove accessibility.**

Secondary explanation:

> Paste a website and A11yForge tests it with a real browser. Connect the source and it can repair a confirmed issue and prove whether the repair worked.

---

## 3. Information layers

### Layer 1 — Normal user
- URL
- current progress
- findings
- screenshot/evidence
- source connection
- repair result
- patch

### Layer 2 — Developer detail
- reproduction steps
- affected source
- source snippet
- proposed diff
- build/test status

### Layer 3 — Technical evidence
- evidence IDs
- source ranking
- schemas
- compiler logs
- model usage
- critic output
- internal lifecycle

The landing/results experience must never begin at Layer 3.

---

## 4. Visual character

Recommended direction:
- dark neutral background,
- high-contrast readable text,
- restrained accent colors,
- strong typography,
- generous spacing,
- cards only where they improve grouping,
- large evidence/screenshot surfaces,
- normal prose for explanations,
- monospace only for code/technical metadata.

Avoid:
- purple/blue AI gradients,
- glowing orbs,
- glassmorphism overload,
- chat bubbles,
- fake terminal walls,
- giant metric dashboards,
- dozens of tiny pills,
- excessive animation.

---

## 5. Suggested design tokens

These are suggested visual defaults, not required architectural constants.

```css
--bg: #0b0f14;
--surface: #111821;
--surface-2: #17212c;
--border: #26313d;

--text: #f5f7fa;
--text-muted: #9aa7b4;

--accent: #5ea1ff;
--success: #45c478;
--warning: #e7b45a;
--danger: #ef6b6b;

--code-bg: #090d12;
```

Status must never rely on color alone.

Use icon/text pairing:
- ✓ Verified
- ✕ Rejected
- ! Needs review
- — Not tested

---

## 6. Typography

Preferred hierarchy:

### H1
Product/result statement.

### H2
Major stage or finding.

### Body
Human explanations.

### Small/meta
URLs, paths, timestamps.

### Monospace
Only:
- source code,
- shell commands,
- selectors/element refs,
- technical evidence.

Do not render the entire product in monospace.

---

## 7. Landing page

### Desktop structure

```text
-----------------------------------------------------
A11yForge                                  Try demo
-----------------------------------------------------

                Find. Fix.
              Prove accessibility.

  Paste a website and A11yForge will test it
               with a real browser.

  Website URL
  [ https://example.com                         ]

                  [ Test accessibility ]

-----------------------------------------------------

Experience        Find                  Prove
Real browser      Real failures         Real replay
```

No dashboard.

No architecture diagram above the fold.

No token usage.

No model branding above the primary CTA.

---

## 8. Live run layout

Desktop:

```text
-----------------------------------------------------
Testing https://site.com
-----------------------------------------------------

[ Browser screenshot                    ]   Exploring pages
[                                       ]   ✓ Opened website
[                                       ]   ● Testing keyboard
[                                       ]   ○ Reviewing evidence

Latest:
Testing dialog keyboard behavior...
-----------------------------------------------------
```

The screenshot is visually dominant.

Progress is secondary.

### Mobile

Stack:
1. current stage,
2. screenshot,
3. findings/progress.

---

## 9. Finding cards

Example:

```text
SERIOUS

Keyboard focus can leave this dialog
while it is still open.

Page
/settings

A keyboard user can move behind the dialog
without closing it.

[ See evidence ]

[ Connect source to repair ]
```

Do not show:
- `focus-contained-in-modal`
- internal evidence IDs
- raw JSON.

---

## 10. Finding evidence

Expanded detail:

```text
What A11yForge did

Close
  ↓ Tab
Email
  ↓ Tab
Continue
  ↓ Tab
Background page  ✕

Expected
Focus stays inside the open dialog.

Actual
Focus moved behind it.
```

Accompany with the real browser screenshot.

---

## 11. Source connection

Keep it tiny:

```text
Connect source

Public Git repository
[ https://github.com/owner/repo ]

[ Connect source ]

Testing local code?
Use the A11yForge CLI.
```

Only reveal advanced verification commands if auto-discovery fails.

---

## 12. Source trace

Default:

```text
Responsible code located

src/components/Dialog.tsx

These lines contain identifiers observed
during the failing browser interaction.

[ bounded code snippet ]

[ Repair this issue ]

View source-trace evidence
```

Do not show numeric ranking unless advanced details are opened.

---

## 13. Repair visualization

### While running

```text
Creating repair       ✓
Building repaired app ✓
Replaying failure     ●
Checking regressions  ○
```

### Important visual rule

A repair proposal is not green success.

Use neutral/progress styling until verification succeeds.

---

## 14. Verified result

Hero:

```text
✓ Fixed and verified

Keyboard focus now stays inside the dialog.
```

Then:

```text
BEFORE                     AFTER

Continue                   Continue
   ↓                          ↓
Background page ✕          Close ✓
```

Then:

```text
✓ Build
✓ Original failure replay
✓ Accessibility regression scan

0 new serious accessibility issues
```

Primary buttons:
- View fix
- Download patch

Secondary:
- Technical evidence

---

## 15. Rejected result

Hero:

```text
✕ Repair rejected

A11yForge did not approve this repair.
```

Reason is plain English:

> The original accessibility failure still occurs.

or:

> The project no longer passes its build checks.

Buttons:
- View attempted fix
- Technical evidence

No celebratory styling.

---

## 16. Unverifiable result

```text
— Repair proposed

Verification unavailable

A11yForge created a patch but could not launch
the connected project to replay the original failure.
```

Buttons:
- Download patch
- Configure verification
- Technical evidence

---

## 17. Recorded demo

Always show a visible label:

```text
RECORDED REAL RUN
```

Explain:

> This is a real historical A11yForge run bundled with the project. It is not executing now.

Never animate it as if it were live unless the UI says:
> Replay recorded run.

---

## 18. Technical evidence

The current dense console belongs here.

Recommended tabs/sections:

- Browser evidence
- Diagnosis
- Source trace
- Repair attempts
- Verification
- Critic
- Model usage

This is where engineering detail is valuable.

---

## 19. Motion

Use motion sparingly.

Allowed:
- subtle progress transition,
- stage status change,
- screenshot fade,
- finding expansion,
- before/after toggle.

Avoid:
- fake typing,
- artificial wait timers,
- AI-thinking animation,
- fake streaming logs.

Real operation timing should be displayed honestly.

---

## 20. Accessibility requirements

The product itself must maintain:
- semantic landmarks,
- logical heading order,
- labeled form controls,
- visible focus,
- keyboard-operable disclosure/buttons,
- status conveyed with text + icon,
- limited polite live-region usage,
- no focus theft during streaming updates,
- sufficient contrast,
- mobile usability.

Target:
- 0 serious/critical axe findings.

---

## 21. Responsive rules

### >= 1100 px
Two-column live run:
- screenshot/evidence
- progress/findings

### 700–1099 px
Single-column with compact progress.

### < 700 px
- one primary column,
- no horizontal dependency,
- code/diff areas scroll independently,
- full-width CTA buttons where useful.

---

## 22. Copy tone

Use direct product language.

Good:
- “Focus left this dialog.”
- “A11yForge could not safely test this control.”
- “The original failure still occurs.”
- “Source connected.”
- “Repair rejected.”

Avoid:
- “Agentic inference pipeline”
- “LLM reasoning stage”
- “Zod validation”
- “evidence graph”
- “deterministic adjudicator”

Those terms belong in technical docs.

---

## 23. Design acceptance test

A new user should answer these after looking at the product for 10 seconds:

1. What does A11yForge do?
2. What should I paste?
3. What is it doing right now?
4. Did it find something?
5. Can it fix it?
6. Did the fix actually work?

If the interface cannot answer these immediately, simplify it.

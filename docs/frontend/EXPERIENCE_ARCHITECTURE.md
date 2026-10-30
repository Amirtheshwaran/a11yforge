# A11yForge Experience Architecture

## 1. Product Principle

A user must understand A11yForge as:

> **"Give me your website. I will show you exactly where people may have trouble using it, explain why, and help fix it."**

A11yForge translates complex accessibility standards, browser automation, source-code analysis, and machine-learning reasoning into plain English understandable to an eight-year-old child, while keeping strict, verifiable engineering tooling underneath.

---

## 2. Core Experience Stages

The application centers around five essential continuous experiences:

```text
┌─────────────────────┐
│ 1. START            │ "What website do you want to check?"
│ Enter website       │ Input: https://yourwebsite.com  CTA: Check my website
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 2. SCAN             │ "What is A11yForge doing right now?"
│ Watch inspection    │ Real SSE stages: opening, scanning, interacting, reviewing
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 3. UNDERSTAND       │ "Where are the problems?"
│ See issues on site  │ Clustered zones: Keyboard, Forms, Images, Readability, Structure
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. FIX              │ "Can A11yForge fix it?"
│ Connect source      │ Two-plane layout (website left, source code right)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 5. PROVE            │ "Did the fix actually work?"
│ Verify & Replay     │ Replay failure, verify fix passes, reject regressions
└─────────────────────┘
```

---

## 3. Information Hierarchy

The UI enforces strict cognitive priority:
1. **WHAT IS HAPPENING** (Plain headline: *"We found 12 problems. 2 should be fixed first."*)
2. **WHERE IT IS HAPPENING** (Visual highlights directly on the website screenshot)
3. **WHAT THE USER SHOULD DO NEXT** (Direct actions: `[Show me]`, `[How do I fix this?]`, `[Review problems]`)
4. **OPTIONAL DETAILS** (Auditory experience impact, plain HTML fix snippet)
5. **TECHNICAL DETAILS** (Collapsible *Developer details* drawer for WCAG clauses, CSS selectors, CDP traces, AST models)

---

## 4. Truthful AI UX

- **Deterministic Facts:** Axe-core checks, Playwright browser interactions, compiler typechecks, and test-runner assertions establish facts.
- **Model Reasoning:** Meta models (Muse Spark) diagnose failure evidence, propose bounded source edits, critique changes, and revise fixes based on compiler errors.
- **Honest Telemetry:** Fictional telemetry (e.g. fake "60 FPS", "AAA Target", "AST CONFIDENCE 99.4%") is strictly forbidden and scrubbed. Telemetry reflects real execution only.

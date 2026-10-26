# A11yForge — Project Spec

## What A11yForge is

A11yForge is an autonomous accessibility engineer for web applications. Given a
web app, it finds real accessibility issues, traces each issue to the source
code responsible, generates a minimal patch, rebuilds the app, replays the same
user interaction, and proves the issue is resolved — without a human driving
each step.

## Why it is different from a normal accessibility scanner

A normal scanner reports rule violations and stops. That leaves the hard work —
reproducing the issue, finding the offending code, writing a safe fix, and
confirming the fix actually worked — to the developer.

A11yForge closes the loop. Scanning is only the first input. The system collects
deterministic browser evidence (DOM, computed accessibility tree, keyboard
behavior), diagnoses the issue against that evidence, traces it to source,
patches it, and then re-runs the exact same interaction to verify the repair.
An issue is only accepted as fixed when post-repair evidence proves it.

## The future autonomous repair loop

```text
EXPLORE → COLLECT EVIDENCE → DIAGNOSE → TRACE TO SOURCE → GENERATE PATCH
  → BUILD → REPLAY → VERIFY → ACCEPT OR REJECT
```

1. **Explore** — drive the target app like a user (clicks, keyboard, routes).
2. **Collect evidence** — capture deterministic accessibility facts per state.
3. **Diagnose** — map evidence to a structured diagnosis (issue, location, cause).
4. **Trace to source** — link the failing DOM to the component and file that renders it.
5. **Generate patch** — propose the minimum safe code change.
6. **Build** — rebuild the target app with the patch applied.
7. **Replay** — repeat the exact interaction that exposed the issue.
8. **Verify** — compare before/after evidence; a critic accepts or rejects.

## Evidence-first philosophy

- Deterministic tools run before model inference. Browsers, scanners, and
  keyboard replays produce facts; models interpret facts, never substitute
  for them.
- Every AI output is structured and bounded: fixed schemas, limited calls,
  no open-ended agents with shell access.
- A claim without evidence is a hypothesis. Repairs are accepted on measured
  before/after evidence, not on model confidence.

## Hackathon MVP

The demo shows one complete loop on a controlled target: A11yForge finds a real
accessibility issue in a deliberately broken fixture app, traces it to source,
fixes it, rebuilds, replays the interaction, and proves the issue is resolved —
visible in an observable agent UI.

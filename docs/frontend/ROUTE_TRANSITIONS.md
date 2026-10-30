# A11yForge Route Transitions & Continuous Continuity

## 1. Single Product Feel

A11yForge is not a collection of disconnected web pages (`/` → `/explore` → `/connect` → `/console`). It is one continuous hardware inspection experience.

Transitions preserve physical continuity:

```text
LANDING (Start)
  │
  ├─ User submits URL
  ▼
SCANNING (The hero website transforms into the live inspection chassis)
  │
  ├─ Scan completes via SSE
  ▼
RESULTS OVERVIEW (Scan stops, broad category clusters emerge on the surface)
  │
  ├─ User clicks "Review problems" or a category cluster
  ▼
PROBLEM WALKTHROUGH (Camera centers on real defective node; details drawer slides in)
  │
  ├─ User clicks "Connect source & repair"
  ▼
SOURCE CONNECTION (Website shifts left; source code editor slides in from right)
  │
  ├─ Repair proposed & rejected ("That fix wasn't good enough")
  ▼
REVISION & REPLAY (Failed compiler check fed back into bounded revision)
  │
  ├─ Deterministic check passes
  ▼
VERIFIED PROOF (Website re-centers; amber marker dissolves into green verified seal)
```

---

## 2. Transition Rules

- **No Hard Cuts:** Element positions and camera states interpolate cleanly across steps.
- **State Preservation:** Navigating backward or refreshing does not corrupt run state or lose finding index.
- **Immediate Fallback:** If `prefers-reduced-motion` is active or WebGL fails, the transition switches immediately without dropping state.

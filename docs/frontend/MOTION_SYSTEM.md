# A11yForge Motion System

## 1. Single Motion Owner Paradigm

To prevent chaotic independent animations, all interface motion follows a single, coordinated hierarchy:

```text
USER / BACKEND EVENT
        ↓
EXPERIENCE STATE
        ↓
MOTION ORCHESTRATOR
       /             \
      ↓               ↓
 Anime.js            R3F Camera & Scene
      ↓               ↓
 HTML UI Layers      3D Surface & Geometry
```

---

## 2. Separation of Responsibilities

- **Anime.js owns:**
  - Route transition choreography
  - Text entrance and reveal staggering
  - Panel drawer sliding (e.g. `[How do I fix this?]` or Developer details)
  - SVG annotation drawing
  - Scan line indicator sweeps
  - Stage timeline progression

- **Three.js / React Three Fiber owns:**
  - Website screenshot plane aspect ratios and textures
  - Constrained camera moves (`HOME`, `OVERVIEW`, `FOCUS`, `RESET`)
  - Finding bounding-box geometry and rings
  - Focus traversal path connecting sequential keyboard steps

---

## 3. Motion Directives

Every movement must answer: **"Why is this moving?"**
- **Valid reasons:** Screen navigation, user selected an issue, scanner detected a node, repair progressed, demo stepped forward.
- **Forbidden:** Continuous unmotivated floating, endless orbiting, spinning rings, idle bobbing.

---

## 4. Accessibility & Reduced Motion

A11yForge strictly observes `prefers-reduced-motion`:
- Transitions convert to immediate cuts or subtle opacity fades.
- Camera moves jump directly to the target point without smooth lerping.
- Automatic demo replays default to paused.
- All functional keyboard interactions remain 100% operational.

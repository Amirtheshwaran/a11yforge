# A11yForge Camera System

## 1. Core Principle: Website As The Physical Product

The user's website is visualized as a physical hardware object inside a dark luxury studio showroom (`#0B0B0C`).
The camera acts as a precision optical inspection lens:
- Front-facing 0° tilt or subtle perspective (2°–4°).
- Zero unconstrained rotation, zero random drift.

---

## 2. Camera Presets & Transitions

| Mode | Purpose | Target Point | Distance / FOV |
| :--- | :--- | :--- | :--- |
| **HOME** | Landing & Scan Theatre | Plane center `(0, 0)` | Framed to show complete website chassis |
| **OVERVIEW** | Scan Complete Results | Plane center `(0, 0)` | Wide view displaying all 5 category clusters |
| **FOCUS** | Issue Detail ("Show me") | Element bounding-box center `(x, y)` | Push-in distance calculated from element width/height |
| **SPLIT_LEFT** | Source Connection & Repair | Translated left `(-1.4, 0)` | Website shifts left to reveal coexisting source code plane |
| **VERIFY** | Verification & Replay | Centered `(0, 0)` | Centered frontal showcase proving resolved state |

---

## 3. Implementation Details

- Managed by `SceneCameraController`:
  - When user clicks **[Show me]** or selects an issue marker, the camera lerps along the existing view direction toward `(point.x, point.y, 0)`.
  - Distance is determined by `fitDistanceFor(width, height) = max(2.5, sqrt(w*h) * 4.2)`.
  - When `resetNonce` increments, the camera smoothly returns to the `cameraHomeFor(plane)` position.
  - OrbitControls are bounded with strict azimuth and polar angle clamps to prevent disorienting flip or under-plane viewing.

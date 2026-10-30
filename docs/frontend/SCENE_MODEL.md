# A11yForge 3D Scene Model & Coordinate Mapping

## 1. Plane Geometry

The tested website is rendered onto a 3D rectangular plane matching the exact pixel aspect ratio of the captured browser screenshot:

- **World Width:** Pinned to a constant width (e.g. `10.0` Three.js units).
- **World Height:** `10.0 * (viewportHeight / viewportWidth)`.
- **Coordinate Transformation:**
  - Viewport origin is top-left `(0, 0)` in browser coordinates.
  - Three.js plane origin is centered at `(0, 0, 0)`.
  - Mapping formula:
    $$x_{\text{3D}} = \left(\frac{x_{\text{DOM}}}{W_{\text{viewport}}} - 0.5\right) \cdot W_{\text{plane}}$$
    $$y_{\text{3D}} = \left(0.5 - \frac{y_{\text{DOM}}}{H_{\text{viewport}}}\right) \cdot H_{\text{plane}}$$

---

## 2. Spatial Hierarchy

```text
Z = +0.40  Defect Indicator Pin & Callout Flag
Z = +0.20  Focus Traversal Path
Z = +0.05  Element Bounding Box Outline
Z =  0.00  Website Screenshot Texture Plane
Z = -0.50  Spatial Chassis Ground Shadow Plate
```

---

## 3. Clustered Hierarchy (Preventing Pin Forests)

- In the broad **Overview** mode, individual DOM elements are grouped into 4–5 broad category zones:
  - `Keyboard`
  - `Forms`
  - `Images`
  - `Readability`
  - `Structure`
- When the user selects a category or problem, individual defective element outlines (`ElementOutline.tsx`) and the single active ring (`FindingMarker.tsx`) activate, keeping visual cognitive load minimal.

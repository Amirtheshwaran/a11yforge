---
name: A11yForge Design System
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c4c7c8'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c6c6c7'
  primary: '#ffffff'
  on-primary: '#2f3131'
  primary-container: '#e2e2e2'
  on-primary-container: '#636565'
  inverse-primary: '#5d5f5f'
  secondary: '#c7c6c6'
  on-secondary: '#303031'
  secondary-container: '#464747'
  on-secondary-container: '#b5b5b5'
  tertiary: '#ffffff'
  on-tertiary: '#2f3131'
  tertiary-container: '#e2e2e2'
  on-tertiary-container: '#636565'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c7'
  on-primary-fixed: '#1a1c1c'
  on-primary-fixed-variant: '#454747'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#131313'
  on-background: '#e2e2e2'
  surface-variant: '#353535'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: -0.01em
  mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 3rem
---

## Brand & Style

This design system embodies the standard of autonomous accessibility engineering: uncompromising precision, strict visual hierarchy, and relentless clarity. Tailored for software engineers, accessibility compliance leads, and QA specialists, the system removes all decorative ornamentation to prioritize actionable diagnostic signal over visual noise.

The design movement is an austere, hyper-focused modern developer tool aesthetic (drawing from terminal interfaces, code review tools, and technical instrumentation panels). 

Core tenets:
- **Zero-Hue Discipline**: Total rejection of color accents, colored indicators, and gradient flourishes. Functional hierarchy is achieved strictly via typographic scale, weight variation, monochromatic surface tiers, and explicit symbology.
- **Universal Affordance**: As a tool built for accessibility verification, every interaction pattern must lead by example. Keyboard navigation, visible contrast thresholds (meeting WCAG AAA requirements across all standard UI states), and structural semantic labels are structural baselines, not optional layers.
- **Instrument Precision**: Sharp geometric boundaries, 1px structural dividing lines, dense monospace diagnostic outputs, and stark, confident micro-interactions.

## Colors

The palette is strictly achromatic. Color is never employed to communicate status, state, severity, or priority.

### Surface and Canvas Scale (Dark Mode Default)
- **Canvas Base**: `#000000` (absolute pure black backdrop for maximum terminal-grade contrast).
- **Surface Elevation 1 (Card / Container)**: `#0B0B0B`.
- **Surface Elevation 2 (Elevated Flyouts / Menus / Code Blocks)**: `#141414`.
- **Surface Elevation 3 (Hover / Active State Fills)**: `#1F1F1F`.

### Border Hierarchy
- **Border Default**: `#262626` (crisp, subtle structural separation).
- **Border Strong / Interactive**: `#404040` (default inputs, interactive card outlines).
- **Border Focus / Terminal**: `#FFFFFF` (selected states, primary callouts).

### Foreground and Text Scale
- **Text Primary**: `#FFFFFF` (AAA contrast ratio against `#000000` of 21:1).
- **Text Secondary**: `#A3A3A3` (supporting descriptions, metadata).
- **Text Muted / Disabled**: `#666666` (structural placeholders, inactive state markers).

### Light Mode Mapping (Equally Achromatic)
- **Canvas Base**: `#FFFFFF`.
- **Surface Elevation 1**: `#FAFAFA`.
- **Surface Elevation 2**: `#F4F4F4`.
- **Surface Elevation 3**: `#E5E5E5`.
- **Border Default**: `#E5E7EB`.
- **Border Strong**: `#A3A3A3`.
- **Text Primary**: `#000000`.
- **Text Secondary**: `#525252`.
- **Text Muted**: `#8A8A8A`.
- **Focus Rings**: `#000000`.

## Typography

The type system enforces a strict dual-font policy:
- **Inter** provides high legibility for all conversational copy, interface navigation, structured tables, modal dialogs, and analytical summaries.
- **JetBrains Mono** is reserved strictly for engineering diagnostics, code snippets, DOM selectors, accessibility trees (`role`, `aria-*` tags), terminal command inputs, keyboard shortcut badges, and raw status glyph indicators.

Never substitute decorative fonts or display serif typefaces. Text scaling maintains tight line heights for high data density, with negative letter tracking on headings to mirror state-of-the-art developer tooling.

## Layout & Spacing

The layout is grounded on a fixed-width, razor-sharp responsive container model:
- **Max Container Width**: Centered content bounded at `1320px` (or `max-w-6xl` / `1152px` for dense text documentation and audits) to prevent unreadable, sprawling diagnostic tables.
- **Grid Structure**: 12-column dynamic grid with a `1.5rem` (24px) gutter on desktop displays, dropping to 4 columns with `1rem` (16px) gutters on mobile viewports.
- **Rhythm Model**: Built upon a strict 4px/8px incremental base unit. Padding within diagnostic cards, DOM inspector trees, and log viewers prioritizes information density while maintaining comfortable reading scanpaths.
- **Breakpoints**:
  - `Mobile (< 640px)`: Full-width single-column stacking; horizontal overflow with sticky column keys for DOM diff comparisons.
  - `Tablet (640px - 1023px)`: Split views convert to vertical step-through inspectors.
  - `Desktop (≥ 1024px)`: Multi-pane side-by-side execution panels (audit runner on left, terminal inspection on right).

## Elevation & Depth

Visual hierarchy does not use colored drop-shadows, directional blurs, or glow effects. Depth is communicated strictly via **low-contrast outlines, micro-tonal surface stepping, and border intensity**:

- **Layer 0 (Base Canvas)**: Background `#000000`.
- **Layer 1 (Cards, Code Wells, Tables)**: `#0B0B0B` encased in a single, crisp `1px solid #262626` stroke.
- **Layer 2 (Overlays, Popovers, Flyout Drawers)**: `#141414` encased in `1px solid #404040`. Where a drop-shadow is required for accessibility occlusion against busy background code, use an un-tinted, diffuse, hard-step shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.8), 0 1px 2px 0 rgba(0, 0, 0, 0.6)`.
- **Layer 3 (Modals and Command Palettes)**: `#141414` anchored by a high-contrast `1px solid #FFFFFF` perimeter border on mobile or `#525252` on desktop, surrounded by a backdrop veil of `rgba(0, 0, 0, 0.75)`.

## Shapes

The interface employs a **Soft (Level 1)** geometric standard. Border radii are restrained to preserve an engineered, analytical feel without drifting into clinical brutality.

- **Base Controls (Buttons, Inputs, Badges)**: `4px` (`0.25rem`).
- **Cards, Panels, Diagnostic Viewers**: `6px` (`0.375rem`).
- **Flyouts, Modals, Command Menus**: `8px` (`0.5rem`).
- **Inner Nested Elements**: When an element is placed inside a `6px` parent container with padding, the inner element radius is clamped to `2px` or `4px` to maintain concentric alignment.
- **Pill shapes (`rounded-full`) are prohibited** except for circular keyboard shortcut icon badges and toggle thumb switches.

## Components

### Focus Indicators (Mandatory Global Pattern)
Every interactive element must demonstrate an unambiguous, high-visibility keyboard focus indicator:
- **Dark Mode**: `outline: 2px solid #FFFFFF; outline-offset: 2px;`
- **Light Mode**: `outline: 2px solid #000000; outline-offset: 2px;`
- `outline: none` without immediate fallback replacement is strictly forbidden.

### Buttons
- **Primary**: Solid background (`#FFFFFF` in dark, `#000000` in light), inverted high-contrast text (`#000000` / `#FFFFFF`), weight 500. Hover: 90% opacity.
- **Secondary / Default**: Canvas match, `1px solid #404040`, text `#FFFFFF`. Hover: background `#1F1F1F`, border `#525252`.
- **Ghost / Tertiary**: Transparent background, text `#A3A3A3`. Hover: text `#FFFFFF`, background `#141414`.
- **Dimensions**: Compact `32px` height for toolbars; default `36px` height; padding `0 12px`.

### Status Indicators (No Color Reliance)
Statuses must present both a distinct typographic glyph and explicit text:
- **Passed**: `[✓] Passed` — Regular weight, text `#FFFFFF`, glyph enclosed or inline.
- **Failed**: `[✕] Failed` — Medium weight, text `#FFFFFF`, preceded by structural boxed or bracketed `✕`.
- **Needs Review**: `[!] Review Required` — Underlined or bracketed `!`, text `#A3A3A3`.
- **Not Tested**: `[—] Untested` — Text `#666666`.
Icons alone are never used to represent success, error, or warning.

### Form Inputs & Checkboxes
- **Input Fields**: Height `36px`, background `#0B0B0B`, border `1px solid #333333`, font `Inter 14px`, text `#FFFFFF`, placeholder `#666666`. Active border `#8A8A8A`. Focused border with explicit `2px` focus ring.
- **Checkboxes**: `16px x 16px`, `2px` border radius, border `1px solid #525252`. Checked state: background `#FFFFFF`, checkmark icon drawn in `#000000`.

### Diagnostic Cards & Code Diffs
- **Audit Cards**: `1px solid #262626`, background `#0B0B0B`, padding `16px`. Header features failure selector in `JetBrains Mono` and explicit WCAG criterion tag (e.g., `WCAG 2.2 · 1.4.3 Contrast (Minimum)`).
- **Code Diffs**: Inline deletion indicated via `[-]` prefix and strikethrough; additions indicated via `[+]` prefix and bold font weight. Zero red/green background fills.
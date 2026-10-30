# Continuous spatial tour

The landing explains the product's capabilities and links to its website check
and demo. The recorded demo and completed live scans use `SpatialTour`. The
charcoal surfaces, serif display copy, restrained accents, and controls follow
the approved Stitch / Obsidian Atelier export. No model calls are needed to
view the demo, record spatial evidence, or explore a website.

## Ownership and motion

- `apps/web/lib/tour-model.ts` adapts either a real `ExplorationRun` or the
  recorded `RunViewModel` into chapters. Live observations and untested probes
  never become failures. A verified payoff requires the recorded deterministic
  gates to pass.
- `components/spatial-tour/spatial-tour.tsx` converts native scroll distance to
  one timeline position. Manual chapter and category navigation scroll that
  same timeline. One paused Anime.js timeline presents the editorial copy.
- `components/spatial-tour/SpatialScene.tsx` keeps one canvas, website object,
  and `CameraRig` mounted for the tour. The rig alone writes the camera and
  object transforms. Delta-time damping follows the timeline in either
  direction, with context-preserving framing derived from measured boxes.
- Source planes use the actual recorded diffs. They emerge from behind the
  website; rejection, revision, and proof retain the same physical composition.
- Screenshot textures are loaded, decoded, and uploaded before revealing the
  scene. Screenshot changes crossfade on the same object. Missing images or
  WebGL failure retain real 2D evidence and chapter navigation.
- High-frequency progress lives in refs. React updates only chapter selection
  and other coarse state. The renderer runs on demand, caps DPR at 1.5, reuses
  vectors, and adds no post-processing or dynamic shadows.
- Mobile uses the same model and controller with front-facing, reduced-depth
  framing and copy below the scene. The system reduced-motion preference and
  the tour's Reduce motion control use instant framing and static outlines.

## Recorded geometry provenance

The historical accepted repair did not retain element bounds. Its original
artifacts remain unchanged. The demo's spatial path uses an explicitly labeled
supplemental browser replay under `apps/web/public/demo/spatial-replay`.

The unchanged controlled fixture reproduced the focus escape. An isolated copy
with the exact historical accepted patch reproduced forward and reverse focus
containment. Both screenshots and the focus sequence were measured at the
capture's viewport and scroll position. The adapter checks the source run ID
and accepted patch SHA-256 (with LF-normalized line endings) before using the supplemental evidence. Live scans
never consume it.

For live axe findings outside the first viewport, the engine now captures a
bounded extra viewport and associates each measurement with its exact
screenshot. Existing screenshot and call budgets remain unchanged. Unmappable
or unrecorded locations remain text-only; the tour does not invent a zoom target.

## Access boundaries

The explorer captures visible sign-in redirects and HTTP error pages before
stopping. These captures can appear in the same 3D tour, but their presence
does not imply that protected content was tested. Runs with no completed probes
show the access limitation immediately and remain explicitly untested. Navigation
waits for DOM content rather than every dependent resource; the existing bounded
stability check still runs before probes.

A run without a capture does not start WebGL or report a graphics failure.
Actual viewer failures retain the screenshot and provide a retry control.
Finished scans and their evidence can be read from validated saved run artifacts
after an API restart; interrupted scans are never resumed or marked complete.

The access-boundary regression tests exercise real Chromium against controlled
sign-in redirects and HTTP errors, and confirm that the screenshot budget is
honored. A fresh public Facebook run also captured its visible sign-in page and
rendered it in the production 3D viewer. No protected content was accessed.

## Validation

- `pnpm typecheck`: passed across workspaces.
- `pnpm lint`: passed repository-wide.
- `pnpm build`: passed across workspaces.
- Web tests: 69 passed, including timeline reversal, evidence isolation,
  verification gates, screenshot validity, replay provenance, and website
  address normalization.
- Targeted engine tests: 16 passed across finding projection, keyboard focus
  evidence, and anti-fixture-coupling suites.
- Real product UI scan: `https://dequeuniversity.com/demo/mars/`, run
  `exp-1793385881031-2c08c414`; 12 accessibility findings on one tested page,
  with the actual scan's limitations retained. Its tour was checked against
  its measured image finding and screenshot.
- Desktop browser checks covered the hero, reverse scrolling, source reveal,
  rejection, proof, manual issue jumps, rapid chapter changes, and reduced
  motion. One canvas remained present throughout chapter navigation.
- The mobile layout was rendered in a real 390 × 844 iframe viewport and
  inspected for page overflow and readable stacked content. The available
  browser automation could read that iframe but could not deliver pointer or
  keyboard actions to it, so mobile interaction automation remains a limitation.
- The reduced-motion execution path was checked through the tour control;
  changing the operating system preference was not emulated.
- WebGL fallback was inspected after context loss during development. A forced
  hardware/WebGL outage was not separately emulated in the production build.

This is local implementation and validation, not a deployment. The current
preview serves the web app on port 3005 and its keyless API on port 3006. Live
website exploration works without a model key; live autonomous repair requires
the existing model configuration. No Meta credits were used for motion work.

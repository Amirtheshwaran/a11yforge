/**
 * A11yForge motion system — Anime.js v4 orchestration.
 *
 * Anime.js owns: page/interface transitions, text reveals, layout movement,
 * panels, issue sequencing, SVG overlays, scroll scenes, and
 * camera-transition orchestration. Three.js owns only the 3D website
 * visualization itself.
 *
 * Every helper no-ops (leaving content fully visible) when
 * `prefers-reduced-motion` is set or Anime.js cannot load, so the
 * reduced-motion version keeps the same spatial states without the
 * aggressive transitions.
 */

export const EASE_OUT = "outExpo";
export const EASE_IN_OUT = "inOutExpo";
export const EASE_SPRING = "outElastic(1, .6)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type AnimeModule = typeof import("animejs");

let cached: AnimeModule | null = null;

async function loadAnime(): Promise<AnimeModule | null> {
  if (prefersReducedMotion()) return null;
  if (cached !== null) return cached;
  try {
    cached = await import("animejs");
    return cached;
  } catch {
    return null;
  }
}

/** Staggered editorial text reveal: `[data-reveal]` children rise with stagger. */
export async function revealIn(scope: ParentNode, selector = "[data-reveal]"): Promise<void> {
  const anime = await loadAnime();
  const targets = Array.from(scope.querySelectorAll?.(selector) ?? []);
  if (anime === null || targets.length === 0) return;
  anime.animate(targets as HTMLElement[], {
    opacity: [0, 1],
    y: [28, 0],
    duration: 900,
    delay: anime.stagger(70),
    ease: EASE_OUT,
  });
}

/**
 * Issue-transition timeline: current typography exits with stagger, then the
 * incoming `[data-enter]` block enters. The swap callback commits React
 * state, so one frame is yielded before selecting the incoming nodes.
 */
export async function transitionIssue(
  scope: ParentNode,
  onSwap: () => void,
): Promise<void> {
  await exitPanel(scope);
  onSwap();
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  const anime = await loadAnime();
  if (anime === null) return;
  const incoming = Array.from(scope.querySelectorAll?.("[data-enter]") ?? []);
  if (incoming.length > 0) {
    anime.animate(incoming as HTMLElement[], {
      opacity: [0, 1],
      y: [24, 0],
      duration: 800,
      delay: anime.stagger(65),
      ease: EASE_OUT,
    });
  }
}

/** Exit half of the issue transition: stagger the `[data-exit]` block out. */
export async function exitPanel(scope: ParentNode): Promise<void> {
  const anime = await loadAnime();
  if (anime === null) return;
  const outgoing = Array.from(scope.querySelectorAll?.("[data-exit]") ?? []);
  if (outgoing.length === 0) return;
  try {
    await anime.animate(outgoing as HTMLElement[], {
      opacity: [1, 0],
      y: [0, -18],
      duration: 300,
      delay: anime.stagger(40),
      ease: "inExpo",
    });
  } catch {
    /* interrupted exit — the swap still proceeds */
  }
}

/** Thin SVG/overlay line drawing: animates stroke-dashoffset to zero. */
export async function drawLines(scope: ParentNode, selector = "[data-draw]"): Promise<void> {
  const anime = await loadAnime();
  const targets = Array.from(scope.querySelectorAll?.(selector) ?? []);
  if (anime === null || targets.length === 0) return;
  const drawable = anime.createDrawable(targets as SVGGeometryElement[]);
  anime.animate(drawable, {
    draw: ["0 0", "0 1"],
    duration: 1400,
    delay: anime.stagger(120),
    ease: EASE_IN_OUT,
  });
}

/**
 * Scroll-driven camera cue: calls `onEnter`/`onLeave` as `[data-scene]`
 * sections cross the viewport center. Returns a cleanup function.
 */
export function observeScenes(
  root: ParentNode,
  onEnter: (index: number, element: Element) => void,
): () => void {
  if (typeof IntersectionObserver === "undefined") return () => undefined;
  const sections = Array.from(root.querySelectorAll?.("[data-scene]") ?? []);
  const reduced = prefersReducedMotion();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = sections.indexOf(entry.target);
        if (index >= 0) onEnter(index, entry.target);
      }
    },
    { rootMargin: reduced ? "0px" : "-35% 0px -35% 0px", threshold: 0 },
  );
  for (const section of sections) observer.observe(section);
  return () => observer.disconnect();
}

/** Subtle pointer parallax: translates `[data-depth]` layers by pointer. */
export function parallax(
  container: HTMLElement,
  strength = 14,
): () => void {
  if (prefersReducedMotion()) return () => undefined;
  let frame = 0;
  const onMove = (event: PointerEvent): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5;
      const ny = (event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5;
      for (const layer of container.querySelectorAll("[data-depth]")) {
        const depth = Number((layer as HTMLElement).dataset.depth ?? "1");
        (layer as HTMLElement).style.translate =
          `${(-nx * strength * depth).toFixed(1)}px ${(-ny * strength * depth).toFixed(1)}px`;
      }
    });
  };
  container.addEventListener("pointermove", onMove);
  return () => {
    cancelAnimationFrame(frame);
    container.removeEventListener("pointermove", onMove);
  };
}

/** Emphasize one element with a restrained spring pulse. */
export async function pulse(target: HTMLElement): Promise<void> {
  const anime = await loadAnime();
  if (anime === null) return;
  anime.animate(target, { scale: [1, 1.04, 1], duration: 700, ease: EASE_SPRING });
}

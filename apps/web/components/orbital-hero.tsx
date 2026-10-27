"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../lib/motion";

/**
 * Orbital accessibility hero: a floating webpage plane inside concentric
 * orbital rings, accessibility nodes linked by thin animated paths, one
 * problematic node breaking out of alignment while a focus point travels
 * between nodes. SVG + Anime.js; fully static when reduced motion is set.
 *
 * Communicates website → scanning → problem detection without words.
 */
export function OrbitalHero({ active }: { active: boolean }): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null || prefersReducedMotion()) return;
    let cancelled = false;
    let animations: Array<{ cancel: () => void }> = [];

    void import("animejs").then((anime) => {
      if (cancelled) return;
      const q = (selector: string): Element | null => root.querySelector(selector);
      const qa = (selector: string): Element[] => Array.from(root.querySelectorAll(selector));

      // Staged SVG line drawing on load.
      const drawTargets = qa("[data-draw]");
      if (drawTargets.length > 0) {
        const drawable = anime.createDrawable(drawTargets as SVGGeometryElement[]);
        animations.push(
          anime.animate(drawable, {
            draw: ["0 0", "0 1"],
            duration: 1800,
            delay: anime.stagger(140),
            ease: "inOutExpo",
          }),
        );
      }

      // Slow orbital drift of the ring system.
      const rings = q("[data-rings]");
      if (rings !== null) {
        (rings as SVGGElement).style.transformBox = "fill-box";
        (rings as SVGGElement).style.transformOrigin = "center";
        animations.push(
          anime.animate(rings as SVGGElement, {
            rotate: 360,
            duration: 90000,
            ease: "linear",
            loop: true,
          }),
        );
      }

      // The problematic node breaks out of alignment, then resettles.
      const hot = q("[data-hot]");
      if (hot !== null) {
        animations.push(
          anime.animate(hot as SVGGElement, {
            y: [0, -26, 0],
            duration: 4200,
            ease: "inOutSine",
            loop: true,
          }),
        );
      }
      const hotLink = q("[data-hot-link]");
      if (hotLink !== null) {
        animations.push(
          anime.animate(hotLink as SVGElement, {
            opacity: [0.7, 0.1, 0.7],
            duration: 4200,
            ease: "inOutSine",
            loop: true,
          }),
        );
      }

      // Focus point travels the focus path between nodes.
      const focusPath = q("[data-focus-path]");
      const focusDot = q("[data-focus-dot]");
      if (focusPath !== null && focusDot !== null) {
        const motion = anime.createMotionPath(focusPath);
        animations.push(
          anime.animate(focusDot as SVGCircleElement, {
            ...motion,
            duration: 7000,
            ease: "inOutSine",
            loop: true,
          }),
        );
      }

      // Scanning sweep passes through the webpage plane.
      const sweep = q("[data-sweep]");
      if (sweep !== null) {
        animations.push(
          anime.animate(sweep as SVGLineElement, {
            y1: [250, 430],
            y2: [250, 430],
            opacity: [0, 0.9, 0.9, 0],
            duration: 3600,
            ease: "inOutSine",
            loop: true,
          }),
        );
      }

      // Gentle float of the whole plane group.
      const plane = q("[data-plane]");
      if (plane !== null) {
        animations.push(
          anime.animate(plane as SVGGElement, {
            y: [0, -8, 0],
            duration: 6000,
            ease: "inOutSine",
            loop: true,
          }),
        );
      }
    });

    return () => {
      cancelled = true;
      for (const animation of animations) animation.cancel();
      animations = [];
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="orbit-stage"
      data-active={active ? "true" : "false"}
      role="img"
      aria-label="A webpage floating inside orbital scanning rings. Small accessibility nodes link together while one problem node drifts out of alignment."
    >
      <svg viewBox="0 0 680 680" aria-hidden="true" focusable="false">
        <g data-rings>
          <ellipse className="orbit-ring" cx="340" cy="330" rx="292" ry="108" transform="rotate(-16 340 330)" />
          <ellipse className="orbit-ring" cx="340" cy="330" rx="222" ry="82" transform="rotate(-16 340 330)" />
          <ellipse className="orbit-ring" cx="340" cy="330" rx="152" ry="58" transform="rotate(-16 340 330)" />
          <path
            className="orbit-ring-accent"
            data-draw
            d="M 96 402 A 292 108 -16 1 1 200 268"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <g className="orbit-tick" strokeWidth="1">
            <line x1="340" y1="196" x2="340" y2="208" />
            <line x1="474" y1="268" x2="466" y2="276" />
            <line x1="474" y1="392" x2="466" y2="384" />
            <line x1="340" y1="464" x2="340" y2="452" />
            <line x1="206" y1="392" x2="214" y2="384" />
            <line x1="206" y1="268" x2="214" y2="276" />
          </g>
        </g>

        <ellipse cx="340" cy="478" rx="130" ry="14" fill="#000" opacity="0.55" />

        <g data-plane>
          <polygon className="orbit-plane" points="248,252 448,232 428,432 228,452" strokeWidth="1.5" />
          <line className="orbit-plane-line" x1="248" y1="282" x2="446" y2="262" strokeWidth="1" />
          <circle cx="262" cy="270" r="3" fill="none" strokeWidth="1" className="orbit-ring" />
          <rect className="orbit-plane-bar" x="262" y="304" width="120" height="10" />
          <rect className="orbit-plane-bar" x="262" y="322" width="84" height="10" opacity="0.6" />
          <rect className="orbit-plane-bar" x="262" y="348" width="150" height="44" opacity="0.35" />
          <rect className="orbit-plane-bar" x="262" y="402" width="96" height="12" />
          <line data-sweep x1="240" y1="250" x2="440" y2="250" stroke="#ff4b2e" strokeWidth="1.5" opacity="0" />
          <text className="orbit-caption" x="258" y="270" dy="-12">
            your site
          </text>
        </g>

        <g>
          <path className="orbit-path" data-draw d="M 148 342 L 228 372" strokeWidth="1" />
          <path className="orbit-path" data-draw d="M 452 288 L 528 300" strokeWidth="1" />
          <path className="orbit-path" data-draw d="M 452 392 L 520 420" strokeWidth="1" />
          <path className="orbit-path" data-draw d="M 228 420 L 168 448" strokeWidth="1" />
          <path
            className="orbit-path-live"
            data-hot-link
            d="M 438 396 L 502 356"
            strokeWidth="1.25"
          />
          <path
            className="orbit-path"
            data-focus-path
            d="M 148 342 L 228 372 L 340 330 L 452 288 L 528 300"
            strokeWidth="1"
            strokeDasharray="3 5"
            fill="none"
            opacity="0.85"
          />
        </g>

        <g>
          <circle className="orbit-node" cx="148" cy="342" r="7" strokeWidth="1.5" />
          <circle className="orbit-node-cyan" cx="228" cy="372" r="5" strokeWidth="1.5" />
          <circle className="orbit-node" cx="340" cy="330" r="5" strokeWidth="1.5" opacity="0" />
          <circle className="orbit-node-lime" cx="452" cy="288" r="6" strokeWidth="1.5" />
          <circle className="orbit-node" cx="528" cy="300" r="7" strokeWidth="1.5" />
          <circle className="orbit-node" cx="520" cy="420" r="6" strokeWidth="1.5" />
          <circle className="orbit-node" cx="168" cy="448" r="5" strokeWidth="1.5" />
          <g data-hot>
            <circle className="orbit-node-hot" cx="502" cy="356" r="9" strokeWidth="1.5" />
            <circle cx="502" cy="356" r="16" fill="none" stroke="#ff4b2e" strokeWidth="1" opacity="0.5" />
            <circle cx="502" cy="356" r="24" fill="none" stroke="#ff4b2e" strokeWidth="1" opacity="0.25" />
          </g>
          <circle className="orbit-focus-dot" data-focus-dot cx="148" cy="342" r="4.5" />
        </g>

        <text className="orbit-caption" x="96" y="470">
          scan
        </text>
        <text className="orbit-caption" x="516" y="330">
          break
        </text>
        <text className="orbit-caption" x="470" y="470">
          focus path
        </text>
      </svg>
    </div>
  );
}

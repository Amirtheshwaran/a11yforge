"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TourModel } from "../../lib/tour-model";
import type { TourMotion } from "./SpatialScene";
import { usePrefersReducedMotion } from "../scene/use-reduced-motion";
import { groupOf, PROBLEM_GROUPS } from "../../lib/human-copy";
import { EvidenceViewer } from "../evidence-viewer";

const Scene = dynamic(() => import("./SpatialScene").then((module) => module.SpatialScene), { ssr: false });

/** One persistent renderer and one scroll timeline for both recorded and live evidence. */
export function SpatialTour({ model, id = "spatial-tour" }: { model: TourModel; id?: string }): React.JSX.Element {
  const root = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const rail = useRef<HTMLProgressElement>(null);
  const motion = useRef<TourMotion>({ target: 0, current: 0, reduced: false, wake: null, present: null });
  const systemReduced = usePrefersReducedMotion();
  const [userReduced, setUserReduced] = useState(false);
  const reduced = systemReduced || userReduced;
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const hasCapture = model.chapters.some((item) => item.imageUrl !== null);
  const lastActive = useRef(0);
  const seek = useRef<((progress: number) => void) | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onFail = useCallback(() => setFailed(true), []);
  const count = model.chapters.length;
  const chapter = model.chapters[active] ?? model.chapters[0];
  const goTo = useCallback((index: number) => {
    const element = root.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    const distance = Math.max(1, rect.height - window.innerHeight + 58);
    const bounded = Math.max(0, Math.min(count - 1, index));
    window.scrollTo({ top: window.scrollY + rect.top - 58 + distance * bounded / Math.max(1, count - 1), behavior: reduced ? "instant" : "smooth" });
  }, [count, reduced]);
  const selectFinding = useCallback((findingId: string) => {
    const index = model.chapters.findIndex((item) => item.finding?.findingId === findingId);
    if (index >= 0) goTo(index);
  }, [model, goTo]);

  useEffect(() => { motion.current.reduced = reduced; motion.current.wake?.(); }, [reduced]);
  useEffect(() => {
    let live = true;
    let timeline: ReturnType<typeof import("animejs")["createTimeline"]> | null = null;
    if (!reduced) void import("animejs").then(({ createTimeline }) => {
      if (!live) return;
      timeline = createTimeline({ autoplay: false });
      panels.current.forEach((panel, index) => {
        if (panel === null) return;
        const children = Array.from(panel.querySelectorAll<HTMLElement>("[data-tour-copy]"));
        children.forEach((child, order) => {
          if (index > 0) timeline?.add(child, { opacity: [0, 1], y: [20, 0], filter: ["blur(2px)", "blur(0px)"], duration: 340, ease: "outExpo" }, index * 1000 - 380 + order * 28);
          if (index < count - 1) timeline?.add(child, { opacity: [1, 0], y: [0, -16], filter: ["blur(0px)", "blur(2px)"], duration: 260, ease: "inOutQuad" }, index * 1000 + 300 + order * 18);
        });
      });
      seek.current = (progress) => timeline?.seek(progress * 1000);
      seek.current(motion.current.current);
    });
    const present = (progress: number): void => {
      seek.current?.(progress);
      root.current?.style.setProperty("--tour-inspection", String(Math.min(1, Math.max(0, progress))));
      if (rail.current !== null) rail.current.value = progress / Math.max(count - 1, 1);
      const index = Math.min(count - 1, Math.max(0, Math.round(progress)));
      if (index !== lastActive.current) { lastActive.current = index; setActive(index); }
    };
    motion.current.present = present;
    return () => { live = false; timeline?.revert(); seek.current = null; motion.current.present = null; };
  }, [model, count, reduced]);

  useEffect(() => {
    let raf = 0;
    const measure = (): void => {
      raf = 0;
      const rect = root.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const distance = Math.max(1, rect.height - window.innerHeight + 58);
      const progress = Math.max(0, Math.min(1, (58 - rect.top) / distance)) * Math.max(count - 1, 1);
      motion.current.target = progress;
      if (failed || !ready) { motion.current.current = progress; motion.current.present?.(progress); }
      motion.current.wake?.();
    };
    const schedule = (): void => { if (raf === 0) raf = requestAnimationFrame(measure); };
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule); if (root.current !== null) resize.observe(root.current);
    measure();
    return () => { cancelAnimationFrame(raf); resize.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [count, failed, ready]);

  const categories = [...new Set(model.chapters.flatMap((item) => item.finding === null ? [] : [groupOf(item.finding)]))];
  if (chapter === undefined) return <p>No recorded tour chapters are available.</p>;
  return <section ref={root} id={id} className="spatial-tour" aria-label={`${model.label} spatial tour`} style={{ "--tour-chapters": count } as React.CSSProperties} data-ready={ready && !failed} data-reduced={reduced}>
    <a className="skip-link" href={`#${id}-end`}>Skip spatial tour</a>
    <div className="tour-sticky">
      <div className="tour-topline"><span><i aria-hidden="true" />{model.label}</span><span>{model.target}</span></div>
      <div className="tour-stage" aria-label="Captured website in 3D">
        {(!ready || failed) && <div className="tour-capture-fallback">
          {chapter.imageUrl !== null ? <img src={chapter.imageUrl} alt="Recorded website capture" /> : <p>No page capture is available for this run.</p>}
          <span role="status">{!hasCapture ? "The browser could not capture this site. Review the access limitation and try a public page." : failed ? "The 3D viewer could not load. The captured page and evidence remain available." : "Preparing the website for inspection…"}</span>
          {hasCapture && failed && <button type="button" onClick={() => { setReady(false); setFailed(false); setSceneAttempt((value) => value + 1); }}>Retry 3D viewer</button>}
          {!hasCapture && <Link href="/#check-site">Check a public page</Link>}
        </div>}
        {hasCapture && !failed && <div className="tour-webgl" aria-hidden="true"><Scene key={sceneAttempt} model={model} motion={motion} onReady={onReady} onFail={onFail} onSelect={selectFinding} /></div>}
      </div>
      <div className="tour-copy-scrim" aria-hidden="true" />
      {model.chapters.map((item, index) => <article key={item.id} ref={(element) => { panels.current[index] = element; }} className={`tour-copy tour-copy-${item.kind}`} data-active={active === index} aria-hidden={active !== index} inert={active !== index}>
        <p data-tour-copy className="tour-eyebrow">{item.eyebrow}</p>
        {index === 0 ? <h1 data-tour-copy>{item.title}</h1> : <h2 data-tour-copy>{item.title}</h2>}
        <p data-tour-copy className="tour-description">{item.body}</p>
        {item.facts.length > 0 && <ul data-tour-copy className="tour-facts">{item.facts.map((fact, fi) => <li key={`${fi}:${fact}`}>{fact}</li>)}</ul>}
        {item.focusSteps.length > 0 && <ol data-tour-copy className="tour-focus-order" aria-label="Recorded focus order">{item.focusSteps.map((step, si) => <li key={si} data-failed={step.failed}><span>{si + 1}</span>{step.label}{step.failed && <strong>Escaped</strong>}</li>)}</ol>}
        {item.kind === "categories" && <div data-tour-copy className="tour-category-controls" role="group" aria-label="Finding categories">{categories.map((category) => <button type="button" key={category} onClick={() => goTo(model.chapters.findIndex((candidate) => candidate.finding !== null && groupOf(candidate.finding) === category))}>{PROBLEM_GROUPS[category].heading}</button>)}</div>}
        {index === 0 && <button data-tour-copy className="tour-scroll-hint" type="button" onClick={() => goTo(1)}><span aria-hidden="true">↓</span>{model.label === "Live website scan" ? model.chapters.some((item) => item.finding !== null) ? "Explore the problems" : "Review the check" : "Scroll to explore"}</button>}
        {item.finding !== null && <div data-tour-copy className="tour-finding-actions"><Link href={`/connect?run=${encodeURIComponent(model.id)}&finding=${encodeURIComponent(item.finding.findingId)}`}>How do I fix this? <span aria-hidden="true">↗</span></Link></div>}
        {failed && item.highlight !== null && item.imageUrl !== null && <div data-tour-copy><EvidenceViewer src={item.imageUrl} alt="Measured problem location in the website capture" highlights={[item.highlight]} selectedIndex={0} onSelect={() => undefined} /></div>}
      </article>)}
      <div className="tour-bottom">
        <div className="tour-position"><span>SCROLL TO INSPECT</span><span>{String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span></div>
        <progress ref={rail} max={1} value={0} aria-label="Spatial tour progress" />
        <nav className="tour-chapter-nav" aria-label="Tour chapters">{model.chapters.map((item, index) => <button key={item.id} type="button" onClick={() => goTo(index)} aria-current={active === index ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{item.kind === "finding" && item.finding !== null ? `Issue ${model.chapters.slice(0, index + 1).filter((entry) => entry.finding !== null).length}` : item.kind === "rejection" ? "Rejected" : item.kind === "verification" ? "Proof" : item.kind === "interaction" ? "Interaction" : item.kind === "overview" ? "Website" : item.kind.charAt(0).toUpperCase() + item.kind.slice(1)}</button>)}</nav>
        <div className="tour-step-controls"><button type="button" disabled={active === 0} onClick={() => goTo(active - 1)} aria-label="Previous tour chapter">← Previous</button><button type="button" disabled={systemReduced} aria-pressed={reduced} onClick={() => setUserReduced((value) => !value)} aria-label="Reduce tour motion">{reduced ? "Reduced motion on" : "Reduce motion"}</button><button type="button" disabled={active === count - 1} onClick={() => goTo(active + 1)} aria-label="Next tour chapter">Next →</button></div>
      </div>
    </div>
    <div id={`${id}-end`} className="tour-end" />
  </section>;
}

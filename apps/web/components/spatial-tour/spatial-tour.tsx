"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TourModel } from "../../lib/tour-model";
import type { TourMotion } from "./SpatialScene";
import { usePrefersReducedMotion } from "../scene/use-reduced-motion";
import { groupOf, PROBLEM_GROUPS } from "../../lib/human-copy";
import { CaptureScene } from "./CaptureScene";

const Scene = dynamic(() => import("./SpatialScene").then((module) => module.SpatialScene), { ssr: false });

/** One persistent renderer and one scroll timeline for both recorded and live evidence. */
export function SpatialTour({ model, id = "spatial-tour" }: { model: TourModel; id?: string }): React.JSX.Element {
  const root = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const chapterNav = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const rail = useRef<HTMLProgressElement>(null);
  const motion = useRef<TourMotion>({ target: 0, current: 0, reduced: false, wake: null, present: null });
  const systemReduced = usePrefersReducedMotion();
  const [userReduced, setUserReduced] = useState(false);
  const reduced = systemReduced || userReduced;
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lightweight, setLightweight] = useState(false);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const hasCapture = model.chapters.some((item) => item.imageUrl !== null);
  const useCaptureScene = hasCapture && (failed || lightweight);
  const presented = hasCapture && (ready || useCaptureScene);
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
    const distance = Math.max(1, rect.height - (sticky.current?.offsetHeight ?? window.innerHeight - 58));
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
          if (index > 0) timeline?.add(child, { opacity: [0, 1], y: [12, 0], duration: 320, ease: "outCubic" }, index * 1000 - 420 + Math.min(order, 3) * 16);
          if (index < count - 1) timeline?.add(child, { opacity: [1, 0], y: [0, -10], duration: 240, ease: "inOutQuad" }, index * 1000 + 320 + Math.min(order, 3) * 12);
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
      const distance = Math.max(1, rect.height - (sticky.current?.offsetHeight ?? window.innerHeight - 58));
      const progress = Math.max(0, Math.min(1, (58 - rect.top) / distance)) * Math.max(count - 1, 1);
      motion.current.target = progress;
      if (!presented) { motion.current.current = progress; motion.current.present?.(progress); }
      motion.current.wake?.();
    };
    const schedule = (): void => { if (raf === 0) raf = requestAnimationFrame(measure); };
    const resized = (): void => {
      const rect = root.current?.getBoundingClientRect();
      const height = sticky.current?.offsetHeight ?? window.innerHeight - 58;
      if (rect !== undefined && rect.top <= 58 && rect.bottom >= height + 58) {
        const distance = Math.max(1, rect.height - height);
        window.scrollTo({ top: window.scrollY + rect.top - 58 + distance * motion.current.target / Math.max(1, count - 1), behavior: "instant" });
      }
      schedule();
    };
    window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", resized);
    const resize = new ResizeObserver(schedule); if (root.current !== null) resize.observe(root.current);
    measure();
    return () => { cancelAnimationFrame(raf); resize.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", resized); };
  }, [count, presented]);

  useEffect(() => {
    const nav = chapterNav.current;
    const button = nav?.querySelector<HTMLButtonElement>('[aria-current="step"]');
    if (nav !== null && button != null) nav.scrollTo({ left: button.offsetLeft - nav.offsetLeft - nav.clientWidth / 2 + button.offsetWidth / 2, behavior: reduced ? "instant" : "smooth" });
    panels.current[active]?.scrollTo({ top: 0, behavior: "instant" });
  }, [active, reduced]);

  const categories = [...new Set(model.chapters.flatMap((item) => item.finding === null ? [] : [groupOf(item.finding)]))];
  if (chapter === undefined) return <p>No recorded tour chapters are available.</p>;
  const pageChapters = model.chapters.map((item, index) => ({ item, index })).filter(({ item }) => item.kind === "overview" || item.kind === "page");
  return <section ref={root} id={id} className="spatial-tour" aria-label={`${model.label} spatial tour`} style={{ "--tour-chapters": count } as React.CSSProperties} data-ready={presented} data-renderer={useCaptureScene ? "css" : hasCapture ? "webgl" : "missing"} data-reduced={reduced}>
    <a className="skip-link" href={`#${id}-end`}>Skip spatial tour</a>
    <div ref={sticky} className="tour-sticky">
      <div className="tour-topline"><span><i aria-hidden="true" />{model.label}</span><span title={model.target}>{model.target}</span></div>
      <div className="tour-stage" aria-label="Captured website in 3D">
        {!presented && <div className="tour-capture-fallback">
          {chapter.imageUrl !== null ? <img src={chapter.imageUrl} alt="Recorded website capture" /> : <p>No page capture is available for this run.</p>}
          <span role="status">{!hasCapture ? "The browser could not capture this site. Review the access limitation and try a public page." : "Preparing the website for inspection…"}</span>
          {!hasCapture && <Link href="/#check-site">Check a public page</Link>}
        </div>}
        {useCaptureScene && <CaptureScene model={model} motion={motion} />}
        {hasCapture && !failed && !lightweight && <div className="tour-webgl" aria-hidden="true"><Scene key={sceneAttempt} model={model} motion={motion} onReady={onReady} onFail={onFail} onSelect={selectFinding} /></div>}
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
      </article>)}
      <div className="tour-bottom">
        <div className="tour-view-controls">
          {pageChapters.length > 1 && <label>Page <select aria-label="Captured pages" value={pageChapters.find(({ item }) => item.pageUrl === chapter.pageUrl)?.index ?? 0} onChange={(event) => goTo(Number(event.target.value))}>{pageChapters.map(({ item, index }, pageIndex) => <option key={item.id} value={index}>{pageIndex + 1}. {index === 0 ? "First page" : item.title}</option>)}</select></label>}
          {hasCapture && <button type="button" aria-pressed={useCaptureScene} onClick={() => { if (useCaptureScene) { setFailed(false); setReady(false); setLightweight(false); setSceneAttempt((value) => value + 1); } else setLightweight(true); }}>{useCaptureScene ? "Lightweight 3D" : "Full 3D"}<span aria-hidden="true"> ⇄</span></button>}
        </div>
        <div className="tour-position"><span>SCROLL TO INSPECT</span><span>{String(active + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span></div>
        <progress ref={rail} max={1} value={0} aria-label="Spatial tour progress" />
        <nav ref={chapterNav} className="tour-chapter-nav" aria-label="Tour chapters">{model.chapters.map((item, index) => <button key={item.id} type="button" onClick={() => goTo(index)} aria-current={active === index ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{item.kind === "finding" && item.finding !== null ? `Issue ${model.chapters.slice(0, index + 1).filter((entry) => entry.finding !== null).length}` : item.kind === "rejection" ? "Rejected" : item.kind === "verification" ? "Proof" : item.kind === "interaction" ? "Interaction" : item.kind === "overview" ? "Website" : item.kind === "page" ? item.eyebrow.replace("CAPTURED ", "") : item.kind.charAt(0).toUpperCase() + item.kind.slice(1)}</button>)}</nav>
        <div className="tour-step-controls"><button type="button" disabled={active === 0} onClick={() => goTo(active - 1)} aria-label="Previous tour chapter">← Previous</button><button type="button" disabled={systemReduced} aria-pressed={reduced} onClick={() => setUserReduced((value) => !value)} aria-label="Reduce tour motion">{reduced ? "Reduced motion on" : "Reduce motion"}</button><button type="button" disabled={active === count - 1} onClick={() => goTo(active + 1)} aria-label="Next tour chapter">Next →</button></div>
      </div>
    </div>
    <div id={`${id}-end`} className="tour-end" />
  </section>;
}

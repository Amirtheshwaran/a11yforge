"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import type { TourChapter, TourModel } from "../../lib/tour-model";
import { tourSegment } from "../../lib/tour-model";
import { followProgress } from "../../lib/tour-motion";
import type { TourMotion } from "./SpatialScene";

function capturePose(chapter: TourChapter | undefined): { x: number; y: number; scale: number } {
  const box = chapter?.highlight;
  if (box == null || chapter?.source != null) return { x: 0, y: 0, scale: 1 };
  const scale = Math.min(2.4, Math.max(1, 0.5 / Math.max(box.width / box.viewportWidth, box.height / box.viewportHeight)));
  return { x: (0.5 - (box.x + box.width / 2) / box.viewportWidth) * 100 * scale, y: (0.5 - (box.y + box.height / 2) / box.viewportHeight) * 100 * scale, scale };
}

/** CSS perspective keeps the real page spatial when WebGL is unavailable or disabled. */
export function CaptureScene({ model, motion }: { model: TourModel; motion: RefObject<TourMotion> }): React.JSX.Element {
  const object = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const last = useRef(0);
  const chapter = model.chapters[active];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    for (const url of new Set(model.chapters.flatMap((item) => item.imageUrl === null ? [] : [item.imageUrl]))) {
      const image = new Image(); image.decoding = "async"; image.src = url;
      void image.decode().catch(() => undefined);
    }
  }, [model]);
  useEffect(() => {
    let raf = 0;
    let previous = 0;
    const segment = { from: 0, to: 0, mix: 0 };
    const draw = (now: number): void => {
      raf = 0;
      motion.current.current = followProgress(motion.current.current, motion.current.target, previous === 0 ? 1 / 60 : (now - previous) / 1000, motion.current.reduced);
      previous = now;
      const { from, to, mix } = tourSegment(motion.current.current, model.chapters.length, segment);
      const selected = mix < 0.5 ? from : to;
      if (selected !== last.current) { last.current = selected; setActive(selected); }
      if (object.current !== null) {
        const reduced = motion.current.reduced;
        const a = capturePose(model.chapters[from]), b = capturePose(model.chapters[to]);
        const lerp = (x: number, y: number): number => x + (y - x) * mix;
        object.current.style.transform = `translate(${lerp(a.x, b.x)}%, ${lerp(a.y, b.y)}%) rotateX(${reduced ? 0 : -2 + Math.sin(mix * Math.PI) * 2}deg) rotateY(${reduced ? 0 : -5 + mix * 3}deg) scale(${lerp(a.scale, b.scale)})`;
      }
      motion.current.present?.(motion.current.current);
      if (Math.abs(motion.current.target - motion.current.current) > 0.0001) raf = requestAnimationFrame(draw);
      else previous = 0;
    };
    const wake = (): void => { if (raf === 0) raf = requestAnimationFrame(draw); };
    motion.current.wake = wake; wake();
    return () => { cancelAnimationFrame(raf); if (motion.current.wake === wake) motion.current.wake = null; };
  }, [model, motion]);
  const box = chapter?.highlight;
  return <div className="tour-css-scene">
    <div ref={object} className="tour-css-object" data-overview={active === 0}>
      {chapter?.imageUrl != null && chapter.imageUrl !== failedUrl ? <div className="tour-css-capture">
        <img key={chapter.imageUrl} src={chapter.imageUrl} alt="Actual website captured during this check" onError={() => setFailedUrl(chapter.imageUrl)} />
        {box != null && <span className="tour-css-highlight" aria-hidden="true" style={{ left: `${100 * box.x / box.viewportWidth}%`, top: `${100 * box.y / box.viewportHeight}%`, width: `${100 * box.width / box.viewportWidth}%`, height: `${100 * box.height / box.viewportHeight}%` }} />}
      </div> : <p className="tour-capture-missing">This page capture could not load. The recorded findings remain available below.</p>}
      {chapter?.source != null && <pre className="tour-css-source"><code>{chapter.source.path}{"\n\n"}{chapter.source.text}</code></pre>}
    </div>
  </div>;
}

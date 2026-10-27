"use client";

import { useEffect, useRef } from "react";
import { revealIn } from "../lib/motion";

/**
 * Staggered editorial reveal: wraps headline words/lines so Anime.js can
 * sequence them, while server output stays fully readable without JS.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "h1" | "h2" | "p" | "span";
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  // Entrance runs once: re-running on re-render would replay the headline
  // on every keystroke in the URL field.
  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    void revealIn(node);
  }, []);

  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement>} className={className}>
      {children}
    </Tag>
  );
}

/** Split headline into word spans for staggered text reveals. */
export function SplitWords({ text }: { text: string }): React.JSX.Element {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          data-reveal
          style={{ display: "inline-block", whiteSpace: "pre" }}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

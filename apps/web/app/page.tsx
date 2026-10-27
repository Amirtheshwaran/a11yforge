"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrbitalHero } from "@/components/orbital-hero";
import { Reveal, SplitWords } from "@/components/motion-text";
import { fetchHealth, startExploration, type ApiHealth } from "../lib/api";
import { observeScenes, parallax, prefersReducedMotion, revealIn } from "../lib/motion";

/**
 * Cinematic landing: giant editorial type left, one dominant orbital
 * accessibility object right, URL form embedded in the composition.
 * Scroll tells the product story; the scan button carries the hero
 * straight into the live scanning theatre (no hard cut in feel).
 */
export default function Home(): React.JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [health, setHealth] = useState<ApiHealth | null | undefined>(undefined);
  const heroRef = useRef<HTMLElement | null>(null);
  const storyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHealth().then((result) => {
      if (!cancelled) setHealth(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hero entrance + pointer parallax + scroll-scene reveals.
  useEffect(() => {
    const hero = heroRef.current;
    const cleanups: Array<() => void> = [];
    if (hero !== null) {
      void revealIn(hero);
      cleanups.push(parallax(hero, 12));
    }
    const story = storyRef.current;
    if (story !== null) {
      cleanups.push(
        observeScenes(story, (_index, element) => {
          void revealIn(element as ParentNode);
        }),
      );
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const target = url.trim();
    if (target === "") {
      setError("Enter a website address to check.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const runId = await startExploration(target);
      const destination = `/explore/${encodeURIComponent(runId)}?url=${encodeURIComponent(target)}`;
      if (prefersReducedMotion()) {
        router.push(destination);
        return;
      }
      // The hero transitions into the live scan: push toward the site
      // instead of hard-cutting to the next screen.
      setLeaving(true);
      window.setTimeout(() => router.push(destination), 320);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the check.");
      setStarting(false);
    }
  }

  const urlForm = (id: string): React.JSX.Element => (
    <form className="forge-url" onSubmit={onSubmit}>
      <Label htmlFor={id} className="mono-label">
        Website address
      </Label>
      <div className="forge-url-row url-row" style={{ marginTop: 6 }}>
        <span className="input-wrap">
          <span className="input-prompt" aria-hidden="true">
            &gt;
          </span>
          <Input
            id={id}
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="yourwebsite.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-describedby={`${id}-help`}
            required
          />
        </span>
        <button type="submit" className="forge-scan-btn" disabled={starting}>
          {starting ? "Scanning…" : "Scan site"}
          <span className="arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
      <p id={`${id}-help`} className="help forge-url-hint">
        A real browser opens your site and finds problems people can actually
        experience. No account needed.
      </p>
    </form>
  );

  return (
    <main className="landing" style={leaving ? { opacity: 0.25, transition: "opacity 0.32s ease" } : undefined}>
      <a className="skip-link" href="#site-url">
        Skip to website check
      </a>

      <section
        ref={heroRef}
        className="forge-hero"
        aria-labelledby="hero-title"
      >
        <div className="forge-hero-copy">
          <span className="mono-label" data-reveal>
            Real-browser accessibility testing
          </span>
          <Reveal as="h1" className="display-1" >
            <span id="hero-title">
              <SplitWords text="See what your users can't." />
            </span>
          </Reveal>
          <Reveal className="lede-xl">
            <span data-reveal>
              A11yForge opens your website in a real browser and finds
              accessibility problems people can actually experience.
            </span>
          </Reveal>
          <div data-reveal>{urlForm("site-url")}</div>
          {error !== null && (
            <Alert variant="destructive" className="mt-3" style={{ maxWidth: 520 }}>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {health === null && (
            <Alert className="mt-3" style={{ maxWidth: 520 }}>
              <AlertDescription>
                The check service is not responding right now. You can still
                watch the recorded example in the{" "}
                <Link href="/console">demo</Link>.
              </AlertDescription>
            </Alert>
          )}
          <p className="demo-link" data-reveal>
            <Link href="/console">Watch a recorded real repair</Link>
            {" — start to finish, in the demo theatre."}
          </p>
        </div>
        <div data-depth="0.6" data-reveal style={{ minWidth: 0 }}>
          <OrbitalHero active={focused || starting} />
        </div>
      </section>

      <div ref={storyRef} className="story" aria-label="How A11yForge works">
        <section className="story-scene" data-scene aria-labelledby="s1">
          <span className="story-index" data-reveal>01 / Visit</span>
          <h2 id="s1" className="display-2" data-reveal>
            Your website, floating in the inspection orbit.
          </h2>
          <p className="lede-xl" data-reveal>
            A real browser opens your site, moves through its pages, and uses
            the keyboard the way people do.
          </p>
        </section>
        <section className="story-scene" data-scene aria-labelledby="s2">
          <span className="story-index" data-reveal>02 / Notice</span>
          <h2 id="s2" className="display-2" data-reveal>
            Barriers light up where they actually happen.
          </h2>
          <p className="lede-xl" data-reveal>
            Text that is hard to read. Controls with no clear purpose. Pages
            that trap keyboard users. Each one pinned to its exact location.
          </p>
        </section>
        <section className="story-scene" data-scene aria-labelledby="s3">
          <span className="story-index" data-reveal>03 / Break</span>
          <h2 id="s3" className="display-2" data-reveal>
            Watch the focus path break.
          </h2>
          <p className="lede-xl" data-reveal>
            See the exact moment keyboard focus moves somewhere users
            can&apos;t understand — explained in plain language, not jargon.
          </p>
        </section>
        <section className="story-scene" data-scene aria-labelledby="s4">
          <span className="story-index" data-reveal>04 / Trace</span>
          <h2 id="s4" className="display-2" data-reveal>
            The code behind the problem slides into view.
          </h2>
          <p className="lede-xl" data-reveal>
            Connect your repository and A11yForge draws a line from the broken
            element straight to the responsible source file.
          </p>
        </section>
        <section className="story-scene" data-scene aria-labelledby="s5">
          <span className="story-index" data-reveal>05 / Prove</span>
          <h2 id="s5" className="display-2" data-reveal>
            The repair only counts if the browser agrees.
          </h2>
          <p className="lede-xl" data-reveal>
            A11yForge replays the original problem after every repair. Fixes
            that don&apos;t verify get rejected — and you see exactly why.
          </p>
        </section>
        <section className="story-finale" data-scene aria-labelledby="finale">
          <p className="workflow-strip" data-reveal>
            <span>Find</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>Fix</span>
            <span className="sep" aria-hidden="true">·</span>
            <span>Prove</span>
          </p>
          <h2 id="finale" className="display-2" data-reveal>
            Test your website now.
          </h2>
          <div data-reveal>{urlForm("site-url-2")}</div>
        </section>
      </div>
    </main>
  );
}

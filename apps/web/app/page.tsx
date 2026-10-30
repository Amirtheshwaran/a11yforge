"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WebsiteHeroChassis } from "@/components/website-hero-chassis";
import { Reveal, SplitWords } from "@/components/motion-text";
import { fetchHealth, startExploration, type ApiHealth } from "../lib/api";
import { observeScenes, parallax, prefersReducedMotion, revealIn } from "../lib/motion";

/**
 * Editorial Landing Experience (Stitch Remix).
 *
 * Core rule: "Give me your website. I will show you exactly where people may have
 * trouble using it, explain why, and help fix it."
 *
 * The user's website is the physical product on display in a dark luxury showroom.
 * No random spinning, no unmotivated orbiting, and no fake telemetry metrics.
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

  // Hero entrance + subtle pointer parallax + scroll-scene reveals.
  useEffect(() => {
    const hero = heroRef.current;
    const cleanups: Array<() => void> = [];
    if (hero !== null) {
      void revealIn(hero);
      cleanups.push(parallax(hero, 8));
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
        Target website
      </Label>
      <div className="forge-url-row url-row" style={{ marginTop: 8 }}>
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
            placeholder="https://yourwebsite.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-describedby={`${id}-help`}
            required
          />
        </span>
        <button type="submit" className="forge-scan-btn" disabled={starting}>
          {starting ? "Starting check…" : "Check my website"}
          <span className="arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>
      <div className="flex items-center gap-4 pt-3 text-xs text-[#7e7d7a]" id={`${id}-help`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[#27ae60]" aria-hidden="true">✓</span>
          <span>Real browser testing</span>
        </div>
        <span>•</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[#7e7d7a]" aria-hidden="true">🔓</span>
          <span>No account required</span>
        </div>
      </div>
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
          <Reveal as="h1" className="display-1">
            <span id="hero-title">
              <SplitWords text="See where your website is hard to use." />
            </span>
          </Reveal>
          <Reveal className="lede-xl">
            <span data-reveal>
              A11yForge checks your website in a real browser, shows exactly
              where people may have trouble, and can repair supported problems.
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
                <Link href="/console">demo theatre</Link>.
              </AlertDescription>
            </Alert>
          )}
          <p className="demo-link" data-reveal>
            <Link href="/console">Watch a recorded real repair</Link>
            {" — start to finish, with deterministic verification."}
          </p>
        </div>
        <div data-depth="0.4" data-reveal style={{ minWidth: 0 }}>
          <WebsiteHeroChassis url={url} active={focused || starting} />
        </div>
      </section>

      <div ref={storyRef} className="story" aria-label="How A11yForge works">
        <section className="story-scene" data-scene aria-labelledby="s1">
          <span className="story-index" data-reveal>01 / Inspect</span>
          <h2 id="s1" className="display-2" data-reveal>
            Your website, tested the way real people use it.
          </h2>
          <p className="lede-xl" data-reveal>
            A real headless browser opens your website, navigates through its
            controls, and tests with the keyboard just like assistive tools do.
          </p>
        </section>
        <section className="story-scene" data-scene aria-labelledby="s2">
          <span className="story-index" data-reveal>02 / Understand</span>
          <h2 id="s2" className="display-2" data-reveal>
            Problems highlighted right on the website.
          </h2>
          <p className="lede-xl" data-reveal>
            Buttons with no names. Text that is hard to read. Trapped focus.
            Each issue is shown in plain language with its exact location.
          </p>
        </section>
        <section className="story-scene" data-scene aria-labelledby="s3">
          <span className="story-index" data-reveal>03 / Repair & Prove</span>
          <h2 id="s3" className="display-2" data-reveal>
            Connect your code, test the fix, and verify it works.
          </h2>
          <p className="lede-xl" data-reveal>
            A11yForge finds the code behind the problem, creates a repair, rejects
            bad fixes that fail project checks, and replays the original problem
            to prove it is resolved.
          </p>
        </section>
      </div>
    </main>
  );
}

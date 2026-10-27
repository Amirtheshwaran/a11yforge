"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { startExploration } from "../lib/api";

/**
 * Phase 8 primary product experience.
 *
 * One sentence, one input, one action: paste a website, test it with a real
 * browser. No evidence IDs, run IDs, scores, tokens, or lifecycle internals
 * on this screen — those live in advanced details.
 */
export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const target = url.trim();
    if (target === "") {
      setError("Enter a website address to test.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const runId = await startExploration(target);
      router.push(`/explore/${encodeURIComponent(runId)}?url=${encodeURIComponent(target)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the test.");
      setStarting(false);
    }
  }

  return (
    <main className="product">
      <a className="skip-link" href="#test-url">
        Skip to website test
      </a>
      <header className="product-top">
        <span className="wordmark">A11yForge</span>
        <nav aria-label="Primary">
          <Link href="/console">Repair demo</Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">
          Find. Fix. <span className="hero-accent">Prove</span> accessibility.
        </h1>
        <p className="lede">
          Paste a website and A11yForge will test it with a real browser.
        </p>
        <form className="url-form" onSubmit={onSubmit}>
          <label htmlFor="test-url">Website URL</label>
          <div className="url-row">
            <input
              id="test-url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-describedby="url-help"
              required
            />
            <button type="submit" className="btn-primary" disabled={starting}>
              {starting ? "Starting…" : "Test accessibility"}
            </button>
          </div>
          <p id="url-help" className="help">
            A11yForge opens your site in a real browser, checks accessibility
            rules, tests keyboard interactions, and records exactly what failed.
          </p>
          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
        <p className="demo-link">
          <Link href="/console">Try the demo</Link> — see a real recorded
          repair, start to finish.
        </p>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">Test the website people actually use</h2>
        <ol className="steps">
          <li>
            <h3>Experience</h3>
            <p>
              A real browser opens your site, moves through its pages, and
              uses the keyboard the way people do.
            </p>
          </li>
          <li>
            <h3>Find</h3>
            <p>
              A11yForge reproduces accessibility failures — focus that escapes
              a dialog, controls with no name, checks the rules catch.
            </p>
          </li>
          <li>
            <h3>Prove</h3>
            <p>
              Every reported failure includes evidence: what happened, where,
              and the exact steps to reproduce it.
            </p>
          </li>
        </ol>
      </section>

      <section className="repair" aria-labelledby="repair-title">
        <h2 id="repair-title">When source code is connected</h2>
        <p>
          A11yForge can trace a confirmed failure into the codebase, propose
          a repair, and deterministically verify whether the repair actually
          worked — accepting it only when the evidence proves it.
        </p>
        <p>
          <Link href="/connect">Connect source to repair</Link>
          {" · "}
          <Link href="/console">See a full repair example</Link>
        </p>
      </section>

      <footer className="product-foot">
        <p>
          Universal website testing is live now. Source-connected repair for
          arbitrary sites is next.{" "}
          <Link href="/console">Technical evidence console</Link>
        </p>
      </footer>
    </main>
  );
}

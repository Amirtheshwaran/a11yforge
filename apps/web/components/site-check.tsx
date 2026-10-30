"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchHealth, startExploration } from "../lib/api";
import { normalizeWebsiteUrl } from "../lib/website-url";

export function SiteCheck({ context = "demo" }: { context?: "landing" | "demo" }): React.JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  useEffect(() => { let live = true; void fetchHealth().then((health) => { if (live) setAvailable(health !== null); }); return () => { live = false; }; }, []);
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (starting) return;
    setError(null);
    try {
      const target = normalizeWebsiteUrl(url);
      setUrl(target); setStarting(true);
      const runId = await startExploration(target);
      router.push(`/explore/${encodeURIComponent(runId)}?url=${encodeURIComponent(target)}`);
    } catch (err) { setError(err instanceof Error ? err.message : "The check could not start."); setStarting(false); }
  }
  return <section id="check-site" className="site-check-section" aria-labelledby="check-site-title">
    <p className="mono-label">{context === "landing" ? "START WITH YOUR WEBSITE" : "THE SAME EXPERIENCE. YOUR WEBSITE."}</p>
    <h2 id="check-site-title">{context === "landing" ? "Check your website." : "Now look at your own website."}</h2>
    <p>A real browser records the evidence. Explore your site’s actual accessibility issues in a guided spatial tour.</p>
    <form className="spatial-url-form" onSubmit={submit} noValidate aria-busy={starting}>
      <label htmlFor="site-url">Start with your website</label>
      <div className="spatial-url-input"><span aria-hidden="true">↗</span><input id="site-url" type="url" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="https://yourwebsite.com" required value={url} onChange={(event) => { setUrl(event.target.value); setError(null); }} aria-invalid={error !== null} aria-describedby={error !== null ? "site-check-help site-check-error" : "site-check-help"} /><button type="submit" disabled={starting} aria-label="Check my website">{starting ? "Opening…" : "Check my website"}<span aria-hidden="true">→</span></button></div>
      <p id="site-check-help">Real browser testing · No model calls for exploration</p>
    </form>
    {error !== null && <p id="site-check-error" role="alert">{error}</p>}
    {!available && <p role="status">The check service is unavailable. The recorded evidence remains available in the <Link href="/console">demo</Link>.</p>}
  </section>;
}

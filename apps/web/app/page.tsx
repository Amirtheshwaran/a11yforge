"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { fetchHealth, startExploration, type ApiHealth } from "../lib/api";

/**
 * Landing: Stitch "Test a site" visual language on shadcn/ui primitives.
 *
 * Preserved logic: URL submit -> startExploration, validation errors,
 * health/demo notices, navigation to /explore/[runId]. No fake progress,
 * no invented findings — every status line below is wired to real state.
 */
export default function Home(): React.JSX.Element {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [health, setHealth] = useState<ApiHealth | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchHealth().then((result) => {
      if (!cancelled) setHealth(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <main className="landing">
      <a className="skip-link" href="#test-url">
        Skip to website test
      </a>

      <section className="hero" aria-labelledby="hero-title">
        <Badge>A11yForge Core // Automated WCAG AAA Inspection</Badge>
        <h1 id="hero-title" style={{ marginTop: 16 }}>
          Find. Fix. Prove accessibility.
        </h1>
        <p className="lede">
          Paste a website and A11yForge will test it with a real browser.
        </p>
        <form className="url-form" onSubmit={onSubmit}>
          <Label htmlFor="test-url" className="label-caps">
            <span>Website URL</span>
            <span className="label-note">headless chromium runtime</span>
          </Label>
          <div className="url-row">
            <span className="input-wrap">
              <span className="input-prompt" aria-hidden="true">
                &gt;
              </span>
              <Input
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
                className="h-12 pl-9"
              />
            </span>
            <Button type="submit" size="lg" disabled={starting}>
              {starting ? "Starting…" : "Test accessibility"}
            </Button>
          </div>
          <p id="url-help" className="help">
            A11yForge opens your site in a real browser, checks accessibility
            rules, tests keyboard interactions, and records exactly what failed.
          </p>
          {error !== null && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>[✕] {error}</AlertDescription>
            </Alert>
          )}
          {health === null && (
            <Alert className="mt-3">
              <AlertDescription>
                [—] API unreachable — the test service is not responding. You can
                still inspect the recorded run in the{" "}
                <Link href="/console">demo</Link>.
              </AlertDescription>
            </Alert>
          )}
          {health !== undefined &&
            health !== null &&
            health.demoMode === "bundled-recorded" && (
              <Alert className="mt-3">
                <AlertDescription>
                  [✓] Recorded demo available —{" "}
                  <Link href="/console">see a real repair, start to finish</Link>.
                </AlertDescription>
              </Alert>
            )}
        </form>
        <p className="demo-link">
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link href="/console">Try the demo</Link>
          </Button>{" "}
          — see a real recorded repair, start to finish.
        </p>
      </section>

      <Separator className="my-2" />

      <section className="how landing-wide steps-grid" aria-labelledby="how-title">
        <h2 id="how-title">Test the website people actually use</h2>
        <ol className="steps">
          <li>
            <Card className="flex h-full flex-col gap-2 border-0 bg-transparent p-0 shadow-none">
              <CardTitle className="font-mono text-[13px] font-normal text-inkfaint">
                runtime
              </CardTitle>
              <h3 className="text-[17px]">Experience</h3>
              <CardDescription className="max-w-[62ch]">
                A real browser opens your site, moves through its pages, and
                uses the keyboard the way people do.
              </CardDescription>
              <p className="steps-foot">[✓] Full shadow-DOM traversal</p>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col gap-2 border-0 bg-transparent p-0 shadow-none">
              <CardTitle className="font-mono text-[13px] font-normal text-inkfaint">
                analysis
              </CardTitle>
              <h3 className="text-[17px]">Find</h3>
              <CardDescription className="max-w-[62ch]">
                A11yForge reproduces accessibility failures — focus that escapes
                a dialog, controls with no name, checks the rules catch.
              </CardDescription>
              <p className="steps-foot">[✓] WCAG 2.2 rule checks</p>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col gap-2 border-0 bg-transparent p-0 shadow-none">
              <CardTitle className="font-mono text-[13px] font-normal text-inkfaint">
                telemetry
              </CardTitle>
              <h3 className="text-[17px]">Prove</h3>
              <CardDescription className="max-w-[62ch]">
                Every reported failure includes evidence: what happened, where,
                and the exact steps to reproduce it.
              </CardDescription>
              <p className="steps-foot">[✓] Trace + DOM snapshot capture</p>
            </Card>
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
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link href="/connect">Connect source to repair</Link>
          </Button>
          {" · "}
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link href="/console">See a full repair example</Link>
          </Button>
        </p>
        <aside className="engine-strip" aria-label="Engine status">
          <span>
            ENGINE ARCHITECTURE · <strong>A11yForge strict</strong>
          </span>
          <Badge variant="faint">
            {health === undefined
              ? "API status: checking…"
              : health === null
                ? "[—] API: unreachable"
                : "[✓] API: connected"}
          </Badge>
        </aside>
      </section>
    </main>
  );
}

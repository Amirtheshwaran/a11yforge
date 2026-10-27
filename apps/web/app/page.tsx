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
 * Landing in plain language: what the product checks, what to do, what
 * happens next. Preserved logic: URL submit -> startExploration,
 * validation errors, health/demo notices, navigation to /explore/[runId].
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
      setError("Enter a website address to check.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const runId = await startExploration(target);
      router.push(`/explore/${encodeURIComponent(runId)}?url=${encodeURIComponent(target)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the check.");
      setStarting(false);
    }
  }

  return (
    <main className="landing">
      <a className="skip-link" href="#site-url">
        Skip to website check
      </a>

      <section className="hero" aria-labelledby="hero-title">
        <Badge>A11yForge checks websites for accessibility problems</Badge>
        <h1 id="hero-title" style={{ marginTop: 16 }}>
          Is your website accessible?
        </h1>
        <p className="lede">
          A11yForge checks your website for accessibility problems that can
          make it difficult or impossible for people to use. Enter a website
          and A11yForge will check for problems that may prevent people from
          using it.
        </p>
        <form className="url-form" onSubmit={onSubmit}>
          <Label htmlFor="site-url" className="label-caps">
            <span>Website address</span>
            <span className="label-note">public pages only</span>
          </Label>
          <div className="url-row">
            <span className="input-wrap">
              <span className="input-prompt" aria-hidden="true">
                &gt;
              </span>
              <Input
                id="site-url"
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
              {starting ? "Checking…" : "Check my website"}
            </Button>
          </div>
          <p id="url-help" className="help">
            Paste a website. We’ll test it in a real browser and explain what
            needs attention. No account required. We only inspect publicly
            available pages.
          </p>
          {error !== null && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {health === null && (
            <Alert className="mt-3">
              <AlertDescription>
                The check service is not responding right now. You can still
                look at the recorded example in the{" "}
                <Link href="/console">demo</Link>.
              </AlertDescription>
            </Alert>
          )}
          {health !== undefined &&
            health !== null &&
            health.demoMode === "bundled-recorded" && (
              <Alert className="mt-3">
                <AlertDescription>
                  Not sure where to start?{" "}
                  <Link href="/console">See an example repair, start to finish</Link>.
                </AlertDescription>
              </Alert>
            )}
        </form>
        <p className="demo-link">
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link href="/console">See an example</Link>
          </Button>{" "}
          — a real recorded repair, start to finish.
        </p>
      </section>

      <Separator className="my-2" />

      <section className="how landing-wide steps-grid" aria-labelledby="how-title">
        <h2 id="how-title">How the check works</h2>
        <ol className="steps">
          <li>
            <Card className="flex h-full flex-col gap-2 border-0 bg-transparent p-0 shadow-none">
              <CardTitle className="font-mono text-[13px] font-normal text-inkfaint">
                visit
              </CardTitle>
              <h3 className="text-[17px]">Experience</h3>
              <CardDescription className="max-w-[62ch]">
                A real browser opens your site, moves through its pages, and
                uses the keyboard the way people do.
              </CardDescription>
              <p className="steps-foot">Real browser test</p>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col gap-2 border-0 bg-transparent p-0 shadow-none">
              <CardTitle className="font-mono text-[13px] font-normal text-inkfaint">
                notice
              </CardTitle>
              <h3 className="text-[17px]">Find</h3>
              <CardDescription className="max-w-[62ch]">
                A11yForge notices barriers — text that is hard to read,
                controls with no clear purpose, pages that are hard to use
                without a mouse.
              </CardDescription>
              <p className="steps-foot">Covers common barriers</p>
            </Card>
          </li>
          <li>
            <Card className="flex h-full flex-col gap-2 border-0 bg-transparent p-0 shadow-none">
              <CardTitle className="font-mono text-[13px] font-normal text-inkfaint">
                explain
              </CardTitle>
              <h3 className="text-[17px]">Explain</h3>
              <CardDescription className="max-w-[62ch]">
                Every problem comes with a plain explanation of what is wrong,
                why it matters, and what to do next.
              </CardDescription>
              <p className="steps-foot">Evidence with every problem</p>
            </Card>
          </li>
        </ol>
      </section>

      <section className="repair" aria-labelledby="repair-title">
        <h2 id="repair-title">Can A11yForge fix problems too?</h2>
        <p>
          Yes — connect your code and A11yForge can try to locate the
          responsible code and repair supported issues, then check whether
          the fix actually worked.
        </p>
        <p>
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link href="/connect">Connect your code to fix problems</Link>
          </Button>
          {" · "}
          <Button variant="link" className="h-auto p-0 text-sm" asChild>
            <Link href="/console">See a full repair example</Link>
          </Button>
        </p>
        <aside className="engine-strip" aria-label="Service status">
          <span>
            Find. Fix. Prove accessibility.
          </span>
          <Badge variant="faint">
            {health === undefined
              ? "Service status: checking…"
              : health === null
                ? "Service: unreachable"
                : "Service: connected"}
          </Badge>
        </aside>
      </section>
    </main>
  );
}

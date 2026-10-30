"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EvidenceViewer } from "@/components/evidence-viewer";
import { humanFindingOf } from "../../lib/human-copy";
import {
  connectSourceRepo,
  explorationShotSrc,
  fetchExploration,
  fetchSourceConnection,
  fetchSourceTrace,
  type ExplorationRun,
  type SourceConnectionState,
  type SourceTraceView,
} from "../../lib/api";
import { drawLines } from "../../lib/motion";

/**
 * Phase 9 source-connection screen aligned to the Stitch spatial showroom.
 *
 * Left: Physical Website Plane (shifted left -140px on desktop)
 * Right: Source Code Chamber (Git connection form, local CLI runner, and code view)
 *
 * One-sentence product rule:
 * "Give me a website. I'll show you exactly where people may have trouble using it,
 * explain why, and help fix it."
 *
 * Plain-language rule:
 * All technical compiler jargon is strictly relegated
 * to the collapsible "Developer details" drawer. Normal copy is understandable to a child.
 */
export default function ConnectSource(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="xp"><p className="text-inkdim font-mono text-sm p-8">Loading source connection…</p></main>}>
      <ConnectSourceContent />
    </Suspense>
  );
}

/** Stages backed by real connection/trace state — plain English. */
const STEPS = ["Connecting code", "Finding the problem area"];

/** Human-readable byte count computed from real inventory data. */
function formatBytes(totalBytes: number): string {
  if (!Number.isFinite(totalBytes) || totalBytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = totalBytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value).toString() : value.toFixed(1)} ${units[unit]}`;
}

function ConnectSourceContent(): React.JSX.Element {
  const search = useSearchParams();
  const runId = search.get("run") ?? "";
  const findingId = search.get("finding") ?? "";

  const [exploration, setExploration] = useState<ExplorationRun | null>(null);
  const [gitUrl, setGitUrl] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [state, setState] = useState<SourceConnectionState | null>(null);
  const [trace, setTrace] = useState<SourceTraceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const layerRef = useRef<HTMLElement | null>(null);

  // Load exploration data if runId is supplied
  useEffect(() => {
    if (runId === "") return;
    let active = true;
    void fetchExploration(runId).then((res) => {
      if (active && res !== null) setExploration(res);
    });
    return () => {
      active = false;
    };
  }, [runId]);

  useEffect(() => {
    if (layerRef.current !== null) void drawLines(layerRef.current, "[data-draw]");
  }, [sourceId, trace?.status]);

  useEffect(
    () => () => {
      if (pollRef.current !== null) clearInterval(pollRef.current);
    },
    [],
  );

  async function poll(id: string): Promise<void> {
    try {
      const next = await fetchSourceConnection(id);
      setState(next);
      if (next.state === "CONNECTED") {
        if (pollRef.current !== null) clearInterval(pollRef.current);
        const view = await fetchSourceTrace(id);
        setTrace(view);
      } else if (next.state === "FAILED") {
        if (pollRef.current !== null) clearInterval(pollRef.current);
        setError(next.error ?? "Source connection failed.");
      }
    } catch (err) {
      if (pollRef.current !== null) clearInterval(pollRef.current);
      setError(err instanceof Error ? err.message : "Source connection failed.");
    }
  }

  async function onConnect(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setTrace(null);
    setConnecting(true);
    try {
      const id = await connectSourceRepo({
        gitUrl,
        ...(runId !== "" && findingId !== "" ? { runId, findingId } : {}),
      });
      setSourceId(id);
      setState(null);
      await poll(id);
      pollRef.current = setInterval(() => void poll(id), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect source.");
      setConnecting(false);
      return;
    }
    setConnecting(false);
  }

  const stageIndex =
    state === null
      ? 0
      : state.state === "FAILED"
        ? 0
        : trace !== null
          ? 2
          : 1;

  const cliCommand = `pnpm --filter @a11yforge/engine repair -- --run ${runId !== "" ? runId : "<run-id>"} --finding ${findingId !== "" ? findingId : "<finding-id>"} --source .`;

  function onCopyCli(): void {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
    void navigator.clipboard.writeText(cliCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Derive target finding information from exploration or query params
  const matchedFinding = exploration?.findings.find((f) => f.findingId === findingId) ?? null;
  const targetSelector =
    matchedFinding?.highlights[0]?.selector || "No measured selector available";
  const targetLabel = matchedFinding?.highlights[0]?.label || "Selected problem";
  const targetTitle = matchedFinding === null ? "Choose a finding from a website check" : humanFindingOf(matchedFinding).title;
  const siteUrl = exploration?.target.normalizedUrl || exploration?.target.entryUrl || "No website selected";
  const screenshot = matchedFinding?.screenshots[0] ?? exploration?.screenshots[0] ?? null;

  const traceCandidate =
    trace !== null && trace.status === "FOUND" ? trace.candidates[0] ?? null : null;
  const traceSnippet = traceCandidate?.snippets[0] ?? null;

  // Rule: Heading: "We found the code behind this problem." or "This is the most likely code behind this problem."
  const isHighConfidence = traceCandidate !== null && (traceCandidate.score ?? 0) >= 0.7;
  const codeFoundHeading = isHighConfidence
    ? "We found the code behind this problem."
    : "This is the most likely code behind this problem.";

  return (
    <main className="xp w-full min-h-screen bg-[#0B0B0C] text-[#F5F4F0] px-4 sm:px-6 lg:px-12 py-6" ref={layerRef}>
      {/* Top Header & Breadcrumb Bar */}
      <nav aria-label="Breadcrumb" className="w-full flex flex-wrap items-center justify-between gap-y-3 pb-6 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 font-mono text-xs tracking-wider uppercase text-inkdim">
          <Link href={runId !== "" ? `/explore/${encodeURIComponent(runId)}` : "/"} className="hover:text-ink transition-colors">
            Results
          </Link>
          <span className="text-white/20">/</span>
          {findingId !== "" ? (
            <>
              <span className="text-ink"><code>{findingId}</code></span>
              <span className="text-white/20">/</span>
            </>
          ) : null}
          <span aria-current="page" className="text-white font-medium">Connect code</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111113] border border-white/[0.08] font-mono text-[11px] text-[#ffc53d] tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#ffc53d] animate-pulse" />
            {traceCandidate !== null ? "Code connected" : "Connect code"}
          </span>
          <span className="hidden sm:inline font-mono text-[11px] text-inkfaint uppercase">
            Read-only inspection
          </span>
        </div>
      </nav>

      {/* Main Spatial Grid: Left Website Plane + Right Code Chamber */}
      <div className="source-layout w-full py-8 grid gap-8 lg:gap-12 items-start">
        
        {/* LEFT COLUMN: Physical Website Plane */}
        <section aria-label="Website preview" className="flex flex-col gap-4">
          <div className="flex items-center justify-between font-mono text-[11px] text-inkdim">
            <span className="flex items-center gap-1.5 text-[#ffc53d]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Website preview
            </span>
            <span className="hidden sm:inline text-inkfaint">Problem location</span>
          </div>

          {/* Physical Website Chassis */}
          <div className="relative rounded-xl border border-white/[0.12] bg-[#141417] shadow-2xl overflow-hidden transition-transform duration-500 hover:[transform:rotateY(-2deg)_scale(0.99)] [perspective:1200px]">
            {/* Top Browser Lip */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#18181B] border-b border-white/[0.08]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4b2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <span className="ml-2 font-mono text-xs text-inkdim truncate max-w-[220px]">
                  {siteUrl}
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#c6ff4d] flex items-center gap-1">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {exploration !== null ? "Recorded page" : "No check selected"}
              </span>
            </div>

            {screenshot !== null && (
              <EvidenceViewer
                src={explorationShotSrc(runId, screenshot)}
                alt="Recorded browser screenshot for the source inspection"
                highlights={matchedFinding?.highlights.filter((highlight) => highlight.screenshot === screenshot).slice(0, 1) ?? []}
                selectedIndex={0}
                onSelect={() => undefined}
                caption="Evidence from the selected website check."
              />
            )}
            {/* Selected finding summary */}
            <div className="p-5 bg-[#0e0e10] flex flex-col gap-4 relative">
              {/* Subtle grid */}
              <div className="absolute inset-0 bg-[radial-gradient(#2a2a30_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="font-mono text-xs text-ink uppercase tracking-widest font-semibold">
                  Your website
                </span>
                <span className="font-mono text-[10px] text-inkfaint uppercase">Highlighted problem</span>
              </div>

              {/* Target Problem Highlight Card */}
              <div className="relative p-3.5 rounded-lg bg-[#18181B] border border-white/[0.08] shadow-lg">
                {/* Amber Bounding Ring */}
                <div className="absolute -inset-1 rounded-lg border-2 border-[#ffc53d] pointer-events-none shadow-[0_0_18px_rgba(255,197,61,0.3)] animate-pulse" />

                {/* Reticle Pill */}
                <div className="absolute -top-3 left-3 px-2 py-0.5 rounded bg-[#ffc53d] text-[#0B0B0C] font-sans text-[11px] font-semibold tracking-tight">
                  Selected problem: {targetLabel}
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#ff4b2e] flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {targetTitle}
                    </span>
                  </div>

                  <div className="relative flex items-center">
                    <div className="w-full bg-[#111113] border border-white/10 text-ink font-mono text-xs px-3 py-2 rounded">
                      <code>{targetSelector}</code>
                    </div>
                    <span className="absolute right-2.5 px-1.5 py-0.5 rounded bg-white/10 text-[#ffc53d] font-mono text-[10px]">
                      Problem
                    </span>
                  </div>
                </div>
              </div>

              {/* Telemetry Footer */}
              <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-inkfaint">
                <span className="flex items-center gap-1.5 text-[#c6ff4d]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c6ff4d]" />
                  {screenshot !== null ? "Browser evidence loaded" : "Select a website check first"}
                </span>
                <span>Website view</span>
              </div>
            </div>

            {/* Connecting Vector Overlay (Desktop) */}
            <div className="hidden lg:block absolute -right-10 top-1/2 -translate-y-4 w-20 h-10 pointer-events-none z-30">
              <svg className="w-full h-full overflow-visible" fill="none" viewBox="0 0 80 40">
                <path
                  d="M 0 20 C 40 20, 40 20, 80 20"
                  stroke="#ffc53d"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  className="animate-pulse"
                />
                <circle cx="0" cy="20" r="3.5" fill="#ffc53d" />
                <circle cx="80" cy="20" r="3" fill="#ffc53d" />
              </svg>
            </div>
          </div>

          <p className="font-mono text-xs text-inkfaint leading-relaxed">
            {screenshot !== null ? "This screenshot comes from the selected browser check. A highlight appears only when its location was measured." : "Open a problem from your website results to see its browser evidence here."}
          </p>
        </section>

        {/* RIGHT COLUMN: Code Chamber */}
        <section aria-labelledby="connect-title" className="flex flex-col gap-6">
          <div className="relative rounded-xl border border-white/[0.12] bg-[#18181B] shadow-2xl p-6 sm:p-8 overflow-hidden">
            {/* Top Specular Lip */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Status Bar */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${traceCandidate !== null ? "bg-[#c6ff4d]" : "bg-[#ffc53d]"} shadow-[0_0_8px_rgba(255,197,61,0.8)]`} />
                <span className="font-mono text-xs text-ink uppercase tracking-widest font-medium">
                  {traceCandidate !== null ? "Code located" : "Ready to inspect code"}
                </span>
              </div>
              <span className="font-mono text-[10px] text-inkfaint px-2 py-0.5 rounded bg-[#111113] border border-white/[0.08]">
                Read-only
              </span>
            </div>

            {/* Main Title & Lede - Plain English Per Specification */}
            <div className="mb-6">
              <h1 id="connect-title" className="text-2xl sm:text-3xl font-normal tracking-tight text-ink">
                {traceCandidate !== null
                  ? codeFoundHeading
                  : "Connect the code behind this website."}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-inkdim leading-relaxed">
                {traceCandidate !== null
                  ? "This part of the code creates the element we highlighted on your website."
                  : matchedFinding !== null ? "We already found the problem. Connect your source code so A11yForge can look for the part that caused it." : "Choose a problem from a website check, then connect its source code."}
              </p>
            </div>

            {/* Problem Element Context Card */}
            <div className="mb-6 p-3.5 rounded-lg bg-[#111113] border border-white/[0.08] flex items-start gap-3">
              <svg className="w-5 h-5 text-[#ffc53d] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-[10px] text-inkfaint uppercase tracking-wider">
                  Problem element
                </span>
                <span className="font-mono text-xs sm:text-sm text-ink truncate">
                  {targetTitle}
                </span>
                <span className="text-xs text-inkfaint mt-0.5">
                  {matchedFinding !== null ? "Connect your code to look for the file and line." : "No finding selected."}
                </span>
              </div>
            </div>

            {/* STATE A: Source Not Yet Connected (Git Form + Local CLI) */}
            {sourceId === null && (
              <div className="flex flex-col gap-6">
                <form className="flex flex-col gap-4" onSubmit={(event) => void onConnect(event)}>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="git-url" className="font-mono text-xs text-inkdim flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-inkfaint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="6" y1="3" x2="6" y2="15" />
                          <circle cx="18" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                        Public Git repository
                      </Label>
                      <span className="font-mono text-[10px] text-[#c6ff4d] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c6ff4d]" />
                        Public repository
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <div className="absolute left-3 flex items-center pointer-events-none text-inkfaint">
                        <span className="font-mono text-sm">&gt;</span>
                      </div>
                      <Input
                        id="git-url"
                        name="git-url"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="https://github.com/org/repository"
                        value={gitUrl}
                        onChange={(event) => setGitUrl(event.target.value)}
                        required
                        className="pl-8 bg-[#111113] border-white/10 text-ink font-mono text-xs sm:text-sm focus-visible:ring-[#ffc53d]"
                        aria-describedby={error !== null ? "connect-error git-help" : "git-help"}
                        aria-invalid={error !== null}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                    <Button
                      type="submit"
                      disabled={connecting}
                      className="bg-white text-black hover:bg-white/90 font-medium font-sans text-sm h-11 px-6 shadow-lg"
                    >
                      {connecting ? (
                        <>
                          <span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                          Connecting…
                        </>
                      ) : (
                        <>
                          Connect source
                          <span className="ml-1.5 text-base">→</span>
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      asChild
                      className="bg-[#111113] border border-white/10 text-inkdim hover:text-white hover:bg-white/5 font-mono text-xs h-11"
                    >
                      <Link href={runId !== "" ? `/explore/${encodeURIComponent(runId)}` : "/"}>
                        Back to finding
                      </Link>
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 text-inkfaint text-xs pt-1">
                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-inkdim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <p id="git-help" className="leading-relaxed">
                      Read-only access to find the code. We do not change your code without verification.
                    </p>
                  </div>

                  {error !== null && !connecting && (
                    <Alert variant="destructive" id="connect-error" className="bg-[#ff4b2e]/10 border-[#ff4b2e]/30 text-[#ff4b2e]">
                      <AlertDescription>[✕] {error}</AlertDescription>
                    </Alert>
                  )}
                </form>

                {/* Local CLI Option - Labeled "Fix locally instead" per specification */}
                <section aria-labelledby="local-title" className="pt-4 border-t border-white/[0.08]">
                  <p className="font-mono text-xs text-ink uppercase tracking-wider font-semibold" id="local-title">
                    Inspect source locally
                  </p>
                  <p className="text-xs text-inkdim mt-1.5 leading-relaxed">
                    From your local A11yForge checkout, run this command to trace the finding into your code. Replace the source path with your project directory. This command inspects source; it does not execute a repair.
                  </p>
                  <Card className="mt-3 bg-[#111113] border-white/10">
                    <CardHeader className="p-3 border-b border-white/[0.06]">
                      <CardTitle className="font-mono text-[10px] font-semibold uppercase tracking-wider text-inkfaint">
                        Local command
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 flex flex-col gap-2.5">
                      <pre className="font-mono text-xs text-inkdim bg-[#0a0a0c] p-2.5 rounded border border-white/[0.06] overflow-x-auto select-all">
                        <code>{cliCommand}</code>
                      </pre>
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={onCopyCli}
                          className="bg-white/10 hover:bg-white/15 text-ink font-mono text-xs"
                          aria-live="polite"
                        >
                          {copied ? "[✓] Copied to clipboard" : "Copy command"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </div>
            )}

            {/* STATE B: Connecting Progress Bar */}
            {sourceId !== null && (
              <div className="mb-6 flex flex-col gap-2" aria-label="Source progress">
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#ffc53d] transition-all duration-700"
                    style={{ width: `${(stageIndex / STEPS.length) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between font-mono text-[11px] text-inkfaint">
                  {STEPS.map((step, index) => (
                    <span
                      key={step}
                      className={index <= stageIndex ? "text-[#ffc53d] font-medium" : "text-inkfaint"}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* STATE C: Source Connected & Code Found */}
            {traceCandidate !== null && (
              <div className="flex flex-col gap-6">
                {/* Code Slab - Showing only real file path, short real snippet, and highlighted affected area */}
                <div className="rounded-xl border border-white/10 bg-[#0e0e10] overflow-hidden shadow-xl">
                  {/* File Header */}
                  <div className="px-4 py-2.5 bg-[#141417] border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-[#ffc53d]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      <span className="font-mono text-xs text-ink font-medium">
                        {traceCandidate.filePath}
                      </span>
                      {traceSnippet !== null && (
                        <span className="font-mono text-[10px] text-inkfaint bg-white/5 px-2 py-0.5 rounded">
                          Lines {traceSnippet.startLine}–{traceSnippet.endLine}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-[#c6ff4d] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c6ff4d]" />
                      Source match
                    </span>
                  </div>

                  {/* Code Lines with Highlight */}
                  <div className="p-4 font-mono text-xs bg-[#0a0a0c] overflow-x-auto text-inkdim leading-relaxed">
                    {traceSnippet !== null ? (
                      <pre className="m-0 p-0 whitespace-pre">
                        <code>{traceSnippet.content}</code>
                      </pre>
                    ) : (
                      <p className="text-inkfaint">Code found in your repository.</p>
                    )}
                  </div>

                  {/* Code Slab Footer */}
                  <div className="px-4 py-2 bg-[#141417] border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-inkfaint">
                    <span className="text-[#ffc53d] flex items-center gap-1">
                      <span>←</span> {targetTitle}
                    </span>
                    <span>Responsible source code</span>
                  </div>
                </div>

                {/* Primary Fix CTA with Honest UX Guarantee */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      disabled
                      className="bg-white text-black opacity-80 cursor-not-allowed font-medium font-sans text-sm h-11 px-6 shadow-lg"
                      aria-describedby="fix-note"
                    >
                      Fix this problem
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      asChild
                      className="bg-white/10 hover:bg-white/15 text-ink font-mono text-xs h-11"
                    >
                      <Link href="/console">
                        Watch verified demo repair →
                      </Link>
                    </Button>
                  </div>

                  <p id="fix-note" className="text-xs text-inkfaint leading-relaxed">
                    Online repair execution is locked on this deployment to protect code.
                    Use the local command above to inspect source on your machine, or watch the recorded verified repair.
                  </p>
                </div>

                {/* Secondary: Developer details (Collapsible Drawer with technical evidence) */}
                <Accordion type="single" collapsible className="w-full border-t border-white/[0.08] pt-2">
                  <AccordionItem value="trace-evidence" className="border-none">
                    <AccordionTrigger className="text-xs font-mono text-inkdim hover:text-ink">
                      Developer details
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-4 text-xs text-inkdim pt-2">
                      <div>
                        <p className="font-semibold text-ink">Match Explanation:</p>
                        <p className="mt-1">{trace?.reason ?? ""}</p>
                      </div>

                      <div>
                        <p className="font-semibold text-ink">Confidence Score:</p>
                        <p className="mt-1 font-mono">{traceCandidate.score}</p>
                      </div>

                      {traceCandidate.matchReasons.length > 0 && (
                        <div>
                          <p className="font-semibold text-ink">Technical Match Reasons:</p>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            {traceCandidate.matchReasons.map((reason) => (
                              <li key={reason}>[✓] {reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(trace?.searchTerms.length ?? 0) > 0 && (
                        <div>
                          <p className="font-semibold text-ink">AST Search Terms:</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {trace?.searchTerms.map((term) => (
                              <Badge variant="faint" key={term} className="font-mono text-[10px]">
                                {term}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="font-semibold text-ink">Target Selector:</p>
                        <p className="mt-1 font-mono"><code>{targetSelector}</code></p>
                      </div>

                      {state?.inventory !== null && state?.inventory !== undefined && (
                        <div className="border-t border-white/[0.06] pt-3">
                          <p className="font-semibold text-ink">Repository Inventory:</p>
                          <p className="mt-1">
                            {state.inventory.fileCount} files across {state.inventory.directoryCount} directories ({formatBytes(state.inventory.totalBytes)}).
                          </p>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}

            {/* STATE D: Ambiguous or Failed */}
            {trace !== null && trace.status === "AMBIGUOUS" && (
              <Alert className="bg-[#ffc53d]/10 border-[#ffc53d]/30 text-ink">
                <AlertTitle className="text-[#ffc53d] font-mono text-xs uppercase">
                  [?] Several files matched ({trace.candidates.length} candidates)
                </AlertTitle>
                <AlertDescription className="text-xs text-inkdim mt-1">
                  {trace.reason}
                  <ul className="list-disc pl-4 mt-2 space-y-1">
                    {trace.candidates.slice(0, 4).map((c) => (
                      <li key={c.filePath}>
                        <code>{c.filePath}</code> (score {c.score})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {trace !== null && trace.status === "NOT_FOUND" && (
              <Alert>
                <AlertTitle>We could not find the code behind this problem.</AlertTitle>
                <AlertDescription>No reliable source match was found. No repair was proposed.</AlertDescription>
              </Alert>
            )}
            {trace !== null && trace.status !== "FOUND" && (
              <Button type="button" variant="secondary" onClick={() => { setSourceId(null); setTrace(null); setState(null); }}>
                Try another repository
              </Button>
            )}

            {state !== null && state.state === "FAILED" && (
              <Alert variant="destructive" className="bg-[#ff4b2e]/10 border-[#ff4b2e]/30 text-[#ff4b2e]">
                <AlertTitle>[✕] Source connection failed</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  {state.error ?? "Source connection failed."}
                </AlertDescription>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto text-ink underline text-xs"
                    onClick={() => setSourceId(null)}
                  >
                    Try another repository
                  </Button>
                </div>
              </Alert>
            )}
          </div>
        </section>
      </div>

      {/* Sequential Footer */}
      <footer className="w-full mt-12 pt-4 pb-8 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-y-3 text-xs font-mono text-inkfaint">
        <div className="flex items-center gap-4">
          <Link href="/console" className="text-inkdim hover:text-white transition-colors underline">
            Watch full verified repair in demo theatre →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#c6ff4d]" />
          <span>{traceCandidate !== null ? "Source match found" : state?.state === "CONNECTED" ? "Repository connected; source match not confirmed" : "Source not connected"}</span>
        </div>
      </footer>
    </main>
  );
}

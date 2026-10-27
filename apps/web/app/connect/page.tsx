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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { MetaGrid, StageSteps } from "@/components/domain";
import {
  connectSourceRepo,
  fetchSourceConnection,
  fetchSourceTrace,
  type SourceConnectionState,
  type SourceTraceView,
} from "../../lib/api";

/**
 * Phase 9 source-connection screen on shadcn/ui primitives.
 *
 * One URL field, one action. After connection: commit SHA, deterministic
 * inventory + execution profile, then the source trace for the selected
 * finding with a Repair CTA. Local trees connect via the trusted CLI
 * (named, never browsable from the hosted UI).
 *
 * Honesty note: web model-driven repair execution does not exist in the
 * backend yet, so this page never simulates repair progress, verification
 * gates, or outcomes. The "Repair this issue" button is rendered disabled
 * with an explicit explanation (a dead enabled button would lie).
 */
export default function ConnectSource(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="product"><p>Loading…</p></main>}>
      <ConnectSourceContent />
    </Suspense>
  );
}

/** Stages backed by real connection/trace state — nothing beyond. */
const STEPS = ["Connecting source", "Finding responsible code"];

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
  const [gitUrl, setGitUrl] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [state, setState] = useState<SourceConnectionState | null>(null);
  const [trace, setTrace] = useState<SourceTraceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const cliCommand = `a11yforge repair --run ${runId !== "" ? runId : "<run-id>"} --finding ${findingId !== "" ? findingId : "<finding-id>"} --source .`;

  function onCopyCli(): void {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
    void navigator.clipboard.writeText(cliCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const traceCandidate =
    trace !== null && trace.status === "FOUND" ? trace.candidates[0] ?? null : null;
  const traceSnippet = traceCandidate?.snippets[0] ?? null;

  return (
    <main className="product">
      <nav aria-label="Breadcrumb">
        <p className="run-url">
          <Link href={runId !== "" ? `/explore/${encodeURIComponent(runId)}` : "/"}>Results</Link>
          {" / "}
          {findingId !== "" ? (
            <span>
              <code>{findingId}</code> /{" "}
            </span>
          ) : null}
          <span aria-current="page">Connect source</span>
        </p>
      </nav>

      <Badge variant="faint" aria-hidden="true">
        Target mapping · phase: triage
      </Badge>

      <section aria-labelledby="connect-title" className="narrow">
        <h1 id="connect-title">Connect source</h1>
        {findingId !== "" && (
          <p className="lede">
            Tracing finding <code>{findingId}</code>
            {runId !== "" && (
              <>
                {" "}from test <code>{runId}</code>
              </>
            )}{" "}
            into your codebase.
          </p>
        )}

        {sourceId === null && (
          <form className="url-form" onSubmit={(event) => void onConnect(event)}>
            <Label htmlFor="git-url" className="label-caps">
              <span>Public Git repository</span>
              <span className="label-note">https format</span>
            </Label>
            <div className="url-row">
              <div className="input-wrap">
                <span className="input-prompt" aria-hidden="true">&gt;</span>
                <Input
                  id="git-url"
                  name="git-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://github.com/owner/repository"
                  value={gitUrl}
                  onChange={(event) => setGitUrl(event.target.value)}
                  required
                  aria-describedby={error !== null ? "connect-error git-help" : "git-help"}
                  aria-invalid={error !== null}
                  className="h-12 pl-9"
                />
              </div>
              <Button type="submit" size="lg" disabled={connecting}>
                {connecting ? "Connecting…" : "Connect source →"}
              </Button>
            </div>
            <p className="help" id="git-help">
              Only public HTTPS repositories can be connected from the hosted
              UI. Local paths are rejected here — use the CLI command below.
            </p>
            {connecting && (
              <p className="loading" role="status" aria-live="polite">
                [···] Connecting{gitUrl !== "" ? ` ${gitUrl}` : ""}…
              </p>
            )}
            {error !== null && !connecting && (
              <Alert variant="destructive" id="connect-error">
                <AlertDescription>[✕] {error}</AlertDescription>
              </Alert>
            )}
          </form>
        )}

        {sourceId === null && (
          <section aria-labelledby="local-title" className="secondary">
            <Badge variant="faint" aria-hidden="true">
              [ALT] Local execution path
            </Badge>
            <h2 id="local-title">Testing a local project?</h2>
            <p>
              Run the repair worker directly against your workstation directory.
              The local path is named, never browsed from the hosted UI:
            </p>
            <Card>
              <CardHeader className="p-0">
                <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]">
                  Terminal // runner CLI
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <pre className="diff" aria-label="CLI repair command" tabIndex={0}>
                  <code>{cliCommand}</code>
                </pre>
                <p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onCopyCli}
                    aria-live="polite"
                  >
                    {copied ? "[✓] Copied" : "Copy command"}
                  </Button>
                </p>
              </CardContent>
            </Card>
          </section>
        )}

        {sourceId !== null && (
          <div>
            <Progress
              value={(stageIndex / STEPS.length) * 100}
              aria-label={`${stageIndex} of ${STEPS.length} source steps complete`}
            />
            <StageSteps
              steps={STEPS.map((step, index) => ({
                id: step,
                label: step,
                state: index < stageIndex ? "done" : index === stageIndex ? "running" : "pending",
              }))}
              ariaLabel="Source progress"
            />
          </div>
        )}

        {state !== null && state.state === "CONNECTED" && state.target !== null && (
          <Card aria-labelledby="connected-title" aria-live="polite" className="mt-4">
            <Badge role="status">[✓] Source connected</Badge>
            <CardTitle asChild className="mt-2">
              <h2 id="connected-title">Source connected</h2>
            </CardTitle>
            <MetaGrid
              ariaLabel="Source connection target"
              entries={[
                { term: "Commit", value: <code>{state.target.revision.slice(0, 7)}</code> },
                { term: "Kind", value: state.target.kind },
                { term: "Connected at", value: state.target.connectedAt },
              ]}
            />
            {state.inventory !== null && (
              <>
                <h3>Inventory</h3>
                <p>
                  <strong className="fact">{state.inventory.fileCount} files</strong>{" "}
                  in {state.inventory.directoryCount} directories (
                  {formatBytes(state.inventory.totalBytes)}).
                </p>
                {state.inventory.manifestFiles.length > 0 && (
                  <p>Manifests: <code>{state.inventory.manifestFiles.join(", ")}</code></p>
                )}
                {state.inventory.lockfiles.length > 0 && (
                  <p>Lockfiles: <code>{state.inventory.lockfiles.join(", ")}</code></p>
                )}
                {state.inventory.likelySourceDirs.length > 0 && (
                  <p>Source dirs: <code>{state.inventory.likelySourceDirs.join(", ")}</code></p>
                )}
                {state.inventory.scripts.length > 0 && (
                  <ul>
                    {state.inventory.scripts.map((script) => (
                      <li key={`${script.source}:${script.name}`}>
                        <code>{script.name}</code>: <code>{script.command}</code>{" "}
                        <span className="recorded-note">({script.source})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {state.profile !== null && (
              <>
                <h3>Execution profile</h3>
                <MetaGrid
                  ariaLabel="Source execution profile"
                  entries={[
                    { term: "Adapter", value: state.profile.adapter },
                    { term: "Package manager", value: state.profile.packageManager },
                    { term: "Working directory", value: state.profile.workingDirectory },
                  ]}
                />
                {state.profile.installCommand !== null && (
                  <p>Install: <code>{state.profile.installCommand.command}</code></p>
                )}
                {state.profile.buildCommand !== null && (
                  <p>Build: <code>{state.profile.buildCommand.command}</code></p>
                )}
                {state.profile.startCommand !== null && (
                  <p>Start: <code>{state.profile.startCommand.command}</code></p>
                )}
                {state.profile.testCommands.length > 0 && (
                  <ul>
                    {state.profile.testCommands.map((command, index) => (
                      <li key={`${command.source}:${command.command}:${index}`}>
                        Test: <code>{command.command}</code>{" "}
                        <span className="recorded-note">({command.source})</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p>
                  {state.profile.confidence === "unknown"
                    ? "[?] Source connected, but A11yForge needs launch instructions to verify repairs."
                    : state.profile.explanation}
                </p>
              </>
            )}
          </Card>
        )}

        {trace !== null && (
          <Card aria-labelledby="trace-title" aria-live="polite" className="mt-4">
            {traceCandidate !== null ? (
              <>
                <Badge role="status">[✓] Trace found</Badge>
                <CardTitle asChild className="mt-2">
                  <h2 id="trace-title">Responsible code located</h2>
                </CardTitle>
                <CardDescription>
                  <code>{traceCandidate.filePath}</code>
                  {traceSnippet !== null && (
                    <>
                      {" "}<Badge variant="faint">lines {traceSnippet.startLine}–{traceSnippet.endLine}</Badge>
                    </>
                  )}
                  {" "}<span className="recorded-note">score {traceCandidate.score}</span>
                </CardDescription>
                <p>
                  These source lines contain identifiers and accessibility
                  attributes observed in the failing browser interaction.
                </p>
                <h3>Why this file</h3>
                <ul>
                  {traceCandidate.matchReasons.map((reason) => (
                    <li key={reason}>[✓] Matched: {reason}</li>
                  ))}
                </ul>
                {traceSnippet !== null && (
                  <pre className="diff" aria-label={`${traceSnippet.filePath} lines ${traceSnippet.startLine} through ${traceSnippet.endLine} source inspection`} tabIndex={0}>
                    <code>{traceSnippet.content}</code>
                  </pre>
                )}
                <p>
                  <Button type="button" disabled aria-describedby="repair-unavailable">
                    Repair this issue
                  </Button>
                </p>
                <p className="help" id="repair-unavailable">
                  Web-based repair execution is not available yet, so this
                  action is disabled. Use the CLI command above for local repair runs.
                </p>
                <Accordion type="single" collapsible>
                  <AccordionItem value="trace-evidence">
                    <AccordionTrigger>View source-trace evidence</AccordionTrigger>
                    <AccordionContent>
                      <p>{trace.reason}</p>
                      {trace.searchTerms.length > 0 && (
                        <p className="tag-row">
                          {trace.searchTerms.map((term) => (
                            <Badge variant="faint" key={term}>{term}</Badge>
                          ))}
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </>
            ) : trace.status === "AMBIGUOUS" ? (
              <>
                <Badge role="status">[?] Ambiguous — {trace.candidates.length} candidates</Badge>
                <CardTitle asChild className="mt-2">
                  <h2 id="trace-title">Several files matched</h2>
                </CardTitle>
                <CardDescription>{trace.reason}</CardDescription>
                <ul>
                  {trace.candidates.slice(0, 5).map((candidate) => (
                    <li key={candidate.filePath}>
                      <code>{candidate.filePath}</code> — {candidate.matchReasons[0] ?? "weak match"}{" "}
                      <span className="recorded-note">(score {candidate.score})</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <Badge role="status">[✕] No matching source</Badge>
                <CardTitle asChild className="mt-2">
                  <h2 id="trace-title">No matching source found</h2>
                </CardTitle>
                <CardDescription>{trace.reason}</CardDescription>
              </>
            )}
          </Card>
        )}

        {state !== null && state.state === "FAILED" && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>[✕] Source connection failed</AlertTitle>
            <AlertDescription>
              {state.error ?? "Source connection failed."}
            </AlertDescription>
            <p>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => setSourceId(null)}>
                Try another repository
              </Button>
            </p>
          </Alert>
        )}

        <p>
          <Button variant="link" className="h-auto p-0" asChild>
            <Link href="/console">
              See a full verified repair
            </Link>
          </Button>
        </p>
      </section>
    </main>
  );
}

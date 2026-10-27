import Link from "next/link";

/**
 * Phase 8 source-connection placeholder.
 *
 * Arbitrary repository cloning and generic source repair arrive in the next
 * phase. This screen says so plainly and points at the working repair
 * demonstration instead of faking capability.
 */
export default function ConnectSource() {
  return (
    <main className="product">
      <header className="product-top">
        <Link href="/" className="wordmark">
          A11yForge
        </Link>
        <nav aria-label="Primary">
          <Link href="/console">Repair demo</Link>
        </nav>
      </header>

      <section aria-labelledby="connect-title" className="narrow">
        <h1 id="connect-title">Connect source to repair</h1>
        <p className="lede">
          Source-connected repair for arbitrary websites isn&apos;t available
          yet. A11yForge can already find and prove failures on any site —
          tracing them into your codebase and verifying a fix comes next.
        </p>
        <p>
          What already works today, end to end, is the autonomous repair loop
          on a connected codebase: reproduce the failure, trace it to source,
          propose a minimal patch, rebuild, replay the exact interaction, and
          accept the repair only when the evidence proves it.
        </p>
        <p>
          <Link href="/console" className="btn-primary btn-inline">
            See a full repair example
          </Link>
        </p>
        <p className="recorded-note">
          Labelled RECORDED REAL RUN — a previously completed repair, shown
          honestly as history rather than a live test.
        </p>
        <p>
          <Link href="/">Back to website testing</Link>
        </p>
      </section>
    </main>
  );
}

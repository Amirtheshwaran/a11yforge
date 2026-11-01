# New-work audit

Audited on 1 November 2026 against the Git history and GitHub's public API.
This file separates what was built for the Meta Global AI Developer Hackathon
from what was reused, and it states where the evidence stops.

## Built during the Meta Global AI Developer Hackathon

The hackathon-period work in this repository is:

- real-browser accessibility exploration: bounded crawl, axe checks, keyboard
  and form probes, screenshots and measured element locations;
- evidence provenance: every finding, screenshot and location is tied to a
  recorded run, and missing evidence stays missing;
- spatial 3D issue tours rendered from that evidence;
- Meta-powered bounded repair reasoning: diagnosis, repair proposal, one
  revision and a critic, all schema-validated;
- deterministic self-rejection and revision: the compiler, build, replay and
  regression gates decide, and a failure becomes evidence for the revision;
- source inspection: a selected finding is traced to ranked source candidates;
- the recorded verification workflow for the controlled Broken Shop target.

The repository history shows no product code before 26 October 2026. See
[the one timing caveat](#timing-caveat) about the first scaffold commit.

## Evidence

| Evidence | Value | Source |
| --- | --- | --- |
| Repository created | 2026-10-26 16:34:12 UTC | GitHub API `created_at` |
| First commit pushed | 2026-10-26 16:43:20 UTC | GitHub `CreateEvent` |
| Published hackathon start | 26 Oct, 10:30 PM GMT+5:30, which is 17:00 UTC (1:00 PM ET) | Cerebral Valley event page |
| Published deadline | 4 Nov, 9:00 PM ET | Event pages |
| Commits at audit time | 31, on `main` | `git rev-list --all --count` |
| Human Git authors | 1 (Amirtheshwaran Navaneethakrishnan: a personal address and a GitHub noreply address) | `git log` |
| GitHub contributors | 1 (`Amirtheshwaran`, credited with all 35 commits when rechecked on 1 November) | GitHub API `contributors` |
| Co-author trailers | 0 | `git log` |

GitHub's push events are recorded by GitHub, not by the author's clock, and they
line up with the commit dates. Examples:

| Pushed head | GitHub push time (UTC) | Commit |
| --- | --- | --- |
| `e99a397` | 2026-10-26 17:05:45 | deterministic accessibility scanner |
| `a3ecbfb` | 2026-10-26 17:43:35 | grounded Meta diagnosis |
| `7ca4b13` | 2026-10-26 18:33:32 | verifier-driven repair recovery |
| `85b10b5` | 2026-10-26 19:22:40 | recorded demo bundle and deployment hardening |
| `11c53b0` | 2026-10-27 00:08:12 | universal accessibility explorer |
| `2b45548` | 2026-10-27 00:40:06 | source connection |
| `7af9f2b` | 2026-10-27 04:24:15 | spatial 3D frontend |
| `dbe5d3f` | 2026-10-30 13:22:46 | browser evidence fixes and submission assets |

The recorded repair `2026-10-26T19-04-29-541Z-27affb` ran on 26 October between
19:04 and 19:05 UTC, according to its own usage artifacts.

### Timing caveat

`3c1eae3` (the scaffold) was committed at 16:43 UTC, 17 minutes before the
17:00 UTC start shown on the event page. It falls on the permitted calendar date,
26 October, but before the published kickoff time. It holds only workspace
configuration, a lockfile, planning documents and stub entry points of 9 to 28
lines. It contains no product feature. The
first feature commit, `e99a397`, follows kickoff at 17:05 UTC.

## Contribution table

Commit dates are as recorded by Git. Every date below is inside the 26 October
to 4 November period.

| Feature | First qualifying commit | Date | What changed | Demo-visible? |
| --- | --- | --- | --- | --- |
| Monorepo scaffold | `3c1eae3` | 2026-10-26 | Workspaces, configs, stubs | No |
| Deterministic scanner, Broken Shop target | `e99a397` | 2026-10-26 | `packages/engine/src/scanner`, `fixtures/broken-shop` | Yes |
| Keyboard interaction evidence | `b94ea78` | 2026-10-26 | `packages/engine/src/interaction` | Yes |
| Grounded Meta diagnosis | `a3ecbfb` | 2026-10-26 | `packages/meta/src/provider.ts`, `packages/engine/src/diagnosis` | Yes |
| Bounded reasoning budget | `f41ee35` | 2026-10-26 | `packages/meta/src/config.ts` | Indirectly |
| Fixture source trace, repair proposal | `f443262` | 2026-10-26 | `packages/engine/src/trace`, `packages/meta/src/repair.ts`, `packages/engine/src/repair/propose.ts` | Yes |
| Closed repair loop, verifier, critic | `b232bcf` | 2026-10-26 | `packages/engine/src/verify`, `packages/meta/src/critic.ts` | Yes |
| Self-rejection, bounded revision | `7ca4b13` | 2026-10-26 | `packages/meta/src/revision.ts` | Yes: the central moment |
| Repair console | `91c0b92` | 2026-10-26 | Run timeline and evidence view | Yes |
| Live fixture orchestration | `81c5c9a` | 2026-10-26 | `packages/engine/src/autorun/pipeline.ts`, `apps/api/src/live-runs.ts` | Recorded output only |
| Recorded bundle, Dockerfile | `85b10b5` | 2026-10-26 | `demo/accepted-run`, `Dockerfile` | Yes |
| Universal website explorer | `11c53b0` | 2026-10-26 | `packages/engine/src/explore`, `apps/api/src/explorations.ts`, web routes | Yes |
| Source connection, ranking, sandbox | `2b45548` | 2026-10-26 | `packages/engine/src/source`, `apps/api/src/sources.ts` | Yes, except the sandbox |
| Live data in the frontend | `fda5d0e` | 2026-10-26 | `apps/web/lib/api.ts`, stage mapping | Yes |
| Plain-language findings, highlights | `a780536` | 2026-10-26 | `apps/web/lib/human-copy.ts`, `apps/web/lib/overlay.ts` | Yes |
| First spatial 3D frontend | `7af9f2b` | 2026-10-27 | React Three Fiber scene and UI | Superseded by `4e45843` |
| Frontend completion and browser validation | `886f4c6` | 2026-10-30 | UI polish, validation | Yes |
| Evidence and recorded-demo fixes | `636104e` | 2026-10-30 | Scan-only runs no longer hide the demo; attempt selection | Yes |
| Continuous spatial tours | `4e45843` | 2026-10-31 | `apps/web/components/spatial-tour`, `apps/web/lib/tour-model.ts`, `inspection-stage.tsx` | Yes |
| Access-boundary captures | `23125d9` | 2026-10-31 | Capture before scanning; sign-in and error pages | Yes |
| Broader captures, responsive tours | `68ad080` | 2026-11-01 | `apps/web/lib/tour-motion.ts`, layouts | Yes |
| Readable handoffs, restored selection | `fb2eb01` | 2026-11-01 | Return navigation keeps the selected finding | Yes |
| Evidence-integrity cleanup | `971aa6d` | 2026-11-01 | Removed illustrative output; probe and page must both match | Yes |

Commits made after this audit are listed by `git log 971aa6d..HEAD`; all of them
are final-submission work made inside the period.

## Reused, not claimed as new

| Item | Status | How it is used |
| --- | --- | --- |
| Open-source dependencies in `pnpm-lock.yaml`, including Next.js, React, Three.js, React Three Fiber, drei, Anime.js, Radix UI, Fastify, Zod, Playwright and axe-core | Pre-existing third-party software | Installed as dependencies under their own licenses; not vendored and not claimed |
| Meta Model API, `muse-spark-1.3-contributor` | Event-provided model | Called from `packages/meta` |
| AI development tools | Development assistance, not team members | Used while building; not listed as contributors |
| Google Stitch mockups in `stitch_a11yforge_autonomous_accessibility_platform/` | Generated design references, committed in `7af9f2b` | Not imported by product code and excluded from the Docker image |

The Stitch mockups contain sample strings such as `2025-05-18T14:32:09.112Z` and
`REF-2024-08X`. Those are placeholder text generated inside the mockups. They are
not evidence of earlier development, and the mockups are not evidence of product
behavior. Do not use them as screenshots.

## Team

Team size: 1. Entrant and author: Amirtheshwaran Navaneethakrishnan. Track: Indie Developer.

**Check for other human contributions, 1 November 2026.** All 35 commits have one human author,
and GitHub credits them to one account. There are no co-author, `Signed-off-by` or `Reviewed-by`
trailers, and no `AUTHORS`, `CONTRIBUTORS` or `CODEOWNERS` file or `package.json` author field. The one commit with `GitHub` as
committer, `f19df93`, is the entrant's own merge of pull request 1. Nothing found needs a
disclosure review. This check covers the repository only: work that never reached it would not
appear.

## What the demo may show

Everything shown in [the demo script](DEMO_SCRIPT.md) was built in this period:
the live scan, spatial tour, source inspection and recorded repair. The recorded
repair is labeled as recorded and is not presented as a live repair of the
scanned public website.

## Limits of this audit

Git dates are self-reported. GitHub's push events are independent, but its public
events API does not list every push; it omits the 30 October and 1 November
intermediate commits, which reached GitHub as part of a later push or a pull
request. This audit checks repository history. It cannot prove how code was
written outside the repository, and the entrant remains responsible for the
original-work statement in the Official Rules.

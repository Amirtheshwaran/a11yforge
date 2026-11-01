# Hackathon compliance

Checked 1 November 2026. Each statement is marked by where it came from. Nothing has been
submitted.

**Sources.** *Official rules* means the [Official Rules and Event Waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver),
read directly. *Event pages* means the [Cerebral Valley](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
and [Meta](https://dev.meta.ai/events/global-hackathon) pages, read directly. *Entrant's
materials* means rules the entrant supplied from event materials. They do not appear on the
public pages above and may be in the sign-in-only portal. They are treated as binding.

## Confirmed rules

| Rule | Status | Source |
| --- | --- | --- |
| Up to 4 people on an Indie team; one Representative submits and identifies the others | Met if solo is confirmed | Official rules |
| One track per project | Indie Developer | Official rules |
| Judging: Impact 30%, Meta AI tooling 25%, Technical depth and execution 20%, Demo 25% | Applied throughout | Official rules |
| Original work; open-source software allowed under its licenses | See [new-work audit](HACKATHON_NEW_WORK.md) | Official rules |
| New work only, 26 October to 4 November | See below | Entrant's materials |
| Judges must be able to identify hackathon contributions | See below | Entrant's materials |
| Public repository | Met | Entrant's materials |
| Demo video, maximum 3 minutes | Video is 2:45, with a public link; accepted hosts unconfirmed | Entrant's materials |
| Not a medical, RAG, image-analysis, education, job-screening, nutrition, personality or sports project | Met: software engineering accessibility | Entrant's materials |

## New-work period

The [new-work audit](HACKATHON_NEW_WORK.md) records every feature with its first qualifying
commit. GitHub's own records put repository creation at 2026-10-26 16:34 UTC.

**One disclosure to know about.** The event page shows a start of 17:00 UTC on 26 October. The
scaffold commit `3c1eae3` was pushed at 16:43 UTC, 17 minutes before that. It is on the permitted
date and holds only configuration and stubs; the first feature commit, `e99a397`, follows at
17:05 UTC. The audit states this openly.

## Contribution identification

Stated in the [README](../README.md#built-during-the-hackathon) and the
[new-work audit](HACKATHON_NEW_WORK.md).

**Built during the Meta Global AI Developer Hackathon:** real-browser accessibility exploration,
evidence provenance, spatial 3D issue tours, Meta-powered bounded repair reasoning, deterministic
self-rejection and revision, source inspection, and the recorded verification workflow.

## Public repo

`https://github.com/Amirtheshwaran/a11yforge` was confirmed public through the GitHub API on
1 November 2026. Recheck before submitting. History was searched for secret-shaped strings with no
matches, and `.env` is ignored. **The repository has no LICENSE file.** Whether one is required is
unconfirmed, and choosing one is the owner's decision.

## Team

One human Git author: Amirtheshwaran Navaneethakrishnan, under two email addresses. GitHub lists one
contributor. There are no co-author trailers. AI tools are development assistance, not team members.

```text
[ ] Entrant confirmed no other human materially contributed
```

## Demo requirement

[`submission-assets/video/a11yforge-demo.mp4`](../submission-assets/video/a11yforge-demo.mp4) runs
2:45 at 1080p. It uses real app footage and a Windows text-to-speech voice, and labels the repair as
recorded.

[Public link](https://cdn.jsdelivr.net/gh/Amirtheshwaran/a11yforge@513704cecfe59f075cdd52f5429354c8f3bc7011/submission-assets/video/a11yforge-demo.mp4):
checked on 1 November 2026 without signing in. It plays and seeks in a browser, and its bytes match
the committed file's SHA-256. Whether the portal accepts a direct file link is unconfirmed. Uploading
to a video platform would need the entrant's account.

## Theme

Push the Frontier: Meta models applied to a hard software-engineering problem, with self-rejection
and deterministic replay as the central story. A11yForge is not presented as a scanner.

## Meta model usage

| Item | Status |
| --- | --- |
| Roles | Diagnosis, repair proposal, one revision, critic |
| Runtime | `https://api.meta.ai/v1`, default model `muse-spark-1.3-contributor` |
| Bound | At most 4 calls per run, enforced in code; 0 during exploration and playback |
| Evidence of use | Four committed usage artifacts from run `2026-10-26T19-04-29-541Z-27affb`, dated 26 October 2026 |
| Re-verified live on 1 November 2026 | **No.** See below. |
| Automated tests | Mocked transport; they do not prove a live call |

**Blocker.** On this machine the key in the ignored `.env` returned `401 invalid_api_key` from
`api.meta.ai/v1/models`, and the same file overrides the model to `meta-models/muse-spark-open-1026`.
So a local live run would fail at its first call until `.env` is corrected. The committed defaults
and the recorded run are not affected. The public deployment holds no key.

**Baseten.** No Baseten code, base-URL setting or inference was found, and the runtime calls Meta
directly. Baseten and open-weight inference are not claimed.

## Deployment

No public deployment exists yet; the entrant deferred it on 1 November 2026. Images build and pass the
smoke test in [CI](../.github/workflows/ci.yml), and [`deploy/huggingface`](../deploy/huggingface) is
ready. Hosting needs the entrant's account. See [deployment](DEPLOYMENT.md). **Public URL:** none yet.

## Physical device testing

**Needs manual action.** Only browser viewports were tested. Once a public URL exists, on one iPhone
and one Android phone:

```text
[ ] Run a scan of https://example.com and see it finish
[ ] Open a finding and use Show me
[ ] Open /console and step through to the verified repair
[ ] Nothing is cut off, and no page scrolls sideways
```

## Submission deadline

Wednesday, 4 November 2026, 9:00 PM ET, which is 5 November, 7:30 AM IST. *Event pages.*

## Eligibility and manual confirmation

The official rules require participants to be 18 or older and of legal age where they live, and to
not be in an excluded location. They also exclude employees, contractors and interns of Meta and
Cerebral Valley, government-affiliated individuals, their immediate family, and members of their
households. The repository cannot establish any of this.

```text
[ ] Entrant personally confirmed waiver eligibility
```

## Unconfirmed portal details

The [submission portal](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit)
redirects to sign-in, so these remain unknown:

- exact fields and character limits;
- accepted video hosts and upload requirements;
- whether a deployed URL or a license is required;
- screenshot requirements;
- team, technology, track and theme fields;
- the exact wording of the new-work, video-length and banned-category rules.

[Submission copy](SUBMISSION_COPY.md) must be checked against the real form.

# Hackathon compliance and technology disclosure

Verified October 30, 2026 (Asia/Kolkata). This records evidence, not a claim that the submission has been filed.

## CONFIRMED — official sources

Source priority: [Official Rules and Event Waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver), then the [submission portal](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit), then [Cerebral Valley event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon) and [Meta event page](https://dev.meta.ai/events/global-hackathon).

The rules were read in a JavaScript-enabled browser. The plain web fetch initially returned only “Loading”; this was resolved by inspecting the rendered page.

| Requirement | Confirmed information |
| --- | --- |
| Submission destination | Cerebral Valley project submission portal linked above |
| Deadline | November 4, 2026, 9:00 PM ET, from both event pages; equivalent November 5, 7:30 AM IST |
| Track | One track per project; Indie accepts individuals, students and teams up to four under the rules |
| Theme | Push the Frontier is one of the two published themes |
| Judging | Impact 30%; use of Meta AI tooling 25%; technical depth and execution 20%; demo 25% |
| Demo | Rules explicitly assess a working demo and video quality; they do not specify video length |
| Technology | Participants build with Meta AI products identified by the event |
| Eligibility | Selected applicants; 18+ and local age of majority; geographic and affiliation exclusions apply |
| Teams | A representative submits and identifies the other team members |
| Rights | Original work and compliance with applicable open-source licenses are required; participant retains ownership while granting organizer usage rights |

The public pages' short Indie description is less specific than the rules' weighted criteria. Use the rules for the presentation and team constraints. The user must confirm their own accepted rules and eligibility; no acceptance was submitted by this agent.

## UNCONFIRMED — authenticated form required

The portal linked from the rules redirects to Cerebral Valley sign-in in the available browser. No submission was entered.

- Whether a repository URL is required, whether it must be public, and any required license.
- Whether video is mandatory; exact duration, host, upload size and format.
- Whether a deployed app URL is mandatory.
- Description character limits and exact form fields.
- Required screenshot count, dimensions and formats.
- Exact model-disclosure and participant/team fields.
- Whether the authenticated portal shows updated terms or deadlines.

Manual action: sign in to the submission portal with the accepted participant account, check these fields against this document, adapt the prepared copy, supply verified deployment/video URLs, and submit before the deadline. Do not describe the proposed 2:40 video as an official length requirement.

## CONFIRMED — implementation and artifacts

- Meta defaults: `muse-spark-1.3-contributor`; `https://api.meta.ai/v1`; server-side `MODEL_API_KEY`. The four committed usage files identify this model.
- Four bounded roles: diagnosis, proposal, optional one-time revision, eligible critic. Live fixture orchestration caps the complete run at four calls. Standalone diagnosis defaults to one; recovery has its own two-call revision/critic budget.
- Fixed wire schemas, local Zod validation, evidence-reference checks; invalid output fails closed without automatic retries.
- Exploration and recorded playback make zero model calls.
- Recorded run `2026-10-26T19-04-29-541Z-27affb` validates with 28 artifacts and four screenshots. Attempt 1 fails TS18048; attempt 2 passes deterministic gates and critic acceptance.
- Runtime code does not read `MODEL_BASE_URL`; no Baseten-specific implementation or configuration was found. Provider base URL injection exists, but there is no evidence of Baseten execution. Do not claim the open-weight Muse model was used.
- Hosted generic source mutation is disabled. The generic CLI connects and traces source but does not execute repairs. Full autonomous repair is implemented for the controlled Broken Shop fixture.
- Model tests mock transport. No new live inference was purchased during final UI validation.

## Evidence and safety

See [final validation](FINAL_VALIDATION.md), [asset provenance](../submission-assets/README.md) and [deployment instructions](DEPLOYMENT.md). Live scan captures and recorded repair screenshots are labeled separately. No public deployment or finished video is claimed until those URLs are tested.

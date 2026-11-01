# Deployment

**Status:** no public deployment exists yet. Hosting needs an account the entrant owns.
Both images are built and smoke-tested by [CI](../.github/workflows/ci.yml) on every push
to `main`, but that is not a hosted test. Record the public URL here only after
`deploy/smoke.mjs` passes against it.

## Shape

The image serves everything from **one public port**. Next.js proxies `/backend/*` to
Fastify on `127.0.0.1:3001`, so the API is not published and no public API hostname is
compiled into the build. The container runs as uid 1000 and needs no secrets.

It needs a Linux container host with HTTPS, enough memory for Chromium (plan on 2 GB),
and long-lived responses for the scan progress stream. Serverless platforms that cannot
run Chromium and a long-lived process are not compatible.

## Recommended: Hugging Face Docker Space

This fits a key-less public demo: free, Docker-based, enough memory for Chromium, and no
credit card. Spaces can sleep after long inactivity and wake on the next visit, so
open the URL before a demo. Their disk is not persistent: saved scan results disappear
when the Space restarts, while the recorded repair ships in the image.

1. Create a **public** Space with the **Docker** SDK.
2. Add two files from [`deploy/huggingface/`](../deploy/huggingface):
   `Dockerfile` and `README.md`. The Dockerfile fetches this public repository at
   `A11YFORGE_REF`. Set that to the final tag or commit once one exists.
3. Add no secrets. Leave `MODEL_API_KEY` unset.
4. When the build finishes, run:

   ```sh
   node deploy/smoke.mjs https://<owner>-<space>.hf.space
   ```

## Any other container host

```sh
docker build -t a11yforge:submission .
docker run -d --restart unless-stopped -p 3000:3000 -v a11yforge-data:/data/a11yforge a11yforge:submission
```

The web server uses the platform's `PORT` if one is injected, and otherwise 3000. Mount
`/data/a11yforge` for scan results that survive restarts. If a proxy sits in front,
disable response buffering for `/backend/explorations/*/events` and
`/backend/runs/*/events`.

## Security on a public host

- **Leave `MODEL_API_KEY` unset.** `POST /runs` has no user authentication and starts a
  paid fixture run. With no key it answers 503. Exploration and the recorded demo make no
  model calls, so they lose nothing.
- **Leave `A11YFORGE_ALLOW_PRIVATE_TARGETS` unset.** Website and Git targets are then
  checked by DNS against private, loopback, link-local and reserved addresses. The smoke
  test confirms refusal.
- A key, if ever needed, belongs in runtime configuration: never in a build argument or
  a `NEXT_PUBLIC_` variable.
- Source connection clones public repositories into the data directory, read-only. It runs
  no repository code. Local paths are refused over HTTP. At most 3 scans and 3 connections
  run at once.
- Anyone holding a scan's URL can open its results, and scan identifiers are not secrets.
- The image is not a safe service for executing arbitrary repositories. Generic repair
  execution is deliberately not exposed.

## Post-deployment proof

`deploy/smoke.mjs` covers API health, pages, the recorded demo and its artifacts, refusal
of private targets and server paths, refusal of paid runs, one real scan with its SSE
stream, a real screenshot and the result deep link. After it passes, check the following
by hand or with a browser: spatial tour, finding selection, source inspection, refresh,
keyboard use and a phone-sized viewport.

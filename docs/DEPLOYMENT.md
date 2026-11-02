# Deployment

**Status: deployed.** Public URL: <https://unelected-unearned-average.ngrok-free.dev>
(recorded 2 November 2026). `deploy/smoke.mjs` passed all 19 checks against it, including
live scan SSE streaming. Both images are also built and smoke-tested by
[CI](../.github/workflows/ci.yml) on every push to `main`.

## Live deployment (2 November 2026)

- **Host:** the entrant's own Linux machine, Docker container `a11yforge`
  (image `a11yforge:submission`, port 3000, volume `a11yforge-data`,
  `--restart unless-stopped`).
- **Tunnel:** ngrok free plan with a fixed dev domain (the URL survives restarts and
  reboots), running as the systemd user service `a11yforge-ngrok.service`
  (`systemctl --user status|restart a11yforge-ngrok.service`; user linger is enabled).
- **Key-less:** no `MODEL_API_KEY` on the host. `POST /runs` answers 503, the bundled
  recorded demo and website scans work (see [Security](#security-on-a-public-host)).
- **First-visit interstitial:** browsers see ngrok's one-time "Visit Site" warning page;
  a cookie suppresses it for 7 days. Programmatic clients (curl, `deploy/smoke.mjs`)
  bypass it automatically.
- **Verify after any restart:**

  ```sh
  node deploy/smoke.mjs https://unelected-unearned-average.ngrok-free.dev
  ```

## Shape

The image serves everything from **one public port**. Next.js proxies `/backend/*` to
Fastify on `127.0.0.1:3001`, so the API is not published and no public API hostname is
compiled into the build. The container runs as uid 1000 and needs no secrets.

It needs a Linux container host with HTTPS, enough memory for Chromium (plan on 2 GB),
and long-lived responses for the scan progress stream. Serverless platforms that cannot
run Chromium and a long-lived process are not compatible.

## Hugging Face Docker Space (needs the paid PRO plan)

This used to be the free default. As verified on 2 November 2026, creating a Docker Space
without PRO returns a 402 payment error, so the live deployment uses the Docker host
below with an ngrok tunnel instead. The steps remain valid for a PRO account: Spaces sleep
after long inactivity and wake on the next visit, and their disk is not persistent (saved
scan results disappear when the Space restarts, while the recorded repair ships in the image).

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

- **Without `MODEL_API_KEY`**, `POST /runs` answers 503. Exploration and the recorded demo
  make no model calls, so they lose nothing. This remains the safest public setup.
- **To allow live runs on a public host**, set `MODEL_API_KEY` *and* `A11YFORGE_RUN_PASSCODE`
  as runtime secrets. The console then asks for the passcode, and `POST /runs` answers 401
  without it. Independently of the passcode, every run counts against a per-client hourly
  limit (`A11YFORGE_RUNS_PER_HOUR_PER_CLIENT`, default 2) and a global daily cap
  (`A11YFORGE_MAX_RUNS_PER_DAY`, default 20, at most four model calls per run). Refusals
  answer 429 with `Retry-After`. `GET /health` reports `runPasscodeRequired` and
  `runsRemainingToday`. Counters live in memory and reset when the server restarts.
- **Scans and repository connections** are also limited per client per hour (defaults 10
  and 10), on top of the existing cap of 3 running at once.
- **Client addresses** for those per-client limits come from the last `X-Forwarded-For`
  entry (`A11YFORGE_TRUST_PROXY_HOPS`, default 1). The built-in Next.js proxy passes that
  header through without adding to it, so the entry must come from a front proxy that
  appends the real client address, such as the Hugging Face Spaces proxy, Cloudflare or
  nginx. Without one, a client can forge its own address and evade the per-client limits;
  the passcode and the daily cap still apply. To check, start a scan and confirm the API
  log's `remoteAddress` shows your public address rather than a proxy's. Raise the value
  only when several proxies each append an entry.
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

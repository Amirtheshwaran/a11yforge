# Deployment preparation

## Current status

No hosted deployment URL, hosting project binding, Vercel configuration or GitHub deployment workflow was found in this checkout. Docker CLI is unavailable on the inspected machine. The production workspace build and local Next/Fastify servers were validated; the Docker image itself has not been built or deployed.

## Existing deployment shape

The Dockerfile packages Next.js on port 3000, Fastify on 3001, Playwright Chromium and the committed recorded demo. It runs as an unprivileged user and uses `/data/a11yforge` for runtime artifacts. The image excludes local environment files, raw Stitch exports and submission assets.

The web API URL is compiled at build time. The Dockerfile now accepts the documented `NEXT_PUBLIC_API_URL` build argument.

## Concrete operator steps

Use a Linux container host with persistent storage and HTTPS ingress for two services/ports. Replace the example domain with your actual public API hostname before building.

```sh
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.YOUR-DOMAIN.example -t a11yforge:submission .
docker run -d --name a11yforge --restart unless-stopped -p 127.0.0.1:3000:3000 -p 127.0.0.1:3001:3001 -v a11yforge-data:/data/a11yforge -e A11YFORGE_CORS_ORIGIN=https://YOUR-DOMAIN.example a11yforge:submission
```

Configure your HTTPS ingress to send the app hostname to port 3000 and API hostname to port 3001. Preserve API paths. Disable proxy buffering for `/explorations/*/events` and `/runs/*/events`; permit long-lived SSE connections. Keep screenshot and artifact routes accessible to the same browser origin.

Do not enable `A11YFORGE_ALLOW_PRIVATE_TARGETS` on a public host. Leave `MODEL_API_KEY` unset for the public scan/recorded-demo deployment. The paid `POST /runs` fixture route currently has no user authentication; if enabling it, restrict access at the ingress first. Store any key in server runtime configuration, never a build argument or browser variable.

Source connection clones public repositories. Generic source execution/mutation is not exposed by these web routes. Do not treat the container image as a safe arbitrary repository execution service.

## Post-deployment proof

1. Fetch HTTPS `/health` on the API; expect status ok and writable runtime data.
2. Open landing, `/console`, and `/connect` anonymously.
3. Verify recorded demo artifacts, screenshots, both attempt diffs, and acceptance gates.
4. Run one real public-site scan. Confirm SSE events, result screenshots, categories and Show me.
5. Refresh, navigate Back/Forward, test keyboard and mobile width; inspect browser errors.
6. Confirm private/loopback target rejection remains active.
7. Record the tested app/API URLs, deployment version and time in `docs/FINAL_VALIDATION.md`; replace pending URLs in submission copy.

Manual blocker: choose/provide a container hosting target and configure its domain, credentials, persistent volume and HTTPS ingress. No deployment success is claimed.

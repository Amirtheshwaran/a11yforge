# A11yForge production image: one public port serves the web app, and the web
# app proxies /backend/* to the API on a private loopback port.
#
# The committed recorded-demo bundle (demo/accepted-run) ships inside the
# image, so the app is useful with zero credentials. Live repairs need only
# runtime env (never baked in):
#   MODEL_API_KEY — Meta model key for live fixture repairs. Leave it unset on
#   an unauthenticated public host; POST /runs then answers 503.
# Runtime knobs:
#   PORT — public web port (default 3000; platforms usually inject it).
#   A11YFORGE_VERSION — release label reported by GET /health.

FROM node:22-bookworm

ENV PNPM_HOME=/pnpm-store \
    PATH=/pnpm-store:$PATH \
    NEXT_PUBLIC_API_URL=/backend \
    A11YFORGE_API_PROXY_TARGET=http://127.0.0.1:3001 \
    NEXT_TELEMETRY_DISABLED=1 \
    A11YFORGE_VERSION=0.8.0 \
    A11YFORGE_DATA_DIR=/data/a11yforge \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Deterministic toolchain: pinned Node major, pnpm via corepack.
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

# Workspace install first for layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/meta/package.json packages/meta/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY fixtures/broken-shop/package.json fixtures/broken-shop/package.json
RUN pnpm install --frozen-lockfile

# Build everything, then the browser the explorer and verifier use.
COPY . .
RUN pnpm build
RUN pnpm --filter @a11yforge/engine exec playwright install --with-deps chromium

# Writable runtime root for live-run artifacts and source workspaces. The image
# runs as the base image's `node` user (uid 1000), the uid container platforms
# commonly force. The committed demo/accepted-run bundle stays read-only.
RUN mkdir -p /data/a11yforge && chown -R node:node /app /data/a11yforge /ms-playwright

USER node
EXPOSE 3000
VOLUME /data/a11yforge

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/backend/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

# The API stays on loopback; only the web port is published. Each process gets
# its own PORT because the platform's PORT belongs to the web server.
CMD ["sh", "-c", "HOST=127.0.0.1 PORT=3001 node apps/api/dist/index.js & cd apps/web && exec node node_modules/next/dist/bin/next start --port ${PORT:-3000} --hostname 0.0.0.0"]

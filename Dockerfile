# A11yForge production image: web console (3000) + API (3001).
#
# The committed recorded-demo bundle (demo/accepted-run) ships inside the
# image, so the console is useful with zero credentials. Live repairs need
# only runtime env (never baked in):
#   MODEL_API_KEY — Meta model key for live autonomous runs (optional).
# Build-time knobs:
#   NEXT_PUBLIC_API_URL — public API base the browser calls
#     (default http://localhost:3001; set to your host at build time).
#   A11YFORGE_VERSION — release label reported by GET /health.

FROM node:20-bookworm

ENV PNPM_HOME=/pnpm-store \
    PATH=/pnpm-store:$PATH \
    NEXT_PUBLIC_API_URL=http://localhost:3001 \
    A11YFORGE_VERSION=0.7.0 \
    A11YFORGE_DATA_DIR=/data/a11yforge \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOST=0.0.0.0 \
    PORT=3001

WORKDIR /app

# Deterministic toolchain: pinned Node, pnpm via corepack.
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

# Build everything, then the browser the verifier replays with.
COPY . .
RUN pnpm build
RUN pnpm --filter @a11yforge/engine exec playwright install --with-deps chromium

# Writable runtime root for live-run artifacts and repair workspaces.
# The committed demo/accepted-run bundle stays read-only inside the image.
RUN groupadd -r appuser && useradd -r -m -d /home/appuser -g appuser appuser && \
    mkdir -p /data/a11yforge /ms-playwright /home/appuser/.cache/node/corepack && \
    chown -R appuser:appuser /app /data/a11yforge /ms-playwright /home/appuser

USER appuser
EXPOSE 3000 3001
VOLUME /data/a11yforge

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["sh", "-c", "node apps/api/dist/index.js & exec pnpm --filter @a11yforge/web start"]

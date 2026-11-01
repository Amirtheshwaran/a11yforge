# Hugging Face Docker Space for A11yForge.
#
# A Space builds from its own small repository, so this file fetches the public
# GitHub source at a pinned revision instead of copying a local tree. Apart from
# that fetch it mirrors the repository's root Dockerfile. No secrets are needed:
# leave MODEL_API_KEY unset, and POST /runs answers 503.

FROM node:22-bookworm

# Update this revision to redeploy a newer commit.
ARG A11YFORGE_REF=main

ENV PNPM_HOME=/pnpm-store \
    PATH=/pnpm-store:$PATH \
    NEXT_PUBLIC_API_URL=/backend \
    A11YFORGE_API_PROXY_TARGET=http://127.0.0.1:3001 \
    NEXT_TELEMETRY_DISABLED=1 \
    A11YFORGE_VERSION=0.8.0 \
    A11YFORGE_DATA_DIR=/data/a11yforge \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=7860

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.9 --activate

RUN git init -q . \
    && git remote add origin https://github.com/Amirtheshwaran/a11yforge.git \
    && git fetch -q --depth 1 origin "${A11YFORGE_REF}" \
    && git checkout -q FETCH_HEAD \
    && rm -rf .git stitch_a11yforge_autonomous_accessibility_platform submission-assets

RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @a11yforge/engine exec playwright install --with-deps chromium

RUN mkdir -p /data/a11yforge && chown -R node:node /app /data/a11yforge /ms-playwright

USER node
EXPOSE 7860

CMD ["sh", "-c", "HOST=127.0.0.1 PORT=3001 node apps/api/dist/index.js & cd apps/web && exec node node_modules/next/dist/bin/next start --port ${PORT} --hostname 0.0.0.0"]

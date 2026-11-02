#!/usr/bin/env bash
# Continuous deployment for a self-hosted A11yForge (Docker + ngrok).
#
# Pull-based: this script runs on the host (a systemd user timer calls it every
# few minutes). It asks GitHub for the newest commit on main and deploys it only
# after that commit's CI run has passed. Nothing outside can trigger code on the
# host: there is no inbound webhook and no self-hosted GitHub runner.
#
# Each deploy builds the new image first, swaps the container, waits for the new
# version to answer /backend/health, and rolls back to the previous image if it
# does not. A commit that fails to start is not retried until run with --force.
#
# Usage: auto-deploy.sh [--force]
# Install with deploy/install-auto-deploy.sh. Configuration is via the
# environment variables below; secrets go in the runtime env file (chmod 600).

set -euo pipefail

REPO_URL="${A11YFORGE_REPO_URL:-https://github.com/Amirtheshwaran/a11yforge.git}"
API_REPO="${A11YFORGE_API_REPO:-Amirtheshwaran/a11yforge}"
STATE_DIR="${A11YFORGE_DEPLOY_DIR:-$HOME/.local/share/a11yforge-deploy}"
CONTAINER="${A11YFORGE_CONTAINER:-a11yforge}"
IMAGE="${A11YFORGE_IMAGE:-a11yforge:submission}"
VOLUME="${A11YFORGE_VOLUME:-a11yforge-data}"
BIND="${A11YFORGE_BIND:-127.0.0.1}"
PORT="${A11YFORGE_HOST_PORT:-3000}"
ENV_FILE="${A11YFORGE_ENV_FILE:-$STATE_DIR/runtime.env}"
HEALTH_TIMEOUT_S="${A11YFORGE_HEALTH_TIMEOUT_S:-180}"

SRC="$STATE_DIR/src"
FORCE="no"
[[ "${1:-}" == "--force" ]] && FORCE="yes"

log() { printf '%s auto-deploy: %s\n' "$(date -u +%FT%TZ)" "$*"; }

for tool in docker git curl node flock; do
  command -v "$tool" >/dev/null || { log "missing required tool: $tool"; exit 1; }
done

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || { log "another deploy is running; skipping"; exit 0; }

# 1. Newest commit on main, in a dedicated clone (never the developer's checkout).
if [[ ! -d "$SRC/.git" ]]; then
  git clone --quiet "$REPO_URL" "$SRC"
fi
git -C "$SRC" fetch --quiet origin main
SHA="$(git -C "$SRC" rev-parse FETCH_HEAD)"
SHORT="${SHA:0:7}"

DEPLOYED="$(docker inspect -f '{{ index .Config.Labels "org.a11yforge.sha" }}' "$CONTAINER" 2>/dev/null || true)"
if [[ "$DEPLOYED" == "$SHA" && "$FORCE" == "no" ]]; then
  exit 0
fi
if [[ -e "$STATE_DIR/failed-$SHA" && "$FORCE" == "no" ]]; then
  exit 0
fi

# 2. Deploy only commits whose CI run on main has passed.
CI_STATE="$(curl -fsS -H 'accept: application/vnd.github+json' \
  "https://api.github.com/repos/$API_REPO/actions/runs?head_sha=$SHA&event=push&per_page=20" |
  node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c)).on("end", () => {
      const runs = (JSON.parse(raw).workflow_runs ?? []).filter((r) => r.name === "CI");
      if (runs.length === 0) return console.log("pending");
      const run = runs[0];
      console.log(run.status !== "completed" ? "pending" : run.conclusion === "success" ? "success" : "failure");
    });
  ')" || CI_STATE="unknown"

case "$CI_STATE" in
  success) ;;
  pending) log "CI for $SHORT has not finished; will check again"; exit 0 ;;
  failure) log "CI failed for $SHORT; not deploying it"; touch "$STATE_DIR/failed-$SHA"; exit 0 ;;
  *) log "could not read CI status for $SHORT from GitHub; will check again"; exit 0 ;;
esac

# Refuse a model key without a run passcode: POST /runs would be open to anyone.
EXTRA_ENV=()
if [[ -f "$ENV_FILE" ]]; then
  if grep -Eq '^MODEL_API_KEY=.+' "$ENV_FILE" && ! grep -Eq '^A11YFORGE_RUN_PASSCODE=.+' "$ENV_FILE"; then
    log "refusing to deploy: $ENV_FILE sets MODEL_API_KEY without A11YFORGE_RUN_PASSCODE"
    exit 1
  fi
  EXTRA_ENV=(--env-file "$ENV_FILE")
fi

# 3. Build the new image before touching the running container.
CURRENT_LABEL="${DEPLOYED:0:7}"
log "deploying $SHORT (currently deployed: ${CURRENT_LABEL:-unknown})"
git -C "$SRC" checkout --quiet --force --detach "$SHA"
docker build --quiet --label "org.a11yforge.sha=$SHA" -t "a11yforge:$SHORT" "$SRC" >/dev/null

PREVIOUS_IMAGE=""
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker tag "$(docker inspect -f '{{ .Image }}' "$CONTAINER")" a11yforge:previous
  PREVIOUS_IMAGE="a11yforge:previous"
fi

start_container() {
  local image="$1" version="$2"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" --restart unless-stopped \
    -p "$BIND:$PORT:3000" \
    -v "$VOLUME:/data/a11yforge" \
    -e "A11YFORGE_VERSION=$version" \
    ${EXTRA_ENV[@]+"${EXTRA_ENV[@]}"} \
    "$image" >/dev/null
}

wait_for_version() {
  local want="$1" deadline=$((SECONDS + HEALTH_TIMEOUT_S)) got
  while ((SECONDS < deadline)); do
    got="$(curl -fsS "http://127.0.0.1:$PORT/backend/health" 2>/dev/null |
      node -e 'let r="";process.stdin.on("data",(c)=>(r+=c)).on("end",()=>{try{console.log(JSON.parse(r).version)}catch{}})' || true)"
    [[ "$got" == "$want" ]] && return 0
    sleep 3
  done
  return 1
}

# 4. Swap, verify, and roll back on failure.
start_container "a11yforge:$SHORT" "$SHORT"
if wait_for_version "$SHORT"; then
  docker tag "a11yforge:$SHORT" "$IMAGE"
  log "deployed $SHORT; /backend/health reports version $SHORT"
  # Keep the current and previous images; drop older per-commit tags.
  docker images --format '{{.Repository}}:{{.Tag}}' a11yforge |
    grep -Ev "^a11yforge:($SHORT|previous|${IMAGE#a11yforge:})$" |
    xargs -r docker rmi >/dev/null 2>&1 || true
  exit 0
fi

log "version $SHORT did not become healthy within ${HEALTH_TIMEOUT_S}s; container log tail:"
docker logs --tail 40 "$CONTAINER" 2>&1 || true
touch "$STATE_DIR/failed-$SHA"
if [[ -n "$PREVIOUS_IMAGE" ]]; then
  ROLLBACK_VERSION="${DEPLOYED:0:7}"
  start_container "$PREVIOUS_IMAGE" "${ROLLBACK_VERSION:-previous}"
  if wait_for_version "${ROLLBACK_VERSION:-previous}"; then
    log "rolled back to ${ROLLBACK_VERSION:-the previous image}"
  else
    log "rollback did not become healthy either; check 'docker logs $CONTAINER'"
  fi
fi
exit 1

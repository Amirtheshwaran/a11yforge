#!/usr/bin/env bash
# Installs continuous deployment on the A11yForge host as a systemd user timer.
# Run once, as the user that owns the Docker container: bash deploy/install-auto-deploy.sh
# The script is copied out of the repository, so later commits to main do not
# change what runs on the host until this installer is run again.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
state="$HOME/.local/share/a11yforge-deploy"
units="$HOME/.config/systemd/user"

for tool in docker git curl node flock systemctl; do
  command -v "$tool" >/dev/null || { echo "Missing required tool: $tool" >&2; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "This user cannot reach Docker (is it in the docker group?)" >&2; exit 1; }

mkdir -p "$state" "$units"
install -m 755 "$here/auto-deploy.sh" "$state/auto-deploy.sh"
install -m 644 "$here/systemd/a11yforge-auto-deploy.service" "$here/systemd/a11yforge-auto-deploy.timer" "$units/"
systemctl --user daemon-reload
systemctl --user enable --now a11yforge-auto-deploy.timer

echo "Installed. The first check runs within a few minutes."
echo "Deploy now:      systemctl --user start a11yforge-auto-deploy.service"
echo "Watch the log:   journalctl --user -u a11yforge-auto-deploy.service -f"
echo "Force a rebuild: $state/auto-deploy.sh --force"

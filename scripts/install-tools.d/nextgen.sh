#!/usr/bin/env bash
# Static installer fragment for backend/tools.d/nextgen.yaml.
set -euo pipefail

log() { printf "\033[1;36m[install-tools]\033[0m %s\n" "$*"; }
skip() { printf "\033[2m[install-tools] %s already installed at %s\033[0m\n" "$1" "$2"; }

# ── OSINT extension ──────────────────────────────────────────────
if command -v uncover >/dev/null 2>&1; then
  skip "Uncover" "$(command -v uncover)"
else
  log "Installing Uncover (uncover)"
  go install -v github.com/projectdiscovery/uncover/cmd/uncover@latest
fi

# ── Supply Chain extension ───────────────────────────────────────
if command -v syft >/dev/null 2>&1; then
  skip "Syft" "$(command -v syft)"
else
  log "Installing Syft (syft)"
  curl -sSfL https://get.anchore.io/syft | sudo sh -s -- -b /usr/local/bin
fi

if command -v grype >/dev/null 2>&1; then
  skip "Grype" "$(command -v grype)"
else
  log "Installing Grype (grype)"
  curl -sSfL https://get.anchore.io/grype | sudo sh -s -- -b /usr/local/bin
fi

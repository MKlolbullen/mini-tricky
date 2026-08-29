#!/usr/bin/env bash
# Static installer fragment for backend/tools.d/nextgen.yaml.
# Honors the same --dry-run / --only / --skip-prereqs flags as the core
# installer and never aborts the bootstrap on a single failure.
set -uo pipefail

MT_DRY_RUN=""
MT_ONLY=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) MT_DRY_RUN=1 ;;
    --only) MT_ONLY="${2:-}"; shift ;;
    --only=*) MT_ONLY="${1#*=}" ;;
    *) ;;
  esac
  shift
done

log()  { printf "\033[1;36m[install-tools]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[install-tools]\033[0m %s\n" "$*" >&2; }
skip() { printf "\033[2m[install-tools] %s already installed at %s\033[0m\n" "$1" "$2"; }
run()  { if [[ -n "$MT_DRY_RUN" ]]; then printf '   (dry-run) %s\n' "$1"; else eval "$1" || warn "install step failed"; fi; }

# ── OSINT extension ──────────────────────────────────────────────
if command -v uncover >/dev/null 2>&1; then
  skip "Uncover" "$(command -v uncover)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "go" ]]; then
  log "Installing Uncover (uncover)"
  run 'go install -v github.com/projectdiscovery/uncover/cmd/uncover@latest'
fi

# ── Supply Chain extension ───────────────────────────────────────
if command -v syft >/dev/null 2>&1; then
  skip "Syft" "$(command -v syft)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "sh" ]]; then
  log "Installing Syft (syft)"
  run 'curl -sSfL https://get.anchore.io/syft | sudo sh -s -- -b /usr/local/bin'
fi

if command -v grype >/dev/null 2>&1; then
  skip "Grype" "$(command -v grype)"
elif [[ -z "$MT_ONLY" || "$MT_ONLY" == "sh" ]]; then
  log "Installing Grype (grype)"
  run 'curl -sSfL https://get.anchore.io/grype | sudo sh -s -- -b /usr/local/bin'
fi

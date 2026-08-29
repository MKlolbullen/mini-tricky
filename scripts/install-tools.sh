#!/usr/bin/env bash
#
# install-tools.sh — composable bootstrap for mini-tricky's tool catalog.
#
# This wrapper runs the focused tools.d installer fragments under
# install-tools.d/*.sh, then the generated legacy/core installer
# (install-tools-core.sh). Every option is forwarded to each part, so the core
# runtime's flags work end-to-end:
#
#   ./install-tools.sh                 install everything that is missing
#   ./install-tools.sh --dry-run       show what would be installed
#   ./install-tools.sh --only go       only install Go-based tools
#   ./install-tools.sh --skip-prereqs  do not auto-install language toolchains
#   ./install-tools.sh -h              show the core runtime's usage
#
# The installer is idempotent (each tool is guarded by `command -v`) and never
# aborts on a single failure — a summary of installed / present / from-source /
# failed tools is printed at the end.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR/install-tools.d"

# Handle help before running any fragment, so `install-tools.sh -h` never
# installs anything: hand off to the core runtime's usage and exit.
for arg in "$@"; do
  case "$arg" in
    -h|--help) exec bash "$SCRIPT_DIR/install-tools-core.sh" --help ;;
  esac
done

if [[ -d "$EXTENSION_DIR" ]]; then
  shopt -s nullglob
  fragments=("$EXTENSION_DIR"/*.sh)
  shopt -u nullglob
  for fragment in "${fragments[@]}"; do
    bash "$fragment" "$@"
  done
fi

bash "$SCRIPT_DIR/install-tools-core.sh" "$@"

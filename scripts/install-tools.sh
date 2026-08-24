#!/usr/bin/env bash
#
# install-tools.sh — composable bootstrap for mini-tricky's tool catalog.
#
# The legacy/core catalog remains generated into install-tools-core.sh. Focused
# tools.d packs keep their static installer blocks under install-tools.d/*.sh.
# Run fragments first so the core generator's final "All done" message remains
# the final message from the complete bootstrap.
#
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$SCRIPT_DIR/install-tools.d"

if [[ -d "$EXTENSION_DIR" ]]; then
  shopt -s nullglob
  fragments=("$EXTENSION_DIR"/*.sh)
  shopt -u nullglob
  for fragment in "${fragments[@]}"; do
    bash "$fragment"
  done
fi

bash "$SCRIPT_DIR/install-tools-core.sh"

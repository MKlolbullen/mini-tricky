"""Tests for the install-tools script generator and endpoint.

The script is the on-ramp for new users — it has to stay bash-valid, cover
every tool in ``tools.yaml``, and remain idempotent (``command -v`` guards
on every entry). These tests lock in those invariants so a stray rename in
``tools.yaml`` or a missing hint doesn't silently degrade the quick-start
UX.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from src.main import INSTALL_HINTS, _generate_install_script, load_tools

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STATIC_SCRIPT = REPO_ROOT / "scripts" / "install-tools.sh"


def test_generate_install_script_has_shebang_and_strict_mode():
    script = _generate_install_script()
    assert script.startswith("#!/usr/bin/env bash"), "script must have bash shebang"
    assert "set -euo pipefail" in script, "script must use strict mode"


def test_generate_install_script_is_idempotent_per_tool():
    """Every tool with an install hint gets a ``command -v`` guard.

    Without guards the script would re-install tools on every run, which
    wastes bandwidth and can break pinned versions.
    """
    script = _generate_install_script()
    tools = load_tools()
    # Count unique binaries that have a hint registered.
    binaries = {t.command[0] for t in tools if t.command and t.command[0] in INSTALL_HINTS}
    for binary in binaries:
        assert f"if command -v {binary} >/dev/null 2>&1; then" in script, f"missing command -v guard for {binary!r}"


def test_generate_install_script_covers_all_tools_with_hints():
    """Every tool whose binary is in ``INSTALL_HINTS`` must appear in the script."""
    script = _generate_install_script()
    tools = load_tools()
    for tool in tools:
        if not tool.command:
            continue
        binary = tool.command[0]
        if binary in INSTALL_HINTS:
            # The log line carries the tool name, which is the most useful
            # human-readable anchor to grep for.
            assert f"Installing {tool.name}" in script, f"{tool.name} ({binary}) not present in generated script"


def test_generate_install_script_bash_syntax_valid():
    """Feed the generated script through ``bash -n`` to catch typos."""
    script = _generate_install_script()
    result = subprocess.run(
        ["bash", "-n"],
        input=script,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"bash syntax error:\n{result.stderr}"


def test_install_script_endpoint_returns_script(client):
    resp = client.get("/api/tools/install-script")
    assert resp.status_code == 200
    body = resp.text
    assert body.startswith("#!/usr/bin/env bash")
    assert "set -euo pipefail" in body
    # At least 50 command -v guards for the 75 tools in tools.yaml.
    assert body.count("command -v ") >= 50


def test_static_install_script_is_up_to_date():
    """``scripts/install-tools.sh`` is committed for README quick-start users.

    This test keeps it in sync with the generator: if a dev bumps tools.yaml
    or an install hint, they must regenerate the static file in the same PR
    so the README link and the endpoint agree.
    """
    assert STATIC_SCRIPT.exists(), (
        "scripts/install-tools.sh is missing. Regenerate with:\n"
        '  cd backend && python -c "from src.main import _generate_install_script; '
        "open('../scripts/install-tools.sh', 'w').write(_generate_install_script())\""
    )
    committed = STATIC_SCRIPT.read_text()
    fresh = _generate_install_script()
    assert committed == fresh, "scripts/install-tools.sh is stale. Regenerate it and commit the update."

"""Tests for the install-tools generator, endpoint, and static bootstrap.

The generated endpoint covers the full composed catalog. The committed quick-
start bootstrap is intentionally split into a stable core generator snapshot
plus one shell fragment per focused tools.d pack, mirroring the YAML extension
architecture instead of rebuilding a monolithic shell artifact on every pack.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from src import main
from src.catalog_extensions import extension_install_hints, extension_tool_dicts, install_catalog_extensions

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
STATIC_SCRIPT = REPO_ROOT / "scripts" / "install-tools.sh"
CORE_SCRIPT = REPO_ROOT / "scripts" / "install-tools-core.sh"
EXTENSION_SCRIPT_DIR = REPO_ROOT / "scripts" / "install-tools.d"


def _install_runtime_extensions() -> None:
    install_catalog_extensions(main)


def test_generate_install_script_has_shebang_and_strict_mode():
    _install_runtime_extensions()
    script = main._generate_install_script()
    assert script.startswith("#!/usr/bin/env bash"), "script must have bash shebang"
    assert "set -euo pipefail" in script, "script must use strict mode"


def test_generate_install_script_is_idempotent_per_tool():
    """Every composed tool with an install hint gets a ``command -v`` guard."""
    _install_runtime_extensions()
    script = main._generate_install_script()
    tools = main.load_tools()
    binaries = {t.command[0] for t in tools if t.command and t.command[0] in main.INSTALL_HINTS}
    for binary in binaries:
        assert f"if command -v {binary} >/dev/null 2>&1; then" in script, f"missing command -v guard for {binary!r}"


def test_generate_install_script_covers_all_tools_with_hints():
    """Every composed tool whose binary has a hint must appear in the generator."""
    _install_runtime_extensions()
    script = main._generate_install_script()
    for tool in main.load_tools():
        if not tool.command:
            continue
        binary = tool.command[0]
        if binary in main.INSTALL_HINTS:
            assert f"Installing {tool.name}" in script, f"{tool.name} ({binary}) not present in generated script"


def test_generate_install_script_bash_syntax_valid():
    _install_runtime_extensions()
    script = main._generate_install_script()
    result = subprocess.run(
        ["bash", "-n"],
        input=script,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"bash syntax error:\n{result.stderr}"


def test_install_script_endpoint_returns_script(client):
    _install_runtime_extensions()
    resp = client.get("/api/tools/install-script")
    assert resp.status_code == 200
    body = resp.text
    assert body.startswith("#!/usr/bin/env bash")
    assert "set -euo pipefail" in body
    assert "Installing Uncover" in body
    assert "Installing Syft" in body
    assert "Installing Grype" in body
    assert body.count("command -v ") >= 50


def test_static_installer_shell_files_are_syntax_valid():
    paths = [STATIC_SCRIPT, CORE_SCRIPT, *sorted(EXTENSION_SCRIPT_DIR.glob("*.sh"))]
    assert len(paths) >= 3, "expected wrapper, core installer, and at least one extension fragment"
    for path in paths:
        assert path.exists(), f"missing static installer component: {path}"
        result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True, check=False)
        assert result.returncode == 0, f"bash syntax error in {path}:\n{result.stderr}"


def test_static_wrapper_composes_core_and_extension_fragments():
    body = STATIC_SCRIPT.read_text(encoding="utf-8")
    assert "install-tools-core.sh" in body
    assert "install-tools.d" in body
    assert 'fragments=("$EXTENSION_DIR"/*.sh)' in body
    assert 'bash "$fragment"' in body


def test_static_core_installer_is_up_to_date(monkeypatch):
    """Keep the legacy/core static script equal to the core-only generator."""
    _install_runtime_extensions()
    core_loader = getattr(main, "_catalog_core_load_tools", None)
    assert core_loader is not None, "catalog extension installer did not preserve the core loader"

    monkeypatch.setattr(main, "load_tools", core_loader)
    fresh = main._generate_install_script()
    committed = CORE_SCRIPT.read_text(encoding="utf-8")
    assert committed == fresh, "scripts/install-tools-core.sh is stale; regenerate the core installer snapshot"


def test_static_extension_fragments_cover_extension_install_hints():
    """Every tools.d binary with a static hint is represented by a fragment."""
    fragments = sorted(EXTENSION_SCRIPT_DIR.glob("*.sh"))
    assert fragments, "no scripts/install-tools.d fragments found"
    body = "\n".join(path.read_text(encoding="utf-8") for path in fragments)
    hints = extension_install_hints()

    for raw in extension_tool_dicts():
        command = raw.get("command") or []
        if not command:
            continue
        binary = str(command[0])
        if binary not in hints:
            continue
        assert f"if command -v {binary} >/dev/null 2>&1; then" in body, f"missing static fragment guard for {binary}"
        assert hints[binary] in body, f"static fragment install hint drift for {binary}"

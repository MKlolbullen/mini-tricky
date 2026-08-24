#!/usr/bin/env python3
"""Synchronize and validate project metadata that tends to drift.

Usage:
    python scripts/sync_project_metadata.py --write
    python scripts/sync_project_metadata.py --check

The canonical release version lives in VERSION. Tool/template counts are
computed from the core YAML files plus backend/tools.d and backend/templates.d.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def replace_marker(text: str, name: str, value: str) -> str:
    pattern = re.compile(
        rf"(<!-- {re.escape(name)} -->).*?(<!-- /{re.escape(name)} -->)",
        re.DOTALL,
    )
    replacement = rf"\g<1>{value}\g<2>"
    updated, count = pattern.subn(replacement, text)
    if count == 0:
        raise RuntimeError(f"missing metadata marker: {name}")
    return updated


def _catalog_items(path: Path, key: str) -> list[dict]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    items = data.get(key, [])
    if not isinstance(items, list):
        raise RuntimeError(f"{path}: expected {key!r} to be a list")
    return items


def catalog_count(path: Path, key: str, extension_dir: Path | None = None) -> int:
    items = list(_catalog_items(path, key))
    if extension_dir and extension_dir.exists():
        extension_paths = sorted({*extension_dir.glob("*.yaml"), *extension_dir.glob("*.yml")})
        for extension_path in extension_paths:
            items.extend(_catalog_items(extension_path, key))

    ids = [str(item.get("id", "")).strip() for item in items if isinstance(item, dict)]
    if any(not item_id for item_id in ids):
        raise RuntimeError(f"{path}: catalog item missing id")
    if len(ids) != len(set(ids)):
        raise RuntimeError(f"{path}: duplicate catalog ids across core/extensions")
    return len(items)


def current_counts() -> tuple[int, int]:
    backend = ROOT / "backend"
    tools = catalog_count(backend / "tools.yaml", "tools", backend / "tools.d")
    templates = catalog_count(backend / "templates.yaml", "templates", backend / "templates.d")
    return tools, templates


def expected_files() -> dict[Path, str]:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    tools, templates = current_counts()

    updates: dict[Path, str] = {}

    readme = ROOT / "README.md"
    text = readme.read_text(encoding="utf-8")
    text = replace_marker(text, "tools-count", str(tools))
    text = replace_marker(text, "templates-count", str(templates))
    text = replace_marker(text, "release-version", version)
    updates[readme] = text

    release = ROOT / ".github" / "workflows" / "release.yml"
    text = release.read_text(encoding="utf-8")
    text = replace_marker(text, "tools-count", str(tools))
    text = replace_marker(text, "templates-count", str(templates))
    updates[release] = text

    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    effective = package.get("build", {}).get("extraMetadata", {}).get("version")
    if effective != version:
        raise RuntimeError(
            "package.json build.extraMetadata.version must match VERSION "
            f"({effective!r} != {version!r})"
        )

    release_default = f"default: 'v{version}'"
    if release_default not in updates[release]:
        raise RuntimeError("release.yml workflow_dispatch default must match VERSION")

    return updates


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()

    try:
        updates = expected_files()
    except Exception as exc:  # deliberately concise for CI output
        print(f"metadata validation failed: {exc}", file=sys.stderr)
        return 1

    dirty: list[Path] = []
    for path, expected in updates.items():
        current = path.read_text(encoding="utf-8")
        if current != expected:
            dirty.append(path)
            if args.write:
                path.write_text(expected, encoding="utf-8")

    if args.check and dirty:
        print("project metadata is out of sync:", file=sys.stderr)
        for path in dirty:
            print(f"  - {path.relative_to(ROOT)}", file=sys.stderr)
        print("run: python scripts/sync_project_metadata.py --write", file=sys.stderr)
        return 1

    if args.write:
        tools, templates = current_counts()
        print(f"synced metadata: {tools} tools, {templates} templates")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

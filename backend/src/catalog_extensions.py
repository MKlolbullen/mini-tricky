"""Composable catalog extensions for tools, templates, and install hints.

The original catalog lives in large monolithic YAML files. Extension directories
let focused feature packs add tools/templates without rewriting those files on
every change. The secure application entrypoint installs these wrappers once at
startup, so all existing endpoints, validation, Mermaid mapping, execution, and
installer generation continue to call the same public loader names.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_D_DIR = BASE_DIR / "tools.d"
TEMPLATES_D_DIR = BASE_DIR / "templates.d"


def _yaml_documents(directory: Path) -> list[dict[str, Any]]:
    if not directory.exists():
        return []
    documents: list[dict[str, Any]] = []
    for path in sorted([*directory.glob("*.yaml"), *directory.glob("*.yml")]):
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        if not isinstance(raw, dict):
            raise ValueError(f"{path}: expected a YAML mapping")
        documents.append(raw)
    return documents


def extension_tool_dicts(directory: Path = TOOLS_D_DIR) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for document in _yaml_documents(directory):
        raw_tools = document.get("tools", [])
        if not isinstance(raw_tools, list):
            raise ValueError(f"{directory}: tools must be a list")
        for raw in raw_tools:
            if not isinstance(raw, dict) or not raw.get("id"):
                raise ValueError(f"{directory}: every tool extension needs an id")
            tool_id = str(raw["id"])
            if tool_id in seen:
                raise ValueError(f"duplicate extension tool id: {tool_id}")
            seen.add(tool_id)
            items.append(raw)
    return items


def extension_install_hints(directory: Path = TOOLS_D_DIR) -> dict[str, str]:
    hints: dict[str, str] = {}
    for document in _yaml_documents(directory):
        raw_hints = document.get("install_hints", {})
        if not isinstance(raw_hints, dict):
            raise ValueError(f"{directory}: install_hints must be a mapping")
        for binary, command in raw_hints.items():
            name = str(binary).strip()
            hint = str(command).strip()
            if not name or not hint:
                raise ValueError(f"{directory}: install hint keys/values must be non-empty")
            if name in hints and hints[name] != hint:
                raise ValueError(f"conflicting install hint for binary: {name}")
            hints[name] = hint
    return hints


def extension_template_dicts(directory: Path = TEMPLATES_D_DIR) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for document in _yaml_documents(directory):
        raw_templates = document.get("templates", [])
        if not isinstance(raw_templates, list):
            raise ValueError(f"{directory}: templates must be a list")
        for raw in raw_templates:
            if not isinstance(raw, dict) or not raw.get("id"):
                raise ValueError(f"{directory}: every template extension needs an id")
            template_id = str(raw["id"])
            if template_id in seen:
                raise ValueError(f"duplicate extension template id: {template_id}")
            seen.add(template_id)
            items.append(raw)
    return items


def install_catalog_extensions(main_module: Any) -> None:
    """Patch the existing catalog loader seams exactly once."""

    if getattr(main_module, "_catalog_extensions_installed", False):
        return

    base_load_tools = main_module.load_tools
    base_load_templates = main_module.load_builtin_templates
    tool_dicts = extension_tool_dicts()
    template_dicts = extension_template_dicts()
    install_hints = extension_install_hints()

    def load_tools() -> list[Any]:
        base_tools = list(base_load_tools())
        base_ids = {tool.id for tool in base_tools}
        extras: list[Any] = []
        for raw in tool_dicts:
            tool = main_module.Tool(**raw)
            if tool.id in base_ids:
                raise ValueError(f"extension tool id collides with core catalog: {tool.id}")
            base_ids.add(tool.id)
            extras.append(tool)
        return [*base_tools, *extras]

    def load_builtin_templates() -> list[dict[str, Any]]:
        base_templates = list(base_load_templates())
        base_ids = {str(item.get("id")) for item in base_templates}
        extras: list[dict[str, Any]] = []
        for raw in template_dicts:
            item = dict(raw)
            template_id = str(item["id"])
            if template_id in base_ids:
                raise ValueError(f"extension template id collides with core catalog: {template_id}")
            base_ids.add(template_id)
            item["builtin"] = True
            extras.append(item)
        return [*base_templates, *extras]

    main_module.load_tools = load_tools
    main_module.load_builtin_templates = load_builtin_templates
    main_module.INSTALL_HINTS.update(install_hints)
    main_module._catalog_extensions_installed = True

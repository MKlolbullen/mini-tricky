"""Smoke tests for the tool catalog loader.

Catches the "forgot to add a required field" class of YAML regressions by
asserting every tool round-trips through the pydantic model and that the
catalog is big enough to reflect the shipping set (>= 70 tools).
"""

from __future__ import annotations


def test_load_tools_returns_nonempty_catalog():
    from src.main import load_tools

    tools = load_tools()
    assert isinstance(tools, list)
    assert len(tools) >= 70, f'expected >= 70 tools, got {len(tools)}'


def test_every_tool_has_required_fields():
    from src.main import Tool, load_tools

    for tool in load_tools():
        assert isinstance(tool, Tool)
        assert tool.id
        assert tool.name
        assert tool.category
        # inputs/outputs are lists (may be empty for sinks/sources but the
        # attribute must exist — pydantic default_factory guarantees this).
        assert isinstance(tool.inputs, list)
        assert isinstance(tool.outputs, list)


def test_tool_ids_are_unique():
    from src.main import load_tools

    ids = [t.id for t in load_tools()]
    assert len(ids) == len(set(ids)), 'duplicate tool ids in catalog'

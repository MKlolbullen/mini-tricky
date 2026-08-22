"""Sanity tests for backend/templates.yaml.

Locks in the invariants that make a template actually usable:
* Every ``tool_id`` referenced exists in ``tools.yaml``.
* Every edge points at real nodes.
* Every ``source_handle`` is ``out:<type>`` and every ``target_handle`` is
  ``in:<type>``.
* Source types match target types, or the target is ``any``.
* The source type appears in the source tool's ``outputs``; the target type
  appears in the target tool's ``inputs``.

Catches the class of bug where a template references a tool that was
renamed in ``tools.yaml`` or chains a ``domain``-output socket into a
``targets``-only input.
"""

from __future__ import annotations

from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_FILE = REPO_ROOT / "templates.yaml"
TOOLS_FILE = REPO_ROOT / "tools.yaml"


def _load_templates() -> list[dict]:
    doc = yaml.safe_load(TEMPLATES_FILE.read_text())
    return doc["templates"]


def _load_tools_by_id() -> dict[str, dict]:
    doc = yaml.safe_load(TOOLS_FILE.read_text())
    return {t["id"]: t for t in doc["tools"]}


def test_templates_yaml_parses():
    templates = _load_templates()
    assert isinstance(templates, list)
    assert len(templates) >= 20, f"expected >= 20 templates, got {len(templates)}"


def test_every_template_has_required_fields():
    for tpl in _load_templates():
        assert tpl.get("id"), f"template missing id: {tpl}"
        assert tpl.get("name")
        assert tpl.get("category")
        assert isinstance(tpl.get("graph"), dict)
        assert "nodes" in tpl["graph"]
        assert "edges" in tpl["graph"]


def test_template_tool_ids_exist():
    tools_by_id = _load_tools_by_id()
    for tpl in _load_templates():
        for n in tpl["graph"]["nodes"]:
            if n["kind"] == "tool":
                tid = n.get("tool_id")
                assert tid, f"{tpl['id']}: tool node without tool_id"
                assert tid in tools_by_id, f"{tpl['id']}: unknown tool_id {tid!r}"


def test_template_edges_reference_real_nodes():
    for tpl in _load_templates():
        node_ids = {n["id"] for n in tpl["graph"]["nodes"]}
        for e in tpl["graph"]["edges"]:
            assert e["source"] in node_ids, f"{tpl['id']}: edge {e.get('id')} source missing"
            assert e["target"] in node_ids, f"{tpl['id']}: edge {e.get('id')} target missing"


def test_template_edge_handles_are_well_formed():
    for tpl in _load_templates():
        for e in tpl["graph"]["edges"]:
            sh = e.get("source_handle", "")
            th = e.get("target_handle", "")
            assert sh.startswith("out:"), f"{tpl['id']}: edge {e.get('id')} source_handle={sh!r}"
            assert th.startswith("in:"), f"{tpl['id']}: edge {e.get('id')} target_handle={th!r}"


def test_template_edge_socket_types_are_compatible():
    tools_by_id = _load_tools_by_id()
    for tpl in _load_templates():
        nodes = {n["id"]: n for n in tpl["graph"]["nodes"]}
        for e in tpl["graph"]["edges"]:
            stype = e["source_handle"][4:]
            ttype = e["target_handle"][3:]

            # Type flow rule: any on the target matches everything, otherwise types must match.
            if ttype != "any":
                assert stype == ttype, f"{tpl['id']}: edge {e.get('id')} type mismatch {stype} -> {ttype}"

            source = nodes[e["source"]]
            target = nodes[e["target"]]
            # Validate against tool catalog inputs/outputs where applicable.
            if source["kind"] == "tool":
                tool = tools_by_id[source["tool_id"]]
                assert stype in (tool.get("outputs") or []), (
                    f"{tpl['id']}: edge {e.get('id')}: {source['tool_id']} has no output {stype!r}"
                )
            if target["kind"] == "tool" and ttype != "any":
                tool = tools_by_id[target["tool_id"]]
                assert ttype in (tool.get("inputs") or []), (
                    f"{tpl['id']}: edge {e.get('id')}: {target['tool_id']} has no input {ttype!r}"
                )


def test_template_ids_are_unique():
    ids = [t["id"] for t in _load_templates()]
    assert len(ids) == len(set(ids)), "duplicate template ids"


def test_every_template_passes_runtime_graph_validation():
    """Every built-in template must be runnable, not just type-compatible.

    ``validate_graph`` is the gate a workflow passes before execution. A
    template can satisfy the socket-type checks above yet still be rejected at
    run time — most subtly by fanning several branches into one node. This
    locks in that the whole library actually validates, and in particular that
    the ``in:any`` aggregation socket on output nodes accepts multiple incoming
    edges (typed sockets remain single-occupancy).
    """
    from src.main import WorkflowGraph, validate_graph

    for tpl in _load_templates():
        graph = WorkflowGraph(**tpl["graph"])
        result = validate_graph(graph)
        assert result.get("ok"), f"{tpl['id']}: {result.get('error')}"


def test_in_any_socket_allows_fan_in_but_typed_socket_does_not():
    """Guard the exact rule the fan-in fix depends on."""
    from src.main import WorkflowGraph, validate_graph

    sources = [
        {"id": "v1", "kind": "variable", "label": "A", "variable_type": "targets", "value": "", "params": {}},
        {"id": "v2", "kind": "variable", "label": "B", "variable_type": "targets", "value": "", "params": {}},
    ]

    def _edges(target: str, handle: str) -> list[dict]:
        return [
            {"id": "e1", "source": "v1", "target": target, "source_handle": "out:targets", "target_handle": handle},
            {"id": "e2", "source": "v2", "target": target, "source_handle": "out:targets", "target_handle": handle},
        ]

    # Two edges into an output node's aggregation socket are allowed.
    aggregate = WorkflowGraph(
        nodes=[*sources, {"id": "out", "kind": "output", "label": "Out", "params": {}}],
        edges=_edges("out", "in:any"),
    )
    assert validate_graph(aggregate).get("ok")

    # Two edges into a tool's typed socket are rejected as already-occupied
    # (httpx exposes a single ``in:targets`` input, and the bind is last-write-wins).
    typed = WorkflowGraph(
        nodes=[*sources, {"id": "t", "kind": "tool", "label": "HTTPX", "tool_id": "httpx", "params": {}}],
        edges=_edges("t", "in:targets"),
    )
    result = validate_graph(typed)
    assert not result.get("ok")
    assert "occupied" in result.get("error", "")

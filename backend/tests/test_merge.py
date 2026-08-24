"""Tests for the merge & sort node.

The merge node is a fan-in aggregator: many upstream lists connect to its
single ``any`` input, and it emits one sorted, deduplicated list (the graph
equivalent of ``cat A B C | sort -u``). These tests lock in the socket
contract, that fan-in actually validates (typed sockets stay single-occupancy,
``any`` does not), and the dedup/sort behavior.
"""

from __future__ import annotations

import tempfile
from pathlib import Path


def test_merge_node_contract_defaults_to_targets():
    from src.main import WorkflowNode, node_contract

    node = WorkflowNode(id="m0", kind="merge", label="Merge")
    assert node_contract(node, {}) == (["any"], ["targets"])


def test_merge_node_output_type_is_configurable():
    from src.main import WorkflowNode, node_contract

    node = WorkflowNode(id="m0", kind="merge", label="Merge", params={"output_type": "url"})
    assert node_contract(node, {}) == (["any"], ["url"])
    # Unknown output types fall back to targets.
    bogus = WorkflowNode(id="m0", kind="merge", label="Merge", params={"output_type": "nope"})
    assert node_contract(bogus, {}) == (["any"], ["targets"])


def test_merge_node_allows_multi_input_fan_in():
    from src.main import WorkflowGraph, validate_graph

    graph = WorkflowGraph(
        nodes=[
            {"id": "v", "kind": "variable", "label": "d", "variable_type": "domain", "value": "x", "params": {}},
            {"id": "t1", "kind": "tool", "label": "subfinder", "tool_id": "subfinder", "params": {}},
            {"id": "t2", "kind": "tool", "label": "assetfinder", "tool_id": "assetfinder", "params": {}},
            {"id": "m0", "kind": "merge", "label": "Merge", "params": {}},
            {"id": "out", "kind": "output", "label": "o", "params": {}},
        ],
        edges=[
            {"id": "e1", "source": "v", "target": "t1", "source_handle": "out:domain", "target_handle": "in:domain"},
            {"id": "e2", "source": "v", "target": "t2", "source_handle": "out:domain", "target_handle": "in:domain"},
            {"id": "e3", "source": "t1", "target": "m0", "source_handle": "out:targets", "target_handle": "in:any"},
            {"id": "e4", "source": "t2", "target": "m0", "source_handle": "out:targets", "target_handle": "in:any"},
            {"id": "e5", "source": "m0", "target": "out", "source_handle": "out:targets", "target_handle": "in:any"},
        ],
    )
    assert validate_graph(graph)["ok"]


def test_merge_node_sorts_and_deduplicates():
    from src.main import WorkflowEdge, WorkflowNode, execute_merge_node, write_text

    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        a = base / "a.txt"
        b = base / "b.txt"
        write_text(a, "b.com\na.com\na.com\n")
        write_text(b, "c.com\na.com\n")
        output_values = {"t1": {"targets": str(a)}, "t2": {"targets": str(b)}}
        edges = [
            WorkflowEdge(id="e1", source="t1", target="m0", source_handle="out:targets", target_handle="in:any"),
            WorkflowEdge(id="e2", source="t2", target="m0", source_handle="out:targets", target_handle="in:any"),
        ]
        node = WorkflowNode(id="m0", kind="merge", label="Merge", params={})
        node_dir = base / "m0"
        node_dir.mkdir()
        result = execute_merge_node(node, node_dir, edges, output_values)
        assert result["status"] == "success"
        merged = Path(result["outputs"]["targets"]).read_text().split()
        assert merged == ["a.com", "b.com", "c.com"]


def test_merge_node_fails_with_no_inputs():
    from src.main import WorkflowNode, execute_merge_node

    with tempfile.TemporaryDirectory() as d:
        node_dir = Path(d) / "m0"
        node_dir.mkdir()
        node = WorkflowNode(id="m0", kind="merge", label="Merge", params={})
        result = execute_merge_node(node, node_dir, [], {})
        assert result["status"] == "failed"

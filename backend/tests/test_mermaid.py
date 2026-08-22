"""Tests for Mermaid flowchart import."""

from src import mermaid
from src.main import WorkflowGraph, load_tools, validate_graph


def _graph(text):
    return mermaid.mermaid_to_graph(text, load_tools())


def test_clean_chain_maps_and_validates():
    g = _graph(
        "flowchart LR\n"
        "  A[domain: example.com] --> B[subfinder] --> C[httpx] --> D[nuclei] --> E[Artifacts]"
    )
    kinds = {n["id"]: n["kind"] for n in g["nodes"]}
    assert kinds["A"] == "variable"
    assert kinds["B"] == "tool" and kinds["D"] == "tool"
    assert kinds["E"] == "output"
    # Variable value is parsed out of the label.
    a = next(n for n in g["nodes"] if n["id"] == "A")
    assert a["variable_type"] == "domain" and a["value"] == "example.com"
    # Handles are typed and the whole graph passes the real validator.
    res = validate_graph(WorkflowGraph(nodes=g["nodes"], edges=g["edges"]))
    assert res["ok"], res.get("error")


def test_tool_names_matched_case_insensitively():
    g = _graph("flowchart LR\n X[Subfinder] --> Y[HTTPX]")
    tool_ids = {n["tool_id"] for n in g["nodes"] if n["kind"] == "tool"}
    assert tool_ids == {"subfinder", "httpx"}


def test_incompatible_edge_dropped_but_graph_valid():
    # httpx emits `targets`, gau wants a `domain` -> no compatible socket.
    g = _graph("flowchart LR\n A[targets: x] --> httpx --> gau --> nuclei")
    assert any("no compatible socket" in w for w in g["warnings"])
    res = validate_graph(WorkflowGraph(nodes=g["nodes"], edges=g["edges"]))
    assert res["ok"], res.get("error")


def test_diamond_becomes_condition():
    g = _graph("flowchart LR\n A[targets: x] --> C{has_lines}")
    c = next(n for n in g["nodes"] if n["id"] == "C")
    assert c["kind"] == "condition"


def test_import_endpoint(client):
    resp = client.post(
        "/api/import/mermaid",
        json={"mermaid": "flowchart LR\n A[domain: t.com] --> subfinder --> httpx", "name": "From Mermaid"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] and body["valid"]
    assert body["node_count"] == 3
    assert body["graph"]["nodes"][1]["tool_id"] == "subfinder"

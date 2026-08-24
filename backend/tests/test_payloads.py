"""Tests for the payload node and the shipped payload lists.

The payload node is a source node: the user checks which categories to emit
(LFI/XSS/SQLI/RCE/SSRF/SSTI) and which encodings to apply, and it writes a
combined wordlist. These tests lock in the socket contract, the encoding
behavior, and — importantly — that a crafted category name cannot traverse out
of the payloads directory.
"""

from __future__ import annotations

import tempfile
from pathlib import Path


def test_payload_files_exist_and_are_nonempty():
    from src.main import PAYLOAD_TYPES, PAYLOADS_DIR

    for ptype in PAYLOAD_TYPES:
        f = PAYLOADS_DIR / f"{ptype}.txt"
        assert f.exists(), f"missing payload file {f}"
        lines = [ln for ln in f.read_text().splitlines() if ln.strip()]
        assert lines, f"{ptype}.txt is empty"


def test_payload_node_contract_is_wordlist_source():
    from src.main import WorkflowNode, node_contract

    node = WorkflowNode(id="p1", kind="payload", label="Payloads")
    assert node_contract(node, {}) == ([], ["wordlist"])


def test_payload_node_emits_selected_types_and_encodings():
    from src.main import WorkflowNode, execute_payload_node

    node = WorkflowNode(
        id="p1",
        kind="payload",
        label="Payloads",
        params={"payload_types": "XSS,SQLI", "encodings": "raw,base64"},
    )
    with tempfile.TemporaryDirectory() as d:
        result = execute_payload_node(node, Path(d))
        assert result["status"] == "success"
        assert result["outputs"]["wordlist"]
        body = Path(result["outputs"]["wordlist"]).read_text().splitlines()
        # Two categories, two encodings → more lines than a single raw category.
        assert len(body) > 20


def test_payload_node_rejects_empty_selection():
    from src.main import WorkflowNode, execute_payload_node

    node = WorkflowNode(id="p1", kind="payload", label="Payloads", params={})
    with tempfile.TemporaryDirectory() as d:
        result = execute_payload_node(node, Path(d))
    assert result["status"] == "failed"


def test_payload_node_ignores_path_traversal_in_type_names():
    from src.main import WorkflowNode, execute_payload_node

    node = WorkflowNode(
        id="p1",
        kind="payload",
        label="Payloads",
        params={"payload_types": "../../etc/passwd,../secrets,XSS", "encodings": "raw"},
    )
    with tempfile.TemporaryDirectory() as d:
        result = execute_payload_node(node, Path(d))
    # The bogus names are dropped; only XSS is honored, so it still succeeds
    # and never reads outside the payloads directory.
    assert result["status"] == "success"
    assert "XSS" in result["logs"][0]


def test_encode_payload_variants():
    from src.main import _encode_payload

    assert _encode_payload("a b", "url") == "a%20b"
    assert _encode_payload("<x>", "html") == "&lt;x&gt;"
    assert _encode_payload("a b", "double_url") == "a%2520b"
    assert _encode_payload("A", "base64") == "QQ=="
    assert _encode_payload("<x>", "raw") == "<x>"

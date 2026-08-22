"""Mermaid flowchart -> mini-tricky workflow graph.

Turns a Mermaid ``flowchart``/``graph`` definition into a runnable workflow
graph (the same shape the builder saves and the runner executes). A Mermaid
edge carries no socket *type*, so typed handles are inferred from the two
nodes it connects using each node's declared inputs/outputs.

Node kind is inferred from the label, with optional explicit prefixes:

* ``tool:subfinder`` / a bare label matching a tool id or name -> tool node
* ``var:domain=example.com`` / ``domain: example.com`` -> variable node
* ``out:Artifacts`` / a sink labelled output/artifacts/results -> output node
* ``script:bash=echo hi`` / ``script:python=...`` -> script node
* ``cond:has_lines`` or a ``{diamond}`` shape -> condition node
* ``loop:line`` / ``loop:chunk`` -> loop node

Anything unrecognised becomes a variable (if it is a pure source), an output
(pure sink) or a bash script node (in the middle), so the result is always a
valid, editable workflow rather than a hard failure.
"""

from __future__ import annotations

import re
from typing import Any

VARIABLE_TYPES = {
    "domain": "domain",
    "domains": "domain",
    "target": "targets",
    "targets": "targets",
    "target list": "targets",
    "targetlist": "targets",
    "list": "targets",
    "wordlist": "wordlist",
    "words": "wordlist",
}

OUTPUT_WORDS = {"output", "outputs", "artifact", "artifacts", "results", "result", "sink", "out"}

# Mermaid node shapes -> (open, close) delimiter pairs, longest first so the
# double-bracket shapes win over the single-bracket ones.
_SHAPE_PATTERNS = [
    (r"\(\(", r"\)\)"),  # ((circle))
    (r"\[\[", r"\]\]"),  # [[subroutine]]
    (r"\{\{", r"\}\}"),  # {{hexagon}}
    (r"\(\[", r"\]\)"),  # ([stadium])
    (r"\[", r"\]"),  # [rect]
    (r"\(", r"\)"),  # (round)
    (r"\{", r"\}"),  # {diamond}
    (r">", r"\]"),  # >flag]
]

# Edge connectors, longest first so e.g. ``-.->`` isn't split as ``-``.
_EDGE_CONNECTORS = ["-.->", "==>", "-->", "---", "===", "--"]


def _strip_quotes(text: str) -> str:
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1].strip()
    return text


def _parse_node_token(token: str) -> tuple[str, str, str]:
    """Return (id, label, shape) for a token like ``A[Subfinder]``.

    Falls back to a bare id (``A``) when no shape brackets are present.
    """
    token = token.strip()
    for open_pat, close_pat in _SHAPE_PATTERNS:
        m = re.match(rf"^([A-Za-z0-9_\-.]+)\s*{open_pat}(.*?){close_pat}\s*$", token)
        if m:
            shape = "diamond" if open_pat == r"\{" else "default"
            return m.group(1), _strip_quotes(m.group(2)), shape
    # Bare id (no label brackets)
    ident = re.match(r"^([A-Za-z0-9_\-.]+)$", token)
    if ident:
        return ident.group(1), "", "default"
    # Unusable token
    return token, "", "default"


def _split_edges(line: str) -> list[tuple[str, str]] | None:
    """Split a chain line into (left, right) token pairs, or None if not an edge line."""
    # Find the connector used (they can be mixed but usually aren't).
    connector = next((c for c in _EDGE_CONNECTORS if c in line), None)
    if not connector:
        return None
    # Drop edge labels: ``A -->|text| B`` or ``A -- text --> B`` -> keep endpoints.
    # Normalise ``-- text -->`` to ``-->``.
    line = re.sub(r"--\s*[^>|-][^>|]*?\s*-->", "-->", line)
    line = re.sub(r"\|[^|]*\|", "", line)  # strip |edge labels|
    parts = [p.strip() for p in re.split("|".join(re.escape(c) for c in _EDGE_CONNECTORS), line) if p.strip()]
    if len(parts) < 2:
        return None
    return [(parts[i], parts[i + 1]) for i in range(len(parts) - 1)]


def parse_flowchart(text: str) -> tuple[dict[str, Any], list[tuple[str, str]], list[str]]:
    """Parse Mermaid text into (nodes-by-id, edges, warnings)."""
    warnings: list[str] = []
    nodes: dict[str, Any] = {}
    edges: list[tuple[str, str]] = []
    order: list[str] = []

    def touch(token: str) -> str:
        node_id, label, shape = _parse_node_token(token)
        existing = nodes.get(node_id)
        if existing is None:
            nodes[node_id] = {"id": node_id, "label": label, "shape": shape}
            order.append(node_id)
        elif label and not existing.get("label"):
            existing["label"] = label
            existing["shape"] = shape
        return node_id

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("%%"):
            continue
        low = line.lower()
        if low.startswith(("flowchart", "graph")):
            continue
        if low.startswith(("subgraph", "end", "classdef", "class ", "style ", "linkstyle", "click")):
            continue

        pairs = _split_edges(line)
        if pairs:
            for left, right in pairs:
                a = touch(left)
                b = touch(right)
                edges.append((a, b))
        else:
            # Standalone node definition.
            touch(line)

    nodes["__order__"] = {"ids": order}  # stash declaration order
    return nodes, edges, warnings


def _infer_variable(label: str) -> tuple[str, str] | None:
    """Return (variable_type, value) if the label denotes a variable, else None."""
    body = label
    # ``domain=example.com`` or ``domain: example.com``
    m = re.match(r"^\s*([A-Za-z ]+?)\s*[:=]\s*(.+?)\s*$", body)
    if m:
        key = m.group(1).strip().lower()
        if key in VARIABLE_TYPES:
            return VARIABLE_TYPES[key], m.group(2).strip()
    key = body.strip().lower()
    if key in VARIABLE_TYPES:
        return VARIABLE_TYPES[key], ""
    return None


def _classify(
    node: dict[str, str],
    incoming: int,
    outgoing: int,
    tools_by_id: dict[str, Any],
    tools_by_name: dict[str, Any],
) -> dict[str, Any]:
    """Map a parsed node to a workflow-node dict (without position)."""
    node_id = node["id"]
    label = (node.get("label") or node_id).strip()
    shape = node.get("shape", "default")
    low = label.lower()

    def base(**extra: Any) -> dict[str, Any]:
        return {"id": node_id, "label": label, "params": {}, **extra}

    # --- explicit prefixes -----------------------------------------------
    if low.startswith("tool:"):
        name = label.split(":", 1)[1].strip()
        tool = tools_by_id.get(name.lower()) or tools_by_name.get(name.lower())
        if tool:
            return base(kind="tool", label=tool.name, tool_id=tool.id)
    if low.startswith("var:"):
        spec = label.split(":", 1)[1].strip()
        inferred = _infer_variable(spec) or ("targets", spec)
        return base(kind="variable", variable_type=inferred[0], value=inferred[1])
    if low.startswith("out:") or low.startswith("output:"):
        return base(kind="output", label=label.split(":", 1)[1].strip() or "Artifacts")
    if low.startswith("script:"):
        rest = label.split(":", 1)[1].strip()
        lang = "python" if rest.lower().startswith("python") else "bash"
        body = rest.split("=", 1)[1].strip() if "=" in rest else ""
        return base(kind="script", label=f"{lang.title()} Script", script_language=lang, script_body=body)
    if low.startswith("cond:"):
        return base(kind="condition", label="Condition", condition_expr=label.split(":", 1)[1].strip() or "has_lines")
    if low.startswith("loop:"):
        mode = label.split(":", 1)[1].strip().lower()
        return base(kind="loop", label="Iterator", loop_mode="chunk" if mode == "chunk" else "line")

    # --- tool match ------------------------------------------------------
    tool = tools_by_id.get(low) or tools_by_name.get(low) or tools_by_id.get(node_id.lower())
    if tool:
        return base(kind="tool", label=tool.name, tool_id=tool.id)

    # --- variables / outputs by keyword ----------------------------------
    var = _infer_variable(label)
    if var:
        return base(kind="variable", variable_type=var[0], value=var[1])
    if low in OUTPUT_WORDS or any(w in low.split() for w in OUTPUT_WORDS):
        return base(kind="output", label=label)
    if shape == "diamond":
        # The diamond's text is the condition expression (round-trips export).
        return base(kind="condition", label=label, condition_expr=label or "has_lines")

    # --- structural fallback ---------------------------------------------
    if incoming == 0 and outgoing > 0:
        # A pure source with no tool match -> a variable seed.
        return base(kind="variable", variable_type="targets", value=label if label != node_id else "")
    if outgoing == 0 and incoming > 0:
        return base(kind="output", label=label)
    # An internal unknown -> an editable passthrough script.
    return base(kind="script", label=label or "Script", script_language="bash", script_body=f"# {label}\ncat")


def _pick_handles(source_outputs: list[str], target_inputs: list[str]) -> tuple[str, str] | None:
    """Choose compatible (source_handle, target_handle), or None if the two
    contracts share no type and the target has no ``any`` input."""
    for t in source_outputs:
        if t in target_inputs:
            return f"out:{t}", f"in:{t}"
    if "any" in target_inputs:
        src = source_outputs[0] if source_outputs else "targets"
        return f"out:{src}", "in:any"
    return None


def _layer_positions(node_ids: list[str], edges: list[tuple[str, str]]) -> dict[str, dict[str, float]]:
    """Assign x/y by longest-path layering so the graph reads left-to-right."""
    adj: dict[str, list[str]] = {n: [] for n in node_ids}
    indeg: dict[str, int] = {n: 0 for n in node_ids}
    for a, b in edges:
        if a in adj and b in indeg:
            adj[a].append(b)
            indeg[b] += 1

    # Longest-path layer for each node (Kahn-style relaxation).
    layer = {n: 0 for n in node_ids}
    queue = [n for n in node_ids if indeg[n] == 0]
    seen = dict(indeg)
    while queue:
        n = queue.pop(0)
        for m in adj[n]:
            layer[m] = max(layer[m], layer[n] + 1)
            seen[m] -= 1
            if seen[m] == 0:
                queue.append(m)

    per_layer: dict[int, int] = {}
    positions: dict[str, dict[str, float]] = {}
    for n in node_ids:
        col = layer[n]
        row = per_layer.get(col, 0)
        per_layer[col] = row + 1
        positions[n] = {"x": float(40 + col * 300), "y": float(40 + row * 150)}
    return positions


def mermaid_to_graph(text: str, tools: list[Any]) -> dict[str, Any]:
    """Full pipeline: Mermaid text -> {nodes, edges} workflow graph + warnings."""
    tools_by_id = {t.id.lower(): t for t in tools}
    tools_by_name = {t.name.lower(): t for t in tools}

    parsed_nodes, raw_edges, warnings = parse_flowchart(text)
    order = parsed_nodes.pop("__order__", {}).get("ids", list(parsed_nodes.keys()))

    if not order:
        return {"nodes": [], "edges": [], "warnings": ["No nodes found — is this a Mermaid flowchart?"]}

    incoming = {n: 0 for n in order}
    outgoing = {n: 0 for n in order}
    for a, b in raw_edges:
        outgoing[a] = outgoing.get(a, 0) + 1
        incoming[b] = incoming.get(b, 0) + 1

    wf_nodes = [
        _classify(parsed_nodes[n], incoming.get(n, 0), outgoing.get(n, 0), tools_by_id, tools_by_name) for n in order
    ]
    by_id = {n["id"]: n for n in wf_nodes}

    positions = _layer_positions(order, raw_edges)
    for n in wf_nodes:
        n["position"] = positions.get(n["id"], {"x": 40.0, "y": 40.0})

    # Contracts for handle inference (mirror of node_contract).
    def contract(node: dict[str, Any]) -> tuple[list[str], list[str]]:
        kind = node["kind"]
        if kind == "tool":
            tool = tools_by_id.get((node.get("tool_id") or "").lower())
            return (tool.inputs, tool.outputs) if tool else (["targets"], ["targets"])
        if kind == "variable":
            return [], [node.get("variable_type") or "targets"]
        if kind == "output":
            return ["any"], []
        if kind in ("script", "module"):
            return ["targets"], ["targets"]
        if kind == "condition":
            return ["targets"], ["pass", "fail"]
        if kind == "loop":
            return ["targets"], ["item"]
        return ["targets"], ["targets"]

    wf_edges = []
    occupied: set[tuple[str, str]] = set()
    for i, (a, b) in enumerate(raw_edges):
        if a == b or a not in by_id or b not in by_id:
            continue
        _, src_out = contract(by_id[a])
        tgt_in, _ = contract(by_id[b])
        handles = _pick_handles(src_out, tgt_in)
        if handles is None:
            warnings.append(
                f"Dropped {by_id[a]['label']} → {by_id[b]['label']}: "
                f"no compatible socket ({'/'.join(src_out) or '—'} → {'/'.join(tgt_in) or '—'}). Connect it manually."
            )
            continue
        sh, th = handles
        if (b, th) in occupied:
            warnings.append(f"Skipped a second connection into {by_id[b]['label']} ({th} already used).")
            continue
        occupied.add((b, th))
        wf_edges.append({"id": f"e{i}", "source": a, "target": b, "source_handle": sh, "target_handle": th})

    tool_count = sum(1 for n in wf_nodes if n["kind"] == "tool")
    if tool_count == 0:
        warnings.append("No labels matched a known tool — nodes were mapped to variables/scripts you can edit.")

    return {"nodes": wf_nodes, "edges": wf_edges, "warnings": warnings}


# ── Export: workflow graph -> Mermaid flowchart ──────────────────────────────


def _safe_mermaid_id(node_id: str, index: int) -> str:
    """A Mermaid-safe node id (alphanumeric/underscore, starts with a letter)."""
    s = re.sub(r"[^A-Za-z0-9_]", "_", node_id) or f"n{index}"
    if not s[0].isalpha():
        s = f"n_{s}"
    return s


def _escape_label(text: str) -> str:
    """Escape a label for a quoted Mermaid node — drop the quote/bracket chars
    that would break parsing."""
    return re.sub(r'["\[\]{}|]', "", text or "").strip()


def graph_to_mermaid(graph: dict[str, Any], tools: list[Any]) -> str:
    """Render a workflow graph as a Mermaid ``flowchart`` that re-imports back
    into an equivalent workflow.

    Node kinds are emitted so :func:`mermaid_to_graph` recovers them: tools as
    their bare id, variables as ``type: value``, outputs with an ``out:``
    prefix, conditions as ``{diamond}`` shapes, scripts/loops with their
    prefixes. Edges carry the source socket type as a (cosmetic) label.
    """
    tools_by_id = {t.id: t for t in tools}
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    id_map = {n["id"]: _safe_mermaid_id(n["id"], i) for i, n in enumerate(nodes)}
    lines = ["flowchart LR"]

    for node in nodes:
        nid = id_map[node["id"]]
        kind = node.get("kind", "tool")
        if kind == "tool":
            tool = tools_by_id.get(node.get("tool_id") or "")
            token = node.get("tool_id") or (tool.id if tool else node.get("label") or "tool")
            lines.append(f'  {nid}["{_escape_label(token)}"]')
        elif kind == "variable":
            vtype = node.get("variable_type") or "targets"
            value = (node.get("value") or "").strip()
            label = f"{vtype}: {value}" if value else vtype
            lines.append(f'  {nid}["{_escape_label(label)}"]')
        elif kind == "output":
            lines.append(f'  {nid}["out: {_escape_label(node.get("label") or "Artifacts")}"]')
        elif kind == "script":
            lang = node.get("script_language") or "bash"
            lines.append(f'  {nid}["script:{lang}"]')
        elif kind == "condition":
            expr = node.get("condition_expr") or "has_lines"
            lines.append(f'  {nid}{{"{_escape_label(expr)}"}}')
        elif kind == "loop":
            lines.append(f'  {nid}["loop:{node.get("loop_mode") or "line"}"]')
        elif kind == "module":
            lines.append(f'  {nid}["{_escape_label(node.get("label") or "module")}"]')
        else:
            lines.append(f'  {nid}["{_escape_label(node.get("label") or node["id"])}"]')

    for edge in edges:
        src = id_map.get(edge.get("source"))
        tgt = id_map.get(edge.get("target"))
        if not src or not tgt:
            continue
        stype = (edge.get("source_handle") or "").removeprefix("out:")
        label = f"|{stype}| " if stype else ""
        lines.append(f"  {src} -->{label}{tgt}")

    return "\n".join(lines)

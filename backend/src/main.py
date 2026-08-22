from __future__ import annotations

import asyncio
import base64
import json
import mimetypes
import subprocess
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field

from . import db, llm, mermaid, secrets_store

BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_FILE = BASE_DIR / "tools.yaml"
TEMPLATES_FILE = BASE_DIR / "templates.yaml"
STATE_DIR = BASE_DIR / "state"
VERSIONS_DIR = STATE_DIR / "versions"
ARTIFACTS_DIR = STATE_DIR / "artifacts"

STATE_DIR.mkdir(parents=True, exist_ok=True)
db.init_db(STATE_DIR)
secrets_store.init_secrets_store(STATE_DIR)

# A fresh process has no live runs, so any record still marked "running" was
# interrupted by a previous shutdown — reconcile it so it can't linger forever.
for _stale in db.list_runs():
    if _stale.get("status") == "running":
        _stale["status"] = "interrupted"
        db.upsert_run(_stale)

# One-shot migration: any plaintext secrets left in the profile env_vars blob
# from before Phase D gets rewritten into the keychain. Idempotent — profiles
# that already have ``SENTINEL`` placeholders are skipped.
_legacy_profiles = db.list_profiles()
_migrated_count = secrets_store.migrate_legacy_plaintext(_legacy_profiles)
if _migrated_count:
    db.save_profiles(_legacy_profiles)

TEXT_SUFFIXES = {
    ".txt",
    ".log",
    ".md",
    ".csv",
    ".xml",
    ".yaml",
    ".yml",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".go",
    ".rs",
    ".sh",
    ".zsh",
    ".bash",
    ".ini",
    ".cfg",
    ".conf",
    ".toml",
}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"}


class ToolArg(BaseModel):
    flag: str
    label: str
    description: str = ""
    type: str = "flag"  # flag | string | int | float
    default: str | None = None


class Tool(BaseModel):
    id: str
    name: str
    category: str
    description: str = ""
    icon: str = ""
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    command: list[str] = Field(default_factory=list)
    output_mode: str = "stdout"
    timeout_seconds: int = 300
    args: list[ToolArg] = Field(default_factory=list)


class WorkflowNode(BaseModel):
    id: str
    kind: str = "tool"
    label: str
    tool_id: str | None = None
    variable_type: str | None = None
    value: str | None = None
    params: dict[str, str] = Field(default_factory=dict)
    position: dict[str, float] | None = None
    script_language: str | None = None
    script_body: str | None = None
    module_workflow_id: str | None = None
    condition_expr: str | None = None
    loop_mode: str | None = None


class WorkflowEdge(BaseModel):
    id: str | None = None
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class WorkflowGraph(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


class WorkflowPayload(BaseModel):
    id: str | None = None
    name: str
    graph: WorkflowGraph


class RunPayload(BaseModel):
    workflow_id: str | None = None
    name: str = "Queued Run"
    workflow: WorkflowGraph | None = None
    max_parallel: int = 2


app = FastAPI(title="mini-tricky API", version="0.5.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_state() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)


def load_tools() -> list[Tool]:
    if not TOOLS_FILE.exists():
        return []
    data = yaml.safe_load(TOOLS_FILE.read_text()) or {}
    return [Tool(**item) for item in data.get("tools", [])]


def node_contract(node: WorkflowNode, tools_by_id: dict[str, Tool]) -> tuple[list[str], list[str]]:
    if node.kind == "tool":
        if not node.tool_id or node.tool_id not in tools_by_id:
            raise ValueError(f"Node {node.id} references an unknown tool.")
        tool = tools_by_id[node.tool_id]
        return tool.inputs, tool.outputs
    if node.kind == "variable":
        return [], [node.variable_type or "targets"]
    if node.kind == "output":
        return ["any"], []
    if node.kind == "script":
        return ["targets"], ["targets"]
    if node.kind == "module":
        return ["targets"], ["targets"]
    if node.kind == "condition":
        return ["targets"], ["pass", "fail"]
    if node.kind == "loop":
        return ["targets"], ["item"]
    raise ValueError(f"Unknown node kind: {node.kind}")


def build_graph_indexes(
    graph: WorkflowGraph,
) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[WorkflowEdge]]]:
    parents_by_node: dict[str, list[str]] = defaultdict(list)
    children_by_node: dict[str, list[str]] = defaultdict(list)
    incoming_edges_by_target: dict[str, list[WorkflowEdge]] = defaultdict(list)
    for edge in graph.edges:
        parents_by_node[edge.target].append(edge.source)
        children_by_node[edge.source].append(edge.target)
        incoming_edges_by_target[edge.target].append(edge)
    return parents_by_node, children_by_node, incoming_edges_by_target


def validate_graph(graph: WorkflowGraph) -> dict[str, Any]:
    tools_by_id = {tool.id: tool for tool in load_tools()}
    nodes_by_id = {node.id: node for node in graph.nodes}
    indegree = {node.id: 0 for node in graph.nodes}
    adjacency: dict[str, list[str]] = defaultdict(list)
    target_handle_use: set[tuple[str, str]] = set()

    for edge in graph.edges:
        if edge.source not in nodes_by_id or edge.target not in nodes_by_id:
            return {"ok": False, "error": f"Unknown node in edge {edge.source} -> {edge.target}"}
        if edge.source == edge.target:
            return {"ok": False, "error": f"Self-loop detected on {edge.source}"}
        if not edge.source_handle or not edge.target_handle:
            return {"ok": False, "error": f"Edge {edge.source} -> {edge.target} is missing handle metadata"}
        if not edge.source_handle.startswith("out:") or not edge.target_handle.startswith("in:"):
            return {"ok": False, "error": f"Invalid socket direction on edge {edge.source} -> {edge.target}"}

        source_node = nodes_by_id[edge.source]
        target_node = nodes_by_id[edge.target]

        try:
            _, source_outputs = node_contract(source_node, tools_by_id)
            target_inputs, _ = node_contract(target_node, tools_by_id)
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}

        source_type = edge.source_handle.removeprefix("out:")
        target_type = edge.target_handle.removeprefix("in:")

        if source_type not in source_outputs:
            return {"ok": False, "error": f"Node {source_node.id} does not expose output socket {source_type}"}
        if target_type not in target_inputs:
            return {"ok": False, "error": f"Node {target_node.id} does not expose input socket {target_type}"}
        if target_type != "any" and source_type != target_type:
            return {"ok": False, "error": f"Socket type mismatch: {source_type} -> {target_type}"}

        occupied_key = (edge.target, edge.target_handle)
        if occupied_key in target_handle_use:
            return {
                "ok": False,
                "error": f"Target socket {edge.target_handle} on node {edge.target} is already occupied",
            }
        target_handle_use.add(occupied_key)

        adjacency[edge.source].append(edge.target)
        indegree[edge.target] += 1

    queue = deque([node_id for node_id, degree in indegree.items() if degree == 0])
    ordered: list[str] = []
    levels: list[list[str]] = []

    while queue:
        batch = list(queue)
        levels.append(batch)
        for _ in range(len(batch)):
            current = queue.popleft()
            ordered.append(current)
            for child in adjacency[current]:
                indegree[child] -= 1
                if indegree[child] == 0:
                    queue.append(child)

    if len(ordered) != len(graph.nodes):
        return {"ok": False, "error": "Cycle detected in workflow graph"}

    return {
        "ok": True,
        "topological_order": ordered,
        "parallel_groups": levels,
        "message": "Graph is a valid DAG. Child nodes can start only after all parents complete.",
    }


def workflow_records() -> list[dict[str, Any]]:
    return db.list_workflows()


def run_records() -> list[dict[str, Any]]:
    return db.list_runs()


def persist_run_record(updated_run: dict[str, Any]) -> None:
    db.upsert_run(updated_run)


def truncate_text(value: str, limit: int = 6000) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + "\n... [truncated]"


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", errors="ignore")


def prepare_bound_value(input_name: str, value: Any, node_dir: Path, context: dict[str, str]) -> None:
    inputs_dir = node_dir / "inputs"
    inputs_dir.mkdir(parents=True, exist_ok=True)

    if isinstance(value, str):
        possible_path = Path(value)
        if possible_path.exists():
            context[input_name] = str(possible_path)
            context[f"{input_name}_file"] = str(possible_path)
            return

    raw_value = str(value)
    input_file = inputs_dir / f"{input_name}.txt"
    write_text(input_file, raw_value)
    context[input_name] = raw_value
    context[f"{input_name}_file"] = str(input_file)


def failed_node_result(
    node: WorkflowNode, node_dir: Path, reason: str, command: list[str] | None = None, stderr: str = ""
) -> dict[str, Any]:
    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"
    write_text(stdout_path, "")
    write_text(stderr_path, stderr or reason)
    return {
        "node_id": node.id,
        "status": "failed",
        "command": command or [],
        "exit_code": None,
        "artifact_paths": [],
        "outputs": {},
        "stdout_preview": "",
        "stderr_preview": truncate_text(stderr or reason),
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": [f"[-] Node {node.id} failed: {reason}"],
    }


def execute_variable_node(node: WorkflowNode, node_dir: Path) -> dict[str, Any]:
    variable_type = node.variable_type or "targets"
    value = (node.value or "").strip()
    if not value:
        return failed_node_result(node, node_dir, f"Variable node {node.id} has no value configured.")

    artifact_file = node_dir / f"{variable_type}.txt"
    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"
    write_text(artifact_file, value + "\n")
    write_text(stdout_path, value + "\n")
    write_text(stderr_path, "")
    return {
        "node_id": node.id,
        "status": "success",
        "command": [],
        "exit_code": 0,
        "artifact_paths": [str(artifact_file)],
        "outputs": {variable_type: value},
        "stdout_preview": truncate_text(value),
        "stderr_preview": "",
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": [f"[+] Variable node {node.id} emitted {variable_type}."],
    }


def execute_output_node(
    node: WorkflowNode, node_dir: Path, incoming_edges: list[WorkflowEdge], output_values: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    manifest = []
    for edge in incoming_edges:
        source_type = edge.source_handle.removeprefix("out:") if edge.source_handle else "unknown"
        source_value = output_values.get(edge.source, {}).get(source_type)
        manifest.append(
            {
                "source_node": edge.source,
                "source_type": source_type,
                "value": source_value,
            }
        )

    manifest_path = node_dir / "manifest.json"
    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"
    write_text(manifest_path, json.dumps(manifest, indent=2))
    write_text(stdout_path, json.dumps(manifest, indent=2))
    write_text(stderr_path, "")
    return {
        "node_id": node.id,
        "status": "success",
        "command": [],
        "exit_code": 0,
        "artifact_paths": [str(manifest_path)],
        "outputs": {},
        "stdout_preview": truncate_text(json.dumps(manifest, indent=2)),
        "stderr_preview": "",
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": [f"[+] Output node {node.id} collected {len(manifest)} upstream artifacts."],
    }


def execute_tool_node(
    run_id: str,
    node: WorkflowNode,
    node_dir: Path,
    tool: Tool,
    incoming_edges: list[WorkflowEdge],
    output_values: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    if not tool.command:
        return failed_node_result(node, node_dir, f"Tool {tool.id} has no command template configured.")

    primary_output = tool.outputs[0] if tool.outputs else "output"
    artifact_file = node_dir / f"{primary_output}.txt"
    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"

    context: dict[str, str] = {
        "run_id": run_id,
        "node_id": node.id,
        "artifact_dir": str(node_dir),
        "artifact_file": str(artifact_file),
    }

    for edge in incoming_edges:
        input_name = edge.target_handle.removeprefix("in:") if edge.target_handle else "input"
        source_type = edge.source_handle.removeprefix("out:") if edge.source_handle else "output"
        source_value = output_values.get(edge.source, {}).get(source_type)
        if source_value is None:
            return failed_node_result(node, node_dir, f"Input {input_name} for node {node.id} has no upstream value.")
        if input_name != "any":
            prepare_bound_value(input_name, source_value, node_dir, context)

    # Separate toggled args (CLI flags) from template context params
    extra_cli_args: list[str] = []
    for key, value in node.params.items():
        if value == "__flag__":
            # Boolean flag — just append the flag
            extra_cli_args.append(key)
        elif key.startswith("-"):
            # Value arg — append flag + value
            extra_cli_args.append(key)
            extra_cli_args.append(str(value))
        else:
            # Template context variable
            context[key] = str(value)

    try:
        command = [segment.format_map(context) for segment in tool.command]
    except KeyError as exc:
        return failed_node_result(
            node, node_dir, f"Missing template value for {exc.args[0]} while building command for {tool.id}."
        )

    # Append toggled args to the end of the command
    command.extend(extra_cli_args)

    try:
        completed = subprocess.run(
            command,
            cwd=str(node_dir),
            capture_output=True,
            text=True,
            timeout=tool.timeout_seconds,
            check=False,
        )
    except FileNotFoundError:
        return failed_node_result(node, node_dir, f"Binary not found for tool {tool.id}: {command[0]}", command=command)
    except subprocess.TimeoutExpired as exc:
        stdout_text = exc.stdout or ""
        stderr_text = exc.stderr or ""
        write_text(stdout_path, stdout_text)
        write_text(stderr_path, stderr_text or f"Timeout after {tool.timeout_seconds}s")
        return {
            "node_id": node.id,
            "status": "failed",
            "command": command,
            "exit_code": None,
            "artifact_paths": [],
            "outputs": {},
            "stdout_preview": truncate_text(stdout_text),
            "stderr_preview": truncate_text(stderr_text or f"Timeout after {tool.timeout_seconds}s"),
            "stdout_path": str(stdout_path),
            "stderr_path": str(stderr_path),
            "logs": [f"[-] Node {node.id} timed out after {tool.timeout_seconds}s."],
        }

    stdout_text = completed.stdout or ""
    stderr_text = completed.stderr or ""
    write_text(stdout_path, stdout_text)
    write_text(stderr_path, stderr_text)

    artifact_paths: list[str] = []
    if tool.output_mode == "stdout":
        write_text(artifact_file, stdout_text)
        artifact_paths.append(str(artifact_file))
    elif artifact_file.exists():
        artifact_paths.append(str(artifact_file))

    success = completed.returncode == 0
    outputs = {primary_output: str(artifact_file)} if success and artifact_paths else {}
    logs = [f"[>] {node.id}: {' '.join(command)}"]
    if success:
        logs.append(f"[+] Node {node.id} finished successfully.")
        if artifact_paths:
            logs.append(f"[+] artifact://{run_id}/{node.id}/{Path(artifact_paths[0]).name}")
    else:
        logs.append(f"[-] Node {node.id} exited with code {completed.returncode}.")

    return {
        "node_id": node.id,
        "status": "success" if success else "failed",
        "command": command,
        "exit_code": completed.returncode,
        "artifact_paths": artifact_paths,
        "outputs": outputs,
        "stdout_preview": truncate_text(stdout_text),
        "stderr_preview": truncate_text(stderr_text),
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": logs,
    }


def execute_script_node(
    run_id: str,
    node: WorkflowNode,
    node_dir: Path,
    incoming_edges: list[WorkflowEdge],
    output_values: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    language = node.script_language or "bash"
    script_body = node.script_body or ""
    if not script_body.strip():
        return failed_node_result(node, node_dir, f"Script node {node.id} has no script body.")

    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"
    artifact_file = node_dir / "targets.txt"

    # Gather stdin from upstream
    stdin_data = ""
    for edge in incoming_edges:
        input_name = edge.target_handle.removeprefix("in:") if edge.target_handle else "input"
        source_type = edge.source_handle.removeprefix("out:") if edge.source_handle else "output"
        source_value = output_values.get(edge.source, {}).get(source_type)
        if source_value and input_name != "any":
            source_path = Path(str(source_value))
            if source_path.exists():
                stdin_data += source_path.read_text(encoding="utf-8", errors="ignore")
            else:
                stdin_data += str(source_value) + "\n"

    # Write script to temp file and execute
    ext = ".py" if language == "python" else ".sh"
    script_file = node_dir / f"script{ext}"
    write_text(script_file, script_body)

    cmd = ["python3", str(script_file)] if language == "python" else ["bash", str(script_file)]

    try:
        completed = subprocess.run(
            cmd,
            input=stdin_data,
            cwd=str(node_dir),
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
    except FileNotFoundError:
        return failed_node_result(node, node_dir, f"{language} interpreter not found.", command=cmd)
    except subprocess.TimeoutExpired as exc:
        write_text(stdout_path, exc.stdout or "")
        write_text(stderr_path, exc.stderr or "Timeout after 300s")
        return failed_node_result(node, node_dir, "Script timed out.", command=cmd)

    stdout_text = completed.stdout or ""
    stderr_text = completed.stderr or ""
    write_text(stdout_path, stdout_text)
    write_text(stderr_path, stderr_text)
    write_text(artifact_file, stdout_text)

    success = completed.returncode == 0
    return {
        "node_id": node.id,
        "status": "success" if success else "failed",
        "command": cmd,
        "exit_code": completed.returncode,
        "artifact_paths": [str(artifact_file)] if success else [],
        "outputs": {"targets": str(artifact_file)} if success else {},
        "stdout_preview": truncate_text(stdout_text),
        "stderr_preview": truncate_text(stderr_text),
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": [
            f"[>] {node.id}: {' '.join(cmd)}",
            f"[+] Script node {node.id} {'succeeded' if success else f'failed (exit {completed.returncode})'}.",
        ]
        + ([f"[+] artifact://{run_id}/{node.id}/targets.txt"] if success else []),
    }


def execute_condition_node(
    run_id: str,
    node: WorkflowNode,
    node_dir: Path,
    incoming_edges: list[WorkflowEdge],
    output_values: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Evaluate a condition expression against upstream data. Outputs to 'pass' or 'fail' sockets."""
    expr = (node.condition_expr or "").strip()
    if not expr:
        return failed_node_result(node, node_dir, f"Condition node {node.id} has no expression.")

    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"

    # Gather upstream data
    upstream_data = ""
    for edge in incoming_edges:
        source_type = edge.source_handle.removeprefix("out:") if edge.source_handle else "output"
        source_value = output_values.get(edge.source, {}).get(source_type)
        if source_value:
            source_path = Path(str(source_value))
            if source_path.exists():
                upstream_data += source_path.read_text(encoding="utf-8", errors="ignore")
            else:
                upstream_data += str(source_value) + "\n"

    # Evaluate expression: supports simple conditions
    # - "has_lines" / "not_empty": true if upstream has content
    # - "line_count > N": compare line count
    # - "contains:PATTERN": true if pattern is found
    # - "exit_code == 0": check upstream exit code
    lines = [l for l in upstream_data.strip().split("\n") if l.strip()] if upstream_data.strip() else []
    line_count = len(lines)
    passed = False

    try:
        if expr in ("has_lines", "not_empty"):
            passed = line_count > 0
        elif expr == "empty":
            passed = line_count == 0
        elif expr.startswith("contains:"):
            pattern = expr[len("contains:") :]
            passed = pattern in upstream_data
        elif expr.startswith("not_contains:"):
            pattern = expr[len("not_contains:") :]
            passed = pattern not in upstream_data
        elif expr.startswith("line_count"):
            # e.g. "line_count > 10", "line_count >= 5", "line_count == 0"
            import re

            m = re.match(r"line_count\s*(>=|<=|>|<|==|!=)\s*(\d+)", expr)
            if m:
                op, threshold = m.group(1), int(m.group(2))
                ops = {
                    ">=": lambda a, b: a >= b,
                    "<=": lambda a, b: a <= b,
                    ">": lambda a, b: a > b,
                    "<": lambda a, b: a < b,
                    "==": lambda a, b: a == b,
                    "!=": lambda a, b: a != b,
                }
                passed = ops[op](line_count, threshold)
            else:
                return failed_node_result(node, node_dir, f"Invalid line_count expression: {expr}")
        elif expr.startswith("min_lines:"):
            threshold = int(expr.split(":")[1])
            passed = line_count >= threshold
        else:
            return failed_node_result(
                node,
                node_dir,
                f"Unknown condition expression: {expr}. Supported: has_lines, empty, contains:PATTERN, line_count > N, min_lines:N",
            )
    except Exception as e:
        return failed_node_result(node, node_dir, f"Condition evaluation error: {e}")

    # Write data to the appropriate output socket
    pass_file = node_dir / "pass.txt"
    fail_file = node_dir / "fail.txt"
    result_text = f'Condition "{expr}": {"PASS" if passed else "FAIL"} (lines={line_count})'

    if passed:
        write_text(pass_file, upstream_data)
        write_text(fail_file, "")
    else:
        write_text(pass_file, "")
        write_text(fail_file, upstream_data)

    write_text(stdout_path, result_text + "\n")
    write_text(stderr_path, "")

    return {
        "node_id": node.id,
        "status": "success",
        "command": [],
        "exit_code": 0,
        "artifact_paths": [str(pass_file if passed else fail_file)],
        "outputs": {
            "pass": str(pass_file) if passed else "",
            "fail": str(fail_file) if not passed else "",
        },
        "stdout_preview": result_text,
        "stderr_preview": "",
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": [f"[>] Condition {node.id}: {expr} => {'PASS' if passed else 'FAIL'} ({line_count} lines)"],
    }


def execute_loop_node(
    run_id: str,
    node: WorkflowNode,
    node_dir: Path,
    incoming_edges: list[WorkflowEdge],
    output_values: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Iterate over upstream data line-by-line (or chunk-by-chunk), emitting each item."""
    loop_mode = node.loop_mode or "line"
    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"

    # Gather upstream data
    upstream_data = ""
    for edge in incoming_edges:
        source_type = edge.source_handle.removeprefix("out:") if edge.source_handle else "output"
        source_value = output_values.get(edge.source, {}).get(source_type)
        if source_value:
            source_path = Path(str(source_value))
            if source_path.exists():
                upstream_data += source_path.read_text(encoding="utf-8", errors="ignore")
            else:
                upstream_data += str(source_value) + "\n"

    if not upstream_data.strip():
        return failed_node_result(node, node_dir, f"Loop node {node.id} received no data to iterate over.")

    if loop_mode == "line":
        items = [line for line in upstream_data.strip().split("\n") if line.strip()]
    else:
        # chunk mode: split by double newlines
        items = [chunk.strip() for chunk in upstream_data.split("\n\n") if chunk.strip()]

    # Write all items as output (downstream nodes process the aggregated list)
    # Each item written on its own line for downstream consumption
    item_file = node_dir / "item.txt"
    output_text = "\n".join(items) + "\n"
    write_text(item_file, output_text)

    summary = f"Loop ({loop_mode}): {len(items)} items from upstream"
    write_text(stdout_path, summary + "\n" + output_text)
    write_text(stderr_path, "")

    return {
        "node_id": node.id,
        "status": "success",
        "command": [],
        "exit_code": 0,
        "artifact_paths": [str(item_file)],
        "outputs": {"item": str(item_file)},
        "stdout_preview": truncate_text(summary + "\n" + output_text),
        "stderr_preview": "",
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": [f"[>] Loop {node.id}: emitted {len(items)} items ({loop_mode} mode)"],
    }


def execute_module_node(
    run_id: str,
    node: WorkflowNode,
    node_dir: Path,
    tools_by_id: dict[str, Tool],
    incoming_edges: list[WorkflowEdge],
    output_values: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Execute a module (sub-workflow) node by loading and running the referenced workflow."""
    workflow_id = node.module_workflow_id
    if not workflow_id:
        return failed_node_result(node, node_dir, f"Module node {node.id} has no workflow reference.")

    stored = next((item for item in workflow_records() if item.get("id") == workflow_id), None)
    if not stored or "graph" not in stored:
        return failed_node_result(node, node_dir, f"Module node {node.id} references unknown workflow {workflow_id}.")

    sub_graph = WorkflowGraph(**stored["graph"])
    sub_validation = validate_graph(sub_graph)
    if not sub_validation.get("ok"):
        return failed_node_result(node, node_dir, f"Sub-workflow graph invalid: {sub_validation.get('error')}")

    stdout_path = node_dir / "stdout.log"
    stderr_path = node_dir / "stderr.log"

    # Gather upstream input to feed into the sub-workflow's variable nodes
    upstream_data = ""
    for edge in incoming_edges:
        source_type = edge.source_handle.removeprefix("out:") if edge.source_handle else "output"
        source_value = output_values.get(edge.source, {}).get(source_type)
        if source_value:
            source_path = Path(str(source_value))
            if source_path.exists():
                upstream_data += source_path.read_text(encoding="utf-8", errors="ignore")
            else:
                upstream_data += str(source_value) + "\n"

    # Inject upstream data into variable nodes of the sub-workflow
    for sub_node in sub_graph.nodes:
        if sub_node.kind == "variable" and not sub_node.value and upstream_data:
            sub_node.value = upstream_data.strip()

    # Execute the sub-workflow within a sub-directory
    sub_dir = node_dir / "sub_run"
    sub_dir.mkdir(parents=True, exist_ok=True)

    sub_nodes_by_id = {n.id: n for n in sub_graph.nodes}
    sub_parents, _, sub_incoming = build_graph_indexes(sub_graph)
    sub_node_states = {n.id: "queued" for n in sub_graph.nodes}
    sub_node_results: dict[str, Any] = {}
    sub_output_values: dict[str, dict[str, Any]] = {}
    sub_logs: list[str] = [f'[>] Module {node.id}: executing sub-workflow "{stored.get("name", workflow_id)}"']

    for group in sub_validation["parallel_groups"]:
        runnable: list[WorkflowNode] = []
        for nid in group:
            blocked = [pid for pid in sub_parents.get(nid, []) if sub_node_states.get(pid) != "success"]
            if blocked:
                sub_node_states[nid] = "blocked"
                continue
            sub_node_states[nid] = "running"
            runnable.append(sub_nodes_by_id[nid])

        for sub_node in runnable:
            result = execute_node(
                run_id,
                sub_node,
                tools_by_id,
                sub_incoming.get(sub_node.id, []),
                sub_output_values,
                sub_dir,
            )
            sub_node_states[sub_node.id] = result["status"]
            sub_node_results[sub_node.id] = result
            if result["status"] == "success":
                sub_output_values[sub_node.id] = result.get("outputs", {})
            sub_logs.extend(result.get("logs", []))

    # Collect final outputs from sub-workflow output nodes
    final_artifacts: list[str] = []
    final_output_value = ""
    for sub_node in sub_graph.nodes:
        if sub_node.kind == "output" and sub_node.id in sub_node_results:
            final_artifacts.extend(sub_node_results[sub_node.id].get("artifact_paths", []))
        # Also collect from the last successful node
        if sub_node.id in sub_output_values:
            for val in sub_output_values[sub_node.id].values():
                if val and Path(str(val)).exists():
                    final_output_value = str(val)

    # Write aggregate output
    aggregate_file = node_dir / "targets.txt"
    aggregate_content = ""
    if final_output_value and Path(final_output_value).exists():
        aggregate_content = Path(final_output_value).read_text(encoding="utf-8", errors="ignore")
    write_text(aggregate_file, aggregate_content)
    write_text(stdout_path, "\n".join(sub_logs))
    write_text(stderr_path, "")

    all_success = all(s == "success" for s in sub_node_states.values() if s != "queued")
    return {
        "node_id": node.id,
        "status": "success" if all_success else "failed",
        "command": [],
        "exit_code": 0 if all_success else 1,
        "artifact_paths": [str(aggregate_file)] + final_artifacts,
        "outputs": {"targets": str(aggregate_file)} if all_success else {},
        "stdout_preview": truncate_text("\n".join(sub_logs)),
        "stderr_preview": "",
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "logs": sub_logs + [f"[+] Module {node.id} {'completed' if all_success else 'failed'}."],
    }


def execute_node(
    run_id: str,
    node: WorkflowNode,
    tools_by_id: dict[str, Tool],
    incoming_edges: list[WorkflowEdge],
    output_values: dict[str, dict[str, Any]],
    run_dir: Path,
) -> dict[str, Any]:
    node_dir = run_dir / node.id
    node_dir.mkdir(parents=True, exist_ok=True)

    if node.kind == "variable":
        return execute_variable_node(node, node_dir)
    if node.kind == "output":
        return execute_output_node(node, node_dir, incoming_edges, output_values)
    if node.kind == "tool":
        if not node.tool_id or node.tool_id not in tools_by_id:
            return failed_node_result(node, node_dir, f"Unknown tool for node {node.id}.")
        return execute_tool_node(run_id, node, node_dir, tools_by_id[node.tool_id], incoming_edges, output_values)
    if node.kind == "script":
        return execute_script_node(run_id, node, node_dir, incoming_edges, output_values)
    if node.kind == "module":
        return execute_module_node(run_id, node, node_dir, tools_by_id, incoming_edges, output_values)
    if node.kind == "condition":
        return execute_condition_node(run_id, node, node_dir, incoming_edges, output_values)
    if node.kind == "loop":
        return execute_loop_node(run_id, node, node_dir, incoming_edges, output_values)
    return failed_node_result(node, node_dir, f"Unsupported node kind {node.kind}.")


def reconstruct_output_values(node_results: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output_values: dict[str, dict[str, Any]] = {}
    for node_id, result in node_results.items():
        outputs = result.get("outputs") or {}
        if outputs:
            output_values[node_id] = outputs
    return output_values


def resolve_run_graph(run: dict[str, Any]) -> WorkflowGraph | None:
    if "graph" in run:
        return WorkflowGraph(**run["graph"])
    workflow_id = run.get("workflow_id")
    if workflow_id:
        workflow = next((item for item in workflow_records() if item.get("id") == workflow_id), None)
        if workflow and "graph" in workflow:
            return WorkflowGraph(**workflow["graph"])
    return None


def find_run(run_id: str) -> dict[str, Any] | None:
    return next((run for run in run_records() if run.get("id") == run_id), None)


def ensure_artifact_path(run: dict[str, Any], requested_path: str) -> Path | None:
    root = Path(run["artifact_root"]).resolve()
    candidate = Path(requested_path).expanduser()
    if not candidate.is_absolute():
        candidate = (root / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if not candidate.exists():
        return None
    if candidate == root or root in candidate.parents:
        return candidate
    return None


def collect_run_artifacts(run: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    for node_id, result in (run.get("node_results") or {}).items():
        for path in result.get("artifact_paths") or []:
            artifact_path = ensure_artifact_path(run, path)
            if not artifact_path:
                continue
            items.append(
                {
                    "id": f"run::{node_id}::{artifact_path.name}",
                    "source": "run",
                    "node_id": node_id,
                    "label": f"{node_id} · {artifact_path.name}",
                    "path": str(artifact_path),
                    "name": artifact_path.name,
                    "extension": artifact_path.suffix.lower(),
                    "size_bytes": artifact_path.stat().st_size,
                }
            )

    for replay in run.get("replays") or []:
        replay_id = replay.get("id", "replay")
        replay_node = replay.get("node_id", "node")
        result = replay.get("result") or {}
        for path in result.get("artifact_paths") or []:
            artifact_path = ensure_artifact_path(run, path)
            if not artifact_path:
                continue
            items.append(
                {
                    "id": f"replay::{replay_id}::{artifact_path.name}",
                    "source": "replay",
                    "replay_id": replay_id,
                    "node_id": replay_node,
                    "label": f"{replay_node} replay · {artifact_path.name}",
                    "path": str(artifact_path),
                    "name": artifact_path.name,
                    "extension": artifact_path.suffix.lower(),
                    "size_bytes": artifact_path.stat().st_size,
                }
            )

    items.sort(key=lambda item: (item["node_id"], item["name"]))
    return items


def preview_artifact(run: dict[str, Any], requested_path: str) -> dict[str, Any]:
    artifact_path = ensure_artifact_path(run, requested_path)
    if not artifact_path:
        return {"ok": False, "error": "Artifact path is invalid or outside the run root."}

    mime_type = mimetypes.guess_type(artifact_path.name)[0] or "application/octet-stream"
    suffix = artifact_path.suffix.lower()
    size_bytes = artifact_path.stat().st_size

    if suffix == ".json":
        raw = artifact_path.read_text(encoding="utf-8", errors="ignore")
        try:
            parsed = json.loads(raw)
            return {
                "ok": True,
                "kind": "json",
                "path": str(artifact_path),
                "name": artifact_path.name,
                "mime_type": mime_type,
                "size_bytes": size_bytes,
                "json_content": parsed,
            }
        except json.JSONDecodeError:
            return {
                "ok": True,
                "kind": "text",
                "path": str(artifact_path),
                "name": artifact_path.name,
                "mime_type": "text/plain",
                "size_bytes": size_bytes,
                "text_content": raw,
            }

    if suffix in {".html", ".htm"} or mime_type == "text/html":
        html = artifact_path.read_text(encoding="utf-8", errors="ignore")
        return {
            "ok": True,
            "kind": "html",
            "path": str(artifact_path),
            "name": artifact_path.name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "html_content": html,
        }

    if suffix in IMAGE_SUFFIXES or mime_type.startswith("image/"):
        raw_bytes = artifact_path.read_bytes()
        encoded = base64.b64encode(raw_bytes).decode("ascii")
        return {
            "ok": True,
            "kind": "image",
            "path": str(artifact_path),
            "name": artifact_path.name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "image_data_url": f"data:{mime_type};base64,{encoded}",
        }

    if suffix in TEXT_SUFFIXES or mime_type.startswith("text/"):
        text = artifact_path.read_text(encoding="utf-8", errors="ignore")
        return {
            "ok": True,
            "kind": "text",
            "path": str(artifact_path),
            "name": artifact_path.name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "text_content": text,
        }

    if size_bytes <= 1_000_000:
        text = artifact_path.read_text(encoding="utf-8", errors="ignore")
        return {
            "ok": True,
            "kind": "text",
            "path": str(artifact_path),
            "name": artifact_path.name,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "text_content": text,
        }

    return {
        "ok": True,
        "kind": "binary",
        "path": str(artifact_path),
        "name": artifact_path.name,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/tools", response_model=list[Tool])
def tools() -> list[Tool]:
    return load_tools()


@app.get("/api/workflows")
def list_workflows() -> list[dict[str, Any]]:
    return workflow_records()


def _save_version(workflow_id: str, item: dict[str, Any]) -> int:
    """Save a version snapshot of the workflow, return version number."""
    ver_dir = VERSIONS_DIR / workflow_id
    ver_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(ver_dir.glob("v*.json"))
    version = len(existing) + 1
    ver_file = ver_dir / f"v{version}.json"
    ver_file.write_text(json.dumps({**item, "version": version}, indent=2))
    return version


def _list_versions(workflow_id: str) -> list[dict[str, Any]]:
    ver_dir = VERSIONS_DIR / workflow_id
    if not ver_dir.exists():
        return []
    versions = []
    for vf in sorted(ver_dir.glob("v*.json")):
        try:
            data = json.loads(vf.read_text())
            versions.append(
                {
                    "version": data.get("version", 0),
                    "updated_at": data.get("updated_at", ""),
                    "name": data.get("name", ""),
                    "node_count": len(data.get("graph", {}).get("nodes", [])),
                    "edge_count": len(data.get("graph", {}).get("edges", [])),
                }
            )
        except (json.JSONDecodeError, KeyError):
            pass
    return versions


@app.post("/api/workflows")
def save_workflow(payload: WorkflowPayload) -> dict[str, Any]:
    workflow_id = payload.id or f"wf-{uuid4().hex[:10]}"
    item = {
        "id": workflow_id,
        "name": payload.name,
        "graph": payload.graph.model_dump(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    version = _save_version(workflow_id, item)
    item["version"] = version

    db.upsert_workflow(item)
    return item


@app.get("/api/workflows/{workflow_id}")
def get_workflow(workflow_id: str) -> dict[str, Any]:
    for workflow in workflow_records():
        if workflow["id"] == workflow_id:
            return workflow
    return {"error": "Workflow not found"}


@app.delete("/api/workflows/{workflow_id}")
def delete_workflow_endpoint(workflow_id: str) -> dict[str, Any]:
    db.delete_workflow(workflow_id)
    # Best-effort cleanup of stored version snapshots.
    ver_dir = VERSIONS_DIR / workflow_id
    if ver_dir.exists():
        for vf in ver_dir.glob("v*.json"):
            vf.unlink(missing_ok=True)
        try:
            ver_dir.rmdir()
        except OSError:
            pass
    return {"ok": True, "id": workflow_id}


@app.get("/api/workflows/{workflow_id}/versions")
def list_workflow_versions(workflow_id: str) -> list[dict[str, Any]]:
    return _list_versions(workflow_id)


@app.post("/api/workflows/{workflow_id}/versions/{version}/restore")
def restore_workflow_version(workflow_id: str, version: int) -> dict[str, Any]:
    ver_file = VERSIONS_DIR / workflow_id / f"v{version}.json"
    if not ver_file.exists():
        return {"error": f"Version {version} not found for workflow {workflow_id}"}
    data = json.loads(ver_file.read_text())
    # Save as a new version (creating a restore point)
    payload = WorkflowPayload(
        id=workflow_id,
        name=data.get("name", "Restored"),
        graph=WorkflowGraph(**data["graph"]),
    )
    return save_workflow(payload)


@app.post("/api/workflows/validate")
def validate_workflow(graph: WorkflowGraph) -> dict[str, Any]:
    return validate_graph(graph)


@app.get("/api/runs")
def list_runs() -> list[dict[str, Any]]:
    return run_records()


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    found = find_run(run_id)
    if found:
        return found
    return {"error": "Run not found"}


@app.get("/api/runs/{run_id}/artifacts")
def list_run_artifacts(run_id: str) -> dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {"ok": False, "error": f"Run {run_id} not found"}
    return {
        "ok": True,
        "run_id": run_id,
        "items": collect_run_artifacts(run),
    }


@app.get("/api/runs/{run_id}/artifact-preview")
def get_artifact_preview(run_id: str, path: str = Query(...)) -> dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {"ok": False, "error": f"Run {run_id} not found"}
    return preview_artifact(run, path)


@app.get("/api/runs/{run_id}/artifact-raw")
def get_artifact_raw(run_id: str, path: str = Query(...)) -> Any:
    run = find_run(run_id)
    if not run:
        return {"ok": False, "error": f"Run {run_id} not found"}

    artifact_path = ensure_artifact_path(run, path)
    if not artifact_path:
        return {"ok": False, "error": "Artifact path is invalid or outside the run root."}

    media_type = mimetypes.guess_type(artifact_path.name)[0] or "application/octet-stream"
    return FileResponse(path=artifact_path, filename=artifact_path.name, media_type=media_type)


@app.post("/api/runs")
def run_workflow(payload: RunPayload) -> dict[str, Any]:
    graph: WorkflowGraph | None = payload.workflow

    if graph is None and payload.workflow_id:
        stored = next((item for item in workflow_records() if item["id"] == payload.workflow_id), None)
        if stored:
            graph = WorkflowGraph(**stored["graph"])

    if graph is None:
        return {"ok": False, "error": "No workflow graph supplied"}

    validation = validate_graph(graph)
    if not validation.get("ok"):
        return validation

    ensure_state()
    run_id = f"run-{uuid4().hex[:10]}"
    run_dir = ARTIFACTS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    tools_by_id = {tool.id: tool for tool in load_tools()}
    nodes_by_id = {node.id: node for node in graph.nodes}
    parents_by_node, _, incoming_edges_by_target = build_graph_indexes(graph)
    node_states = {node.id: "queued" for node in graph.nodes}
    node_results: dict[str, Any] = {}
    output_values: dict[str, dict[str, Any]] = {}
    logs = [f'[+] Run {run_id} accepted for "{payload.name}".']
    logs.append(f"[+] Scheduler mode: DAG queue with parent completion gating. max_parallel={payload.max_parallel}")

    max_workers = max(1, payload.max_parallel)

    for group_index, group in enumerate(validation["parallel_groups"], start=1):
        logs.append(f"[+] Parallel group {group_index}: {', '.join(group)}")
        runnable: list[WorkflowNode] = []

        for node_id in group:
            blocked_parents = [
                parent_id for parent_id in parents_by_node.get(node_id, []) if node_states.get(parent_id) != "success"
            ]
            if blocked_parents:
                node_states[node_id] = "blocked"
                node_results[node_id] = {
                    "node_id": node_id,
                    "status": "blocked",
                    "command": [],
                    "exit_code": None,
                    "artifact_paths": [],
                    "outputs": {},
                    "stdout_preview": "",
                    "stderr_preview": "",
                    "stdout_path": "",
                    "stderr_path": "",
                    "logs": [f"[-] Node {node_id} blocked by parent state(s): {', '.join(blocked_parents)}"],
                }
                logs.extend(node_results[node_id]["logs"])
                continue
            node_states[node_id] = "running"
            runnable.append(nodes_by_id[node_id])

        if not runnable:
            continue

        with ThreadPoolExecutor(max_workers=min(max_workers, len(runnable))) as executor:
            future_map = {
                executor.submit(
                    execute_node,
                    run_id,
                    node,
                    tools_by_id,
                    incoming_edges_by_target.get(node.id, []),
                    output_values,
                    run_dir,
                ): node.id
                for node in runnable
            }
            for future in as_completed(future_map):
                result = future.result()
                node_id = result["node_id"]
                node_states[node_id] = result["status"]
                node_results[node_id] = result
                if result["status"] == "success":
                    output_values[node_id] = result.get("outputs", {})
                logs.extend(result.get("logs", []))

    overall_status = "completed" if all(state == "success" for state in node_states.values()) else "failed"
    result = {
        "id": run_id,
        "workflow_id": payload.workflow_id,
        "name": payload.name,
        "status": overall_status,
        "created_at": datetime.now(UTC).isoformat(),
        "graph": graph.model_dump(),
        "parallel_groups": validation["parallel_groups"],
        "node_states": node_states,
        "node_results": node_results,
        "artifact_root": str(run_dir),
        "replays": [],
        "logs": logs,
    }

    persist_run_record(result)
    write_text(run_dir / "run.json", json.dumps(result, indent=2))
    return result


@app.post("/api/runs/{run_id}/replay/{node_id}")
def replay_node(run_id: str, node_id: str) -> dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {"ok": False, "error": f"Run {run_id} not found"}

    graph = resolve_run_graph(run)
    if graph is None:
        return {
            "ok": False,
            "error": "This run does not include a stored graph. Save the workflow or execute a fresh run, then replay nodes from the newer run.",
        }

    validation = validate_graph(graph)
    if not validation.get("ok"):
        return {"ok": False, "error": validation.get("error", "Stored graph is invalid")}

    tools_by_id = {tool.id: tool for tool in load_tools()}
    nodes_by_id = {node.id: node for node in graph.nodes}
    if node_id not in nodes_by_id:
        return {"ok": False, "error": f"Node {node_id} not found in stored graph"}

    parents_by_node, _, incoming_edges_by_target = build_graph_indexes(graph)
    parent_ids = parents_by_node.get(node_id, [])
    node_states = run.get("node_states", {})
    blocked_parents = [parent_id for parent_id in parent_ids if node_states.get(parent_id) != "success"]
    if blocked_parents:
        return {
            "ok": False,
            "error": f"Node {node_id} cannot be replayed because parent node(s) are not successful: {', '.join(blocked_parents)}",
        }

    replay_id = f"replay-{uuid4().hex[:8]}"
    replay_root = Path(run["artifact_root"]) / "replays" / replay_id
    replay_root.mkdir(parents=True, exist_ok=True)

    output_values = reconstruct_output_values(run.get("node_results", {}))
    result = execute_node(
        run_id,
        nodes_by_id[node_id],
        tools_by_id,
        incoming_edges_by_target.get(node_id, []),
        output_values,
        replay_root,
    )

    replay_record = {
        "id": replay_id,
        "node_id": node_id,
        "created_at": datetime.now(UTC).isoformat(),
        "used_cached_upstream_from": parent_ids,
        "result": result,
    }

    run.setdefault("replays", []).insert(0, replay_record)
    run.setdefault("logs", []).append(f"[+] Replay {replay_id} executed for node {node_id}.")
    run.setdefault("graph", graph.model_dump())
    persist_run_record(run)
    write_text(replay_root / "replay.json", json.dumps(replay_record, indent=2))

    return {
        "ok": result.get("status") == "success",
        "run_id": run_id,
        "replay_id": replay_id,
        "node_id": node_id,
        "parent_ids": parent_ids,
        "cached_output_nodes": sorted(output_values.keys()),
        "result": result,
    }


# ── Delete Run ───────────────────────────────────────────────────────────────


@app.delete("/api/runs/{run_id}")
def delete_run(run_id: str) -> dict[str, Any]:
    if db.get_run(run_id) is None:
        return {"ok": False, "error": f"Run {run_id} not found"}
    db.delete_run(run_id)
    run_dir = ARTIFACTS_DIR / run_id
    if run_dir.exists():
        import shutil

        shutil.rmtree(run_dir, ignore_errors=True)
    return {"ok": True, "deleted": run_id}


# ── Tool Categories ──────────────────────────────────────────────────────────


@app.get("/api/tools/categories")
def tool_categories() -> list[str]:
    tools = load_tools()
    return sorted({t.category for t in tools})


# ── Templates ────────────────────────────────────────────────────────────────


class TemplatePayload(BaseModel):
    name: str
    description: str = ""
    category: str = "Recon"
    tags: list[str] = Field(default_factory=list)
    graph: WorkflowGraph


def load_builtin_templates() -> list[dict[str, Any]]:
    if not TEMPLATES_FILE.exists():
        return []
    data = yaml.safe_load(TEMPLATES_FILE.read_text()) or {}
    templates = []
    for item in data.get("templates", []):
        item["builtin"] = True
        templates.append(item)
    return templates


def load_user_templates() -> list[dict[str, Any]]:
    return db.list_user_templates()


@app.get("/api/templates")
def list_templates() -> list[dict[str, Any]]:
    return load_builtin_templates() + load_user_templates()


@app.get("/api/templates/{template_id}")
def get_template(template_id: str) -> dict[str, Any]:
    for t in load_builtin_templates() + load_user_templates():
        if t.get("id") == template_id:
            return t
    return {"error": "Template not found"}


@app.post("/api/templates")
def save_template(payload: TemplatePayload) -> dict[str, Any]:
    templates = load_user_templates()
    template_id = f"tpl-{uuid4().hex[:10]}"
    item = {
        "id": template_id,
        "name": payload.name,
        "description": payload.description,
        "category": payload.category,
        "tags": payload.tags,
        "builtin": False,
        "graph": payload.graph.model_dump(),
        "created_at": datetime.now(UTC).isoformat(),
    }
    templates.insert(0, item)
    db.save_user_templates(templates)
    return item


# ── Mermaid flowchart import ─────────────────────────────────────────────────


class MermaidPayload(BaseModel):
    mermaid: str
    name: str = "Imported workflow"
    save: str | None = None  # None | "workflow" | "template"
    category: str = "Recon"


@app.post("/api/import/mermaid")
def import_mermaid(payload: MermaidPayload) -> dict[str, Any]:
    """Parse a Mermaid flowchart into a workflow graph.

    Always returns the mapped graph (so the UI can load and fix it), plus its
    validation status and any mapping warnings. Optionally persists it as a
    workflow or a template.
    """
    result = mermaid.mermaid_to_graph(payload.mermaid, load_tools())
    graph_dict = {"nodes": result["nodes"], "edges": result["edges"]}

    if not result["nodes"]:
        return {"ok": False, "error": "No nodes parsed — is this a Mermaid flowchart?", "warnings": result["warnings"]}

    try:
        graph = WorkflowGraph(**graph_dict)
    except Exception as exc:  # noqa: BLE001 - surface any pydantic error to the UI
        return {"ok": False, "error": f"Could not build graph: {exc}", "warnings": result["warnings"], "graph": graph_dict}

    validation = validate_graph(graph)
    response: dict[str, Any] = {
        "ok": True,
        "name": payload.name,
        "graph": graph.model_dump(),
        "warnings": result["warnings"],
        "valid": bool(validation.get("ok")),
        "validation_error": None if validation.get("ok") else validation.get("error"),
        "node_count": len(result["nodes"]),
        "edge_count": len(result["edges"]),
    }

    if payload.save == "workflow":
        saved = save_workflow(WorkflowPayload(name=payload.name, graph=graph))
        response["saved_workflow_id"] = saved.get("id")
    elif payload.save == "template":
        saved = save_template(
            TemplatePayload(
                name=payload.name,
                description="Imported from a Mermaid flowchart.",
                category=payload.category,
                tags=["mermaid", "imported"],
                graph=graph,
            )
        )
        response["saved_template_id"] = saved.get("id")

    return response


# ── Active run tracking (for cancellation) ───────────────────────────────────

_active_runs: dict[str, bool] = {}


@app.post("/api/runs/{run_id}/cancel")
def cancel_run(run_id: str) -> dict[str, Any]:
    if run_id in _active_runs:
        _active_runs[run_id] = True
        return {"ok": True, "message": f"Run {run_id} cancellation requested."}
    return {"ok": False, "error": f"Run {run_id} is not active."}


# ── WebSocket streaming run endpoint ─────────────────────────────────────────


@app.websocket("/ws/run")
async def ws_run(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        payload_data = json.loads(raw)
    except (WebSocketDisconnect, json.JSONDecodeError):
        return

    payload = RunPayload(
        name=payload_data.get("name", "Streamed Run"),
        workflow=WorkflowGraph(**payload_data["workflow"]) if "workflow" in payload_data else None,
        workflow_id=payload_data.get("workflow_id"),
        max_parallel=payload_data.get("max_parallel", 2),
    )

    graph: WorkflowGraph | None = payload.workflow
    if graph is None and payload.workflow_id:
        stored = next((item for item in workflow_records() if item["id"] == payload.workflow_id), None)
        if stored:
            graph = WorkflowGraph(**stored["graph"])

    if graph is None:
        await websocket.send_json({"type": "run_error", "run_id": "", "error": "No workflow graph supplied"})
        await websocket.close()
        return

    validation = validate_graph(graph)
    if not validation.get("ok"):
        await websocket.send_json(
            {"type": "run_error", "run_id": "", "error": validation.get("error", "Invalid graph")}
        )
        await websocket.close()
        return

    ensure_state()
    run_id = f"run-{uuid4().hex[:10]}"
    run_dir = ARTIFACTS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    _active_runs[run_id] = False

    tools_by_id = {tool.id: tool for tool in load_tools()}
    nodes_by_id = {node.id: node for node in graph.nodes}
    parents_by_node, _, incoming_edges_by_target = build_graph_indexes(graph)
    node_states = {node.id: "queued" for node in graph.nodes}
    node_results: dict[str, Any] = {}
    output_values: dict[str, dict[str, Any]] = {}
    logs: list[str] = [f'[+] Run {run_id} accepted for "{payload.name}".']

    await websocket.send_json({"type": "run_started", "run_id": run_id, "node_states": node_states})

    # Persist an in-flight record so the run surfaces (as "running") in the
    # Executions list and the dashboard while it streams. The final record at
    # run_finished replaces this by id (upsert).
    persist_run_record(
        {
            "id": run_id,
            "workflow_id": payload.workflow_id,
            "name": payload.name,
            "status": "running",
            "created_at": datetime.now(UTC).isoformat(),
            "graph": graph.model_dump(),
            "parallel_groups": validation["parallel_groups"],
            "node_states": node_states,
            "node_results": {},
            "artifact_root": str(run_dir),
            "replays": [],
            "logs": list(logs),
        }
    )

    max_workers = max(1, payload.max_parallel)
    cancelled = False

    for group_index, group in enumerate(validation["parallel_groups"], start=1):
        if _active_runs.get(run_id):
            cancelled = True
            break

        # Check for cancel messages (non-blocking)
        try:
            while True:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                data = json.loads(msg)
                if data.get("type") == "cancel":
                    cancelled = True
                    break
        except (TimeoutError, WebSocketDisconnect, json.JSONDecodeError):
            pass

        if cancelled:
            break

        logs.append(f"[+] Parallel group {group_index}: {', '.join(group)}")
        runnable: list[WorkflowNode] = []

        for node_id in group:
            blocked_parents = [pid for pid in parents_by_node.get(node_id, []) if node_states.get(pid) != "success"]
            if blocked_parents:
                node_states[node_id] = "blocked"
                node_results[node_id] = {
                    "node_id": node_id,
                    "status": "blocked",
                    "command": [],
                    "exit_code": None,
                    "artifact_paths": [],
                    "outputs": {},
                    "stdout_preview": "",
                    "stderr_preview": "",
                    "stdout_path": "",
                    "stderr_path": "",
                    "logs": [f"[-] Node {node_id} blocked by: {', '.join(blocked_parents)}"],
                }
                logs.extend(node_results[node_id]["logs"])
                try:
                    await websocket.send_json(
                        {
                            "type": "node_finished",
                            "run_id": run_id,
                            "node_id": node_id,
                            "status": "blocked",
                            "result": node_results[node_id],
                        }
                    )
                except WebSocketDisconnect:
                    cancelled = True
                    break
                continue
            node_states[node_id] = "running"
            runnable.append(nodes_by_id[node_id])
            try:
                await websocket.send_json({"type": "node_started", "run_id": run_id, "node_id": node_id})
            except WebSocketDisconnect:
                cancelled = True
                break

        if cancelled or not runnable:
            continue

        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=min(max_workers, len(runnable))) as executor:
            futures = {
                loop.run_in_executor(
                    executor,
                    execute_node,
                    run_id,
                    node,
                    tools_by_id,
                    incoming_edges_by_target.get(node.id, []),
                    output_values,
                    run_dir,
                ): node.id
                for node in runnable
            }
            for coro in asyncio.as_completed(futures):
                result = await coro
                nid = result["node_id"]
                node_states[nid] = result["status"]
                node_results[nid] = result
                if result["status"] == "success":
                    output_values[nid] = result.get("outputs", {})
                logs.extend(result.get("logs", []))
                try:
                    await websocket.send_json(
                        {
                            "type": "node_finished",
                            "run_id": run_id,
                            "node_id": nid,
                            "status": result["status"],
                            "result": result,
                        }
                    )
                except WebSocketDisconnect:
                    cancelled = True
                    break

    if cancelled:
        for nid, state in node_states.items():
            if state in ("queued", "running"):
                node_states[nid] = "cancelled"
        overall_status = "cancelled"
    else:
        overall_status = "completed" if all(s == "success" for s in node_states.values()) else "failed"

    run_record = {
        "id": run_id,
        "workflow_id": payload.workflow_id,
        "name": payload.name,
        "status": overall_status,
        "created_at": datetime.now(UTC).isoformat(),
        "graph": graph.model_dump(),
        "parallel_groups": validation["parallel_groups"],
        "node_states": node_states,
        "node_results": node_results,
        "artifact_root": str(run_dir),
        "replays": [],
        "logs": logs,
    }

    persist_run_record(run_record)
    write_text(run_dir / "run.json", json.dumps(run_record, indent=2))
    _active_runs.pop(run_id, None)

    try:
        await websocket.send_json(
            {"type": "run_finished", "run_id": run_id, "status": overall_status, "run": run_record}
        )
    except WebSocketDisconnect:
        pass

    try:
        await websocket.close()
    except Exception:
        pass


# ── Workflow Scheduling ──────────────────────────────────────────────────────


class SchedulePayload(BaseModel):
    workflow_id: str
    name: str = "Scheduled Run"
    cron: str = "0 * * * *"
    max_parallel: int = 2
    enabled: bool = True


def load_schedules() -> list[dict[str, Any]]:
    return db.list_schedules()


def save_schedules(schedules: list[dict[str, Any]]) -> None:
    db.save_schedules(schedules)


def execute_scheduled_run(schedule: dict[str, Any]) -> None:
    """Execute a workflow run from a schedule (called by APScheduler)."""
    workflow_id = schedule.get("workflow_id")
    if not workflow_id:
        return
    stored = next((item for item in workflow_records() if item["id"] == workflow_id), None)
    if not stored or "graph" not in stored:
        return
    payload = RunPayload(
        workflow_id=workflow_id,
        name=schedule.get("name", "Scheduled Run"),
        workflow=WorkflowGraph(**stored["graph"]),
        max_parallel=schedule.get("max_parallel", 2),
    )
    run_workflow(payload)


try:
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    _scheduler = BackgroundScheduler()
    _scheduler.start()
    _scheduler_available = True
except ImportError:
    _scheduler = None
    _scheduler_available = False


def _sync_scheduler_jobs() -> None:
    if not _scheduler_available or not _scheduler:
        return
    # Remove all existing jobs and re-add from schedules
    for job in _scheduler.get_jobs():
        job.remove()
    for schedule in load_schedules():
        if schedule.get("enabled", True):
            try:
                _scheduler.add_job(
                    execute_scheduled_run,
                    trigger=CronTrigger.from_crontab(schedule["cron"]),
                    args=[schedule],
                    id=schedule["id"],
                    replace_existing=True,
                )
            except Exception:
                pass


@app.get("/api/schedules")
def list_schedules() -> list[dict[str, Any]]:
    return load_schedules()


@app.post("/api/schedules")
def create_schedule(payload: SchedulePayload) -> dict[str, Any]:
    schedules = load_schedules()
    schedule_id = f"sched-{uuid4().hex[:10]}"
    item = {
        "id": schedule_id,
        "workflow_id": payload.workflow_id,
        "name": payload.name,
        "cron": payload.cron,
        "max_parallel": payload.max_parallel,
        "enabled": payload.enabled,
        "created_at": datetime.now(UTC).isoformat(),
    }
    schedules.insert(0, item)
    save_schedules(schedules)
    _sync_scheduler_jobs()
    return item


@app.delete("/api/schedules/{schedule_id}")
def delete_schedule(schedule_id: str) -> dict[str, Any]:
    schedules = load_schedules()
    before = len(schedules)
    schedules = [s for s in schedules if s.get("id") != schedule_id]
    if len(schedules) == before:
        return {"ok": False, "error": "Schedule not found"}
    save_schedules(schedules)
    _sync_scheduler_jobs()
    return {"ok": True, "deleted": schedule_id}


@app.patch("/api/schedules/{schedule_id}")
def toggle_schedule(schedule_id: str) -> dict[str, Any]:
    schedules = load_schedules()
    for s in schedules:
        if s.get("id") == schedule_id:
            s["enabled"] = not s.get("enabled", True)
            save_schedules(schedules)
            _sync_scheduler_jobs()
            return s
    return {"ok": False, "error": "Schedule not found"}


# ── Parameter Presets ──────────────────────────────────────────────────────────


class PresetPayload(BaseModel):
    tool_id: str
    name: str
    params: dict[str, str] = Field(default_factory=dict)


def load_presets() -> list[dict[str, Any]]:
    return db.list_presets()


def save_presets(presets: list[dict[str, Any]]) -> None:
    db.save_presets(presets)


@app.get("/api/presets")
def list_presets(tool_id: str | None = None) -> list[dict[str, Any]]:
    presets = load_presets()
    if tool_id:
        return [p for p in presets if p.get("tool_id") == tool_id]
    return presets


@app.post("/api/presets")
def create_preset(payload: PresetPayload) -> dict[str, Any]:
    presets = load_presets()
    preset_id = f"preset-{uuid4().hex[:10]}"
    item = {
        "id": preset_id,
        "tool_id": payload.tool_id,
        "name": payload.name,
        "params": payload.params,
        "created_at": datetime.now(UTC).isoformat(),
    }
    presets.insert(0, item)
    save_presets(presets)
    return item


@app.delete("/api/presets/{preset_id}")
def delete_preset(preset_id: str) -> dict[str, Any]:
    presets = load_presets()
    before = len(presets)
    presets = [p for p in presets if p.get("id") != preset_id]
    if len(presets) == before:
        return {"ok": False, "error": "Preset not found"}
    save_presets(presets)
    return {"ok": True, "deleted": preset_id}


# ── AI-Assisted Workflow Generation ────────────────────────────────────────────


class GeneratePayload(BaseModel):
    prompt: str
    scope: str = ""


def _collect_env_vars_from_profiles() -> dict[str, str]:
    """Merge ``env_vars`` from every stored profile into a single dict.

    Profiles earlier in the list win on conflict (matches the UI's
    "active profile first" ordering). Used to source ``ANTHROPIC_API_KEY``
    for the LLM-backed generator when the env var is not set. Sensitive
    keys live in the OS keychain via :mod:`secrets_store`; this function
    hydrates them per-profile before merging so the LLM call sees real
    values, never the ``SENTINEL`` placeholder.
    """
    merged: dict[str, str] = {}
    try:
        profiles = load_profiles()
    except Exception:
        return merged
    for p in profiles:
        env = p.get("env_vars") or {}
        if not isinstance(env, dict):
            continue
        hydrated = secrets_store.hydrate_env_vars(p.get("id", ""), env)
        for k, v in hydrated.items():
            if k not in merged and isinstance(v, str) and v:
                merged[k] = v
    return merged


@app.post("/api/generate")
def generate_workflow(payload: GeneratePayload) -> dict[str, Any]:
    """Generate a workflow from a natural language description.

    Tries the Anthropic-backed generator first (see ``llm.py``). If the SDK
    or API key is missing, or Claude returns an invalid workflow after a
    retry, falls back to the legacy keyword-matcher implementation. The
    response includes a ``source`` field of ``'claude'`` or ``'fallback'``
    so the UI can show which path produced the graph.
    """
    tools = load_tools()

    # Try LLM first.
    try:
        env_vars = _collect_env_vars_from_profiles()
        llm_result = llm.generate_workflow_via_claude(payload.prompt, payload.scope.strip(), tools, env_vars)
        # Validate through the same pydantic schema used by the save endpoint.
        try:
            WorkflowGraph(**llm_result["graph"])
        except Exception as e:  # noqa: BLE001
            raise llm.LLMGenerationError(f"schema validation failed: {e}")
        return {
            "ok": True,
            "name": llm_result["name"],
            "graph": llm_result["graph"],
            "description": llm_result["description"],
            "source": "claude",
        }
    except llm.LLMNotAvailable as e:
        fallback_reason = f"llm unavailable: {e}"
    except llm.LLMGenerationError as e:
        fallback_reason = f"llm generation failed: {e}"
    except Exception as e:  # noqa: BLE001
        fallback_reason = f"llm error: {e}"

    result = _generate_workflow_via_keywords(payload, tools)
    result["source"] = "fallback"
    result["fallback_reason"] = fallback_reason
    return result


def _generate_workflow_via_keywords(payload: GeneratePayload, tools: list[Tool]) -> dict[str, Any]:
    """Legacy keyword-based workflow generator (fallback path).

    Retained for offline operation and as a hard fallback when the LLM path
    fails. Identical behaviour to the pre-LLM implementation.
    """
    prompt = payload.prompt.lower()
    scope = payload.scope.strip()

    tools_by_id = {t.id: t for t in tools}

    # Pattern matching for workflow generation
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    x_pos = 80
    y_pos = 120
    node_counter = 0

    def add_node(
        kind: str,
        label: str,
        tool_id: str | None = None,
        variable_type: str | None = None,
        value: str | None = None,
        **kwargs: Any,
    ) -> str:
        nonlocal node_counter, x_pos
        node_counter += 1
        nid = f"{kind}-{node_counter}"
        node = {
            "id": nid,
            "kind": kind,
            "label": label,
            "tool_id": tool_id,
            "variable_type": variable_type,
            "value": value,
            "params": {},
            "position": {"x": x_pos, "y": y_pos},
        }
        node.update(kwargs)
        nodes.append(node)
        x_pos += 280
        return nid

    def connect(source: str, target: str, source_handle: str, target_handle: str) -> None:
        edges.append(
            {
                "id": f"edge-{len(edges) + 1}",
                "source": source,
                "target": target,
                "source_handle": f"out:{source_handle}",
                "target_handle": f"in:{target_handle}",
            }
        )

    # Detect intent and build workflow
    has_recon = any(k in prompt for k in ["recon", "subdomain", "enumerate", "discover", "asset"])
    has_vuln = any(k in prompt for k in ["vuln", "scan", "nuclei", "security", "exploit"])
    has_fuzz = any(k in prompt for k in ["fuzz", "brute", "directory", "dir", "ffuf", "gobuster"])
    has_crawl = any(k in prompt for k in ["crawl", "spider", "url", "endpoint", "katana", "gau"])
    has_port = any(k in prompt for k in ["port", "nmap", "naabu", "service", "masscan"])
    has_osint = any(k in prompt for k in ["osint", "harvest", "shodan", "censys", "intel"])
    has_full = any(k in prompt for k in ["full", "complete", "comprehensive", "everything", "all"])

    if has_full:
        has_recon = has_vuln = has_crawl = True

    # Always start with an input
    input_type = "domain"
    if any(k in prompt for k in ["url list", "target list", "ip list"]):
        input_type = "targets"

    var_id = add_node("variable", "Target Input", variable_type=input_type, value=scope or "")

    last_id = var_id
    last_output = input_type

    if has_recon:
        # Subdomain enumeration
        if "subfinder" in tools_by_id:
            sid = add_node("tool", "Subfinder", tool_id="subfinder")
            connect(last_id, sid, last_output, "domain" if last_output == "domain" else "targets")
            last_id = sid
            last_output = "targets"

        # HTTP probing
        if "httpx" in tools_by_id:
            hid = add_node("tool", "HTTPX", tool_id="httpx")
            connect(last_id, hid, last_output, "targets")
            last_id = hid
            last_output = "targets"

    if has_port:
        if "naabu" in tools_by_id:
            pid = add_node("tool", "Naabu", tool_id="naabu")
            connect(last_id, pid, last_output, "targets")
            last_id = pid
            last_output = "targets"

    if has_crawl:
        y_pos_saved = y_pos
        if "katana" in tools_by_id:
            kid = add_node("tool", "Katana", tool_id="katana")
            connect(last_id, kid, last_output, "targets")
            last_id = kid
            last_output = "targets"
        y_pos = y_pos_saved

    if has_fuzz:
        if "ffuf" in tools_by_id:
            fid = add_node("tool", "FFUF", tool_id="ffuf")
            connect(last_id, fid, last_output, "targets")
            last_id = fid
            last_output = "targets"

    if has_osint:
        if "theHarvester" in tools_by_id:
            oid = add_node("tool", "theHarvester", tool_id="theHarvester")
            connect(last_id, oid, last_output, "domain" if last_output == "domain" else "targets")
            last_id = oid
            last_output = "targets"

    if has_vuln:
        if "nuclei" in tools_by_id:
            nid = add_node("tool", "Nuclei", tool_id="nuclei")
            connect(last_id, nid, last_output, "targets")
            last_id = nid
            last_output = "findings"

    # Always end with output
    out_id = add_node("output", "Artifacts")
    connect(last_id, out_id, last_output, "any")

    # Generate a name
    parts = []
    if has_recon:
        parts.append("Recon")
    if has_port:
        parts.append("Port Scan")
    if has_crawl:
        parts.append("Crawl")
    if has_fuzz:
        parts.append("Fuzz")
    if has_osint:
        parts.append("OSINT")
    if has_vuln:
        parts.append("Vuln Scan")
    name = " + ".join(parts) if parts else "Generated Workflow"
    if scope:
        name += f" ({scope})"

    return {
        "ok": True,
        "name": name,
        "graph": {"nodes": nodes, "edges": edges},
        "description": f'Auto-generated workflow with {len(nodes)} nodes based on: "{payload.prompt}"',
    }


# Sync scheduler on startup
_sync_scheduler_jobs()


# ── Tool Health / Bootstrap Manager ────────────────────────────────────────────


@app.get("/api/tools/health")
def tools_health() -> dict[str, Any]:
    """Check which tools are installed and available on PATH."""
    tools = load_tools()
    results: list[dict[str, Any]] = []
    for tool in tools:
        binary = tool.command[0] if tool.command else None
        if not binary:
            results.append(
                {
                    "id": tool.id,
                    "name": tool.name,
                    "binary": None,
                    "installed": False,
                    "path": None,
                    "hint": "No command configured",
                }
            )
            continue
        # Check if binary exists on PATH
        import shutil as _shutil

        found = _shutil.which(binary)
        hint = ""
        if not found:
            # Provide install hints for common tools
            hint = _get_install_hint(binary)
        results.append(
            {
                "id": tool.id,
                "name": tool.name,
                "category": tool.category,
                "binary": binary,
                "installed": found is not None,
                "path": found,
                "hint": hint,
            }
        )
    installed = sum(1 for r in results if r["installed"])
    return {
        "ok": True,
        "total": len(results),
        "installed": installed,
        "missing": len(results) - installed,
        "tools": results,
    }


# Install hints keyed on the tool's *binary name* (first token of ``tool.command``),
# not on its ``tool_id``. A few tools have mixed-case binaries (``theHarvester``,
# ``SecretFinder``) or differ from their id entirely (``kr`` for kiterunner,
# ``cloud_enum`` for cloudenum) — matching on the binary keeps those accurate.
INSTALL_HINTS: dict[str, str] = {
    "subfinder": "go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest",
    "httpx": "go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest",
    "nuclei": "go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest",
    "naabu": "go install -v github.com/projectdiscovery/naabu/v2/cmd/naabu@latest",
    "katana": "go install -v github.com/projectdiscovery/katana/cmd/katana@latest",
    "dnsx": "go install -v github.com/projectdiscovery/dnsx/cmd/dnsx@latest",
    "ffuf": "go install -v github.com/ffuf/ffuf/v2@latest",
    "amass": "go install -v github.com/owasp-amass/amass/v4/...@master",
    "assetfinder": "go install -v github.com/tomnomnom/assetfinder@latest",
    "gau": "go install -v github.com/lc/gau/v2/cmd/gau@latest",
    "waybackurls": "go install -v github.com/tomnomnom/waybackurls@latest",
    "gospider": "go install -v github.com/jaeles-project/gospider@latest",
    "hakrawler": "go install -v github.com/hakluke/hakrawler@latest",
    "anew": "go install -v github.com/tomnomnom/anew@latest",
    "unfurl": "go install -v github.com/tomnomnom/unfurl@latest",
    "qsreplace": "go install -v github.com/tomnomnom/qsreplace@latest",
    "uro": "pip install uro",
    "dalfox": "go install -v github.com/hahwul/dalfox/v2@latest",
    "arjun": "pip install arjun",
    "sqlmap": "pip install sqlmap",
    "feroxbuster": "curl -sL https://raw.githubusercontent.com/epi052/feroxbuster/main/install-nix.sh | bash",
    "gobuster": "go install github.com/OJ/gobuster/v3@latest",
    "dirsearch": "pip install dirsearch",
    "nmap": "apt install nmap  # or brew install nmap",
    "masscan": "apt install masscan  # or brew install masscan",
    "rustscan": "cargo install rustscan",
    "jq": "apt install jq  # or brew install jq",
    "wfuzz": "pip install wfuzz",
    "massdns": "apt install massdns  # or build from github.com/blechschmidt/massdns",
    "shuffledns": "go install -v github.com/projectdiscovery/shuffledns/cmd/shuffledns@latest",
    "testssl.sh": "git clone https://github.com/drwetter/testssl.sh.git",
    "theHarvester": "pip install theHarvester",
    "spiderfoot": "pip install spiderfoot",
    "shodan": "pip install shodan",
    "censys": "pip install censys",
    "nikto": "apt install nikto  # or brew install nikto",
    "wpscan": "gem install wpscan  # or apt install wpscan",
    "xsstrike": "pip install XSStrike",
    "commix": "pip install commix",
    "wappalyzer": "npm install -g wappalyzer",
    "linkfinder": "pip install linkfinder",
    "waymore": "pip install waymore",
    # Parameter Discovery
    "paramspider": "pip install paramspider",
    "x8": "cargo install x8",
    "paraminer": "pip install paraminer",
    # API Testing
    "kr": "go install github.com/assetnote/kiterunner/cmd/kr@latest",
    "APIFuzzer": "pip install APIFuzzer",
    "oasdiff": "go install github.com/tufin/oasdiff@latest",
    "restler": "pip install restler-fuzzer  # or download from github.com/microsoft/restler-fuzzer",
    # SSRF / OOB
    "ssrfmap": "pip install ssrfmap",
    "gopherus": "pip install gopherus",
    "interactsh-client": "go install -v github.com/projectdiscovery/interactsh/cmd/interactsh-client@latest",
    "ssrf-sheriff": "pip install ssrf-sheriff",
    # SSTI
    "sstimap": "pip install sstimap",
    "tplmap": "pip install tplmap",
    # CSRF / CORS
    "xsrfprobe": "pip install xsrfprobe",
    "cors_scan": "pip install CORScanner",
    "crlfuzz": "go install github.com/dwisiswant0/crlfuzz/cmd/crlfuzz@latest",
    # Subdomain Takeover
    "subjack": "go install github.com/haccer/subjack@latest",
    "subzy": "go install -v github.com/PentestPad/subzy@latest",
    # Headers
    "shcheck": "pip install shcheck",
    "hakcheckurl": "go install github.com/hakluke/hakcheckurl@latest",
    # JS Analysis
    "SecretFinder": "pip install SecretFinder",
    "getJS": "go install github.com/003random/getJS/v2@latest",
    "subjs": "go install -v github.com/lc/subjs@latest",
    # Wordlist
    "cewl": "gem install cewl  # or apt install cewl",
    "wordlister": "pip install wordlister",
    # Cloud / Buckets
    "s3scanner": "pip install s3scanner",
    "cloud_enum": "pip install cloud_enum",
    # Secrets
    "trufflehog": "go install github.com/trufflesecurity/trufflehog/v3@latest",
    "gitleaks": "go install github.com/gitleaks/gitleaks/v8@latest",
    # Utility
    "gf": "go install -v github.com/tomnomnom/gf@latest",
    "interlace": "pip install interlace",
    "rush": "go install github.com/shenwei356/rush@latest",
    "notify": "go install -v github.com/projectdiscovery/notify/cmd/notify@latest",
    "meg": "go install github.com/tomnomnom/meg@latest",
    "chaos": "go install -v github.com/projectdiscovery/chaos-client/cmd/chaos@latest",
    "findomain": "curl -LO https://github.com/Findomain/Findomain/releases/latest/download/findomain-linux.zip && unzip findomain-linux.zip",
}


def _get_install_hint(binary: str) -> str:
    """Return an install hint for ``binary`` or a generic fallback."""
    return INSTALL_HINTS.get(binary, f"Install {binary} and ensure it is on your PATH")


def _generate_install_script() -> str:
    """Build a bash installer script covering every tool in ``tools.yaml``.

    Each tool becomes a block guarded by ``command -v`` so the script is
    idempotent: tools already on the PATH are skipped. Unknown binaries fall
    through to a ``# TODO`` stub so the operator can fill them in manually.
    """
    tools = load_tools()
    lines: list[str] = [
        "#!/usr/bin/env bash",
        "#",
        "# install-tools.sh — bootstrap the 75+ binaries mini-tricky drives.",
        "#",
        "# Generated from backend/src/main.py::_generate_install_script. Re-generate with:",
        "#   curl -s http://localhost:5000/api/tools/install-script > scripts/install-tools.sh",
        "#",
        "# Idempotent: each tool is guarded by `command -v`, so re-running only",
        "# installs what is still missing. Requires go, python/pip, cargo, npm, and",
        "# apt or brew on the host.",
        "#",
        "set -euo pipefail",
        "",
        'log() { printf "\\033[1;36m[install-tools]\\033[0m %s\\n" "$*"; }',
        'skip() { printf "\\033[2m[install-tools] %s already installed at %s\\033[0m\\n" "$1" "$2"; }',
        "",
    ]

    seen: set[str] = set()
    missing: list[str] = []
    # Group by category so the generated script reads top-down by domain.
    by_category: dict[str, list[Tool]] = {}
    for tool in tools:
        by_category.setdefault(tool.category or "Other", []).append(tool)

    for category in sorted(by_category):
        lines.append(f"# ── {category} " + "─" * max(1, 60 - len(category)))
        for tool in by_category[category]:
            binary = tool.command[0] if tool.command else ""
            if not binary or binary in seen:
                continue
            seen.add(binary)
            hint = INSTALL_HINTS.get(binary)
            if not hint:
                missing.append(binary)
                lines.append(f"# TODO: no install hint for {tool.name} ({binary})")
                lines.append("")
                continue
            # Shell-safe single-quoted binary; hint is emitted verbatim so users
            # can eyeball the command before running the script.
            lines.append(f"if command -v {binary} >/dev/null 2>&1; then")
            lines.append(f'  skip "{tool.name}" "$(command -v {binary})"')
            lines.append("else")
            lines.append(f'  log "Installing {tool.name} ({binary})"')
            lines.append(f"  {hint}")
            lines.append("fi")
            lines.append("")

    lines.append("log \"All done. Run 'npm run dev' or launch the desktop app.\"")
    if missing:
        lines.append("")
        lines.append(f"# Note: {len(missing)} tools have no install hint yet: " + ", ".join(missing))
    lines.append("")
    return "\n".join(lines)


@app.get("/api/tools/install-script")
def tools_install_script() -> PlainTextResponse:
    """Return a bash script that installs every tool in ``tools.yaml``."""
    script = _generate_install_script()
    return PlainTextResponse(
        content=script,
        media_type="text/x-shellscript",
        headers={"Content-Disposition": 'attachment; filename="install-tools.sh"'},
    )


# ── Environment Profiles ──────────────────────────────────────────────────────


class ProfilePayload(BaseModel):
    name: str
    description: str = ""
    tool_overrides: dict[str, dict[str, str]] = Field(default_factory=dict)
    env_vars: dict[str, str] = Field(default_factory=dict)


def load_profiles() -> list[dict[str, Any]]:
    return db.list_profiles()


def save_profiles(profiles: list[dict[str, Any]]) -> None:
    db.save_profiles(profiles)


def _profile_for_api(profile: dict[str, Any]) -> dict[str, Any]:
    """Return a profile safe to send to the frontend.

    Sensitive env_vars are stored as ``secrets_store.SENTINEL`` in the DB;
    we hand the UI a bullet-mask so users can tell "a key is set" without
    ever seeing the real value cross the wire.
    """
    view = dict(profile)
    env = view.get("env_vars") or {}
    if isinstance(env, dict):
        view["env_vars"] = secrets_store.mask_env_vars(env)
    return view


@app.get("/api/profiles")
def list_profiles() -> list[dict[str, Any]]:
    return [_profile_for_api(p) for p in load_profiles()]


@app.post("/api/profiles")
def create_profile(payload: ProfilePayload) -> dict[str, Any]:
    profiles = load_profiles()
    profile_id = f"prof-{uuid4().hex[:10]}"
    env_for_db = secrets_store.split_env_vars(profile_id, payload.env_vars, existing=None)
    item = {
        "id": profile_id,
        "name": payload.name,
        "description": payload.description,
        "tool_overrides": payload.tool_overrides,
        "env_vars": env_for_db,
        "created_at": datetime.now(UTC).isoformat(),
    }
    profiles.insert(0, item)
    save_profiles(profiles)
    return _profile_for_api(item)


@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: str) -> dict[str, Any]:
    profiles = load_profiles()
    before = len(profiles)
    profiles = [p for p in profiles if p.get("id") != profile_id]
    if len(profiles) == before:
        return {"ok": False, "error": "Profile not found"}
    save_profiles(profiles)
    # Purge any keyring entries this profile owned so secrets don't outlive
    # the profile record they belonged to.
    removed = secrets_store.delete_profile_secrets(profile_id)
    return {"ok": True, "deleted": profile_id, "secrets_removed": removed}


@app.put("/api/profiles/{profile_id}")
def update_profile(profile_id: str, payload: ProfilePayload) -> dict[str, Any]:
    profiles = load_profiles()
    for p in profiles:
        if p.get("id") == profile_id:
            env_for_db = secrets_store.split_env_vars(
                profile_id,
                payload.env_vars,
                existing=p.get("env_vars") or {},
            )
            p["name"] = payload.name
            p["description"] = payload.description
            p["tool_overrides"] = payload.tool_overrides
            p["env_vars"] = env_for_db
            p["updated_at"] = datetime.now(UTC).isoformat()
            save_profiles(profiles)
            return _profile_for_api(p)
    return {"ok": False, "error": "Profile not found"}


# ── Result Normalization ──────────────────────────────────────────────────────


@app.get("/api/runs/{run_id}/normalized")
def get_normalized_results(run_id: str) -> dict[str, Any]:
    """Return normalized results across all nodes in a run."""
    run = find_run(run_id)
    if not run:
        return {"ok": False, "error": f"Run {run_id} not found"}

    normalized: list[dict[str, Any]] = []
    summary = {"total_items": 0, "by_type": {}, "by_node": {}, "by_severity": {}}

    for node_id, result in (run.get("node_results") or {}).items():
        if result.get("status") != "success":
            continue
        stdout = result.get("stdout_preview", "")
        if not stdout:
            continue

        lines = [l.strip() for l in stdout.strip().split("\n") if l.strip()]
        node_type = _classify_output(node_id, result, lines)

        for line in lines:
            if line.startswith("[") or line.startswith("#"):
                continue  # skip log lines
            item = _normalize_line(line, node_id, node_type)
            if item:
                normalized.append(item)
                summary["total_items"] += 1
                summary["by_type"][item["type"]] = summary["by_type"].get(item["type"], 0) + 1
                summary["by_node"][node_id] = summary["by_node"].get(node_id, 0) + 1
                if item.get("severity"):
                    summary["by_severity"][item["severity"]] = summary["by_severity"].get(item["severity"], 0) + 1

    return {
        "ok": True,
        "run_id": run_id,
        "summary": summary,
        "items": normalized,
    }


def _classify_output(node_id: str, result: dict[str, Any], lines: list[str]) -> str:
    """Guess the type of output based on content patterns."""
    cmd = " ".join(result.get("command", []))
    if "nuclei" in cmd:
        return "vulnerability"
    if "subfinder" in cmd or "amass" in cmd or "assetfinder" in cmd:
        return "subdomain"
    if "httpx" in cmd:
        return "live_host"
    if "naabu" in cmd or "nmap" in cmd or "masscan" in cmd:
        return "port"
    if "ffuf" in cmd or "gobuster" in cmd or "feroxbuster" in cmd:
        return "directory"
    if "katana" in cmd or "gau" in cmd or "waybackurls" in cmd:
        return "url"
    if any(":" in l and "//" in l for l in lines[:5]):
        return "url"
    return "raw"


def _normalize_line(line: str, node_id: str, node_type: str) -> dict[str, Any] | None:
    """Normalize a single output line into a structured item."""
    if not line or len(line) < 3:
        return None

    item: dict[str, Any] = {"node_id": node_id, "type": node_type, "raw": line}

    if node_type == "vulnerability":
        # Nuclei output: [template-id] [protocol] [severity] url
        import re

        m = re.match(r"\[([^\]]+)\]\s*\[([^\]]*)\]\s*\[([^\]]*)\]\s*(.*)", line)
        if m:
            item["template"] = m.group(1)
            item["protocol"] = m.group(2)
            item["severity"] = m.group(3).lower()
            item["target"] = m.group(4).strip()
        else:
            item["target"] = line
    elif node_type == "subdomain":
        item["subdomain"] = line
        item["target"] = line
    elif node_type == "live_host":
        item["url"] = line
        item["target"] = line
    elif node_type == "port":
        # Could be "host:port" format
        if ":" in line:
            parts = line.rsplit(":", 1)
            item["host"] = parts[0]
            item["port"] = parts[1] if len(parts) > 1 else ""
        item["target"] = line
    elif node_type == "url":
        item["url"] = line
        item["target"] = line
    elif node_type == "directory":
        item["path"] = line
        item["target"] = line
    else:
        item["target"] = line

    return item


# ── Report Export ─────────────────────────────────────────────────────────────


@app.get("/api/runs/{run_id}/report")
def export_report(run_id: str, fmt: str = Query("markdown")) -> Any:
    """Export a run as a Markdown or text report."""
    run = find_run(run_id)
    if not run:
        return {"ok": False, "error": f"Run {run_id} not found"}

    # Get normalized results
    normalized_resp = get_normalized_results(run_id)
    normalized = normalized_resp.get("items", []) if normalized_resp.get("ok") else []
    summary = normalized_resp.get("summary", {})

    report = _generate_markdown_report(run, normalized, summary)

    if fmt == "markdown":
        report_path = ARTIFACTS_DIR / run_id / "report.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(report, encoding="utf-8")
        return FileResponse(path=report_path, filename=f"{run['name']}-report.md", media_type="text/markdown")

    # Default: return as JSON with the markdown content
    return {"ok": True, "format": fmt, "content": report}


def _generate_markdown_report(run: dict[str, Any], normalized: list[dict[str, Any]], summary: dict[str, Any]) -> str:
    """Generate a Markdown report from run results."""
    lines: list[str] = []
    name = run.get("name", "Unnamed Run")
    status = run.get("status", "unknown")
    created = run.get("created_at", "")

    lines.append(f"# {name}")
    lines.append("")
    lines.append(f"**Status:** {status}  ")
    lines.append(f"**Run ID:** `{run.get('id', '')}`  ")
    lines.append(f"**Created:** {created}  ")
    lines.append(f"**Nodes:** {len(run.get('node_states', {}))}  ")
    lines.append("")

    # Summary
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Total items found:** {summary.get('total_items', 0)}")
    if summary.get("by_type"):
        lines.append("- **By type:**")
        for t, count in sorted(summary["by_type"].items()):
            lines.append(f"  - {t}: {count}")
    if summary.get("by_severity"):
        lines.append("- **By severity:**")
        for s, count in sorted(
            summary["by_severity"].items(),
            key=lambda x: {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}.get(x[0], 5),
        ):
            lines.append(f"  - {s}: {count}")
    lines.append("")

    # Node results
    lines.append("## Node Results")
    lines.append("")
    lines.append("| Node | Status | Exit Code |")
    lines.append("|------|--------|-----------|")
    for node_id, result in (run.get("node_results") or {}).items():
        exit_code = result.get("exit_code", "N/A")
        lines.append(f"| {node_id} | {result.get('status', 'unknown')} | {exit_code} |")
    lines.append("")

    # Findings by type
    if normalized:
        by_type: dict[str, list[dict[str, Any]]] = {}
        for item in normalized:
            by_type.setdefault(item["type"], []).append(item)

        for item_type, items in sorted(by_type.items()):
            lines.append(f"## {item_type.replace('_', ' ').title()} ({len(items)})")
            lines.append("")

            if item_type == "vulnerability":
                lines.append("| Severity | Template | Target |")
                lines.append("|----------|----------|--------|")
                for item in items:
                    sev = item.get("severity", "unknown")
                    tpl = item.get("template", "")
                    tgt = item.get("target", "")
                    lines.append(f"| {sev} | {tpl} | {tgt} |")
            elif item_type == "subdomain":
                lines.append("```")
                for item in items:
                    lines.append(item.get("subdomain", item.get("raw", "")))
                lines.append("```")
            elif item_type == "port":
                lines.append("| Host | Port |")
                lines.append("|------|------|")
                for item in items:
                    lines.append(f"| {item.get('host', '')} | {item.get('port', '')} |")
            else:
                lines.append("```")
                for item in items[:100]:  # Limit to 100 items
                    lines.append(item.get("target", item.get("raw", "")))
                if len(items) > 100:
                    lines.append(f"... and {len(items) - 100} more")
                lines.append("```")
            lines.append("")

    # Logs
    lines.append("## Execution Logs")
    lines.append("")
    lines.append("```")
    for log in run.get("logs", []):
        lines.append(log)
    lines.append("```")
    lines.append("")
    lines.append("---")
    lines.append(f"*Generated by mini-tricky on {datetime.now(UTC).isoformat()}*")

    return "\n".join(lines)

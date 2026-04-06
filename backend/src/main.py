from __future__ import annotations

import base64
import json
import mimetypes
import subprocess
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_FILE = BASE_DIR / 'tools.yaml'
STATE_DIR = BASE_DIR / 'state'
WORKFLOWS_FILE = STATE_DIR / 'workflows.json'
RUNS_FILE = STATE_DIR / 'runs.json'
ARTIFACTS_DIR = STATE_DIR / 'artifacts'

TEXT_SUFFIXES = {
    '.txt', '.log', '.md', '.csv', '.xml', '.yaml', '.yml',
    '.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.sh',
    '.zsh', '.bash', '.ini', '.cfg', '.conf', '.toml',
}
IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'}


class Tool(BaseModel):
    id: str
    name: str
    category: str
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    command: list[str] = Field(default_factory=list)
    output_mode: str = 'stdout'
    timeout_seconds: int = 300


class WorkflowNode(BaseModel):
    id: str
    kind: str = 'tool'
    label: str
    tool_id: str | None = None
    variable_type: str | None = None
    value: str | None = None
    params: dict[str, str] = Field(default_factory=dict)
    position: dict[str, float] | None = None


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
    name: str = 'Queued Run'
    workflow: WorkflowGraph | None = None
    max_parallel: int = 2


app = FastAPI(title='mini-tricky API', version='0.5.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def ensure_state() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    if not WORKFLOWS_FILE.exists():
        WORKFLOWS_FILE.write_text('[]')
    if not RUNS_FILE.exists():
        RUNS_FILE.write_text('[]')


def read_json(path: Path) -> list[dict[str, Any]]:
    ensure_state()
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return []


def write_json(path: Path, data: list[dict[str, Any]]) -> None:
    ensure_state()
    path.write_text(json.dumps(data, indent=2))


def load_tools() -> list[Tool]:
    if not TOOLS_FILE.exists():
        return []
    data = yaml.safe_load(TOOLS_FILE.read_text()) or {}
    return [Tool(**item) for item in data.get('tools', [])]


def node_contract(node: WorkflowNode, tools_by_id: dict[str, Tool]) -> tuple[list[str], list[str]]:
    if node.kind == 'tool':
        if not node.tool_id or node.tool_id not in tools_by_id:
            raise ValueError(f'Node {node.id} references an unknown tool.')
        tool = tools_by_id[node.tool_id]
        return tool.inputs, tool.outputs
    if node.kind == 'variable':
        return [], [node.variable_type or 'targets']
    if node.kind == 'output':
        return ['any'], []
    raise ValueError(f'Unknown node kind: {node.kind}')


def build_graph_indexes(graph: WorkflowGraph) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[WorkflowEdge]]]:
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
            return {'ok': False, 'error': f'Unknown node in edge {edge.source} -> {edge.target}'}
        if edge.source == edge.target:
            return {'ok': False, 'error': f'Self-loop detected on {edge.source}'}
        if not edge.source_handle or not edge.target_handle:
            return {'ok': False, 'error': f'Edge {edge.source} -> {edge.target} is missing handle metadata'}
        if not edge.source_handle.startswith('out:') or not edge.target_handle.startswith('in:'):
            return {'ok': False, 'error': f'Invalid socket direction on edge {edge.source} -> {edge.target}'}

        source_node = nodes_by_id[edge.source]
        target_node = nodes_by_id[edge.target]

        try:
            _, source_outputs = node_contract(source_node, tools_by_id)
            target_inputs, _ = node_contract(target_node, tools_by_id)
        except ValueError as exc:
            return {'ok': False, 'error': str(exc)}

        source_type = edge.source_handle.removeprefix('out:')
        target_type = edge.target_handle.removeprefix('in:')

        if source_type not in source_outputs:
            return {'ok': False, 'error': f'Node {source_node.id} does not expose output socket {source_type}'}
        if target_type not in target_inputs:
            return {'ok': False, 'error': f'Node {target_node.id} does not expose input socket {target_type}'}
        if target_type != 'any' and source_type != target_type:
            return {'ok': False, 'error': f'Socket type mismatch: {source_type} -> {target_type}'}

        occupied_key = (edge.target, edge.target_handle)
        if occupied_key in target_handle_use:
            return {'ok': False, 'error': f'Target socket {edge.target_handle} on node {edge.target} is already occupied'}
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
        return {'ok': False, 'error': 'Cycle detected in workflow graph'}

    return {
        'ok': True,
        'topological_order': ordered,
        'parallel_groups': levels,
        'message': 'Graph is a valid DAG. Child nodes can start only after all parents complete.',
    }


def workflow_records() -> list[dict[str, Any]]:
    return read_json(WORKFLOWS_FILE)


def run_records() -> list[dict[str, Any]]:
    return read_json(RUNS_FILE)


def persist_run_record(updated_run: dict[str, Any]) -> None:
    runs = run_records()
    runs = [run for run in runs if run.get('id') != updated_run.get('id')]
    runs.insert(0, updated_run)
    write_json(RUNS_FILE, runs)


def truncate_text(value: str, limit: int = 6000) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + '\n... [truncated]'


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding='utf-8', errors='ignore')


def prepare_bound_value(input_name: str, value: Any, node_dir: Path, context: dict[str, str]) -> None:
    inputs_dir = node_dir / 'inputs'
    inputs_dir.mkdir(parents=True, exist_ok=True)

    if isinstance(value, str):
        possible_path = Path(value)
        if possible_path.exists():
            context[input_name] = str(possible_path)
            context[f'{input_name}_file'] = str(possible_path)
            return

    raw_value = str(value)
    input_file = inputs_dir / f'{input_name}.txt'
    write_text(input_file, raw_value)
    context[input_name] = raw_value
    context[f'{input_name}_file'] = str(input_file)


def failed_node_result(node: WorkflowNode, node_dir: Path, reason: str, command: list[str] | None = None, stderr: str = '') -> dict[str, Any]:
    stdout_path = node_dir / 'stdout.log'
    stderr_path = node_dir / 'stderr.log'
    write_text(stdout_path, '')
    write_text(stderr_path, stderr or reason)
    return {
        'node_id': node.id,
        'status': 'failed',
        'command': command or [],
        'exit_code': None,
        'artifact_paths': [],
        'outputs': {},
        'stdout_preview': '',
        'stderr_preview': truncate_text(stderr or reason),
        'stdout_path': str(stdout_path),
        'stderr_path': str(stderr_path),
        'logs': [f'[-] Node {node.id} failed: {reason}'],
    }


def execute_variable_node(node: WorkflowNode, node_dir: Path) -> dict[str, Any]:
    variable_type = node.variable_type or 'targets'
    value = (node.value or '').strip()
    if not value:
        return failed_node_result(node, node_dir, f'Variable node {node.id} has no value configured.')

    artifact_file = node_dir / f'{variable_type}.txt'
    stdout_path = node_dir / 'stdout.log'
    stderr_path = node_dir / 'stderr.log'
    write_text(artifact_file, value + '\n')
    write_text(stdout_path, value + '\n')
    write_text(stderr_path, '')
    return {
        'node_id': node.id,
        'status': 'success',
        'command': [],
        'exit_code': 0,
        'artifact_paths': [str(artifact_file)],
        'outputs': {variable_type: value},
        'stdout_preview': truncate_text(value),
        'stderr_preview': '',
        'stdout_path': str(stdout_path),
        'stderr_path': str(stderr_path),
        'logs': [f'[+] Variable node {node.id} emitted {variable_type}.'],
    }


def execute_output_node(node: WorkflowNode, node_dir: Path, incoming_edges: list[WorkflowEdge], output_values: dict[str, dict[str, Any]]) -> dict[str, Any]:
    manifest = []
    for edge in incoming_edges:
        source_type = edge.source_handle.removeprefix('out:') if edge.source_handle else 'unknown'
        source_value = output_values.get(edge.source, {}).get(source_type)
        manifest.append({
            'source_node': edge.source,
            'source_type': source_type,
            'value': source_value,
        })

    manifest_path = node_dir / 'manifest.json'
    stdout_path = node_dir / 'stdout.log'
    stderr_path = node_dir / 'stderr.log'
    write_text(manifest_path, json.dumps(manifest, indent=2))
    write_text(stdout_path, json.dumps(manifest, indent=2))
    write_text(stderr_path, '')
    return {
        'node_id': node.id,
        'status': 'success',
        'command': [],
        'exit_code': 0,
        'artifact_paths': [str(manifest_path)],
        'outputs': {},
        'stdout_preview': truncate_text(json.dumps(manifest, indent=2)),
        'stderr_preview': '',
        'stdout_path': str(stdout_path),
        'stderr_path': str(stderr_path),
        'logs': [f'[+] Output node {node.id} collected {len(manifest)} upstream artifacts.'],
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
        return failed_node_result(node, node_dir, f'Tool {tool.id} has no command template configured.')

    primary_output = tool.outputs[0] if tool.outputs else 'output'
    artifact_file = node_dir / f'{primary_output}.txt'
    stdout_path = node_dir / 'stdout.log'
    stderr_path = node_dir / 'stderr.log'

    context: dict[str, str] = {
        'run_id': run_id,
        'node_id': node.id,
        'artifact_dir': str(node_dir),
        'artifact_file': str(artifact_file),
    }

    for edge in incoming_edges:
        input_name = edge.target_handle.removeprefix('in:') if edge.target_handle else 'input'
        source_type = edge.source_handle.removeprefix('out:') if edge.source_handle else 'output'
        source_value = output_values.get(edge.source, {}).get(source_type)
        if source_value is None:
            return failed_node_result(node, node_dir, f'Input {input_name} for node {node.id} has no upstream value.')
        if input_name != 'any':
            prepare_bound_value(input_name, source_value, node_dir, context)

    for key, value in node.params.items():
        context[key] = str(value)

    try:
        command = [segment.format_map(context) for segment in tool.command]
    except KeyError as exc:
        return failed_node_result(node, node_dir, f'Missing template value for {exc.args[0]} while building command for {tool.id}.')

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
        return failed_node_result(node, node_dir, f'Binary not found for tool {tool.id}: {command[0]}', command=command)
    except subprocess.TimeoutExpired as exc:
        stdout_text = exc.stdout or ''
        stderr_text = exc.stderr or ''
        write_text(stdout_path, stdout_text)
        write_text(stderr_path, stderr_text or f'Timeout after {tool.timeout_seconds}s')
        return {
            'node_id': node.id,
            'status': 'failed',
            'command': command,
            'exit_code': None,
            'artifact_paths': [],
            'outputs': {},
            'stdout_preview': truncate_text(stdout_text),
            'stderr_preview': truncate_text(stderr_text or f'Timeout after {tool.timeout_seconds}s'),
            'stdout_path': str(stdout_path),
            'stderr_path': str(stderr_path),
            'logs': [f'[-] Node {node.id} timed out after {tool.timeout_seconds}s.'],
        }

    stdout_text = completed.stdout or ''
    stderr_text = completed.stderr or ''
    write_text(stdout_path, stdout_text)
    write_text(stderr_path, stderr_text)

    artifact_paths: list[str] = []
    if tool.output_mode == 'stdout':
        write_text(artifact_file, stdout_text)
        artifact_paths.append(str(artifact_file))
    elif artifact_file.exists():
        artifact_paths.append(str(artifact_file))

    success = completed.returncode == 0
    outputs = {primary_output: str(artifact_file)} if success and artifact_paths else {}
    logs = [f"[>] {node.id}: {' '.join(command)}"]
    if success:
        logs.append(f'[+] Node {node.id} finished successfully.')
        if artifact_paths:
            logs.append(f'[+] artifact://{run_id}/{node.id}/{Path(artifact_paths[0]).name}')
    else:
        logs.append(f'[-] Node {node.id} exited with code {completed.returncode}.')

    return {
        'node_id': node.id,
        'status': 'success' if success else 'failed',
        'command': command,
        'exit_code': completed.returncode,
        'artifact_paths': artifact_paths,
        'outputs': outputs,
        'stdout_preview': truncate_text(stdout_text),
        'stderr_preview': truncate_text(stderr_text),
        'stdout_path': str(stdout_path),
        'stderr_path': str(stderr_path),
        'logs': logs,
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

    if node.kind == 'variable':
        return execute_variable_node(node, node_dir)
    if node.kind == 'output':
        return execute_output_node(node, node_dir, incoming_edges, output_values)
    if node.kind == 'tool':
        if not node.tool_id or node.tool_id not in tools_by_id:
            return failed_node_result(node, node_dir, f'Unknown tool for node {node.id}.')
        return execute_tool_node(run_id, node, node_dir, tools_by_id[node.tool_id], incoming_edges, output_values)
    return failed_node_result(node, node_dir, f'Unsupported node kind {node.kind}.')


def reconstruct_output_values(node_results: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output_values: dict[str, dict[str, Any]] = {}
    for node_id, result in node_results.items():
        outputs = result.get('outputs') or {}
        if outputs:
            output_values[node_id] = outputs
    return output_values


def resolve_run_graph(run: dict[str, Any]) -> WorkflowGraph | None:
    if 'graph' in run:
        return WorkflowGraph(**run['graph'])
    workflow_id = run.get('workflow_id')
    if workflow_id:
        workflow = next((item for item in workflow_records() if item.get('id') == workflow_id), None)
        if workflow and 'graph' in workflow:
            return WorkflowGraph(**workflow['graph'])
    return None


def find_run(run_id: str) -> dict[str, Any] | None:
    return next((run for run in run_records() if run.get('id') == run_id), None)


def ensure_artifact_path(run: dict[str, Any], requested_path: str) -> Path | None:
    root = Path(run['artifact_root']).resolve()
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

    for node_id, result in (run.get('node_results') or {}).items():
        for path in result.get('artifact_paths') or []:
            artifact_path = ensure_artifact_path(run, path)
            if not artifact_path:
                continue
            items.append({
                'id': f'run::{node_id}::{artifact_path.name}',
                'source': 'run',
                'node_id': node_id,
                'label': f'{node_id} · {artifact_path.name}',
                'path': str(artifact_path),
                'name': artifact_path.name,
                'extension': artifact_path.suffix.lower(),
                'size_bytes': artifact_path.stat().st_size,
            })

    for replay in run.get('replays') or []:
        replay_id = replay.get('id', 'replay')
        replay_node = replay.get('node_id', 'node')
        result = replay.get('result') or {}
        for path in result.get('artifact_paths') or []:
            artifact_path = ensure_artifact_path(run, path)
            if not artifact_path:
                continue
            items.append({
                'id': f'replay::{replay_id}::{artifact_path.name}',
                'source': 'replay',
                'replay_id': replay_id,
                'node_id': replay_node,
                'label': f'{replay_node} replay · {artifact_path.name}',
                'path': str(artifact_path),
                'name': artifact_path.name,
                'extension': artifact_path.suffix.lower(),
                'size_bytes': artifact_path.stat().st_size,
            })

    items.sort(key=lambda item: (item['node_id'], item['name']))
    return items


def preview_artifact(run: dict[str, Any], requested_path: str) -> dict[str, Any]:
    artifact_path = ensure_artifact_path(run, requested_path)
    if not artifact_path:
        return {'ok': False, 'error': 'Artifact path is invalid or outside the run root.'}

    mime_type = mimetypes.guess_type(artifact_path.name)[0] or 'application/octet-stream'
    suffix = artifact_path.suffix.lower()
    size_bytes = artifact_path.stat().st_size

    if suffix == '.json':
        raw = artifact_path.read_text(encoding='utf-8', errors='ignore')
        try:
            parsed = json.loads(raw)
            return {
                'ok': True,
                'kind': 'json',
                'path': str(artifact_path),
                'name': artifact_path.name,
                'mime_type': mime_type,
                'size_bytes': size_bytes,
                'json_content': parsed,
            }
        except json.JSONDecodeError:
            return {
                'ok': True,
                'kind': 'text',
                'path': str(artifact_path),
                'name': artifact_path.name,
                'mime_type': 'text/plain',
                'size_bytes': size_bytes,
                'text_content': raw,
            }

    if suffix in {'.html', '.htm'} or mime_type == 'text/html':
        html = artifact_path.read_text(encoding='utf-8', errors='ignore')
        return {
            'ok': True,
            'kind': 'html',
            'path': str(artifact_path),
            'name': artifact_path.name,
            'mime_type': mime_type,
            'size_bytes': size_bytes,
            'html_content': html,
        }

    if suffix in IMAGE_SUFFIXES or mime_type.startswith('image/'):
        raw_bytes = artifact_path.read_bytes()
        encoded = base64.b64encode(raw_bytes).decode('ascii')
        return {
            'ok': True,
            'kind': 'image',
            'path': str(artifact_path),
            'name': artifact_path.name,
            'mime_type': mime_type,
            'size_bytes': size_bytes,
            'image_data_url': f'data:{mime_type};base64,{encoded}',
        }

    if suffix in TEXT_SUFFIXES or mime_type.startswith('text/'):
        text = artifact_path.read_text(encoding='utf-8', errors='ignore')
        return {
            'ok': True,
            'kind': 'text',
            'path': str(artifact_path),
            'name': artifact_path.name,
            'mime_type': mime_type,
            'size_bytes': size_bytes,
            'text_content': text,
        }

    if size_bytes <= 1_000_000:
        text = artifact_path.read_text(encoding='utf-8', errors='ignore')
        return {
            'ok': True,
            'kind': 'text',
            'path': str(artifact_path),
            'name': artifact_path.name,
            'mime_type': mime_type,
            'size_bytes': size_bytes,
            'text_content': text,
        }

    return {
        'ok': True,
        'kind': 'binary',
        'path': str(artifact_path),
        'name': artifact_path.name,
        'mime_type': mime_type,
        'size_bytes': size_bytes,
    }


@app.get('/api/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/api/tools', response_model=list[Tool])
def tools() -> list[Tool]:
    return load_tools()


@app.get('/api/workflows')
def list_workflows() -> list[dict[str, Any]]:
    return workflow_records()


@app.post('/api/workflows')
def save_workflow(payload: WorkflowPayload) -> dict[str, Any]:
    records = workflow_records()
    workflow_id = payload.id or f'wf-{uuid4().hex[:10]}'
    item = {
        'id': workflow_id,
        'name': payload.name,
        'graph': payload.graph.model_dump(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
    }

    records = [record for record in records if record['id'] != workflow_id]
    records.insert(0, item)
    write_json(WORKFLOWS_FILE, records)
    return item


@app.get('/api/workflows/{workflow_id}')
def get_workflow(workflow_id: str) -> dict[str, Any]:
    for workflow in workflow_records():
        if workflow['id'] == workflow_id:
            return workflow
    return {'error': 'Workflow not found'}


@app.post('/api/workflows/validate')
def validate_workflow(graph: WorkflowGraph) -> dict[str, Any]:
    return validate_graph(graph)


@app.get('/api/runs')
def list_runs() -> list[dict[str, Any]]:
    return run_records()


@app.get('/api/runs/{run_id}')
def get_run(run_id: str) -> dict[str, Any]:
    found = find_run(run_id)
    if found:
        return found
    return {'error': 'Run not found'}


@app.get('/api/runs/{run_id}/artifacts')
def list_run_artifacts(run_id: str) -> dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {'ok': False, 'error': f'Run {run_id} not found'}
    return {
        'ok': True,
        'run_id': run_id,
        'items': collect_run_artifacts(run),
    }


@app.get('/api/runs/{run_id}/artifact-preview')
def get_artifact_preview(run_id: str, path: str = Query(...)) -> dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {'ok': False, 'error': f'Run {run_id} not found'}
    return preview_artifact(run, path)


@app.get('/api/runs/{run_id}/artifact-raw')
def get_artifact_raw(run_id: str, path: str = Query(...)) -> FileResponse | dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {'ok': False, 'error': f'Run {run_id} not found'}

    artifact_path = ensure_artifact_path(run, path)
    if not artifact_path:
        return {'ok': False, 'error': 'Artifact path is invalid or outside the run root.'}

    media_type = mimetypes.guess_type(artifact_path.name)[0] or 'application/octet-stream'
    return FileResponse(path=artifact_path, filename=artifact_path.name, media_type=media_type)


@app.post('/api/runs')
def run_workflow(payload: RunPayload) -> dict[str, Any]:
    graph: WorkflowGraph | None = payload.workflow

    if graph is None and payload.workflow_id:
        stored = next((item for item in workflow_records() if item['id'] == payload.workflow_id), None)
        if stored:
            graph = WorkflowGraph(**stored['graph'])

    if graph is None:
        return {'ok': False, 'error': 'No workflow graph supplied'}

    validation = validate_graph(graph)
    if not validation.get('ok'):
        return validation

    ensure_state()
    run_id = f'run-{uuid4().hex[:10]}'
    run_dir = ARTIFACTS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    tools_by_id = {tool.id: tool for tool in load_tools()}
    nodes_by_id = {node.id: node for node in graph.nodes}
    parents_by_node, _, incoming_edges_by_target = build_graph_indexes(graph)
    node_states = {node.id: 'queued' for node in graph.nodes}
    node_results: dict[str, Any] = {}
    output_values: dict[str, dict[str, Any]] = {}
    logs = [f'[+] Run {run_id} accepted for "{payload.name}".']
    logs.append(f'[+] Scheduler mode: DAG queue with parent completion gating. max_parallel={payload.max_parallel}')

    max_workers = max(1, payload.max_parallel)

    for group_index, group in enumerate(validation['parallel_groups'], start=1):
        logs.append(f'[+] Parallel group {group_index}: {", ".join(group)}')
        runnable: list[WorkflowNode] = []

        for node_id in group:
            blocked_parents = [parent_id for parent_id in parents_by_node.get(node_id, []) if node_states.get(parent_id) != 'success']
            if blocked_parents:
                node_states[node_id] = 'blocked'
                node_results[node_id] = {
                    'node_id': node_id,
                    'status': 'blocked',
                    'command': [],
                    'exit_code': None,
                    'artifact_paths': [],
                    'outputs': {},
                    'stdout_preview': '',
                    'stderr_preview': '',
                    'stdout_path': '',
                    'stderr_path': '',
                    'logs': [f'[-] Node {node_id} blocked by parent state(s): {", ".join(blocked_parents)}'],
                }
                logs.extend(node_results[node_id]['logs'])
                continue
            node_states[node_id] = 'running'
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
                node_id = result['node_id']
                node_states[node_id] = result['status']
                node_results[node_id] = result
                if result['status'] == 'success':
                    output_values[node_id] = result.get('outputs', {})
                logs.extend(result.get('logs', []))

    overall_status = 'completed' if all(state == 'success' for state in node_states.values()) else 'failed'
    result = {
        'id': run_id,
        'workflow_id': payload.workflow_id,
        'name': payload.name,
        'status': overall_status,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'graph': graph.model_dump(),
        'parallel_groups': validation['parallel_groups'],
        'node_states': node_states,
        'node_results': node_results,
        'artifact_root': str(run_dir),
        'replays': [],
        'logs': logs,
    }

    persist_run_record(result)
    write_text(run_dir / 'run.json', json.dumps(result, indent=2))
    return result


@app.post('/api/runs/{run_id}/replay/{node_id}')
def replay_node(run_id: str, node_id: str) -> dict[str, Any]:
    run = find_run(run_id)
    if not run:
        return {'ok': False, 'error': f'Run {run_id} not found'}

    graph = resolve_run_graph(run)
    if graph is None:
        return {'ok': False, 'error': 'This run does not include a stored graph. Save the workflow or execute a fresh run, then replay nodes from the newer run.'}

    validation = validate_graph(graph)
    if not validation.get('ok'):
        return {'ok': False, 'error': validation.get('error', 'Stored graph is invalid')}

    tools_by_id = {tool.id: tool for tool in load_tools()}
    nodes_by_id = {node.id: node for node in graph.nodes}
    if node_id not in nodes_by_id:
        return {'ok': False, 'error': f'Node {node_id} not found in stored graph'}

    parents_by_node, _, incoming_edges_by_target = build_graph_indexes(graph)
    parent_ids = parents_by_node.get(node_id, [])
    node_states = run.get('node_states', {})
    blocked_parents = [parent_id for parent_id in parent_ids if node_states.get(parent_id) != 'success']
    if blocked_parents:
        return {'ok': False, 'error': f'Node {node_id} cannot be replayed because parent node(s) are not successful: {", ".join(blocked_parents)}'}

    replay_id = f'replay-{uuid4().hex[:8]}'
    replay_root = Path(run['artifact_root']) / 'replays' / replay_id
    replay_root.mkdir(parents=True, exist_ok=True)

    output_values = reconstruct_output_values(run.get('node_results', {}))
    result = execute_node(
        run_id,
        nodes_by_id[node_id],
        tools_by_id,
        incoming_edges_by_target.get(node_id, []),
        output_values,
        replay_root,
    )

    replay_record = {
        'id': replay_id,
        'node_id': node_id,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'used_cached_upstream_from': parent_ids,
        'result': result,
    }

    run.setdefault('replays', []).insert(0, replay_record)
    run.setdefault('logs', []).append(f'[+] Replay {replay_id} executed for node {node_id}.')
    run.setdefault('graph', graph.model_dump())
    persist_run_record(run)
    write_text(replay_root / 'replay.json', json.dumps(replay_record, indent=2))

    return {
        'ok': result.get('status') == 'success',
        'run_id': run_id,
        'replay_id': replay_id,
        'node_id': node_id,
        'parent_ids': parent_ids,
        'cached_output_nodes': sorted(output_values.keys()),
        'result': result,
    }

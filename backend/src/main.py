from __future__ import annotations

import json
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_FILE = BASE_DIR / 'tools.yaml'
STATE_DIR = BASE_DIR / 'state'
WORKFLOWS_FILE = STATE_DIR / 'workflows.json'
RUNS_FILE = STATE_DIR / 'runs.json'


class Tool(BaseModel):
    id: str
    name: str
    category: str
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class WorkflowNode(BaseModel):
    id: str
    kind: str = 'tool'
    label: str
    tool_id: str | None = None
    variable_type: str | None = None
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


app = FastAPI(title='mini-tricky API', version='0.2.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def ensure_state() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
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
    for run in run_records():
        if run['id'] == run_id:
            return run
    return {'error': 'Run not found'}


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

    run_id = f'run-{uuid4().hex[:10]}'
    node_states = {node.id: 'queued' for node in graph.nodes}
    logs = [f'[+] Run {run_id} accepted for "{payload.name}".']
    logs.append('[+] Scheduler mode: DAG queue with parent completion gating.')

    for group_index, group in enumerate(validation['parallel_groups'], start=1):
        logs.append(f'[+] Parallel group {group_index}: {", ".join(group)}')
        for node_id in group:
            node_states[node_id] = 'running'
            logs.append(f'[>] Node {node_id} started.')
        for node_id in group:
            node_states[node_id] = 'success'
            logs.append(f'[+] Node {node_id} finished successfully.')
            logs.append(f'[+] artifact://{run_id}/{node_id}/output.json')

    result = {
        'id': run_id,
        'workflow_id': payload.workflow_id,
        'name': payload.name,
        'status': 'completed',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'parallel_groups': validation['parallel_groups'],
        'node_states': node_states,
        'logs': logs,
    }

    runs = run_records()
    runs.insert(0, result)
    write_json(RUNS_FILE, runs)
    return result

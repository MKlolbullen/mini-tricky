from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_FILE = BASE_DIR / 'tools.yaml'


class Tool(BaseModel):
    id: str
    name: str
    category: str
    inputs: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)


class WorkflowNode(BaseModel):
    id: str
    tool_id: str | None = None


class WorkflowEdge(BaseModel):
    source: str
    target: str
    source_handle: str | None = None
    target_handle: str | None = None


class WorkflowGraph(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


app = FastAPI(title='mini-tricky API', version='0.1.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def load_tools() -> list[Tool]:
    if not TOOLS_FILE.exists():
        return []
    data = yaml.safe_load(TOOLS_FILE.read_text()) or {}
    return [Tool(**item) for item in data.get('tools', [])]


@app.get('/api/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/api/tools', response_model=list[Tool])
def tools() -> list[Tool]:
    return load_tools()


@app.post('/api/workflows/validate')
def validate_workflow(graph: WorkflowGraph) -> dict[str, Any]:
    node_ids = {node.id for node in graph.nodes}
    indegree = {node.id: 0 for node in graph.nodes}
    adj: dict[str, list[str]] = defaultdict(list)

    for edge in graph.edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            return {'ok': False, 'error': f'Unknown node in edge {edge.source} -> {edge.target}'}
        if edge.source == edge.target:
            return {'ok': False, 'error': f'Self-loop detected on {edge.source}'}
        adj[edge.source].append(edge.target)
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
            for child in adj[current]:
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

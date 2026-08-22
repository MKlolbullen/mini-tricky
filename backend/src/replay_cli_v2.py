from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from src.main import (
    WorkflowGraph,
    build_graph_indexes,
    execute_node,
    load_tools,
    reconstruct_output_values,
    validate_graph,
)

BASE_DIR = Path(__file__).resolve().parent.parent
RUNS_FILE = BASE_DIR / "state" / "runs.json"
WORKFLOWS_FILE = BASE_DIR / "state" / "workflows.json"


def load_json(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text())


def find_run(run_id: str) -> dict | None:
    return next((run for run in load_json(RUNS_FILE) if run.get("id") == run_id), None)


def find_workflow(workflow_id: str) -> dict | None:
    return next((workflow for workflow in load_json(WORKFLOWS_FILE) if workflow.get("id") == workflow_id), None)


def resolve_graph(run: dict) -> WorkflowGraph:
    if "graph" in run:
        return WorkflowGraph(**run["graph"])
    workflow_id = run.get("workflow_id")
    if workflow_id:
        workflow = find_workflow(workflow_id)
        if workflow and "graph" in workflow:
            return WorkflowGraph(**workflow["graph"])
    raise SystemExit(
        "Could not resolve a workflow graph for this run. Save the workflow first or execute a newer run that persists the graph directly."
    )


def replay_node(run_id: str, node_id: str) -> dict:
    run = find_run(run_id)
    if not run:
        raise SystemExit(f"Run {run_id} not found.")

    graph = resolve_graph(run)
    validation = validate_graph(graph)
    if not validation.get("ok"):
        raise SystemExit(f"Stored graph is invalid: {validation.get('error', 'unknown error')}")

    nodes_by_id = {node.id: node for node in graph.nodes}
    if node_id not in nodes_by_id:
        raise SystemExit(f"Node {node_id} not present in stored graph.")

    parents_by_node, _, incoming_edges_by_target = build_graph_indexes(graph)
    parent_ids = parents_by_node.get(node_id, [])
    node_states = run.get("node_states", {})
    blocked_parents = [parent_id for parent_id in parent_ids if node_states.get(parent_id) != "success"]
    if blocked_parents:
        raise SystemExit(
            f"Node {node_id} cannot be replayed because parent node(s) are not successful: {', '.join(blocked_parents)}"
        )

    replay_id = f"replay-{uuid4().hex[:8]}"
    replay_root = Path(run["artifact_root"]) / "replays" / replay_id
    replay_root.mkdir(parents=True, exist_ok=True)

    tools_by_id = {tool.id: tool for tool in load_tools()}
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
        "run_id": run_id,
        "node_id": node_id,
        "created_at": datetime.now(UTC).isoformat(),
        "used_cached_upstream_from": parent_ids,
        "result": result,
    }
    (replay_root / "replay.json").write_text(json.dumps(replay_record, indent=2))
    return replay_record


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replay a single node from a stored mini-tricky run using cached upstream outputs."
    )
    parser.add_argument("--run-id", required=True, help="Run identifier, for example run-1234abcd")
    parser.add_argument("--node-id", required=True, help="Node identifier to replay")
    args = parser.parse_args()

    replay_record = replay_node(args.run_id, args.node_id)
    print(json.dumps(replay_record, indent=2))


if __name__ == "__main__":
    main()

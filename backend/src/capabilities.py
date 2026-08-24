"""Machine-readable tool capabilities and typed path planning.

The workflow engine already models tools as typed input/output transitions. This
module adds the missing semantic layer: default risk/cost metadata, named
capabilities, secret requirements, and a small planner that can answer questions
such as "how can I transform a domain into findings without exceeding medium
risk?".

Planning is advisory only. It does not execute tools, enable flags, or bypass any
workflow/scope controls.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException, Query

BASE_DIR = Path(__file__).resolve().parent.parent
CAPABILITIES_FILE = BASE_DIR / "capabilities.yaml"

RISK_ORDER = {"passive": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
COST_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

router = APIRouter(prefix="/api/capabilities", tags=["capabilities"])


def load_policy() -> dict[str, Any]:
    if not CAPABILITIES_FILE.exists():
        return {"version": 1, "category_defaults": {}, "tools": {}}
    raw = yaml.safe_load(CAPABILITIES_FILE.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError("capabilities.yaml must contain a mapping")
    return raw


def _tool_catalog() -> list[Any]:
    # Imported lazily to avoid a circular import while secure_entry composes
    # the main FastAPI application and this router.
    from .main import load_tools

    return load_tools()


def _normalized_level(value: Any, allowed: dict[str, int], fallback: str) -> str:
    candidate = str(value or fallback).lower()
    return candidate if candidate in allowed else fallback


def metadata_for_tool(tool: Any, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    policy = policy or load_policy()
    category_defaults = policy.get("category_defaults") or {}
    tool_overrides = policy.get("tools") or {}

    category_meta = category_defaults.get(tool.category, {}) if isinstance(category_defaults, dict) else {}
    override = tool_overrides.get(tool.id, {}) if isinstance(tool_overrides, dict) else {}
    category_meta = category_meta if isinstance(category_meta, dict) else {}
    override = override if isinstance(override, dict) else {}

    risk = _normalized_level(override.get("risk", category_meta.get("risk")), RISK_ORDER, "medium")
    network_cost = _normalized_level(
        override.get("network_cost", category_meta.get("network_cost")), COST_ORDER, "medium"
    )
    cpu_cost = _normalized_level(override.get("cpu_cost", category_meta.get("cpu_cost")), COST_ORDER, "medium")

    capabilities: list[str] = []
    for source in (category_meta.get("capabilities", []), override.get("capabilities", [])):
        if isinstance(source, list):
            for item in source:
                name = str(item).strip()
                if name and name not in capabilities:
                    capabilities.append(name)

    secrets = [str(value) for value in override.get("secrets", []) if str(value).strip()]
    platforms = [str(value) for value in override.get("platforms", []) if str(value).strip()]

    transitions = [
        {"from": input_type, "to": output_type}
        for input_type in tool.inputs
        for output_type in tool.outputs
    ]

    return {
        "id": tool.id,
        "name": tool.name,
        "category": tool.category,
        "risk": risk,
        "network_cost": network_cost,
        "cpu_cost": cpu_cost,
        "capabilities": capabilities,
        "secrets": secrets,
        "platforms": platforms,
        "inputs": list(tool.inputs),
        "outputs": list(tool.outputs),
        "transitions": transitions,
    }


def enriched_catalog(tools: list[Any] | None = None, policy: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    tools = tools if tools is not None else _tool_catalog()
    policy = policy or load_policy()
    return [metadata_for_tool(tool, policy) for tool in tools]


def policy_issues(tools: list[Any] | None = None, policy: dict[str, Any] | None = None) -> list[str]:
    tools = tools if tools is not None else _tool_catalog()
    policy = policy or load_policy()
    known_ids = {tool.id for tool in tools}
    overrides = policy.get("tools") or {}
    if not isinstance(overrides, dict):
        return ["capabilities.yaml tools must be a mapping"]
    return [f"capability override references unknown tool: {tool_id}" for tool_id in overrides if tool_id not in known_ids]


def plan_paths(
    from_type: str,
    to_type: str,
    *,
    max_risk: str = "medium",
    max_steps: int = 5,
    limit: int = 20,
    tools: list[Any] | None = None,
    policy: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return low-cost typed tool chains without executing anything."""

    from_type = from_type.strip()
    to_type = to_type.strip()
    if not from_type or not to_type:
        return []
    if max_risk not in RISK_ORDER:
        raise ValueError(f"unknown max_risk: {max_risk}")

    tools = tools if tools is not None else _tool_catalog()
    policy = policy or load_policy()
    catalog = enriched_catalog(tools, policy)
    allowed_risk = RISK_ORDER[max_risk]

    # state: current type, ordered steps, tool ids already used, aggregate score
    queue: deque[tuple[str, list[dict[str, Any]], frozenset[str], int]] = deque()
    queue.append((from_type, [], frozenset(), 0))
    results: list[dict[str, Any]] = []
    seen_states: dict[tuple[str, frozenset[str]], int] = {(from_type, frozenset()): 0}

    while queue and len(results) < max(limit * 4, limit):
        current_type, steps, used, score = queue.popleft()
        if len(steps) >= max_steps:
            continue

        for tool in catalog:
            tool_id = tool["id"]
            if tool_id in used:
                continue
            if current_type not in tool["inputs"] and "any" not in tool["inputs"]:
                continue

            risk_value = RISK_ORDER[tool["risk"]]
            if risk_value > allowed_risk:
                continue

            for output_type in tool["outputs"]:
                step_cost = (
                    10
                    + risk_value * 100
                    + COST_ORDER[tool["network_cost"]] * 5
                    + COST_ORDER[tool["cpu_cost"]] * 3
                )
                next_score = score + step_cost
                step = {
                    "tool_id": tool_id,
                    "tool_name": tool["name"],
                    "from": current_type,
                    "to": output_type,
                    "risk": tool["risk"],
                    "network_cost": tool["network_cost"],
                    "cpu_cost": tool["cpu_cost"],
                    "capabilities": tool["capabilities"],
                    "secrets": tool["secrets"],
                }
                next_steps = [*steps, step]
                next_used = used | {tool_id}

                if output_type == to_type:
                    results.append(
                        {
                            "from": from_type,
                            "to": to_type,
                            "score": next_score,
                            "steps": next_steps,
                            "tool_ids": [item["tool_id"] for item in next_steps],
                            "types": [from_type, *[item["to"] for item in next_steps]],
                            "max_risk": max(
                                (item["risk"] for item in next_steps),
                                key=lambda value: RISK_ORDER[value],
                            ),
                        }
                    )
                    continue

                state_key = (output_type, next_used)
                if next_score >= seen_states.get(state_key, 10**9):
                    continue
                seen_states[state_key] = next_score
                queue.append((output_type, next_steps, next_used, next_score))

    # Deduplicate equivalent tool chains and prefer lower-risk/lower-cost routes.
    unique: dict[tuple[str, ...], dict[str, Any]] = {}
    for result in results:
        key = tuple(result["tool_ids"])
        if key not in unique or result["score"] < unique[key]["score"]:
            unique[key] = result
    return sorted(unique.values(), key=lambda item: (item["score"], len(item["steps"]), item["tool_ids"]))[:limit]


@router.get("/tools")
def capability_tools() -> dict[str, Any]:
    tools = _tool_catalog()
    policy = load_policy()
    return {
        "version": int(policy.get("version", 1)),
        "count": len(tools),
        "issues": policy_issues(tools, policy),
        "tools": enriched_catalog(tools, policy),
    }


@router.get("/plan")
def capability_plan(
    from_type: str = Query(..., min_length=1),
    to_type: str = Query(..., min_length=1),
    max_risk: str = Query("medium"),
    max_steps: int = Query(5, ge=1, le=8),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    max_risk = max_risk.lower()
    if max_risk not in RISK_ORDER:
        raise HTTPException(status_code=400, detail=f"max_risk must be one of: {', '.join(RISK_ORDER)}")

    paths = plan_paths(from_type, to_type, max_risk=max_risk, max_steps=max_steps, limit=limit)
    return {
        "from": from_type,
        "to": to_type,
        "max_risk": max_risk,
        "max_steps": max_steps,
        "count": len(paths),
        "paths": paths,
    }

from __future__ import annotations

from types import SimpleNamespace

from src import main
from src.capabilities import load_policy, metadata_for_tool, plan_paths, policy_issues


def _tool(
    tool_id: str,
    category: str,
    inputs: list[str],
    outputs: list[str],
    name: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=tool_id,
        name=name or tool_id,
        category=category,
        inputs=inputs,
        outputs=outputs,
    )


def test_capability_overrides_reference_real_catalog_tools() -> None:
    assert policy_issues(main.load_tools(), load_policy()) == []


def test_tool_metadata_combines_category_defaults_and_overrides() -> None:
    policy = {
        "category_defaults": {
            "Recon": {
                "risk": "low",
                "network_cost": "low",
                "cpu_cost": "low",
                "capabilities": ["asset_discovery"],
            }
        },
        "tools": {
            "passive": {
                "risk": "passive",
                "capabilities": ["passive_subdomain_discovery"],
                "secrets": ["TOKEN"],
            }
        },
    }
    meta = metadata_for_tool(_tool("passive", "Recon", ["domain"], ["targets"]), policy)

    assert meta["risk"] == "passive"
    assert meta["network_cost"] == "low"
    assert meta["capabilities"] == ["asset_discovery", "passive_subdomain_discovery"]
    assert meta["secrets"] == ["TOKEN"]
    assert meta["transitions"] == [{"from": "domain", "to": "targets"}]


def test_planner_prefers_low_risk_short_typed_route() -> None:
    tools = [
        _tool("discover", "Recon", ["domain"], ["targets"]),
        _tool("probe", "Recon", ["targets"], ["url"]),
        _tool("scan", "Vulnerability", ["url"], ["findings"]),
        _tool("direct-high", "Vulnerability", ["domain"], ["findings"]),
    ]
    policy = {
        "category_defaults": {
            "Recon": {"risk": "low", "network_cost": "low", "cpu_cost": "low"},
            "Vulnerability": {"risk": "medium", "network_cost": "medium", "cpu_cost": "medium"},
        },
        "tools": {"direct-high": {"risk": "high"}},
    }

    paths = plan_paths("domain", "findings", max_risk="medium", tools=tools, policy=policy)

    assert paths
    assert paths[0]["tool_ids"] == ["discover", "probe", "scan"]
    assert paths[0]["types"] == ["domain", "targets", "url", "findings"]
    assert all("direct-high" not in path["tool_ids"] for path in paths)


def test_planner_respects_step_limit() -> None:
    tools = [
        _tool("one", "Recon", ["domain"], ["targets"]),
        _tool("two", "Recon", ["targets"], ["url"]),
        _tool("three", "Vulnerability", ["url"], ["findings"]),
    ]
    policy = {
        "category_defaults": {
            "Recon": {"risk": "low", "network_cost": "low", "cpu_cost": "low"},
            "Vulnerability": {"risk": "medium", "network_cost": "medium", "cpu_cost": "medium"},
        },
        "tools": {},
    }

    assert plan_paths("domain", "findings", max_steps=2, tools=tools, policy=policy) == []

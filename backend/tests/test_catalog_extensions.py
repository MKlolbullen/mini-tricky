from __future__ import annotations

from pathlib import Path

import pytest

from src import main
from src.capabilities import load_policy, metadata_for_tool, plan_paths, policy_issues
from src.catalog_extensions import (
    extension_capability_policy,
    extension_install_hints,
    extension_template_dicts,
    extension_tool_dicts,
    install_catalog_extensions,
)


def _install_runtime_extensions() -> None:
    install_catalog_extensions(main)


def test_nextgen_tools_and_install_hints_are_composed() -> None:
    _install_runtime_extensions()
    tools = {tool.id: tool for tool in main.load_tools()}

    assert {"uncover", "syft", "grype"} <= tools.keys()
    assert tools["uncover"].inputs == ["query"]
    assert tools["syft"].outputs == ["sbom"]
    assert tools["grype"].inputs == ["sbom"]

    hints = extension_install_hints()
    assert "projectdiscovery/uncover" in hints["uncover"]
    assert "get.anchore.io/syft" in hints["syft"]
    assert "get.anchore.io/grype" in hints["grype"]
    assert main.INSTALL_HINTS["uncover"] == hints["uncover"]


def test_nextgen_templates_pass_runtime_validation() -> None:
    _install_runtime_extensions()
    tools = {tool.id for tool in main.load_tools()}
    templates = extension_template_dicts()

    assert {item["id"] for item in templates} == {
        "tpl-internet-exposure-correlation",
        "tpl-sbom-vulnerability-review",
    }

    for template in templates:
        for node in template["graph"]["nodes"]:
            if node["kind"] == "tool":
                assert node["tool_id"] in tools
        graph = main.WorkflowGraph(**template["graph"])
        result = main.validate_graph(graph)
        assert result.get("ok"), f"{template['id']}: {result.get('error')}"


def test_extension_capability_policy_is_visible_to_planner() -> None:
    _install_runtime_extensions()
    policy = load_policy()
    tools = main.load_tools()

    assert policy_issues(tools, policy) == []

    by_id = {tool.id: tool for tool in tools}
    syft_meta = metadata_for_tool(by_id["syft"], policy)
    grype_meta = metadata_for_tool(by_id["grype"], policy)
    uncover_meta = metadata_for_tool(by_id["uncover"], policy)

    assert syft_meta["risk"] == "passive"
    assert "sbom_generation" in syft_meta["capabilities"]
    assert "sbom_vulnerability_assessment" in grype_meta["capabilities"]
    assert "internet_exposure_search" in uncover_meta["capabilities"]

    sbom_paths = plan_paths("folder", "findings", max_risk="passive", max_steps=2, tools=tools, policy=policy)
    assert any(path["tool_ids"] == ["syft", "grype"] for path in sbom_paths)

    exposure_paths = plan_paths("query", "targets", max_risk="passive", max_steps=1, tools=tools, policy=policy)
    assert any(path["tool_ids"] == ["uncover"] for path in exposure_paths)


def test_duplicate_extension_tool_ids_are_rejected(tmp_path: Path) -> None:
    (tmp_path / "a.yaml").write_text("tools:\n  - id: duplicate\n", encoding="utf-8")
    (tmp_path / "b.yaml").write_text("tools:\n  - id: duplicate\n", encoding="utf-8")

    with pytest.raises(ValueError, match="duplicate extension tool id"):
        extension_tool_dicts(tmp_path)


def test_conflicting_extension_capability_policy_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "a.yaml").write_text(
        "capability_policy:\n  category_defaults:\n    Supply Chain:\n      risk: passive\n",
        encoding="utf-8",
    )
    (tmp_path / "b.yaml").write_text(
        "capability_policy:\n  category_defaults:\n    Supply Chain:\n      risk: medium\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="conflicting extension capability category_defaults"):
        extension_capability_policy(tmp_path)

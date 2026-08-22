"""Tests for the /api/generate endpoint and the LLM module.

Exercises:
* The fallback (keyword matcher) path when no API key / SDK is available.
* The LLM happy path with a mocked Anthropic client, asserting the full
  tool catalog makes it into the system prompt.
* ``llm._extract_json`` tolerance to ```json fences and stray prose.
"""

from __future__ import annotations

import json
import os
import sys
import types
from typing import Any

import pytest


def test_extract_json_plain():
    from src.llm import _extract_json

    obj = _extract_json('{"name": "x", "nodes": []}')
    assert obj["name"] == "x"


def test_extract_json_fenced():
    from src.llm import _extract_json

    text = '```json\n{"name": "x", "nodes": []}\n```'
    obj = _extract_json(text)
    assert obj["name"] == "x"


def test_extract_json_surrounded_by_prose():
    from src.llm import _extract_json

    text = 'Sure! Here is the workflow:\n{"name": "x", "nodes": []}\nLet me know if…'
    obj = _extract_json(text)
    assert obj["name"] == "x"


def test_resolve_api_key_env(monkeypatch):
    from src.llm import _resolve_api_key

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-env")
    assert _resolve_api_key(None) == "sk-env"
    assert _resolve_api_key({"ANTHROPIC_API_KEY": "sk-profile"}) == "sk-env"


def test_resolve_api_key_profile(monkeypatch):
    from src.llm import _resolve_api_key

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert _resolve_api_key({"ANTHROPIC_API_KEY": "sk-profile"}) == "sk-profile"
    assert _resolve_api_key(None) is None


def test_generate_endpoint_falls_back_without_key(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.post("/api/generate", json={"prompt": "recon a domain", "scope": "example.com"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "fallback"
    assert "fallback_reason" in body
    assert body["graph"]["nodes"]


def _install_fake_anthropic(captured: dict[str, Any], response_text: str) -> None:
    """Install a fake ``anthropic`` module into sys.modules for the test."""
    fake = types.ModuleType("anthropic")

    class FakeBlock:
        def __init__(self, text: str) -> None:
            self.text = text

    class FakeMessage:
        def __init__(self, text: str) -> None:
            self.content = [FakeBlock(text)]

    class FakeMessages:
        def create(self, **kwargs: Any) -> FakeMessage:
            captured.update(kwargs)
            return FakeMessage(response_text)

    class FakeAnthropic:
        def __init__(self, api_key: str, **kwargs: Any) -> None:
            self.api_key = api_key
            self.messages = FakeMessages()

    fake.Anthropic = FakeAnthropic  # type: ignore[attr-defined]
    sys.modules["anthropic"] = fake


def test_generate_endpoint_uses_llm_when_available(client, monkeypatch):
    response_json = json.dumps(
        {
            "name": "Mocked Recon",
            "description": "Test",
            "nodes": [
                {
                    "id": "var-1",
                    "kind": "variable",
                    "label": "Target",
                    "variable_type": "domain",
                    "value": "example.com",
                    "params": {},
                    "position": {"x": 80, "y": 120},
                },
                {"id": "out-1", "kind": "output", "label": "Artifacts", "params": {}, "position": {"x": 360, "y": 120}},
            ],
            "edges": [
                {
                    "id": "e1",
                    "source": "var-1",
                    "target": "out-1",
                    "source_handle": "out:domain",
                    "target_handle": "in:any",
                },
            ],
        }
    )
    captured: dict[str, Any] = {}
    _install_fake_anthropic(captured, response_json)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    try:
        resp = client.post("/api/generate", json={"prompt": "recon example.com", "scope": "example.com"})
    finally:
        sys.modules.pop("anthropic", None)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["source"] == "claude"
    assert body["name"] == "Mocked Recon"
    assert len(body["graph"]["nodes"]) == 2

    # Assert the full tool catalog made it into the system prompt
    assert "system" in captured
    assert "Tool catalog" in captured["system"]
    assert "subfinder" in captured["system"]


def test_generate_endpoint_falls_back_on_bad_json(client, monkeypatch):
    """If Claude returns garbage, we retry once, then fall back."""
    captured: dict[str, Any] = {}
    _install_fake_anthropic(captured, "not json at all, just prose")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    try:
        resp = client.post("/api/generate", json={"prompt": "recon", "scope": ""})
    finally:
        sys.modules.pop("anthropic", None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "fallback"
    assert "fallback_reason" in body


def test_normalize_provider_aliases_and_unknown():
    from src.llm import LLMNotAvailable, _normalize_provider

    assert _normalize_provider("claude") == "anthropic"
    assert _normalize_provider("GPT") == "openai"
    assert _normalize_provider("xai") == "grok"
    assert _normalize_provider(None) is None
    with pytest.raises(LLMNotAvailable):
        _normalize_provider("bogus")


def test_select_provider_rejects_unknown_even_when_another_is_configured(monkeypatch):
    from src.llm import LLMNotAvailable, _select_provider

    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai")
    with pytest.raises(LLMNotAvailable):
        _select_provider("does-not-exist", None)


def test_generate_workflow_rejects_non_list_graph(monkeypatch):
    import src.llm as llm

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-x")
    monkeypatch.setattr(llm, "_complete", lambda *a, **k: '{"nodes": "notalist", "edges": []}')
    with pytest.raises(llm.LLMGenerationError):
        llm.generate_workflow("recon", provider="claude")


def _no_providers(monkeypatch):
    """Strip every provider key from env and profiles for deterministic AI-endpoint tests."""
    for var in (
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "XAI_API_KEY",
        "GROK_API_KEY",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr("src.main._collect_env_vars_from_profiles", dict)


def test_ai_providers_endpoint_shape(client):
    resp = client.get("/api/ai/providers")
    assert resp.status_code == 200
    providers = resp.json()["providers"]
    ids = {p["id"] for p in providers}
    assert ids == {"anthropic", "openai", "gemini", "grok"}
    for p in providers:
        assert set(p) >= {"id", "default_model", "configured"}


def test_ai_generate_without_any_key_returns_success_false(client, monkeypatch):
    _no_providers(monkeypatch)
    body = client.post("/api/ai/generate-workflow", json={"prompt": "recon example.com"}).json()
    assert body["success"] is False
    assert "no LLM provider available" in body["error"]


def test_ai_generate_unknown_provider_returns_success_false(client, monkeypatch):
    _no_providers(monkeypatch)
    body = client.post("/api/ai/generate-workflow", json={"prompt": "recon", "provider": "mistral"}).json()
    assert body["success"] is False
    assert "Unknown LLM provider" in body["error"] or "no LLM provider available" in body["error"]


def test_ai_explain_rejects_oversized_workflow(client):
    big = {"nodes": [{"id": str(i), "blob": "x" * 1000} for i in range(400)]}
    body = client.post("/api/ai/explain-workflow", json={"workflow": big}).json()
    assert body["success"] is False
    assert "too large" in body["error"]

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
    assert obj['name'] == 'x'


def test_extract_json_fenced():
    from src.llm import _extract_json

    text = '```json\n{"name": "x", "nodes": []}\n```'
    obj = _extract_json(text)
    assert obj['name'] == 'x'


def test_extract_json_surrounded_by_prose():
    from src.llm import _extract_json

    text = 'Sure! Here is the workflow:\n{"name": "x", "nodes": []}\nLet me know if…'
    obj = _extract_json(text)
    assert obj['name'] == 'x'


def test_resolve_api_key_env(monkeypatch):
    from src.llm import _resolve_api_key

    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-env')
    assert _resolve_api_key(None) == 'sk-env'
    assert _resolve_api_key({'ANTHROPIC_API_KEY': 'sk-profile'}) == 'sk-env'


def test_resolve_api_key_profile(monkeypatch):
    from src.llm import _resolve_api_key

    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    assert _resolve_api_key({'ANTHROPIC_API_KEY': 'sk-profile'}) == 'sk-profile'
    assert _resolve_api_key(None) is None


def test_generate_endpoint_falls_back_without_key(client, monkeypatch):
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    resp = client.post('/api/generate', json={'prompt': 'recon a domain', 'scope': 'example.com'})
    assert resp.status_code == 200
    body = resp.json()
    assert body['source'] == 'fallback'
    assert 'fallback_reason' in body
    assert body['graph']['nodes']


def _install_fake_anthropic(captured: dict[str, Any], response_text: str) -> None:
    """Install a fake ``anthropic`` module into sys.modules for the test."""
    fake = types.ModuleType('anthropic')

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
        def __init__(self, api_key: str) -> None:
            self.api_key = api_key
            self.messages = FakeMessages()

    fake.Anthropic = FakeAnthropic  # type: ignore[attr-defined]
    sys.modules['anthropic'] = fake


def test_generate_endpoint_uses_llm_when_available(client, monkeypatch):
    response_json = json.dumps({
        'name': 'Mocked Recon',
        'description': 'Test',
        'nodes': [
            {'id': 'var-1', 'kind': 'variable', 'label': 'Target', 'variable_type': 'domain',
             'value': 'example.com', 'params': {}, 'position': {'x': 80, 'y': 120}},
            {'id': 'out-1', 'kind': 'output', 'label': 'Artifacts',
             'params': {}, 'position': {'x': 360, 'y': 120}},
        ],
        'edges': [
            {'id': 'e1', 'source': 'var-1', 'target': 'out-1',
             'source_handle': 'out:domain', 'target_handle': 'in:any'},
        ],
    })
    captured: dict[str, Any] = {}
    _install_fake_anthropic(captured, response_json)
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')
    try:
        resp = client.post('/api/generate', json={'prompt': 'recon example.com', 'scope': 'example.com'})
    finally:
        sys.modules.pop('anthropic', None)

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['source'] == 'claude'
    assert body['name'] == 'Mocked Recon'
    assert len(body['graph']['nodes']) == 2

    # Assert the full tool catalog made it into the system prompt
    assert 'system' in captured
    assert 'Tool catalog' in captured['system']
    assert 'subfinder' in captured['system']


def test_generate_endpoint_falls_back_on_bad_json(client, monkeypatch):
    """If Claude returns garbage, we retry once, then fall back."""
    captured: dict[str, Any] = {}
    _install_fake_anthropic(captured, 'not json at all, just prose')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')
    try:
        resp = client.post('/api/generate', json={'prompt': 'recon', 'scope': ''})
    finally:
        sys.modules.pop('anthropic', None)

    assert resp.status_code == 200
    body = resp.json()
    assert body['source'] == 'fallback'
    assert 'fallback_reason' in body

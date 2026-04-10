"""LLM-backed workflow generator for mini-tricky.

Replaces the keyword-matching 'AI' in ``main.generate_workflow``. Asks
Claude to produce a ``WorkflowGraph``-shaped JSON object given the user's
natural-language prompt, an optional target scope, and the full tool catalog.

Design notes:

* **Import-safe.** The ``anthropic`` SDK import is deferred to call-time, so
  importing this module does NOT require the dep to be installed — the
  backend still boots without it and falls back to the keyword matcher.
* **API key resolution.** ``ANTHROPIC_API_KEY`` env var first, then a
  caller-provided ``env_vars`` dict (typically merged from the active
  profile's ``env_vars``). Missing key raises ``LLMNotAvailable``, which
  the caller treats as a soft fallback, not an error.
* **Model.** Defaults to ``claude-haiku-4-5-20251001`` — fast enough to be
  the default behaviour for every ``/api/generate`` call.
* **Retry.** On JSON/shape failure, retry once with the error message
  appended. Second failure raises ``LLMGenerationError``.
"""

from __future__ import annotations

import json
import os
from typing import Any

DEFAULT_MODEL = 'claude-haiku-4-5-20251001'


class LLMNotAvailable(RuntimeError):
    """Raised when the Anthropic SDK or API key is missing — soft fallback."""


class LLMGenerationError(RuntimeError):
    """Raised when Claude returns an invalid or unusable workflow graph."""


def _resolve_api_key(env_vars: dict[str, str] | None) -> str | None:
    key = os.environ.get('ANTHROPIC_API_KEY')
    if key:
        return key
    if env_vars and env_vars.get('ANTHROPIC_API_KEY'):
        return env_vars['ANTHROPIC_API_KEY']
    return None


def _tool_catalog(tools: list[Any]) -> list[dict[str, Any]]:
    """Convert Tool pydantic models to a compact dict list for the prompt.

    Accepts anything that exposes ``id``, ``name``, ``category``,
    ``description``, ``inputs``, ``outputs``.
    """
    catalog: list[dict[str, Any]] = []
    for t in tools:
        catalog.append({
            'id': getattr(t, 'id', ''),
            'name': getattr(t, 'name', ''),
            'category': getattr(t, 'category', ''),
            'description': getattr(t, 'description', ''),
            'inputs': list(getattr(t, 'inputs', []) or []),
            'outputs': list(getattr(t, 'outputs', []) or []),
        })
    return catalog


def _system_prompt(catalog: list[dict[str, Any]]) -> str:
    return f"""You are a workflow generation assistant for mini-tricky, a local
security-testing workflow builder. Given a natural-language goal and an
optional scope/target, emit a single JSON object describing a workflow graph
that chains the available tools end-to-end.

Rules:
* Only reference ``tool_id`` values that appear in the catalog below. Never
  invent a tool.
* Wire nodes so output socket types match input socket types. The special
  type ``any`` matches anything.
* Every workflow starts with a ``variable`` node (the target input) and ends
  with an ``output`` node (artifacts sink).
* Position nodes left-to-right: ``x`` starts at 80 and increases by 280 per
  step; ``y`` stays at 120 for linear chains.
* Keep the graph linear unless the user explicitly asks for branching.
* Every edge's ``source_handle`` must be ``out:<type>`` and
  ``target_handle`` must be ``in:<type>`` matching a declared socket.

Output EXACTLY this JSON shape — no prose, no markdown fences:

{{
  "name": "<short human-readable workflow name>",
  "description": "<one-sentence explanation>",
  "nodes": [
    {{
      "id": "<unique-id>",
      "kind": "variable|tool|output",
      "label": "<display label>",
      "tool_id": "<id from catalog or null>",
      "variable_type": "domain|targets|wordlist|findings|null",
      "value": "<value for variable nodes or null>",
      "params": {{}},
      "position": {{"x": <int>, "y": <int>}}
    }}
  ],
  "edges": [
    {{
      "id": "<unique-id>",
      "source": "<node id>",
      "target": "<node id>",
      "source_handle": "out:<type>",
      "target_handle": "in:<type>"
    }}
  ]
}}

Tool catalog ({len(catalog)} tools):
{json.dumps(catalog, indent=2)}
"""


def _user_prompt(prompt: str, scope: str) -> str:
    scope_line = f'Scope / target: {scope}\n' if scope else ''
    return (
        f'{scope_line}Goal: {prompt}\n\n'
        'Emit the workflow JSON now. No prose, no markdown fences, just the JSON object.'
    )


def _call_claude(system: str, user: str, api_key: str, model: str) -> str:
    try:
        from anthropic import Anthropic  # type: ignore[import-not-found]
    except ImportError as e:
        raise LLMNotAvailable('anthropic SDK not installed (pip install anthropic)') from e

    client = Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{'role': 'user', 'content': user}],
    )
    parts: list[str] = []
    for block in msg.content:
        text = getattr(block, 'text', None)
        if text:
            parts.append(text)
    return ''.join(parts).strip()


def _extract_json(text: str) -> dict[str, Any]:
    """Tolerant JSON extraction that strips ```json fences if present."""
    s = text.strip()
    if s.startswith('```'):
        lines = s.splitlines()
        lines = lines[1:]
        if lines and lines[-1].startswith('```'):
            lines = lines[:-1]
        s = '\n'.join(lines).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        start = s.find('{')
        end = s.rfind('}')
        if start >= 0 and end > start:
            return json.loads(s[start : end + 1])
        raise


def generate_workflow_via_claude(
    prompt: str,
    scope: str,
    tools: list[Any],
    env_vars: dict[str, str] | None = None,
    model: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    """Ask Claude to produce a workflow graph.

    Returns a dict with keys ``name``, ``description``, ``graph`` (containing
    ``nodes`` and ``edges``). Raises:

    * ``LLMNotAvailable`` — SDK missing or no API key (soft fallback)
    * ``LLMGenerationError`` — response cannot be parsed/validated after
      one retry (hard fallback)
    """
    api_key = _resolve_api_key(env_vars)
    if not api_key:
        raise LLMNotAvailable('ANTHROPIC_API_KEY not set')

    catalog = _tool_catalog(tools)
    system = _system_prompt(catalog)
    user = _user_prompt(prompt, scope)

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            raw = _call_claude(system, user, api_key, model)
            obj = _extract_json(raw)
        except LLMNotAvailable:
            raise
        except Exception as e:  # noqa: BLE001 — we want to retry on anything non-fatal
            last_error = e
            user = (
                user
                + f'\n\nYour previous attempt failed with: {e!s}. '
                'Return a valid JSON object matching the schema.'
            )
            continue

        # Accept either {nodes, edges} at top level or {graph: {nodes, edges}}
        if isinstance(obj.get('graph'), dict):
            graph = obj['graph']
        else:
            graph = {'nodes': obj.get('nodes', []), 'edges': obj.get('edges', [])}

        if not isinstance(graph.get('nodes'), list) or not isinstance(graph.get('edges'), list):
            last_error = LLMGenerationError('response missing nodes/edges arrays')
            user = (
                user
                + '\n\nYour previous attempt missed the nodes/edges arrays. '
                'Return valid JSON matching the schema.'
            )
            continue

        return {
            'name': obj.get('name') or 'Generated Workflow',
            'description': obj.get('description') or '',
            'graph': graph,
        }

    raise LLMGenerationError(f'Claude generation failed after retries: {last_error}')

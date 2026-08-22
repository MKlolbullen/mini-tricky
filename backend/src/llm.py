"""Multi-provider LLM helpers for mini-tricky.

Supports **Anthropic (Claude)**, **OpenAI (GPT)**, **Google (Gemini)**, and
**xAI (Grok)**. Provider SDKs are imported lazily so the backend runs without
any of them installed — a provider is only required when it is actually used.

Provider selection order (for the generic entry points): an explicit
``provider`` argument, then the ``LLM_PROVIDER`` env var, then the first
provider that has an API key configured (Anthropic → OpenAI → Gemini → Grok).

``generate_workflow_via_claude`` stays Anthropic-specific and backs the
``/api/generate`` endpoint (which owns the keyword fallback); the generic
``generate_workflow`` / ``explain_workflow`` / ``debug_failed_run`` /
``suggest_next_nodes`` helpers work across every provider.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import yaml

TOOLS_FILE = Path(__file__).resolve().parent.parent / "tools.yaml"


class LLMNotAvailable(RuntimeError):
    """Raised when the selected provider's SDK or API key is missing (soft fallback)."""


class LLMGenerationError(RuntimeError):
    """Raised when a provider response cannot be parsed/validated (hard fallback)."""


# ── Provider registry ────────────────────────────────────────────────────────
# name -> {"keys": [env var names, priority order], "model": default model}
PROVIDERS: dict[str, dict[str, Any]] = {
    "anthropic": {"keys": ["ANTHROPIC_API_KEY"], "model": "claude-haiku-4-5-20251001"},
    "openai": {"keys": ["OPENAI_API_KEY"], "model": "gpt-4o-mini"},
    "gemini": {"keys": ["GEMINI_API_KEY", "GOOGLE_API_KEY"], "model": "gemini-2.0-flash"},
    "grok": {"keys": ["XAI_API_KEY", "GROK_API_KEY"], "model": "grok-2-latest"},
}

# Friendly names people actually type -> canonical provider key.
_ALIASES: dict[str, str] = {
    "anthropic": "anthropic",
    "claude": "anthropic",
    "openai": "openai",
    "gpt": "openai",
    "chatgpt": "openai",
    "google": "gemini",
    "gemini": "gemini",
    "grok": "grok",
    "xai": "grok",
}

# xAI's Grok speaks the OpenAI wire protocol.
_GROK_BASE_URL = "https://api.x.ai/v1"

# Back-compat constant used by callers that pin the Anthropic default.
DEFAULT_MODEL = PROVIDERS["anthropic"]["model"]


def _normalize_provider(name: str | None) -> str | None:
    if not name:
        return None
    normalized = name.strip().lower()
    if normalized not in _ALIASES:
        raise LLMNotAvailable(f"Unknown LLM provider: {name}")
    return _ALIASES[normalized]


def _provider_key(provider: str, env_vars: dict[str, str] | None) -> str | None:
    """Resolve a provider's API key: process env wins, then a profile's env_vars."""
    for var in PROVIDERS[provider]["keys"]:
        val = os.environ.get(var)
        if val:
            return val
    if env_vars:
        for var in PROVIDERS[provider]["keys"]:
            if env_vars.get(var):
                return env_vars[var]
    return None


def _resolve_api_key(env_vars: dict[str, str] | None) -> str | None:
    """Anthropic key resolver (kept for back-compat and the /api/generate tests)."""
    return _provider_key("anthropic", env_vars)


def _select_provider(provider: str | None, env_vars: dict[str, str] | None) -> tuple[str, str]:
    """Return ``(provider, api_key)`` for the generic entry points.

    Raises :class:`LLMNotAvailable` if no provider can be resolved.
    """
    explicit = _normalize_provider(provider) or _normalize_provider(os.environ.get("LLM_PROVIDER"))
    candidates = [explicit] if explicit else list(PROVIDERS.keys())
    for name in candidates:
        key = _provider_key(name, env_vars)
        if key:
            return name, key
    all_vars = ", ".join(var for spec in PROVIDERS.values() for var in spec["keys"])
    raise LLMNotAvailable(f"No LLM provider configured — set one of: {all_vars}")


def _model_for(provider: str, model: str | None) -> str:
    return model or str(PROVIDERS[provider]["model"])


def provider_status(env_vars: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """List every provider with its default model and whether a key is configured."""
    return [
        {
            "id": name,
            "default_model": str(spec["model"]),
            "env_keys": list(spec["keys"]),
            "configured": _provider_key(name, env_vars) is not None,
        }
        for name, spec in PROVIDERS.items()
    ]


# ── Completion dispatch (lazy per-provider SDK imports) ───────────────────────
def _complete(
    system: str,
    user: str,
    *,
    provider: str,
    model: str,
    api_key: str,
    max_tokens: int = 4096,
) -> str:
    if provider == "anthropic":
        return _complete_anthropic(system, user, model, api_key, max_tokens)
    if provider == "openai":
        return _complete_openai(system, user, model, api_key, max_tokens, base_url=None)
    if provider == "grok":
        return _complete_openai(system, user, model, api_key, max_tokens, base_url=_GROK_BASE_URL)
    if provider == "gemini":
        return _complete_gemini(system, user, model, api_key, max_tokens)
    raise LLMNotAvailable(f"Unknown provider: {provider}")


def _complete_anthropic(system: str, user: str, model: str, api_key: str, max_tokens: int) -> str:
    try:
        from anthropic import Anthropic  # type: ignore[import-not-found]
    except ImportError as e:
        raise LLMNotAvailable("anthropic SDK not installed (pip install anthropic)") from e
    client = Anthropic(api_key=api_key)
    msg = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(getattr(block, "text", "") for block in msg.content).strip()


def _complete_openai(system: str, user: str, model: str, api_key: str, max_tokens: int, base_url: str | None) -> str:
    try:
        from openai import OpenAI  # type: ignore[import-not-found]
    except ImportError as e:
        raise LLMNotAvailable("openai SDK not installed (pip install openai)") from e
    client = OpenAI(api_key=api_key, base_url=base_url) if base_url else OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def _complete_gemini(system: str, user: str, model: str, api_key: str, max_tokens: int) -> str:
    try:
        import google.generativeai as genai  # type: ignore[import-not-found]
    except ImportError as e:
        raise LLMNotAvailable("google-generativeai SDK not installed (pip install google-generativeai)") from e
    genai.configure(api_key=api_key)
    gm = genai.GenerativeModel(model, system_instruction=system)
    resp = gm.generate_content(user, generation_config={"max_output_tokens": max_tokens})
    return (getattr(resp, "text", "") or "").strip()


# ── Tool catalog + prompts ────────────────────────────────────────────────────
def _load_tools_yaml() -> list[dict[str, Any]]:
    try:
        data = yaml.safe_load(TOOLS_FILE.read_text()) or {}
    except OSError:
        return []
    if isinstance(data, dict):
        tools = data.get("tools", [])
        return tools if isinstance(tools, list) else []
    return data if isinstance(data, list) else []


def _tool_catalog(tools: list[Any]) -> list[dict[str, Any]]:
    """Build a compact catalog from ``Tool`` objects (id/name/category/inputs/outputs)."""
    catalog: list[dict[str, Any]] = []
    for t in tools:
        catalog.append(
            {
                "id": getattr(t, "id", ""),
                "name": getattr(t, "name", ""),
                "category": getattr(t, "category", ""),
                "description": getattr(t, "description", ""),
                "inputs": list(getattr(t, "inputs", []) or []),
                "outputs": list(getattr(t, "outputs", []) or []),
            }
        )
    return catalog


def _tool_catalog_from_yaml() -> list[dict[str, Any]]:
    """Catalog for callers that don't already hold ``Tool`` objects."""
    return [
        {k: t.get(k) for k in ("id", "name", "category", "description", "inputs", "outputs")}
        for t in _load_tools_yaml()
    ]


def get_tools_summary() -> str:
    """A compact ``Category: tool, tool`` summary of the catalog for prompts."""
    by_cat: dict[str, list[str]] = {}
    for t in _load_tools_yaml():
        by_cat.setdefault(str(t.get("category", "Other")), []).append(str(t.get("id") or t.get("name", "")))
    return "\n".join(f"{cat}: {', '.join(names)}" for cat, names in sorted(by_cat.items()))


def _workflow_system_prompt(catalog: list[dict[str, Any]]) -> str:
    return (
        "You are a workflow generation assistant for mini-tricky, a local "
        "security-testing workflow builder. Given a natural-language goal and an "
        "optional scope/target, emit a single JSON object describing a workflow "
        "graph that chains the available tools end-to-end.\n\n"
        "Rules:\n"
        "- Use only tools from the catalog below; reference each by its id.\n"
        "- Return ONLY a JSON object: {name, description, nodes, edges}.\n"
        "- Each node: {id, kind: tool|variable|output|script|condition|loop, label, "
        "tool_id?, variable_type?, value?, params?, position?}.\n"
        "- Each edge: {id, source, target, source_handle, target_handle} using "
        "out:/in: typed sockets (e.g. out:domain -> in:domain).\n"
        "- Prefer efficient, low-noise pipelines; never suggest destructive or illegal actions.\n\n"
        "Tool catalog (JSON):\n" + json.dumps(catalog, indent=2)
    )


def _user_prompt(prompt: str, scope: str) -> str:
    scope_line = f"Scope / target: {scope}\n" if scope else ""
    return (
        f"{scope_line}Goal: {prompt}\n\nEmit the workflow JSON now. No prose, no markdown fences, just the JSON object."
    )


def _extract_json(text: str) -> dict[str, Any]:
    """Tolerant JSON-object extraction that strips ```json fences and stray prose."""
    value = _loads_lenient(text)
    if not isinstance(value, dict):
        raise LLMGenerationError("expected a JSON object")
    return value


def _loads_lenient(text: str) -> Any:
    """Parse JSON, tolerating code fences and surrounding prose."""
    s = text.strip()
    if s.startswith("```"):
        lines = s.splitlines()[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        for open_ch, close_ch in (("{", "}"), ("[", "]")):
            start = s.find(open_ch)
            end = s.rfind(close_ch)
            if start >= 0 and end > start:
                try:
                    return json.loads(s[start : end + 1])
                except json.JSONDecodeError:
                    continue
        raise


def _normalize_graph(obj: dict[str, Any]) -> dict[str, Any]:
    if isinstance(obj.get("graph"), dict):
        graph = obj["graph"]
    else:
        graph = {"nodes": obj.get("nodes", []), "edges": obj.get("edges", [])}
    return graph


# ── Public: Anthropic-backed generator behind /api/generate ───────────────────
def generate_workflow_via_claude(
    prompt: str,
    scope: str,
    tools: list[Any],
    env_vars: dict[str, str] | None = None,
    model: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    """Ask Claude to produce a workflow graph.

    Returns ``{name, description, graph}``. Raises :class:`LLMNotAvailable`
    (SDK/key missing) or :class:`LLMGenerationError` (unparseable after one
    retry) — the ``/api/generate`` endpoint turns both into its keyword fallback.
    """
    api_key = _resolve_api_key(env_vars)
    if not api_key:
        raise LLMNotAvailable("ANTHROPIC_API_KEY not set")

    system = _workflow_system_prompt(_tool_catalog(tools))
    user = _user_prompt(prompt, scope)

    last_error: Exception | None = None
    for _ in range(2):
        try:
            obj = _extract_json(_complete_anthropic(system, user, model, api_key, 4096))
        except LLMNotAvailable:
            raise
        except Exception as e:  # noqa: BLE001 — retry on anything non-fatal
            last_error = e
            user += f"\n\nYour previous attempt failed with: {e!s}. Return a valid JSON object matching the schema."
            continue

        graph = _normalize_graph(obj)
        if not isinstance(graph.get("nodes"), list) or not isinstance(graph.get("edges"), list):
            last_error = LLMGenerationError("response missing nodes/edges arrays")
            user += "\n\nYour previous attempt missed the nodes/edges arrays. Return valid JSON matching the schema."
            continue

        return {
            "name": obj.get("name") or "Generated Workflow",
            "description": obj.get("description") or "",
            "graph": graph,
        }

    raise LLMGenerationError(f"Claude generation failed after retries: {last_error}")


# ── Public: provider-agnostic helpers (Claude / OpenAI / Gemini / Grok) ───────
def generate_workflow(
    prompt: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    scope: str = "",
    env_vars: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Generate a workflow graph from natural language using any provider."""
    prov, api_key = _select_provider(provider, env_vars)
    mdl = _model_for(prov, model)
    system = _workflow_system_prompt(_tool_catalog_from_yaml())
    obj = _extract_json(_complete(system, _user_prompt(prompt, scope), provider=prov, model=mdl, api_key=api_key))
    graph = _normalize_graph(obj)
    if not isinstance(graph.get("nodes"), list) or not isinstance(graph.get("edges"), list):
        raise LLMGenerationError("response missing nodes/edges arrays")
    return {
        "name": obj.get("name") or "Generated Workflow",
        "description": obj.get("description") or "",
        "graph": graph,
        "provider": prov,
        "model": mdl,
    }


def explain_workflow(
    workflow: dict[str, Any],
    *,
    provider: str | None = None,
    model: str | None = None,
    env_vars: dict[str, str] | None = None,
) -> str:
    """Explain what a workflow does, in plain language."""
    prov, api_key = _select_provider(provider, env_vars)
    mdl = _model_for(prov, model)
    system = "You are an expert offensive-security engineer. Explain workflows clearly and concisely."
    user = "Explain this security workflow in simple terms:\n" + json.dumps(workflow, indent=2)
    return _complete(system, user, provider=prov, model=mdl, api_key=api_key, max_tokens=1500)


def debug_failed_run(
    workflow: dict[str, Any],
    logs: str,
    failed_node_id: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    env_vars: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Analyze a failed run and suggest fixes (returns structured JSON)."""
    prov, api_key = _select_provider(provider, env_vars)
    mdl = _model_for(prov, model)
    system = "You are debugging a failed security workflow. Return ONLY valid JSON."
    user = (
        "Workflow:\n" + json.dumps(workflow, indent=2) + "\n\n"
        f"Failed node id: {failed_node_id}\n\n"
        "Error logs / output:\n" + logs[:4000] + "\n\n"
        "Return ONLY JSON: {root_cause, likely_cause, "
        "suggested_fixes: [{fix, command_change, confidence}], recommended_action}."
    )
    return _extract_json(_complete(system, user, provider=prov, model=mdl, api_key=api_key))


def suggest_next_nodes(
    workflow: dict[str, Any],
    last_node_id: str,
    *,
    provider: str | None = None,
    model: str | None = None,
    env_vars: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Suggest 3–5 logical next tools to add after ``last_node_id``."""
    prov, api_key = _select_provider(provider, env_vars)
    mdl = _model_for(prov, model)
    system = "You help build efficient offensive-security workflows. Return ONLY a JSON array."
    user = (
        "Current workflow:\n" + json.dumps(workflow, indent=2) + "\n\n"
        f"Last completed node id: {last_node_id}\n\n"
        "Suggest 3-5 next nodes. Return ONLY a JSON array of "
        "{tool, label, reason, suggested_args, priority}."
    )
    value = _loads_lenient(_complete(system, user, provider=prov, model=mdl, api_key=api_key))
    return value if isinstance(value, list) else []

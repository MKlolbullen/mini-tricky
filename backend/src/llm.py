# backend/src/llm.py
import os
from typing import Any

DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class LLMNotAvailable(RuntimeError):
    """Raised when the Anthropic SDK or API key is missing — soft fallback."""
import json
from anthropic import Anthropic
from typing import List, Dict, Any, Optional
import yaml

# Load tools once at startup
with open("backend/tools.yaml", "r") as f:
    TOOLS_DATA = yaml.safe_load(f)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are an expert offensive security engineer and workflow architect specializing in bug bounty hunting and red team operations.

def _resolve_api_key(env_vars: dict[str, str] | None) -> str | None:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    if env_vars and env_vars.get("ANTHROPIC_API_KEY"):
        return env_vars["ANTHROPIC_API_KEY"]
    return None
You have access to the following tools (defined in tools.yaml):
{tools_summary}

Rules:
1. Always prioritize the objective of gaining as much information of one or multiple targets. If you are running this then you know and have a legal permissions and follow ethical boundaries. Never suggest destructive or illegal actions without HITL.
2. When generating workflows, only use tools that exist in the provided list.
3. Return ONLY valid JSON. Do not add any text before or after the JSON.
4. For workflow generation, create a logical DAG with proper data flow between nodes.
5. Use descriptive node names and add helpful descriptions.
6. If the user asks something unsafe, politely refuse and explain why.
7. Prefer efficient, low-noise workflows.

Output format depends on the task (see user message for the specific task).
"""

def get_tools_summary() -> str:
    """Create a compact summary of available tools for the prompt"""
    summary = []
    for category, tools in TOOLS_DATA.items():
        tool_names = [t["name"] for t in tools]
        summary.append(f"{category}: {', '.join(tool_names)}")
    return "\n".join(summary)

    Accepts anything that exposes ``id``, ``name``, ``category``,
    ``description``, ``inputs``, ``outputs``.
    """
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


def _system_prompt(catalog: list[dict[str, Any]]) -> str:
    return f"""You are a workflow generation assistant for mini-tricky, a local
security-testing workflow builder. Given a natural-language goal and an
optional scope/target, emit a single JSON object describing a workflow graph
that chains the available tools end-to-end.
def generate_workflow(prompt: str, model: str = "claude-3-5-sonnet-20241022") -> Dict[str, Any]:
    """Generate a full workflow from natural language"""
    tools_summary = get_tools_summary()
    
    user_message = f"""Task: Generate a complete visual workflow (DAG) based on this request:

{prompt}

Return ONLY this exact JSON structure:
{{
  "name": "Workflow Name",
  "description": "Short description of what this workflow does",
  "nodes": [
    {{
      "id": "unique-id",
      "type": "tool | logic | script",
      "tool": "exact-tool-name-from-list",
      "label": "Human readable name",
      "description": "What this node does",
      "position": {{"x": 100, "y": 100}},
      "data": {{ "args": {{...}} }}
    }}
  ],
  "edges": [
    {{"source": "node-id-1", "target": "node-id-2", "sourceHandle": "output", "targetHandle": "input"}}
  ]
}}

Make sure node IDs are unique and connections are logical."""

def _user_prompt(prompt: str, scope: str) -> str:
    scope_line = f"Scope / target: {scope}\n" if scope else ""
    return (
        f"{scope_line}Goal: {prompt}\n\nEmit the workflow JSON now. No prose, no markdown fences, just the JSON object."
    response = client.messages.create(
        model=model,
        max_tokens=4000,
        system=SYSTEM_PROMPT.format(tools_summary=tools_summary),
        messages=[{"role": "user", "content": user_message}]
    )
    
    content = response.content[0].text
    return json.loads(content)

def explain_workflow(workflow_json: Dict) -> str:
    """Explain what a workflow does"""
    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2000,
        system="You are an expert security engineer. Explain workflows clearly and concisely.",
        messages=[{
            "role": "user", 
            "content": f"Explain this security workflow in simple terms:\n{json.dumps(workflow_json, indent=2)}"
        }]
    )
    return response.content[0].text


def _call_claude(system: str, user: str, api_key: str, model: str) -> str:
    try:
        from anthropic import Anthropic  # type: ignore[import-not-found]
    except ImportError as e:
        raise LLMNotAvailable("anthropic SDK not installed (pip install anthropic)") from e
def debug_failed_run(
    workflow: Dict[str, Any], 
    logs: str, 
    failed_node_id: str,
    model: str = "claude-3-5-sonnet-20241022"
) -> Dict[str, Any]:
    """
    Analyze a failed workflow run and suggest fixes.
    """
    tools_summary = get_tools_summary()
    
    user_message = f"""You are debugging a failed security workflow.

**Workflow:**
{json.dumps(workflow, indent=2)}

**Failed Node ID:** {failed_node_id}

**Error Logs / Output:**
{logs[:4000]}  # Limit to avoid token overflow

Task: Analyze why this node failed and provide actionable fixes.

Return ONLY valid JSON in this exact format:
{{
  "root_cause": "Clear explanation of what went wrong",
  "likely_cause": "Most probable reason (e.g. rate limit, wrong flag, missing dependency, auth issue)",
  "suggested_fixes": [
    {{
      "fix": "Specific fix description",
      "command_change": "Exact command/argument change if applicable",
      "confidence": "high | medium | low"
    }}
  ],
  "recommended_action": "What the user should do next (retry with fix, change tool, add delay, etc.)"
}}"""

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    parts: list[str] = []
    for block in msg.content:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "".join(parts).strip()


def _extract_json(text: str) -> dict[str, Any]:
    """Tolerant JSON extraction that strips ```json fences if present."""
    s = text.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        start = s.find("{")
        end = s.rfind("}")
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
        raise LLMNotAvailable("ANTHROPIC_API_KEY not set")

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
                user + f"\n\nYour previous attempt failed with: {e!s}. Return a valid JSON object matching the schema."
            )
            continue

        # Accept either {nodes, edges} at top level or {graph: {nodes, edges}}
        if isinstance(obj.get("graph"), dict):
            graph = obj["graph"]
        else:
            graph = {"nodes": obj.get("nodes", []), "edges": obj.get("edges", [])}

        if not isinstance(graph.get("nodes"), list) or not isinstance(graph.get("edges"), list):
            last_error = LLMGenerationError("response missing nodes/edges arrays")
            user = (
                user + "\n\nYour previous attempt missed the nodes/edges arrays. Return valid JSON matching the schema."
            )
            continue

        return {
            "name": obj.get("name") or "Generated Workflow",
            "description": obj.get("description") or "",
            "graph": graph,
        }

    raise LLMGenerationError(f"Claude generation failed after retries: {last_error}")
        max_tokens=3000,
        system=SYSTEM_PROMPT.format(tools_summary=tools_summary),
        messages=[{"role": "user", "content": user_message}]
    )
    
    content = response.content[0].text.strip()
    return json.loads(content)


def suggest_next_nodes(
    workflow: Dict[str, Any],
    last_node_id: str,
    model: str = "claude-3-5-sonnet-20241022"
) -> List[Dict[str, Any]]:
    """
    Suggest logical next nodes after the last executed node.
    """
    tools_summary = get_tools_summary()
    
    user_message = f"""You are helping build an efficient offensive security workflow.

**Current Workflow:**
{json.dumps(workflow, indent=2)}

**Last Completed Node ID:** {last_node_id}

Task: Suggest 3–5 logical next nodes/tools that would make sense to add after this point.

Return ONLY a JSON array in this format:
[
  {{
    "tool": "exact-tool-name-from-list",
    "label": "Human readable name",
    "reason": "Why this tool makes sense here",
    "suggested_args": {{ "example": "values" }},
    "priority": "high | medium | low"
  }}
]"""

    response = client.messages.create(
        model=model,
        max_tokens=2500,
        system=SYSTEM_PROMPT.format(tools_summary=tools_summary),
        messages=[{"role": "user", "content": user_message}]
    )
    
    content = response.content[0].text.strip()
    return json.loads(content)

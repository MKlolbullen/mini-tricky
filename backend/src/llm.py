# backend/src/llm.py
import os
import json
from anthropic import Anthropic
from typing import List, Dict, Any, Optional
import yaml

# Load tools once at startup
with open("backend/tools.yaml", "r") as f:
    TOOLS_DATA = yaml.safe_load(f)

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are an expert offensive security engineer and workflow architect specializing in bug bounty hunting and red team operations.

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
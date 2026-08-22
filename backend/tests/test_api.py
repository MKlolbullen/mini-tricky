"""Smoke tests for the HTTP API.

Uses ``fastapi.testclient.TestClient`` (which is httpx under the hood) to
drive the real app. Each test uses a unique workflow id to avoid polluting
other tests if the shared state dir persists.
"""

from __future__ import annotations

import uuid


def _uid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def test_health_endpoint(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("status") == "ok"


def test_list_tools(client):
    resp = client.get("/api/tools")
    assert resp.status_code == 200
    tools = resp.json()
    assert isinstance(tools, list)
    assert len(tools) >= 70


def test_create_and_get_workflow(client):
    payload = {
        "name": _uid("wf-test"),
        "graph": {"nodes": [], "edges": []},
    }
    resp = client.post("/api/workflows", json=payload)
    assert resp.status_code == 200, resp.text
    created = resp.json()
    assert "id" in created
    wf_id = created["id"]

    listed = client.get("/api/workflows").json()
    assert any(w["id"] == wf_id for w in listed), "created workflow missing from list"


def test_delete_workflow(client):
    created = client.post(
        "/api/workflows",
        json={"name": _uid("wf-del"), "graph": {"nodes": [], "edges": []}},
    ).json()
    wf_id = created["id"]

    resp = client.delete(f"/api/workflows/{wf_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True

    listed = client.get("/api/workflows").json()
    assert not any(w["id"] == wf_id for w in listed), "deleted workflow still listed"


def test_profile_secret_routes_through_keychain(client):
    """End-to-end check that profile env_vars never leak secrets over HTTP.

    The ProfileView UI uses POST → GET → PUT → DELETE. At every hop the real
    ANTHROPIC_API_KEY should stay out of the response body.
    """
    from src import secrets_store  # late import so the TestClient startup runs first

    payload = {
        "name": _uid("prof-secret"),
        "description": "phase-d integration",
        "tool_overrides": {},
        "env_vars": {
            "ANTHROPIC_API_KEY": "sk-ant-hunter2",
            "LOG_LEVEL": "debug",
        },
    }

    created = client.post("/api/profiles", json=payload)
    assert created.status_code == 200, created.text
    created_body = created.json()
    pid = created_body["id"]

    # The response must not echo the real secret.
    assert "sk-ant-hunter2" not in created.text
    # Non-sensitive env_vars pass through verbatim.
    assert created_body["env_vars"]["LOG_LEVEL"] == "debug"
    # Sensitive env_vars are masked with bullets.
    masked = created_body["env_vars"]["ANTHROPIC_API_KEY"]
    assert masked != "sk-ant-hunter2"
    assert "\u2022" in masked

    # GET /api/profiles returns the same masked shape.
    listed = client.get("/api/profiles").json()
    me = next(p for p in listed if p["id"] == pid)
    assert "sk-ant-hunter2" not in client.get("/api/profiles").text
    assert "\u2022" in me["env_vars"]["ANTHROPIC_API_KEY"]

    # The real secret is reachable internally via the keychain, so the LLM
    # path can still use it.
    assert secrets_store.get_secret(pid, "ANTHROPIC_API_KEY") == "sk-ant-hunter2"

    # PUT with the bullet-mask on the sensitive field must preserve the value.
    update = {
        "name": created_body["name"],
        "description": "updated",
        "tool_overrides": {},
        "env_vars": {
            "ANTHROPIC_API_KEY": masked,  # UI echoed back the mask
            "LOG_LEVEL": "info",
        },
    }
    put_resp = client.put(f"/api/profiles/{pid}", json=update)
    assert put_resp.status_code == 200
    assert "sk-ant-hunter2" not in put_resp.text
    assert secrets_store.get_secret(pid, "ANTHROPIC_API_KEY") == "sk-ant-hunter2"

    # DELETE purges the keychain entry.
    del_resp = client.delete(f"/api/profiles/{pid}")
    assert del_resp.status_code == 200
    assert del_resp.json().get("ok") is True
    assert secrets_store.get_secret(pid, "ANTHROPIC_API_KEY") is None


def test_create_workflow_with_graph(client):
    payload = {
        "name": _uid("wf-graph"),
        "graph": {
            "nodes": [
                {
                    "id": "var-1",
                    "kind": "variable",
                    "label": "Target",
                    "variable_type": "domain",
                    "value": "example.com",
                    "position": {"x": 80, "y": 120},
                },
                {
                    "id": "out-1",
                    "kind": "output",
                    "label": "Artifacts",
                    "position": {"x": 360, "y": 120},
                },
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
        },
    }
    resp = client.post("/api/workflows", json=payload)
    assert resp.status_code == 200, resp.text
    wf_id = resp.json()["id"]

    # Round-trip through the single-workflow getter
    resp2 = client.get(f"/api/workflows/{wf_id}")
    assert resp2.status_code == 200
    fetched = resp2.json()
    assert fetched["name"] == payload["name"]
    assert len(fetched["graph"]["nodes"]) == 2
    assert len(fetched["graph"]["edges"]) == 1

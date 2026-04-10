"""Smoke tests for the HTTP API.

Uses ``fastapi.testclient.TestClient`` (which is httpx under the hood) to
drive the real app. Each test uses a unique workflow id to avoid polluting
other tests if the shared state dir persists.
"""

from __future__ import annotations

import uuid


def _uid(prefix: str) -> str:
    return f'{prefix}-{uuid.uuid4().hex[:8]}'


def test_health_endpoint(client):
    resp = client.get('/api/health')
    assert resp.status_code == 200
    body = resp.json()
    assert body.get('status') == 'ok'


def test_list_tools(client):
    resp = client.get('/api/tools')
    assert resp.status_code == 200
    tools = resp.json()
    assert isinstance(tools, list)
    assert len(tools) >= 70


def test_create_and_get_workflow(client):
    payload = {
        'name': _uid('wf-test'),
        'graph': {'nodes': [], 'edges': []},
    }
    resp = client.post('/api/workflows', json=payload)
    assert resp.status_code == 200, resp.text
    created = resp.json()
    assert 'id' in created
    wf_id = created['id']

    listed = client.get('/api/workflows').json()
    assert any(w['id'] == wf_id for w in listed), 'created workflow missing from list'


def test_create_workflow_with_graph(client):
    payload = {
        'name': _uid('wf-graph'),
        'graph': {
            'nodes': [
                {
                    'id': 'var-1',
                    'kind': 'variable',
                    'label': 'Target',
                    'variable_type': 'domain',
                    'value': 'example.com',
                    'position': {'x': 80, 'y': 120},
                },
                {
                    'id': 'out-1',
                    'kind': 'output',
                    'label': 'Artifacts',
                    'position': {'x': 360, 'y': 120},
                },
            ],
            'edges': [
                {
                    'id': 'e1',
                    'source': 'var-1',
                    'target': 'out-1',
                    'source_handle': 'out:domain',
                    'target_handle': 'in:any',
                },
            ],
        },
    }
    resp = client.post('/api/workflows', json=payload)
    assert resp.status_code == 200, resp.text
    wf_id = resp.json()['id']

    # Round-trip through the single-workflow getter
    resp2 = client.get(f'/api/workflows/{wf_id}')
    assert resp2.status_code == 200
    fetched = resp2.json()
    assert fetched['name'] == payload['name']
    assert len(fetched['graph']['nodes']) == 2
    assert len(fetched['graph']['edges']) == 1

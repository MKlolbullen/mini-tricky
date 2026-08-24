from __future__ import annotations

import pytest
from fastapi import FastAPI, WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from src.secure_entry import SessionAuthMiddleware


def _test_app(token: str = "test-session-token") -> FastAPI:
    app = FastAPI()

    @app.get("/api/ping")
    def ping() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/public")
    def public() -> dict[str, bool]:
        return {"ok": True}

    @app.websocket("/ws/echo")
    async def echo(websocket: WebSocket) -> None:
        await websocket.accept()
        text = await websocket.receive_text()
        await websocket.send_text(text)

    app.add_middleware(SessionAuthMiddleware, token=token)
    return app


def test_api_rejects_missing_or_wrong_session_token() -> None:
    client = TestClient(_test_app())

    assert client.get("/api/ping").status_code == 401
    assert client.get("/api/ping", headers={"X-Mini-Tricky-Token": "wrong"}).status_code == 401


def test_api_accepts_header_and_query_session_token() -> None:
    client = TestClient(_test_app())

    by_header = client.get("/api/ping", headers={"X-Mini-Tricky-Token": "test-session-token"})
    by_query = client.get("/api/ping?mt_token=test-session-token")

    assert by_header.status_code == 200
    assert by_header.json() == {"ok": True}
    assert by_query.status_code == 200


def test_non_api_routes_are_not_token_gated() -> None:
    client = TestClient(_test_app())
    response = client.get("/public")
    assert response.status_code == 200


def test_auth_can_be_disabled_for_web_mode() -> None:
    client = TestClient(_test_app(token=""))
    assert client.get("/api/ping").status_code == 200


def test_websocket_requires_query_token() -> None:
    client = TestClient(_test_app())

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/echo"):
            pass
    assert exc.value.code == 4401

    with client.websocket_connect("/ws/echo?mt_token=test-session-token") as websocket:
        websocket.send_text("hello")
        assert websocket.receive_text() == "hello"

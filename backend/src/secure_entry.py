"""Security wrapper around the mini-tricky FastAPI application.

The application in :mod:`src.main` intentionally stays focused on workflow
behavior. This module owns process-boundary policy used by Electron and web
mode: restricted CORS plus an optional per-process session token.

When ``MINI_TRICKY_SESSION_TOKEN`` is unset (normal browser/web development),
authentication is disabled but CORS is still restricted to local UI origins.
Packaged Electron generates a random token and passes it to the backend.
"""

from __future__ import annotations

import os
import secrets
from urllib.parse import parse_qs

from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from .main import app

TOKEN_ENV = "MINI_TRICKY_SESSION_TOKEN"
ALLOWED_ORIGINS_ENV = "MINI_TRICKY_ALLOWED_ORIGINS"
TOKEN_HEADER = b"x-mini-tricky-token"
TOKEN_QUERY = "mt_token"
DEFAULT_ALLOWED_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "null",  # packaged Electron file:// renderer
)


def _configured_origins() -> list[str]:
    raw = os.environ.get(ALLOWED_ORIGINS_ENV, "")
    if not raw.strip():
        return list(DEFAULT_ALLOWED_ORIGINS)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _query_token(scope: Scope) -> str:
    raw = scope.get("query_string", b"")
    try:
        values = parse_qs(raw.decode("utf-8"), keep_blank_values=False).get(TOKEN_QUERY, [])
    except (UnicodeDecodeError, ValueError):
        return ""
    return values[0] if values else ""


def _header_token(scope: Scope) -> str:
    for name, value in scope.get("headers", []):
        if name.lower() == TOKEN_HEADER:
            try:
                return value.decode("utf-8")
            except UnicodeDecodeError:
                return ""
    return ""


class SessionAuthMiddleware:
    """Require the Electron session token for API and WebSocket traffic.

    The token may be supplied in ``X-Mini-Tricky-Token`` for HTTP requests.
    Query-string authentication is also accepted because browser WebSocket
    constructors and direct download links cannot attach arbitrary headers.
    """

    def __init__(self, app: ASGIApp, token: str = "") -> None:
        self.app = app
        self.token = token

    def _protected(self, scope: Scope) -> bool:
        path = str(scope.get("path", ""))
        return path.startswith("/api") or path.startswith("/ws")

    def _authorized(self, scope: Scope) -> bool:
        if not self.token or not self._protected(scope):
            return True
        candidate = _header_token(scope) or _query_token(scope)
        return bool(candidate) and secrets.compare_digest(candidate, self.token)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if self._authorized(scope):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 4401, "reason": "Unauthorized"})
            return

        if scope["type"] == "http":
            body = b'{"detail":"Unauthorized local API request"}'
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode("ascii")),
                        (b"cache-control", b"no-store"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return

        await self.app(scope, receive, send)


# src.main historically installed a permissive CORS layer. Remove it here and
# replace it with the local UI origins accepted by the secure entrypoint.
app.user_middleware = [item for item in app.user_middleware if item.cls is not CORSMiddleware]
app.middleware_stack = None

# Authentication is installed first so the CORS layer added below becomes the
# outer middleware. That lets valid browser preflight OPTIONS requests complete
# without needing to carry the actual session token.
app.add_middleware(SessionAuthMiddleware, token=os.environ.get(TOKEN_ENV, ""))
app.add_middleware(
    CORSMiddleware,
    allow_origins=_configured_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Mini-Tricky-Token"],
)

"""Shared test fixtures for mini-tricky backend tests.

Ensures the ``src`` package is importable regardless of where pytest is
launched from, and exposes a FastAPI TestClient fixture that the API tests
can depend on.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make ``src`` importable without requiring an editable install.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(scope="session")
def client():
    """FastAPI TestClient bound to the real app.

    The app calls ``db.init_db(STATE_DIR)`` at import time, which writes to
    ``backend/state/mini-tricky.db``. Tests that touch persistence should
    use unique ids (e.g. ``f'test-{uuid4().hex[:8]}'``) and clean up after
    themselves.
    """
    from fastapi.testclient import TestClient

    from src.main import app

    with TestClient(app) as c:
        yield c

"""Unit tests for the SQLite persistence layer.

These run against an isolated temp dir so they don't touch the real
``backend/state/mini-tricky.db``. Each test re-imports ``src.db`` with a
clean connection by tearing down the module-level state via the
``_reset_db`` helper.
"""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest


@pytest.fixture
def tmp_db(tmp_path: Path):
    """Fresh db module bound to a tmp dir — isolates each test."""
    import src.db as db_mod

    # Reset module-level globals before re-init.
    if db_mod._CONN is not None:
        db_mod._CONN.close()
    db_mod._CONN = None
    db_mod._DB_PATH = None

    db_mod.init_db(tmp_path)
    yield db_mod

    # Tear down so the next test (and the real app) gets a clean slate.
    if db_mod._CONN is not None:
        db_mod._CONN.close()
    db_mod._CONN = None
    db_mod._DB_PATH = None

    # Re-init against the real state dir so any test that imports src.main
    # afterwards still works.
    from src.main import STATE_DIR

    importlib.reload(db_mod)
    db_mod.init_db(STATE_DIR)


def test_workflow_round_trip(tmp_db):
    tmp_db.upsert_workflow({"id": "wf-1", "name": "Test", "graph": {"nodes": [], "edges": []}})
    got = tmp_db.get_workflow("wf-1")
    assert got is not None
    assert got["name"] == "Test"

    listed = tmp_db.list_workflows()
    assert any(w["id"] == "wf-1" for w in listed)


def test_workflow_delete(tmp_db):
    tmp_db.upsert_workflow({"id": "wf-del", "name": "ToDelete", "graph": {"nodes": [], "edges": []}})
    assert tmp_db.get_workflow("wf-del") is not None
    tmp_db.delete_workflow("wf-del")
    assert tmp_db.get_workflow("wf-del") is None


def test_run_round_trip(tmp_db):
    tmp_db.upsert_run(
        {
            "id": "run-1",
            "workflow_id": "wf-1",
            "status": "queued",
            "name": "Test Run",
        }
    )
    got = tmp_db.get_run("run-1")
    assert got is not None
    assert got["status"] == "queued"


def test_schedules_replace(tmp_db):
    tmp_db.save_schedules(
        [
            {"id": "s1", "workflow_id": "wf-1", "enabled": True, "cron": "0 0 * * *"},
            {"id": "s2", "workflow_id": "wf-2", "enabled": False, "cron": "*/5 * * * *"},
        ]
    )
    got = tmp_db.list_schedules()
    assert len(got) == 2

    # save_schedules is a full replace, not an upsert
    tmp_db.save_schedules([{"id": "s3", "workflow_id": "wf-3", "enabled": True, "cron": "@daily"}])
    got = tmp_db.list_schedules()
    assert len(got) == 1
    assert got[0]["id"] == "s3"

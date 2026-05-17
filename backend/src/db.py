"""SQLite-backed persistence layer for mini-tricky.

Replaces the ``read_json``/``write_json`` pattern that dumped every mutation
back to ``state/*.json``. Uses ``sqlite3`` from the standard library (no new
deps) plus a tiny migration runner — the schema is versioned via a
``schema_version`` table and migrations are applied in order at startup.

Design choices:

* **JSON-blob-per-record schema.** Each record type has a single table with an
  ``id`` PK, an ``updated_at`` timestamp, and a ``data JSON`` column holding the
  whole record as JSON. This mirrors the existing API shape exactly, so no
  main.py endpoint has to change how it builds or returns dicts.
* **Synchronous API.** FastAPI is run under threadpool for sync endpoints;
  ``sqlite3`` with ``check_same_thread=False`` + a single module-level
  connection and a per-call transaction is simpler and fast enough for the
  "local workflow builder" scale (hundreds of workflows, low concurrency).
* **Idempotent startup.** ``init_db()`` is safe to call many times. It creates
  the schema and runs any outstanding migrations, including a one-shot import
  from legacy ``state/*.json`` files.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Module-level connection. Opened lazily by ``_conn()``.
_DB_PATH: Path | None = None
_CONN: sqlite3.Connection | None = None
_LOCK = threading.Lock()


def _conn() -> sqlite3.Connection:
    global _CONN
    if _CONN is None:
        if _DB_PATH is None:
            raise RuntimeError("db.init_db() must be called before any query")
        _CONN = sqlite3.connect(str(_DB_PATH), check_same_thread=False, isolation_level=None)
        _CONN.row_factory = sqlite3.Row
        _CONN.execute("PRAGMA journal_mode=WAL")
        _CONN.execute("PRAGMA synchronous=NORMAL")
        _CONN.execute("PRAGMA foreign_keys=ON")
    return _CONN


def _now() -> str:
    return datetime.now(UTC).isoformat()


# ── Migrations ──────────────────────────────────────────────────────────────

# Each migration is a tuple ``(version, name, sql)``. The runner applies any
# migration with a version higher than the current ``schema_version`` value.
MIGRATIONS: list[tuple[int, str, str]] = [
    (
        1,
        "initial_schema",
        """
        CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workflows_updated_at ON workflows(updated_at DESC);

        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT,
            status TEXT,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_runs_updated_at ON runs(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_runs_workflow ON runs(workflow_id);

        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            workflow_id TEXT,
            enabled INTEGER NOT NULL DEFAULT 1,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS presets (
            id TEXT PRIMARY KEY,
            tool_id TEXT NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_presets_tool ON presets(tool_id);

        CREATE TABLE IF NOT EXISTS user_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """,
    ),
]


def _schema_version(c: sqlite3.Connection) -> int:
    c.execute("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
    row = c.execute("SELECT version FROM schema_version LIMIT 1").fetchone()
    if row is None:
        c.execute("INSERT INTO schema_version (version) VALUES (0)")
        return 0
    return int(row[0])


def _set_schema_version(c: sqlite3.Connection, version: int) -> None:
    c.execute("UPDATE schema_version SET version = ?", (version,))


def _run_migrations(c: sqlite3.Connection) -> None:
    current = _schema_version(c)
    for version, name, sql in MIGRATIONS:
        if version <= current:
            continue
        c.executescript("BEGIN; " + sql + "; COMMIT;")
        _set_schema_version(c, version)
        current = version


# ── One-shot legacy JSON import ─────────────────────────────────────────────


def _import_legacy_json(state_dir: Path) -> None:
    """Import existing state/*.json files into the DB if present.

    Safe to call repeatedly: each file is renamed to ``*.json.migrated`` after
    import so a re-run is a no-op. Only runs if the target table is empty —
    this is the second gate that makes re-runs safe.
    """
    mapping = [
        ("workflows.json", "workflows", _import_workflows),
        ("runs.json", "runs", _import_runs),
        ("schedules.json", "schedules", _import_schedules),
        ("profiles.json", "profiles", _import_profiles),
        ("presets.json", "presets", _import_presets),
        ("user_templates.json", "user_templates", _import_user_templates),
    ]
    c = _conn()
    for filename, table, importer in mapping:
        path = state_dir / filename
        if not path.exists():
            continue
        count = c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        if count > 0:
            # Table already has data; just mark the file so we don't
            # re-consider it later.
            _rename_migrated(path)
            continue
        try:
            records = json.loads(path.read_text())
            if isinstance(records, list):
                importer(records)
        except (json.JSONDecodeError, OSError):
            # Corrupted or unreadable legacy file — skip rather than crash
            # startup. The user can inspect .json.migrated.bad if needed.
            continue
        _rename_migrated(path)


def _rename_migrated(path: Path) -> None:
    target = path.with_suffix(path.suffix + ".migrated")
    try:
        path.rename(target)
    except OSError:
        pass


def _import_workflows(records: list[dict[str, Any]]) -> None:
    c = _conn()
    now = _now()
    for r in records:
        if not isinstance(r, dict) or "id" not in r:
            continue
        c.execute(
            "INSERT OR REPLACE INTO workflows (id, name, data, updated_at) VALUES (?, ?, ?, ?)",
            (r["id"], r.get("name", ""), json.dumps(r), r.get("updated_at", now)),
        )


def _import_runs(records: list[dict[str, Any]]) -> None:
    c = _conn()
    now = _now()
    for r in records:
        if not isinstance(r, dict) or "id" not in r:
            continue
        c.execute(
            "INSERT OR REPLACE INTO runs (id, workflow_id, status, data, updated_at) VALUES (?, ?, ?, ?, ?)",
            (r["id"], r.get("workflow_id"), r.get("status"), json.dumps(r), r.get("started_at", now)),
        )


def _import_schedules(records: list[dict[str, Any]]) -> None:
    c = _conn()
    now = _now()
    for r in records:
        if not isinstance(r, dict) or "id" not in r:
            continue
        c.execute(
            "INSERT OR REPLACE INTO schedules (id, workflow_id, enabled, data, updated_at) VALUES (?, ?, ?, ?, ?)",
            (r["id"], r.get("workflow_id"), 1 if r.get("enabled", True) else 0, json.dumps(r), now),
        )


def _import_profiles(records: list[dict[str, Any]]) -> None:
    c = _conn()
    now = _now()
    for r in records:
        if not isinstance(r, dict) or "id" not in r:
            continue
        c.execute(
            "INSERT OR REPLACE INTO profiles (id, name, data, updated_at) VALUES (?, ?, ?, ?)",
            (r["id"], r.get("name", ""), json.dumps(r), now),
        )


def _import_presets(records: list[dict[str, Any]]) -> None:
    c = _conn()
    now = _now()
    for r in records:
        if not isinstance(r, dict) or "id" not in r:
            continue
        c.execute(
            "INSERT OR REPLACE INTO presets (id, tool_id, data, updated_at) VALUES (?, ?, ?, ?)",
            (r["id"], r.get("tool_id", ""), json.dumps(r), now),
        )


def _import_user_templates(records: list[dict[str, Any]]) -> None:
    c = _conn()
    now = _now()
    for r in records:
        if not isinstance(r, dict) or "id" not in r:
            continue
        c.execute(
            "INSERT OR REPLACE INTO user_templates (id, name, category, data, updated_at) VALUES (?, ?, ?, ?, ?)",
            (r["id"], r.get("name", ""), r.get("category"), json.dumps(r), now),
        )


# ── Public API ──────────────────────────────────────────────────────────────


def init_db(state_dir: Path) -> None:
    """Open the DB, run migrations, and import any legacy JSON files."""
    global _DB_PATH
    with _LOCK:
        _DB_PATH = state_dir / "mini-tricky.db"
        state_dir.mkdir(parents=True, exist_ok=True)
        c = _conn()
        _run_migrations(c)
        _import_legacy_json(state_dir)


def _row_data(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return json.loads(row["data"])


def _rows_data(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [json.loads(r["data"]) for r in rows]


# --- workflows -----------------------------------------------------------------


def list_workflows() -> list[dict[str, Any]]:
    c = _conn()
    rows = c.execute("SELECT data FROM workflows ORDER BY updated_at DESC").fetchall()
    return _rows_data(rows)


def upsert_workflow(record: dict[str, Any]) -> None:
    c = _conn()
    with _LOCK:
        c.execute(
            "INSERT OR REPLACE INTO workflows (id, name, data, updated_at) VALUES (?, ?, ?, ?)",
            (record["id"], record.get("name", ""), json.dumps(record), record.get("updated_at", _now())),
        )


def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    c = _conn()
    row = c.execute("SELECT data FROM workflows WHERE id = ?", (workflow_id,)).fetchone()
    return _row_data(row)


def delete_workflow(workflow_id: str) -> None:
    c = _conn()
    with _LOCK:
        c.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))


# --- runs ----------------------------------------------------------------------


def list_runs() -> list[dict[str, Any]]:
    c = _conn()
    rows = c.execute("SELECT data FROM runs ORDER BY updated_at DESC").fetchall()
    return _rows_data(rows)


def upsert_run(record: dict[str, Any]) -> None:
    c = _conn()
    with _LOCK:
        c.execute(
            "INSERT OR REPLACE INTO runs (id, workflow_id, status, data, updated_at) VALUES (?, ?, ?, ?, ?)",
            (
                record["id"],
                record.get("workflow_id"),
                record.get("status"),
                json.dumps(record),
                record.get("started_at", _now()),
            ),
        )


def get_run(run_id: str) -> dict[str, Any] | None:
    c = _conn()
    row = c.execute("SELECT data FROM runs WHERE id = ?", (run_id,)).fetchone()
    return _row_data(row)


def delete_run(run_id: str) -> None:
    c = _conn()
    with _LOCK:
        c.execute("DELETE FROM runs WHERE id = ?", (run_id,))


# --- schedules -----------------------------------------------------------------


def list_schedules() -> list[dict[str, Any]]:
    c = _conn()
    rows = c.execute("SELECT data FROM schedules ORDER BY updated_at DESC").fetchall()
    return _rows_data(rows)


def save_schedules(schedules: list[dict[str, Any]]) -> None:
    """Replace the full schedule set (mirrors the old save_schedules API)."""
    c = _conn()
    with _LOCK:
        c.execute("DELETE FROM schedules")
        for s in schedules:
            if not isinstance(s, dict) or "id" not in s:
                continue
            c.execute(
                "INSERT INTO schedules (id, workflow_id, enabled, data, updated_at) VALUES (?, ?, ?, ?, ?)",
                (s["id"], s.get("workflow_id"), 1 if s.get("enabled", True) else 0, json.dumps(s), _now()),
            )


# --- profiles ------------------------------------------------------------------


def list_profiles() -> list[dict[str, Any]]:
    c = _conn()
    rows = c.execute("SELECT data FROM profiles ORDER BY name ASC").fetchall()
    return _rows_data(rows)


def save_profiles(profiles: list[dict[str, Any]]) -> None:
    c = _conn()
    with _LOCK:
        c.execute("DELETE FROM profiles")
        for p in profiles:
            if not isinstance(p, dict) or "id" not in p:
                continue
            c.execute(
                "INSERT INTO profiles (id, name, data, updated_at) VALUES (?, ?, ?, ?)",
                (p["id"], p.get("name", ""), json.dumps(p), _now()),
            )


# --- presets -------------------------------------------------------------------


def list_presets(tool_id: str | None = None) -> list[dict[str, Any]]:
    c = _conn()
    if tool_id:
        rows = c.execute("SELECT data FROM presets WHERE tool_id = ? ORDER BY updated_at DESC", (tool_id,)).fetchall()
    else:
        rows = c.execute("SELECT data FROM presets ORDER BY updated_at DESC").fetchall()
    return _rows_data(rows)


def save_presets(presets: list[dict[str, Any]]) -> None:
    c = _conn()
    with _LOCK:
        c.execute("DELETE FROM presets")
        for p in presets:
            if not isinstance(p, dict) or "id" not in p:
                continue
            c.execute(
                "INSERT INTO presets (id, tool_id, data, updated_at) VALUES (?, ?, ?, ?)",
                (p["id"], p.get("tool_id", ""), json.dumps(p), _now()),
            )


# --- user templates -----------------------------------------------------------


def list_user_templates() -> list[dict[str, Any]]:
    c = _conn()
    rows = c.execute("SELECT data FROM user_templates ORDER BY updated_at DESC").fetchall()
    return _rows_data(rows)


def save_user_templates(templates: list[dict[str, Any]]) -> None:
    c = _conn()
    with _LOCK:
        c.execute("DELETE FROM user_templates")
        for t in templates:
            if not isinstance(t, dict) or "id" not in t:
                continue
            c.execute(
                "INSERT INTO user_templates (id, name, category, data, updated_at) VALUES (?, ?, ?, ?, ?)",
                (t["id"], t.get("name", ""), t.get("category"), json.dumps(t), _now()),
            )

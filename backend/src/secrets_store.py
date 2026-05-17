"""Per-profile secret storage backed by the OS keychain.

Sensitive entries in a profile's ``env_vars`` (API keys, tokens, passwords —
anything whose key matches :data:`SENSITIVE_KEY_PATTERNS`) are routed through
this module instead of being persisted to the SQLite ``profiles.data`` JSON
blob. The blob keeps a :data:`SENTINEL` marker so the API and UI still
reflect "a secret is set", while the real value lives in the OS keychain:

* macOS Keychain via ``keyring.backends.macOS.Keyring``
* Windows Credential Manager via ``keyring.backends.Windows.WinVaultKeyring``
* Linux SecretService (GNOME Keyring / KWallet) via
  ``keyring.backends.SecretService.Keyring``

If no usable keyring is available (headless CI, Docker without dbus, tests),
we fall back to a JSON file with ``0600`` permissions at
``state/secrets-fallback.json``. The fallback keeps the app running but is
obviously weaker than the OS keychain — users get a one-line warning from
:func:`init_secrets_store` on startup so they can fix their environment.

Service name (keyring ``service``): :data:`SERVICE_NAME`
Username (keyring ``username``): ``<profile_id>::<env_var_name>``
"""

from __future__ import annotations

import fnmatch
import json
import logging
import os
import stat
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Public constants ─────────────────────────────────────────────────────────

SERVICE_NAME = "mini-tricky"
SENTINEL = "__mini_tricky_secret__"
# Stable placeholder the API returns for sensitive values. Keeping the exact
# string pinned makes it round-trippable: when the UI echoes this back on a
# PUT the server can recognise "no change, keep the existing keychain value".
MASK_PLACEHOLDER = "\u2022" * 8

# Keys matching any of these fnmatch patterns (case-insensitive) are treated
# as sensitive. Additive over time — add new vendor-specific patterns here.
SENSITIVE_KEY_PATTERNS: tuple[str, ...] = (
    "*_API_KEY",
    "*_APIKEY",
    "*_TOKEN",
    "*_SECRET",
    "*_PASSWORD",
    "*_PWD",
    "*_PRIVATE_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "SHODAN_API_KEY",
    "CENSYS_API_ID",
    "CENSYS_API_SECRET",
    "VT_API_KEY",
    "VIRUSTOTAL_API_KEY",
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "CHAOS_KEY",
    "GOOGLE_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
)


def is_sensitive(key: str) -> bool:
    """Return True if ``key`` looks like a secret we should route to keyring."""
    k = key.upper()
    return any(fnmatch.fnmatchcase(k, pat) for pat in SENSITIVE_KEY_PATTERNS)


def mask(value: str) -> str:
    """Return a UI-safe preview of ``value``.

    * Empty / sentinel → ``''``
    * <= 4 chars → ``'****'``
    * otherwise → ``'••••' + last 4 chars``
    """
    if not value or value == SENTINEL:
        return ""
    if len(value) <= 4:
        return "****"
    return "\u2022" * 4 + value[-4:]


# ── Backend plumbing ─────────────────────────────────────────────────────────
#
# We keep the OS-keyring call site behind a thin indirection so the file
# fallback can slot in without touching the public API. The active backend is
# picked exactly once by :func:`init_secrets_store` and cached on the module.

_backend: _Backend | None = None
_fallback_path: Path | None = None


class _Backend:
    """Interface that both the keyring and fallback backends implement."""

    name: str = "unknown"

    def get(self, username: str) -> str | None:  # pragma: no cover - abstract
        raise NotImplementedError

    def set(self, username: str, value: str) -> None:  # pragma: no cover - abstract
        raise NotImplementedError

    def delete(self, username: str) -> None:  # pragma: no cover - abstract
        raise NotImplementedError

    def list_usernames(self) -> list[str]:  # pragma: no cover - abstract
        """Return every known username. Used by ``delete_profile_secrets``."""
        raise NotImplementedError


class _KeyringBackend(_Backend):
    name = "keyring"

    def __init__(self, module: Any) -> None:
        self._kr = module
        # A session-only index so delete_profile_secrets can find everything
        # we ever stored for a profile. Keyring has no ``list`` API, so we
        # keep a side index in the fallback JSON file to share state.
        self._index_path = _fallback_path.with_suffix(".index.json") if _fallback_path else None

    def _load_index(self) -> dict[str, list[str]]:
        if not self._index_path or not self._index_path.exists():
            return {}
        try:
            data = json.loads(self._index_path.read_text())
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError):
            return {}

    def _save_index(self, index: dict[str, list[str]]) -> None:
        if not self._index_path:
            return
        try:
            self._index_path.write_text(json.dumps(index, indent=2, sort_keys=True))
            os.chmod(self._index_path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError as e:
            logger.warning("Failed to persist secrets index: %s", e)

    def get(self, username: str) -> str | None:
        try:
            return self._kr.get_password(SERVICE_NAME, username)
        except Exception as e:  # noqa: BLE001 - keyring raises many subclasses
            logger.warning("keyring get failed for %s: %s", username, e)
            return None

    def set(self, username: str, value: str) -> None:
        self._kr.set_password(SERVICE_NAME, username, value)
        index = self._load_index()
        known = set(index.get(SERVICE_NAME, []))
        known.add(username)
        index[SERVICE_NAME] = sorted(known)
        self._save_index(index)

    def delete(self, username: str) -> None:
        try:
            self._kr.delete_password(SERVICE_NAME, username)
        except Exception as e:  # noqa: BLE001
            logger.debug("keyring delete for %s: %s", username, e)
        index = self._load_index()
        known = [u for u in index.get(SERVICE_NAME, []) if u != username]
        index[SERVICE_NAME] = known
        self._save_index(index)

    def list_usernames(self) -> list[str]:
        return list(self._load_index().get(SERVICE_NAME, []))


class _FileBackend(_Backend):
    """Plaintext JSON fallback. ``0600`` perms on POSIX, best-effort on Windows."""

    name = "file"

    def __init__(self, path: Path) -> None:
        self.path = path

    def _read(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text())
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError):
            return {}

    def _write(self, data: dict[str, str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2, sort_keys=True))
        try:
            os.chmod(self.path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            # Windows / unusual filesystems — best effort.
            pass

    def get(self, username: str) -> str | None:
        return self._read().get(username)

    def set(self, username: str, value: str) -> None:
        data = self._read()
        data[username] = value
        self._write(data)

    def delete(self, username: str) -> None:
        data = self._read()
        if username in data:
            del data[username]
            self._write(data)

    def list_usernames(self) -> list[str]:
        return sorted(self._read().keys())


def init_secrets_store(state_dir: Path) -> None:
    """Pick a backend and cache it on the module.

    Called once from the FastAPI startup path (same place that calls
    ``db.init_db``). Safe to call multiple times — later calls are no-ops.
    """
    global _backend, _fallback_path
    if _backend is not None:
        return

    state_dir.mkdir(parents=True, exist_ok=True)
    _fallback_path = state_dir / "secrets-fallback.json"

    # Try the real keyring first. A missing module, no backend, a dbus
    # failure on headless Linux, or a broken transitive C-extension
    # (cryptography / pyo3 PanicException) all fall through to the file
    # backend. We catch BaseException here because pyo3 panics inherit
    # from BaseException, not Exception.
    try:
        import keyring  # type: ignore[import-not-found]
        from keyring.errors import NoKeyringError  # type: ignore[import-not-found]

        # Smoke-test the backend — some platforms return a fake backend that
        # raises ``NoKeyringError`` on first use, not on import.
        try:
            keyring.get_password(SERVICE_NAME, "__ping__")
        except NoKeyringError:
            raise
        except BaseException:
            # Any other error here is treated as "the backend is fine, we
            # just asked for a missing entry". A backend that is actually
            # broken will fail again on the first real get/set call and
            # that code path also degrades gracefully.
            pass

        _backend = _KeyringBackend(keyring)
        logger.info("secrets_store: using OS keychain (%s)", type(keyring.get_keyring()).__name__)
    except BaseException as e:  # noqa: BLE001 — ImportError, NoKeyringError, PanicException, ...
        _backend = _FileBackend(_fallback_path)
        logger.warning(
            "secrets_store: OS keychain unavailable (%s); falling back to %s. "
            "Secrets will be stored plaintext with 0600 perms — install "
            "`keyring` and a backend (macOS: built-in; Windows: built-in; "
            "Linux: secretstorage + dbus) for the hardened path.",
            e,
            _fallback_path,
        )


def backend_name() -> str:
    """Return ``'keyring'`` or ``'file'`` (for diagnostics / health endpoints)."""
    return _backend.name if _backend else "uninitialized"


def _require_backend() -> _Backend:
    if _backend is None:
        raise RuntimeError("secrets_store.init_secrets_store() must be called first")
    return _backend


# ── Public CRUD ──────────────────────────────────────────────────────────────


def _username(profile_id: str, env_key: str) -> str:
    return f"{profile_id}::{env_key}"


def get_secret(profile_id: str, env_key: str) -> str | None:
    """Fetch a single secret, or ``None`` if not set."""
    return _require_backend().get(_username(profile_id, env_key))


def set_secret(profile_id: str, env_key: str, value: str) -> None:
    """Persist a secret for ``profile_id``."""
    _require_backend().set(_username(profile_id, env_key), value)


def delete_secret(profile_id: str, env_key: str) -> None:
    """Remove a single secret for ``profile_id``."""
    _require_backend().delete(_username(profile_id, env_key))


def delete_profile_secrets(profile_id: str) -> int:
    """Remove every secret belonging to ``profile_id``. Returns the count."""
    backend = _require_backend()
    prefix = f"{profile_id}::"
    removed = 0
    for username in backend.list_usernames():
        if username.startswith(prefix):
            backend.delete(username)
            removed += 1
    return removed


# ── Profile env_var helpers ─────────────────────────────────────────────────
#
# These are the functions ``main.py`` calls when a profile is created, updated,
# listed, or consumed by the LLM generator. They implement the split-storage
# contract: plaintext env_vars stay in the DB; sensitive keys are routed to
# the keyring and replaced with :data:`SENTINEL` in the DB record.


def split_env_vars(
    profile_id: str,
    incoming: dict[str, str],
    existing: dict[str, str] | None = None,
) -> dict[str, str]:
    """Route sensitive keys from ``incoming`` to the keyring.

    Returns the value that should be persisted in ``profile.data.env_vars``:
    sensitive entries are replaced with :data:`SENTINEL`, non-sensitive
    entries are kept as-is.

    * If ``incoming[key]`` equals :data:`SENTINEL` or :data:`MASK_PLACEHOLDER`
      the existing keyring value is preserved (the UI echoed back the mask
      on an unchanged field).
    * If ``incoming[key]`` is empty and the key is sensitive, the secret is
      deleted from the keyring so the field clears cleanly.
    * Otherwise the new value is written to the keyring and the DB gets a
      sentinel placeholder.
    """
    existing = existing or {}
    out: dict[str, str] = {}
    for key, value in incoming.items():
        if not is_sensitive(key):
            out[key] = value
            continue
        existing_value = existing.get(key, "")
        # Preserve-existing paths: the UI echoed back the mask or sentinel.
        if value in (SENTINEL, MASK_PLACEHOLDER) and existing_value == SENTINEL:
            out[key] = SENTINEL
            continue
        if not value:
            # Empty string on a sensitive key means "clear it".
            delete_secret(profile_id, key)
            continue
        set_secret(profile_id, key, value)
        out[key] = SENTINEL
    return out


def hydrate_env_vars(profile_id: str, env_vars: dict[str, str]) -> dict[str, str]:
    """Return ``env_vars`` with sentinel values replaced by their keyring values.

    Used by the LLM generator path (:func:`main._collect_env_vars_from_profiles`)
    when it needs the actual API key. Non-sentinel entries pass through
    unchanged. Secrets that the keyring can't produce are dropped so callers
    never see the sentinel by accident.
    """
    hydrated: dict[str, str] = {}
    for key, value in env_vars.items():
        if value == SENTINEL:
            real = get_secret(profile_id, key)
            if real:
                hydrated[key] = real
            continue
        hydrated[key] = value
    return hydrated


def mask_env_vars(env_vars: dict[str, str]) -> dict[str, str]:
    """Return ``env_vars`` with sentinel values replaced by :data:`MASK_PLACEHOLDER`.

    The API hands the masked version to the frontend so the Profiles UI can
    render a neutral "••••••••" indicator without ever seeing the real
    secret. The UI can echo the mask back verbatim on a PUT and the server
    recognises that pattern as "no change".
    """
    out: dict[str, str] = {}
    for key, value in env_vars.items():
        out[key] = MASK_PLACEHOLDER if value == SENTINEL else value
    return out


# ── Legacy migration ────────────────────────────────────────────────────────


def migrate_legacy_plaintext(profiles: list[dict[str, Any]]) -> int:
    """Move any plaintext sensitive env_vars into the keyring in-place.

    Returns the number of secrets migrated. Called once from the FastAPI
    startup path. Idempotent: profiles whose sensitive env_vars are already
    sentinels are skipped, so it is safe to call on every launch.
    """
    migrated = 0
    for profile in profiles:
        profile_id = profile.get("id")
        env = profile.get("env_vars") or {}
        if not profile_id or not isinstance(env, dict):
            continue
        updated = False
        for key, value in list(env.items()):
            if not isinstance(value, str):
                continue
            if not is_sensitive(key):
                continue
            if value == SENTINEL or not value:
                continue
            set_secret(profile_id, key, value)
            env[key] = SENTINEL
            updated = True
            migrated += 1
        if updated:
            profile["env_vars"] = env
    return migrated

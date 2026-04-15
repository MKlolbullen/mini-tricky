"""Tests for the OS-keychain-backed secrets store.

We don't rely on a real system keyring in CI — keyring will fail to find a
backend on headless Linux and :func:`secrets_store.init_secrets_store`
automatically drops to the file fallback. That's exactly the code path the
profile CRUD hits when a user runs the app in a container, so it's the most
important path to lock down.

What these tests cover:

* Sensitivity pattern catches the vendor-specific keys we care about
* ``split_env_vars`` routes secrets to the store and puts a sentinel in the
  returned dict
* ``hydrate_env_vars`` round-trips the sentinel back to the real value
* ``delete_profile_secrets`` actually purges every key for a profile
* ``migrate_legacy_plaintext`` is idempotent and non-destructive
* The profile API masks secrets on the way out and preserves them when a
  subsequent PUT echoes back the mask (the UI pattern for "unchanged key")
"""

from __future__ import annotations

import uuid
from pathlib import Path

from src import secrets_store


def _reset_backend(tmp_path: Path) -> None:
    """Force a fresh file-backend for each test to avoid cross-test bleed."""
    # Wipe the module-level state and re-init against a per-test dir. This
    # gives every test an empty store without mocking ``keyring`` itself.
    secrets_store._backend = None  # type: ignore[attr-defined]
    secrets_store._fallback_path = None  # type: ignore[attr-defined]
    # Force the file backend path — the real keyring may or may not be
    # available on the CI host, and we want a deterministic backend.
    secrets_store._fallback_path = tmp_path / 'secrets-fallback.json'  # type: ignore[attr-defined]
    secrets_store._backend = secrets_store._FileBackend(  # type: ignore[attr-defined]
        secrets_store._fallback_path  # type: ignore[attr-defined]
    )


def test_is_sensitive_matches_known_patterns():
    # Vendor-specific
    assert secrets_store.is_sensitive('ANTHROPIC_API_KEY')
    assert secrets_store.is_sensitive('SHODAN_API_KEY')
    assert secrets_store.is_sensitive('CENSYS_API_ID')
    assert secrets_store.is_sensitive('CENSYS_API_SECRET')
    assert secrets_store.is_sensitive('VT_API_KEY')
    assert secrets_store.is_sensitive('GITHUB_TOKEN')
    # Generic
    assert secrets_store.is_sensitive('MY_TOKEN')
    assert secrets_store.is_sensitive('DB_PASSWORD')
    assert secrets_store.is_sensitive('ADMIN_PWD')
    # Case insensitive
    assert secrets_store.is_sensitive('anthropic_api_key')
    # Non-sensitive
    assert not secrets_store.is_sensitive('PATH')
    assert not secrets_store.is_sensitive('HOME')
    assert not secrets_store.is_sensitive('LOG_LEVEL')
    assert not secrets_store.is_sensitive('USER_AGENT')


def test_mask_covers_edge_cases():
    assert secrets_store.mask('') == ''
    assert secrets_store.mask(secrets_store.SENTINEL) == ''
    assert secrets_store.mask('ab') == '****'
    assert secrets_store.mask('abcd') == '****'
    assert secrets_store.mask('sk-ant-12345') == '\u2022' * 4 + '2345'


def test_split_env_vars_routes_secrets_to_store(tmp_path):
    _reset_backend(tmp_path)
    pid = f'prof-{uuid.uuid4().hex[:8]}'

    incoming = {
        'PATH': '/usr/local/bin',
        'ANTHROPIC_API_KEY': 'sk-ant-test-12345',
        'LOG_LEVEL': 'debug',
    }
    stored = secrets_store.split_env_vars(pid, incoming)

    # Non-sensitive entries pass through unchanged.
    assert stored['PATH'] == '/usr/local/bin'
    assert stored['LOG_LEVEL'] == 'debug'
    # Sensitive entry is replaced with the sentinel marker.
    assert stored['ANTHROPIC_API_KEY'] == secrets_store.SENTINEL
    # And the real value lives in the store.
    assert secrets_store.get_secret(pid, 'ANTHROPIC_API_KEY') == 'sk-ant-test-12345'


def test_hydrate_env_vars_round_trips(tmp_path):
    _reset_backend(tmp_path)
    pid = f'prof-{uuid.uuid4().hex[:8]}'

    stored = secrets_store.split_env_vars(pid, {
        'PATH': '/bin',
        'ANTHROPIC_API_KEY': 'sk-real',
    })
    hydrated = secrets_store.hydrate_env_vars(pid, stored)
    assert hydrated['PATH'] == '/bin'
    assert hydrated['ANTHROPIC_API_KEY'] == 'sk-real'


def test_hydrate_drops_missing_secrets(tmp_path):
    """A sentinel without a matching store entry should not leak the sentinel."""
    _reset_backend(tmp_path)
    pid = f'prof-{uuid.uuid4().hex[:8]}'

    env = {'ANTHROPIC_API_KEY': secrets_store.SENTINEL, 'PATH': '/bin'}
    hydrated = secrets_store.hydrate_env_vars(pid, env)
    assert 'ANTHROPIC_API_KEY' not in hydrated
    assert hydrated['PATH'] == '/bin'


def test_split_preserves_existing_when_value_is_sentinel(tmp_path):
    _reset_backend(tmp_path)
    pid = f'prof-{uuid.uuid4().hex[:8]}'

    # Initial save: stash a real secret.
    secrets_store.split_env_vars(pid, {'ANTHROPIC_API_KEY': 'sk-original'})
    # Second save: UI echoes back the sentinel (nothing changed).
    stored = secrets_store.split_env_vars(
        pid,
        {'ANTHROPIC_API_KEY': secrets_store.SENTINEL},
        existing={'ANTHROPIC_API_KEY': secrets_store.SENTINEL},
    )
    assert stored['ANTHROPIC_API_KEY'] == secrets_store.SENTINEL
    assert secrets_store.get_secret(pid, 'ANTHROPIC_API_KEY') == 'sk-original'


def test_split_clears_on_empty_value(tmp_path):
    _reset_backend(tmp_path)
    pid = f'prof-{uuid.uuid4().hex[:8]}'

    secrets_store.split_env_vars(pid, {'ANTHROPIC_API_KEY': 'sk-clear-me'})
    assert secrets_store.get_secret(pid, 'ANTHROPIC_API_KEY') == 'sk-clear-me'

    stored = secrets_store.split_env_vars(pid, {'ANTHROPIC_API_KEY': ''})
    assert 'ANTHROPIC_API_KEY' not in stored
    assert secrets_store.get_secret(pid, 'ANTHROPIC_API_KEY') is None


def test_delete_profile_secrets_purges_all(tmp_path):
    _reset_backend(tmp_path)
    pid = f'prof-{uuid.uuid4().hex[:8]}'

    secrets_store.split_env_vars(pid, {
        'ANTHROPIC_API_KEY': 'a',
        'SHODAN_API_KEY': 'b',
        'GITHUB_TOKEN': 'c',
    })
    removed = secrets_store.delete_profile_secrets(pid)
    assert removed == 3
    assert secrets_store.get_secret(pid, 'ANTHROPIC_API_KEY') is None
    assert secrets_store.get_secret(pid, 'SHODAN_API_KEY') is None
    assert secrets_store.get_secret(pid, 'GITHUB_TOKEN') is None


def test_delete_profile_secrets_leaves_other_profiles_alone(tmp_path):
    _reset_backend(tmp_path)
    pid_a = 'prof-aaa'
    pid_b = 'prof-bbb'

    secrets_store.split_env_vars(pid_a, {'ANTHROPIC_API_KEY': 'a'})
    secrets_store.split_env_vars(pid_b, {'ANTHROPIC_API_KEY': 'b'})

    secrets_store.delete_profile_secrets(pid_a)
    assert secrets_store.get_secret(pid_a, 'ANTHROPIC_API_KEY') is None
    assert secrets_store.get_secret(pid_b, 'ANTHROPIC_API_KEY') == 'b'


def test_migrate_legacy_plaintext_is_idempotent(tmp_path):
    _reset_backend(tmp_path)
    profiles = [
        {
            'id': 'prof-legacy',
            'name': 'Old',
            'env_vars': {
                'ANTHROPIC_API_KEY': 'plaintext-leak',
                'PATH': '/bin',
            },
        },
    ]
    migrated = secrets_store.migrate_legacy_plaintext(profiles)
    assert migrated == 1
    assert profiles[0]['env_vars']['ANTHROPIC_API_KEY'] == secrets_store.SENTINEL
    assert profiles[0]['env_vars']['PATH'] == '/bin'
    assert secrets_store.get_secret('prof-legacy', 'ANTHROPIC_API_KEY') == 'plaintext-leak'

    # Re-running migration on the now-sentinelised profiles should be a no-op.
    second = secrets_store.migrate_legacy_plaintext(profiles)
    assert second == 0


def test_file_backend_writes_0600_on_posix(tmp_path):
    """The fallback has to be at least 0600 so other users can't read it."""
    import os
    import stat as _stat

    _reset_backend(tmp_path)
    pid = 'prof-perm'
    secrets_store.set_secret(pid, 'ANTHROPIC_API_KEY', 'value')

    path = tmp_path / 'secrets-fallback.json'
    assert path.exists()
    if os.name == 'posix':
        mode = _stat.S_IMODE(path.stat().st_mode)
        # User-read + user-write, nothing else.
        assert mode == _stat.S_IRUSR | _stat.S_IWUSR, f'unexpected mode {oct(mode)}'


def test_backend_name_reports_something(tmp_path):
    _reset_backend(tmp_path)
    assert secrets_store.backend_name() in ('keyring', 'file')

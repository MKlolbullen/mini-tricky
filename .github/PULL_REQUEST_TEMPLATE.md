## What changed

<!-- Describe the user/operator-visible and internal changes. -->

## Why

<!-- What problem or maintenance risk does this solve? -->

## Validation

- [ ] Frontend lint/test/build passed when relevant
- [ ] Backend Ruff/mypy/pytest passed when relevant
- [ ] `python scripts/sync_project_metadata.py --check` passed
- [ ] Playwright smoke tests passed for meaningful UI changes
- [ ] New/changed workflow templates validate as DAGs
- [ ] Screenshots included for meaningful UI changes

### Commands / evidence

```text
Paste concise test output or commands here.
```

## Security / trust-boundary impact

- [ ] No security-sensitive trust boundary changed
- [ ] Electron IPC / filesystem access changed
- [ ] Local HTTP/WebSocket behavior changed
- [ ] Command construction / process execution changed
- [ ] Secrets handling changed
- [ ] Workflow import / custom-script behavior changed
- [ ] Release or dependency integrity changed

<!-- Explain checked security-sensitive items and mitigations. -->

## Compatibility / migration

<!-- OS limitations, dependency changes, database/data migrations, or "None". -->

## Catalog changes

<!-- For tool/template changes: upstream, license, install behavior, typed inputs/outputs, important flags, secrets, and platform limits. -->

## Authorized-use check

- [ ] This change supports legitimate development, defensive research, lab use, or authorized security assessment workflows.

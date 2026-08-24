# Contributing to mini-tricky

Thanks for helping improve mini-tricky. The project moves quickly, so contributions should preserve typed data flow, reproducibility, and safe local execution rather than only increasing the tool count.

## Development setup

```bash
git clone https://github.com/MKlolbullen/mini-tricky.git
cd mini-tricky
npm ci
npm run frontend:install

cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cd ..

npm run dev
```

## Before opening a PR

Run the checks that match your change:

```bash
# Frontend
cd frontend
npm run lint
npm run test
npm run build

# Backend
cd ../backend
ruff check .
ruff format --check .
mypy src --ignore-missing-imports
pytest

# Metadata / catalog drift
cd ..
python scripts/sync_project_metadata.py --write
git diff --exit-code
```

For frontend interaction changes, also run:

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

## Adding a security tool

The original/core catalog lives in `backend/tools.yaml`. New focused integrations should normally be added as a composable pack under `backend/tools.d/*.yaml` so their tool definitions, install hints, and capability policy stay together.

A tool-pack document may contain:

```yaml
tools:
  - id: example
    name: Example
    category: Recon
    inputs: [domain]
    outputs: [targets]
    command: [example, "{domain}"]
    output_mode: stdout

install_hints:
  example: go install example.org/example@latest

capability_policy:
  tools:
    example:
      risk: passive
      network_cost: low
      cpu_cost: low
      capabilities: [passive_asset_discovery]
      platforms: [linux, macos, windows]
```

A useful tool contribution should include:

- upstream project/repository and license checked;
- deterministic executable name;
- installation hint in the generated installer path;
- correct category;
- typed input/output sockets;
- capability metadata describing default risk and resource cost;
- real CLI flags rather than a thin free-form command box;
- safe defaults and a realistic timeout;
- required secret/environment/provider configuration documented;
- OS limitations documented;
- frontend icon/category mapping where appropriate;
- at least one validation test when behavior changes.

Do not advertise one output socket type while exposing flags that change the output into a structurally incompatible format. If a flag changes the artifact contract, model that as a separate tool/node contract instead.

Prefer tools that add a new capability or materially improve a workflow. "One more scanner" is less valuable than a new typed transformation, artifact type, or reusable stage.

## Adding a workflow template

The core template library lives in `backend/templates.yaml`. Templates that belong to a focused feature pack should normally live under `backend/templates.d/*.yaml`.

New templates should:

- validate as a DAG;
- use typed sockets correctly;
- reference tools that exist in the composed catalog;
- merge/deduplicate fan-in explicitly;
- expose inputs through variable/profile nodes rather than hard-coded targets;
- avoid destructive or unexpectedly intrusive defaults;
- produce useful artifacts at meaningful stage boundaries;
- have a clear operator-oriented name, description, category, and tags.

## Documentation metadata

`VERSION` is the canonical release version. Tool/template counts are computed from the core YAML plus `tools.d` / `templates.d` extension packs and synchronized into marked documentation sections by:

```bash
python scripts/sync_project_metadata.py --write
```

CI runs the same script with `--check` and rejects stale metadata or duplicate catalog IDs.

## Security-sensitive changes

Changes touching Electron IPC, filesystem access, local HTTP/WebSocket access, command construction, secrets, workflow imports, capability/risk metadata, or release integrity should explain the threat model in the PR description. Keep the renderer least-privileged and validate data at trust boundaries.

## Pull requests

Keep PRs reviewable. Separate large catalog expansions from execution-engine/security changes when possible. Include:

- what changed;
- why it changed;
- how it was tested;
- screenshots for meaningful UI changes;
- security/compatibility implications;
- migration notes when data formats change.

By contributing, you agree that your contribution is provided under the repository's MIT license.

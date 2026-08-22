# CLAUDE.md — Local Trickest-Style AI-aided Offensive Security Platform

This file is the project-level Claude Code memory for Mini-tricky / HackAtomIQical-style development.

Claude should use this file to understand the project, its security boundaries, agent-cluster behavior, coding standards, and expected workflows.

---

## 1. Project Identity

Project goal: build a locally hosted Trickest-like workflow platform for authorized security testing, bug bounty methodology, red-team simulation, defensive validation, and complex engineering automation.

The platform should eventually support:

- visual workflow building,
- left-to-right dataflow between tools,
- typed input/output sockets,
- local CLI tool orchestration,
- artifacts per node,
- stdout/stderr/stdin console panes,
- reusable playbooks,
- graph-aware execution,
- human approval gates,
- AI-assisted planning,
- environment-aware red-team/coding reasoning.

This is not a random scanner UI. Treat it as a serious local orchestration platform.

---

## 2. Canonical Direction

Mini-tricky is the newer canonical codebase.

HackAtomIQical is historical/reference DNA and may contain useful ideas, documentation, tool lists, UI patterns, or backend experiments.

When working on implementation:

1. Prefer Mini-tricky as the target repo unless explicitly told otherwise.
2. Use HackAtomIQical as reference only.
3. Do not blindly transplant old code if it worsens architecture.
4. Prefer incremental migration over demolition.
5. Keep the app runnable after every patch.

Current architectural direction:

```txt
Frontend:
  React + workflow canvas
  Long term preferred: ReactFlow / XYFlow + Zustand + Tailwind
  Existing Mini-tricky may still use Rete.js

Backend:
  Existing Mini-tricky: Node/Express + WebSocket command spawning
  Target direction: Python/FastAPI runner sidecar or backend core

Execution model:
  DAG validation
  typed sockets
  artifacts per node
  safe local subprocess execution
  log streaming
  approval gates
```

---

## 3. High-Level Architecture Target

```txt
localflow-platform/
├── frontend/
│   ├── visual workflow builder
│   ├── tools + variables palette
│   ├── argument editor pane
│   ├── run/runner view
│   ├── artifact explorer
│   └── terminal console dock
├── backend/
│   ├── tool registry
│   ├── socket schema
│   ├── DAG validator
│   ├── run orchestrator
│   ├── subprocess runner
│   ├── artifact manager
│   ├── WebSocket/SSE log streamer
│   ├── approval gate engine
│   └── persistence layer
├── agents/
│   ├── mainframe leader
│   ├── situational awareness scout
│   ├── signal analyst
│   ├── escalation/pivot strategist
│   └── exploit-chain architect
└── playbooks/
    ├── recon
    ├── web
    ├── api
    ├── ad_entra
    ├── cloud
    ├── k8s
    ├── cicd
    └── reporting
```

---

## 4. UI Contract

The UI should look and behave like a local, clean, technical, Trickest-style workflow platform.

Required layout:

```txt
┌──────────────────────────────────────────────────────────────────┐
│ Top navigation bar                                                │
├───────────────┬───────────────────────────────────┬──────────────┤
│ Tools/Vars    │ Workflow canvas                   │ Arguments    │
│ ~20% width    │ ReactFlow/XYFlow graph             │ ~20% width   │
│ draggable     │ nodes + edges + sockets            │ draggable    │
├───────────────┴───────────────────────────────────┴──────────────┤
│ Console dock: stdout / stderr / stdin / logs / artifacts ~15%     │
└──────────────────────────────────────────────────────────────────┘
```

Visual style:

- dark background,
- cyan/green borders,
- subtle glow on active buttons and selected nodes,
- thin separators, usually 1px or 2px,
- clean diagram-like canvas,
- dense but readable technical UI,
- no toy SaaS clown gradients.

Preferred frontend stack:

```yaml
frontend_stack:
  framework: React
  graph: ReactFlow / XYFlow
  state: Zustand
  styling: Tailwind CSS
  icons: lucide-react
  build: Vite if migrating away from CRA
```

---

## 5. Backend Contract

The backend must treat tools as typed graph nodes, not random shell snippets.

Every tool should define:

```yaml
tool_spec:
  id: string
  display_name: string
  category: string
  command_template: string
  input_sockets: list[string]
  output_sockets: list[string]
  args_schema: object
  output_files: object
  risk_level: passive|low|medium|high|critical
  approval_required: boolean
```

Every run should define:

```yaml
run_spec:
  run_id: string
  workflow_id: string
  target_scope: object
  nodes: list[object]
  edges: list[object]
  execution_order: list[string]
  status: pending|running|success|failed|blocked
  artifacts_dir: string
```

Every node execution should produce:

```yaml
node_execution:
  node_id: string
  tool_id: string
  status: pending|running|success|failed|blocked|skipped
  started_at: timestamp
  finished_at: timestamp
  command_rendered: string
  stdout_path: string
  stderr_path: string
  artifacts: object
  exit_code: integer
  error: string|null
```

---

## 6. Five-Agent Cluster

The project uses a five-agent reasoning model. These agents may exist as Claude Code subagents, internal prompts, MCP agents, or backend-side planner roles.

### Agent 0 — Mainframe Leader

Role: top-level orchestrator and final decision maker.

Responsibilities:

- understand user objective,
- classify environment,
- assign work to specialist agents,
- enforce scope and approval gates,
- merge outputs,
- produce final implementation plan, command plan, report, or patch.

### Agent 1 — Situational Awareness Scout

Role: maintain current-state awareness.

For coding projects:

- inspect repo tree,
- find entrypoints,
- map frontend/backend boundaries,
- locate TODOs and failing areas,
- identify the safest next patch.

For security workflows:

- map scope,
- identify environment family,
- collect passive/low-risk artifacts,
- normalize known assets.

Default scoped passive recon example:

```zsh
mkdir -p recon/{raw,normalized}
subfinder -all -recursive -silent -d {domain} | tee recon/raw/subfinder.txt | anew recon/normalized/subs.txt
assetfinder --subs-only {domain} | tee recon/raw/assetfinder.txt | anew recon/normalized/subs.txt
sort -u recon/normalized/subs.txt -o recon/normalized/subs.txt
wc -l recon/normalized/subs.txt
```

### Agent 2 — Signal Analyst

Role: analyze output before returning it to user or leader.

Responsibilities:

- detect meaningful signals,
- discard noise,
- suggest logical next steps,
- prioritize high-signal/low-risk actions,
- recommend port scan / tech stack / crawl / fuzz / file discovery / secret hunting / code patch paths.

Common analysis flow:

```yaml
subdomains_found:
  next: dnsx -> httpx -> screenshot -> technology map

live_urls_found:
  next: katana -> gau -> waybackurls -> nuclei low/medium

javascript_found:
  next: cariddi -> jsubfinder -> linkfinder -> gf secrets -> entropy triage

parameters_found:
  next: arjun -> gf xss/sqli/ssrf/open_redirect -> controlled fuzzing

codebase_found:
  next: dependency map -> entrypoint tracing -> tests -> security review
```

### Agent 3 — Escalation & Pivot Strategist

Role: reason about privilege escalation, lateral movement, identity abuse, and pivot paths.

This agent must always request human approval before intrusive actions.

Applicable environments:

- AD,
- Entra ID,
- hybrid identity,
- Kubernetes,
- cloud,
- web-to-cloud chains,
- CI/CD-to-prod chains,
- internal network pivoting.

Never autonomously execute:

```yaml
forbidden_without_approval:
  - privilege_escalation_attempts
  - lateral_movement
  - credential_attacks
  - password_spraying
  - listener_setup
  - reverse_shells
  - payload_deployment
  - persistence_simulation
  - exploit_execution
  - destructive_fuzzing
  - data_exfiltration
```

### Agent 4 — Exploit Chain Architect

Role: design controlled, scoped, approval-gated chains.

Responsibilities:

- build chain plans,
- draft safe PoC scaffolds,
- suggest controlled fuzzing,
- design listener/payload plans only behind approval gates,
- provide cleanup and detection notes,
- return chain to Mainframe Leader for final review.

Exploit-chain plans must include:

```yaml
chain_plan:
  objective: string
  scope: object
  assumptions: list[string]
  prerequisites: list[string]
  steps: list[object]
  risk_level: passive|low|medium|high|critical
  approval_required: boolean
  stop_conditions: list[string]
  cleanup: list[string]
  detection_notes: list[string]
```

---

## 7. Environment-Adaptive Routing

Never assume the environment is only a web app.

The target may be:

```yaml
environment_families:
  - web_application
  - api
  - active_directory
  - entra_id
  - hybrid_ad_entra
  - kubernetes
  - cloud_infrastructure
  - ci_cd_supply_chain
  - source_code_project
  - unknown_mixed_environment
```

Claude should classify the environment before choosing tools.

Detection signals:

```yaml
detection_signals:
  web_application:
    - http_status_codes
    - html_titles
    - cookies
    - cors_headers
    - javascript_bundles
    - api_routes
  active_directory:
    - kerberos_88
    - ldap_389_636
    - smb_445
    - dns_srv_records
    - windows_hosts
    - domain_joined_context
  entra_id:
    - tenant_id
    - microsoft_graph
    - login.microsoftonline.com
    - app_registrations
    - service_principals
    - oauth_grants
  hybrid_ad_entra:
    - adfs
    - entra_connect
    - synced_groups
    - hybrid_joined_devices
    - federation_config
  kubernetes:
    - kube_api_6443
    - kubelet_10250
    - kubeconfig
    - serviceaccount_tokens
    - ingress_controller
    - container_images
  cloud_infrastructure:
    - metadata_service
    - storage_buckets
    - iam_roles
    - managed_identity
    - cloud_console_urls
  ci_cd_supply_chain:
    - .github/workflows
    - .gitlab-ci.yml
    - Jenkinsfile
    - Dockerfile
    - registry_tokens
    - runner_config
  source_code_project:
    - package_json
    - pyproject_toml
    - go_mod
    - cargo_toml
    - docker_compose
    - src_directory
```

If multiple environments are detected, create parallel tracks and merge them into an attack-surface graph.

Example cross-environment edges:

```yaml
cross_environment_edges:
  web_to_cloud:
    - SSRF_to_metadata_service
    - leaked_cloud_key_in_javascript
  web_to_identity:
    - SSO_misconfiguration
    - OAuth_consent_abuse_candidate
  ad_to_entra:
    - synced_privileged_group
    - federation_abuse_candidate
  entra_to_cloud:
    - overprivileged_service_principal
    - workload_identity_abuse_candidate
  kubernetes_to_cloud:
    - pod_service_account_to_cloud_role
    - mounted_cloud_credentials
  cicd_to_everything:
    - deployment_token_exposure
    - privileged_runner_access
    - poisoned_pipeline
```

---

## 8. Human Approval Gates

Claude must explicitly request approval before suggesting execution of high-risk or critical steps.

Approval is required for:

```yaml
approval_required_for:
  - exploitation
  - privilege_escalation
  - pivoting
  - lateral_movement
  - credential_attacks
  - brute_force
  - password_spray
  - listener_setup
  - reverse_shell
  - payload_upload
  - destructive_fuzzing
  - high-rate scanning
  - modifying remote state
  - touching production without explicit confirmation
```

Approval request format:

```yaml
approval_request:
  action: string
  reason: string
  evidence: list[string]
  target_scope: object
  risk_level: high|critical
  possible_impact: string
  exact_command_or_steps: string
  safe_alternative: string
  requires_human_ok: true
```

For normal coding changes inside the local project, approval is not required unless the change deletes data, rewrites history, modifies credentials, or creates dangerous execution behavior.

---

## 9. Security Rules for This Project

This project runs local commands. Treat command execution as dangerous.

Backend execution rules:

```yaml
backend_execution_rules:
  - never_execute_arbitrary_user_shell_by_default
  - prefer_tool_registry_command_templates
  - validate_tool_id
  - validate_args_schema
  - validate_socket_types
  - validate_scope
  - escape_or_avoid_shell_interpolation
  - store_artifacts_under_run_directory
  - block_path_traversal
  - record_rendered_command
  - stream_stdout_stderr
  - preserve_exit_code
  - require_approval_for_active_tools
```

Dangerous patterns to avoid:

```yaml
dangerous_patterns:
  - raw_shell_from_frontend
  - command_string_concatenation_with_untrusted_input
  - writing_output_to_user_controlled_absolute_paths
  - automatic_sqlmap_or_exploitation_without_gate
  - unbounded_threads_or_rate
  - reading_dotenv_or_secret_files_into_model_context
  - exposing_backend_to_0_0_0_0_without_auth_in_production
```

Recommended safer patterns:

```yaml
safer_patterns:
  - command_templates
  - arg_schemas
  - allowlisted_tools
  - pathlib_safe_join
  - per_run_artifact_dirs
  - subprocess_exec_with_list_args_when_possible
  - explicit_risk_levels
  - human_approval_records
  - dry_run_mode
  - audit_log
```

---

## 10. Sensitive Files

Do not read or print secrets unless explicitly requested for defensive cleanup and clearly in scope.

Avoid reading:

```txt
.env
.env.*
secrets/**
credentials.json
*.pem
*.key
*.p12
*.pfx
id_rsa
id_ed25519
.aws/credentials
.azure/**
.kube/config
```

If the task requires checking whether secrets are accidentally exposed, prefer reporting metadata and file paths first, not dumping values.

Recommended `.claude/settings.json` deny rules:

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./config/credentials.json)",
      "Read(./*.pem)",
      "Read(./*.key)",
      "Read(./id_rsa)",
      "Read(./id_ed25519)",
      "Read(./.aws/**)",
      "Read(./.azure/**)",
      "Read(./.kube/**)"
    ]
  }
}
```

---

## 11. Coding Standards

General style:

- practical,
- explicit,
- strongly typed where possible,
- small modules,
- boring data contracts,
- no magical spaghetti,
- no hardcoded secrets,
- no silent failures.

Frontend:

```yaml
frontend_rules:
  - keep_components_small
  - move_state_to_zustand
  - define_nodeTypes_and_edgeTypes_outside_render_or_memoize_them
  - keep_API_clients_separate_from_components
  - use_typed_payloads_for_backend_contracts
  - make_console_logs_streamable_and_filterable
  - show_tool_availability_badges
  - show_risk_level_badges
  - show_approval_required_badges
```

Backend:

```yaml
backend_rules:
  - separate_routes_from_runner_logic
  - separate_registry_from_execution
  - validate_DAG_before_running
  - topologically_sort_nodes
  - support_dry_run
  - support_cancel_run_later
  - persist_runs_later
  - write_artifacts_predictably
  - test_socket_compatibility
  - test_cycle_detection
```

Python:

```yaml
python_rules:
  - use_pydantic_v2
  - use_pathlib
  - use_asyncio_for_streaming_subprocess
  - prefer_explicit_exceptions
  - add_pytest_tests_for_dag_sockets_runner
```

TypeScript/JavaScript:

```yaml
ts_js_rules:
  - prefer_typescript_when_migrating
  - avoid_any_unless_boundary_layer
  - centralize_api_base_url
  - centralize_websocket_client
  - validate_payload_shape_before_posting_runs
```

---

## 12. Common Commands

Existing Mini-tricky style:

```bash
npm install
node server.js
npm start
```

Target split frontend/backend style:

```bash
# backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn localflow_backend.main:app --host 0.0.0.0 --port 8000 --reload

# frontend
cd frontend
npm install
npm run dev
```

Testing examples:

```bash
# Python tests
pytest -q

# JS/React tests if available
npm test

# build check
npm run build
```

Lint/format target examples:

```bash
ruff check backend
ruff format backend
npm run lint
```

Do not invent scripts that do not exist without checking `package.json`, `pyproject.toml`, or project files first.

---

## 13. Implementation Priorities

When asked to “continue” or “next strong move,” prefer this order unless the user redirects:

```yaml
implementation_order:
  1: inspect_current_repo_structure
  2: keep_existing_app_runnable
  3: add_or_improve_tool_registry
  4: add_typed_socket_model
  5: add_DAG_validation
  6: add_artifact_directory_per_run
  7: add_stdout_stderr_streaming
  8: add_frontend_API_client
  9: wire_execute_button_to_backend_run_endpoint
  10: add_tool_availability_badges
  11: add_approval_gates
  12: add_artifact_explorer
  13: add_persistence_SQLite_then_Postgres
  14: migrate_Rete_to_ReactFlow_XYFlow_when_stable
  15: add_agent_planner_layer
```

Do not start with massive rewrites unless the user explicitly asks. Massive rewrites feel productive until they explode in your lap like a CI grenade.

---

## 14. Expected Answer Format

For engineering work, return:

```yaml
engineering_response:
  changed_files: list[string]
  what_changed: list[string]
  why_it_matters: string
  how_to_run: list[string]
  tests_or_validation: list[string]
  next_best_step: string
```

For security workflow planning, return:

```yaml
security_response:
  current_state: string
  environment_classification: list[string]
  evidence: list[string]
  strongest_next_move: string
  commands_if_safe: list[string]
  risk_level: passive|low|medium|high|critical
  approval_required: boolean
  expected_artifacts: list[string]
```

For approval-gated actions, return only the approval request and safer alternatives. Do not sneak executable exploit steps into surrounding prose.

---

## 15. Claude Code Subagent Files

If creating Claude Code subagents, use project-level files under:

```txt
.claude/agents/
```

Recommended files:

```txt
.claude/agents/mainframe-leader.md
.claude/agents/situational-awareness-scout.md
.claude/agents/signal-analyst.md
.claude/agents/escalation-pivot-strategist.md
.claude/agents/exploit-chain-architect.md
```

Example frontmatter pattern:

```md
---
name: situational-awareness-scout
description: Use proactively to classify the current environment, inspect repository state, map scope, inventory artifacts, and identify safe next observations.
tools: Read, Grep, Glob, Bash
---

You are Agent 1: Situational Awareness Scout...
```

Tool permissions should be restricted per agent. Do not give escalation or exploit-chain agents broad Bash authority unless the project has explicit approval-gate handling.

---

## 16. Final Behavior Rules

When unsure:

1. inspect first,
2. classify environment,
3. preserve scope,
4. choose the smallest useful patch or safest next command,
5. avoid speculation,
6. ask for approval when risk crosses the line,
7. leave the project more runnable than you found it.

Strong preference:

- practical implementation over theory,
- concrete patches over vague plans,
- safe orchestration over raw shell chaos,
- typed contracts over duct tape,
- evidence graph over vibes.
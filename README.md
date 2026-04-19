<h1 align="center">
  <br />
  mini-tricky
  <br />
</h1>

<p align="center">
  <strong>A locally hosted Trickest clone for security workflow automation.</strong>
  <br />
  Visual DAG editor &middot; 75 security tools &middot; 21 categories &middot; 20 ready-to-run templates &middot; Real-time execution &middot; Zero cloud dependency
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Electron-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/frontend-React%20%2B%20React%20Flow-61DAFB?logo=react&logoColor=111827" alt="React" />
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/tools-75%20integrated-blueviolet" alt="75 Tools" />
  <img src="https://img.shields.io/badge/templates-20%20built--in-ff66c4" alt="20 Templates" />
  <img src="https://img.shields.io/badge/secrets-OS%20keychain-0ea5e9" alt="OS keychain secrets" />
  <img src="https://img.shields.io/badge/version-0.3.0--beta-orange" alt="v0.4.0-beta" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

<p align="center">
  <a href="#download">Download</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#api-reference">API</a> &middot;
  <a href="#project-structure">Project Structure</a> &middot;
  <a href="#roadmap">Roadmap</a>
</p>

---

<p align="center">
  <img src="docs/images/hero-builder.svg" alt="mini-tricky workflow builder" width="100%" />
</p>

---

## Download

Pre-built beta installers are published on the [**Releases page**](https://github.com/MKlolbullen/mini-tricky/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon / Intel) | `mini-tricky-0.4.0-beta-mac-arm64.dmg` / `-x64.dmg` |
| Windows (x64) | `mini-tricky-0.4.0-beta-win-x64.exe` (NSIS installer) |
| Linux (x64) | `mini-tricky-0.4.0-beta.AppImage` / `mini-tricky-0.4.0-beta.deb` |

Installers **bundle a self-contained Python runtime** — no separate Python installation required. You still need the security tools themselves (`subfinder`, `nuclei`, `ffuf`, etc.) on your system `PATH`; mini-tricky ships the orchestration layer, not the tools. Use [`scripts/install-tools.sh`](scripts/install-tools.sh) or the in-app **Settings → Tool Manager → Copy install script** button to bootstrap them in one command.

> **Beta builds are unsigned.** On macOS right-click the `.app` → **Open** on first launch. On Windows click **More info** → **Run anyway** when SmartScreen warns. On Linux: `chmod +x mini-tricky-*.AppImage && ./mini-tricky-*.AppImage` — or install the `.deb` with `sudo dpkg -i mini-tricky-*.deb && sudo apt -f install`.

---

## What is mini-tricky?

**mini-tricky** is a local-first desktop application (with optional web GUI mode) that replicates the Trickest workflow builder experience for offensive security automation. Build visual DAG workflows by dragging tools onto a canvas, connect them with typed sockets, and execute entire recon/scanning pipelines with real-time streaming output.

Ships as a **native Electron desktop app** for macOS / Windows / Linux with menus, tray, keyboard shortcuts, an embedded Python backend, and persisted window state — or run it as a **browser-only web GUI** if you prefer.

No cloud. No accounts. No subscriptions. Just your tools, your machine, your workflows.

### The problem it solves

Most bug bounty setups degrade into:
- Piles of one-off bash scripts with no reuse
- Terminal tabs multiplying faster than subdomains
- No clean way to model dependencies between tools
- Scattered notes, clipboard history, and half-finished pipelines
- Re-running entire chains because one tool failed

mini-tricky fixes this by giving you a **visual workflow engine** with typed data flow, parallel execution, per-node artifacts, and the ability to replay individual nodes without re-running the whole pipeline.

---

## Features

### Visual Workflow Builder
Drag security tools, variables, scripts, and logic nodes onto a React Flow canvas. Connect them with typed input/output sockets. The DAG engine validates connections and prevents invalid graphs (cycles, type mismatches, occupied sockets).

<p align="center">
  <img src="docs/images/logic-nodes.svg" alt="Logic and special nodes" width="85%" />
</p>

### Trickest-Style Arguments Panel
The right sidebar is a structured node arguments controller — just like Trickest. Select any node to see its typed inputs/outputs with connection status indicators, configure parameters with add/remove fields, toggle script languages, and manage parameter presets.

<p align="center">
  <img src="docs/images/node-arguments.svg" alt="Node arguments panel" width="55%" />
</p>

### Real-Time Execution
WebSocket streaming sends `node_started`, `node_finished`, and log events as they happen. Watch nodes light up on the canvas with state badges (queued/running/success/failed) and animated pulse borders. Fall back to HTTP batch execution if needed.

### 75 Integrated Security Tools
Pre-configured tools across **21 categories**, defined in `backend/tools.yaml` with command templates, typed I/O sockets, per-argument toggle switches, and timeout settings:

| Category | Tools |
|----------|-------|
| **Recon** | Subfinder, HTTPX, Amass, Assetfinder, Findomain, DNSx, ShuffleDNS, Chaos |
| **Enumeration** | Gobuster, Dirsearch, Feroxbuster, Wfuzz |
| **Vulnerability** | Nuclei, Nikto, WPScan, SQLMap, XSStrike, Dalfox |
| **Fuzzing** | FFUF |
| **Params** | Arjun, ParamSpider, x8, Paraminer |
| **Crawling** | Katana, GoSpider, Hakrawler, Waybackurls |
| **Network** | Nmap, Masscan, Naabu, RustScan |
| **OSINT** | theHarvester, Shodan CLI, Censys, SpiderFoot |
| **Archive** | GAU, Waymore |
| **API** | Kiterunner, APIFuzzer, OpenAPI Diff, RESTler |
| **SSRF** | SSRFmap, Gopherus, Interactsh, SSRF Sheriff |
| **SSTI** | SSTImap, Tplmap |
| **CSRF** | XSRFProbe |
| **CORS** | CORScanner, CRLFuzz |
| **Takeover** | Subjack, Subzy, Nuclei Takeover |
| **Headers** | Shcheck, Hakcheckurl |
| **JSAnalysis** | LinkFinder, SecretFinder, GetJS, SubJS |
| **Wordlist** | CeWL, Wordlister |
| **Cloud** | S3Scanner, Cloud Enum |
| **Secrets** | TruffleHog, Gitleaks |
| **Utility** | Anew, QSReplace, URO, Unfurl, JQ Filter, GF Patterns, Interlace, Rush, Notify, Meg |

### Trickest-Style Argument Toggle Switches
Each tool exposes its CLI flags as **typed argument toggles** in the right-hand inspector. Flip a `flag` switch on to include `-recursive`, set a `string` field for `-wordlist`, an `int` for `-threads`, a `float` for rate limits — the engine builds the final command from your toggles. Same UX as Trickest, fully local.

### 20 Built-In Workflow Templates
20 ready-to-run Trickest-style templates grouped by attack surface — recon chains, vulnerability scans, fuzzing sweeps, cloud enumeration, secret hunting, takeover checks, API fuzzing, and more. Drag one into the canvas, set the domain variable, and hit **Run**. Save your own workflows as reusable templates with one click.

<p align="center">
  <img src="docs/images/templates-view.svg" alt="Templates gallery" width="100%" />
</p>

### Composable Sub-Workflows (Modules)
Package any saved workflow as a reusable module node. Drag it from the sidebar into another workflow — the backend expands and executes the sub-graph inline, piping data through automatically.

### Conditional Branching
Route data based on content with condition nodes. Supported expressions:
- `has_lines` / `empty` — check if upstream produced data
- `contains:PATTERN` / `not_contains:PATTERN` — string matching
- `line_count > N` / `min_lines:N` — threshold checks

Data flows to the **pass** or **fail** output socket based on evaluation.

### Loop/Iterator Nodes
Split upstream data for downstream processing:
- **Per Line**: Each line becomes a separate item
- **Per Chunk**: Split by blank lines (double newline)

### Custom Script Nodes
Write inline Bash or Python scripts with stdin/stdout piping. Upstream data flows in via stdin, script output flows downstream. Toggle between languages with one click.

### Cron Scheduling
Schedule workflows to run on cron expressions via APScheduler. Enable/disable schedules without deleting them.

### Workflow Versioning
Every save creates a numbered version snapshot. Browse version history in the inspector, compare node/edge counts, and restore any previous version with one click.

### Notifications
Toast notifications slide in on run completion, errors, and saves. Browser Notification API integration for background alerts when you're in another tab.

### Parameter Presets
Save frequently-used parameter configurations per tool. One-click apply from the arguments panel. Never re-type the same flags again.

### Keychain-Backed Secrets
API keys, tokens, and passwords in environment profiles are routed to the **OS keychain** — macOS Keychain, Windows Credential Manager, or Linux SecretService — via the Python [`keyring`](https://pypi.org/project/keyring/) library. The SQLite profile blob only stores a sentinel marker, and the `/api/profiles` endpoints mask sensitive fields as `••••••••` before they leave the backend. Headless hosts without a keyring backend transparently fall back to an `0600`-permissioned JSON file. See `backend/src/secrets_store.py` for the split-storage contract.

### Tool Install Script
Every binary referenced in `backend/tools.yaml` is covered by an idempotent installer script generated on the fly. Fetch it via `GET /api/tools/install-script`, copy it from **Settings → Tool Manager**, or just `bash scripts/install-tools.sh` at the repo root. Each tool is guarded by `command -v` so you can re-run safely to pick up new additions.

### Artifact Explorer
Per-node artifact browsing with inline preview for text, JSON, HTML, and images. Download individual artifacts or open them in a new tab.

### Node Replay
Re-run any individual node using cached upstream outputs. No need to re-execute the entire workflow just because one tool needs a retry.

---

## Screenshots

### Workflow Builder
The main view: left sidebar with categorized tools, center canvas with connected workflow nodes, right sidebar with the Trickest-style arguments panel, and bottom console with live output.

<p align="center">
  <img src="docs/images/hero-builder.svg" alt="Workflow builder view" width="100%" />
</p>

### Node Arguments Controller
Structured parameter editing with connection status indicators, typed socket fields, command templates, parameter presets, and version history.

<p align="center">
  <img src="docs/images/node-arguments.svg" alt="Arguments panel close-up" width="55%" />
</p>

### Logic Nodes
Conditional branching and loop/iterator nodes enable complex workflow logic beyond simple linear chains.

<p align="center">
  <img src="docs/images/logic-nodes.svg" alt="Condition, loop, and module nodes" width="85%" />
</p>

---

## Quick Start

### Prerequisites
- **Node.js** 18+ and npm
- **Python** 3.10+
- Security tools installed on your system `PATH` (subfinder, httpx, nuclei, ffuf, etc.)

### 1. Clone & install dependencies

```bash
git clone https://github.com/MKlolbullen/mini-tricky.git
cd mini-tricky

# Root deps (Electron, electron-builder, concurrently)
npm install

# Frontend deps
npm run frontend:install

# Backend deps (in a virtualenv)
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

### 1b. (Optional) Install the 75 security tools

mini-tricky ships the orchestration layer, not the tools. To bootstrap every
binary referenced in `backend/tools.yaml` in one go, run the generated
installer script:

```bash
bash scripts/install-tools.sh
```

The script is idempotent (every tool is guarded by `command -v`, so re-running
only installs what is still missing) and covers `go install`, `pip install`,
`cargo install`, `npm install -g`, `apt`, and `brew` flavours. You can also
fetch it fresh from a running backend — the same content is served by the
in-app **Tool Manager → Copy install script** button:

```bash
curl -s http://localhost:5000/api/tools/install-script > scripts/install-tools.sh
```

### 2. Run the desktop app (recommended)

```bash
npm run dev
```

This launches **everything** at once:
- FastAPI backend on `127.0.0.1:5000`
- Vite dev server on `127.0.0.1:5173`
- Electron window once both are healthy

When the Electron window opens you get full native menus (`Cmd/Ctrl+N` new workflow, `Cmd/Ctrl+S` save, `Cmd/Ctrl+R` run, `Cmd/Ctrl+1..4` switch views), system tray, and persisted window state.

### 3. Run as web GUI only (no Electron)

If you just want a browser-based experience:

```bash
npm run web
```

Then open `http://127.0.0.1:5173` in your browser. The backend at `127.0.0.1:5000` is started for you.

### 4. Build a production desktop installer

```bash
# All-in-one (current platform)
npm run desktop:build

# Platform-specific
npm run desktop:build:mac     # → dist-electron/*.dmg, *.zip          (macOS host)
npm run desktop:build:win     # → dist-electron/*.exe, portable.exe   (Windows host or wine CI)
npm run desktop:build:linux   # → dist-electron/*.AppImage, *.deb     (Linux host)
```

Cross-compiling `.dmg` / `.exe` from Linux is possible but requires extra toolchains; the `.github/workflows/release.yml` runner handles all three targets on native runners. A fresh Linux build from a clean checkout produces:

```
dist-electron/
├── mini-tricky-0.2.0-beta.AppImage   (~100 MB, portable)
├── mini-tricky-0.2.0-beta.deb        (~73 MB, dpkg installable)
└── linux-unpacked/                   (runnable without install)
    └── mini-tricky                   (launch directly to smoke-test)
```

The installer bundles the frontend `dist/` and the entire `backend/` directory as `extraResources`, so end users only need Python 3.10+ on their system — no manual install of the app's Python deps. The Debian package declares `libgtk-3-0`, `libnss3`, `libsecret-1-0`, and friends as `Depends`, so `apt` will pull them automatically.

### 5. Regenerate the app icons (optional)

App icons live in `build/`:
- `icon.svg` — hand-authored 512×512 source of truth
- `icon.png` — 1024×1024 master electron-builder consumes for macOS/Linux
- `icon.ico` — Windows multi-resolution icon
- `icon-{16,32,64,128,256,512}.png` — intermediate sizes
- `electron/tray-icon.png` — 32×32 tray bitmap

If you tweak the SVG, regenerate every variant with:

```bash
pip install Pillow
python3 build/generate_icons.py
```

---

## Architecture

mini-tricky has **two run modes** that share the exact same backend and frontend code:

```
                ┌──────────────────────┐    ┌──────────────────────┐
                │  Desktop (Electron)  │    │   Web GUI (browser)  │
                │  npm run dev         │    │   npm run web        │
                └──────────┬───────────┘    └──────────┬───────────┘
                           │                            │
                           ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                React 18 + @xyflow/react (Vite)                   │
│  ┌──────────┬──────────────┬──────────────────────────────────┐ │
│  │  Tool    │   Canvas     │  Inspector / Arg Toggles         │ │
│  │  Sidebar │   (DAG)      │  (Trickest-style switches)       │ │
│  └──────────┴──────────────┴──────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Console (stdout / stderr / artifacts / live node states) │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │  HTTP + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI + Uvicorn Backend                     │
│  ┌────────┐ ┌──────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │  Graph │ │ DAG Exec │ │ Artifact Mgr   │ │ Result         │  │
│  │  Valid │ │ Engine   │ │ + Preview      │ │ Normalizer     │  │
│  └────────┘ └──────────┘ └────────────────┘ └────────────────┘  │
│  ┌────────┐ ┌──────────┐ ┌────────────────┐ ┌────────────────┐  │
│  │ Sched. │ │ Version  │ │ Template/Preset│ │ Profile Store  │  │
│  │ (cron) │ │ Store    │ │ Manager        │ │ + Reports      │  │
│  └────────┘ └──────────┘ └────────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │ subprocess
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              75 Local Security Tools (system PATH)               │
│  subfinder  httpx  nuclei  ffuf  katana  nmap  arjun  x8 ...    │
└─────────────────────────────────────────────────────────────────┘
```

In **desktop mode**, the Electron main process (`electron/main.cjs`) spawns the Python backend as a child process, polls `/api/health` until it's ready, then loads the Vite dev server (or the built `frontend/dist/index.html` in production). It also wires up native menus, the system tray, IPC handlers (`get-app-info`, `restart-backend`, `show-save-dialog`, `read-file`, `write-file`, ...), and persists window state to `userData/window-state.json`.

In **web mode**, you skip Electron entirely — `concurrently` runs the backend and Vite, and you point a browser at `http://127.0.0.1:5173`.

### Execution Model
- Workflows are validated as **Directed Acyclic Graphs (DAGs)**
- Nodes execute in **topological order** with parallel groups
- Parent nodes must complete before children start
- Independent nodes run concurrently (configurable worker count)
- Failed parents block downstream nodes cleanly
- Output data flows through typed sockets: `domain`, `targets`, `findings`, etc.

### Data Flow
```
Variable Node (domain: "example.com")
    │
    ▼ out:domain ──→ in:domain
Subfinder (produces targets.txt)
    │
    ▼ out:targets ──→ in:targets
HTTPX (filters live hosts)
    │
    ▼ out:targets ──→ in:targets
Nuclei (scans for vulnerabilities)
    │
    ▼ out:findings ──→ in:any
Output Node (collects artifacts)
```

---

## Node Types

| Node | Icon | Description | Inputs | Outputs |
|------|------|-------------|--------|---------|
| **Tool** | Category-specific | Runs a security tool via subprocess | Tool-defined | Tool-defined |
| **Variable** | 📥 | Provides input data (domain, target list, wordlist) | None | Typed value |
| **Output** | 📤 | Collects artifacts from upstream nodes | any | None |
| **Script** | 🐍/📜 | Custom Bash or Python with stdin/stdout piping | targets | targets |
| **Module** | 🧩 | Embeds a saved workflow as a sub-graph | targets | targets |
| **Condition** | ⚖️ | If/else branching based on data content | targets | pass, fail |
| **Loop** | 🔄 | Iterates over input line-by-line or chunk-by-chunk | targets | item |

---

## Project Structure

```
mini-tricky/
├── electron/                       # Electron main process + preload
│   ├── main.cjs                    # Window/menus/tray/IPC/backend spawn
│   ├── preload.cjs                 # Secure contextBridge → window.miniTricky
│   └── tray-icon.png               # 32x32 tray bitmap
├── build/                          # Icon source + generated rasters (electron-builder resources)
│   ├── icon.svg                    # Hand-authored 512x512 source of truth
│   ├── icon.png                    # 1024x1024 master (macOS + Linux)
│   ├── icon-{16,32,64,128,256,512}.png
│   ├── icon.ico                    # Windows multi-resolution icon
│   └── generate_icons.py           # Pillow-based rasterizer (reproducible)
├── backend/
│   ├── src/
│   │   ├── main.py                 # FastAPI app (all endpoints + execution engine)
│   │   ├── db.py                   # SQLModel tables + repository helpers
│   │   ├── secrets_store.py        # OS keychain split-storage for profile env_vars
│   │   ├── llm.py                  # Anthropic-backed `/api/generate` implementation
│   │   └── replay_cli.py           # Per-node replay helpers
│   ├── alembic/versions/           # Schema migrations (001_initial, 002_import_from_json, ...)
│   ├── tests/                      # pytest suite (test_api, test_secrets_store, test_install_script, ...)
│   ├── tools.yaml                  # 75 tool definitions across 21 categories
│   ├── templates.yaml              # 20 built-in workflow templates
│   ├── requirements.txt            # Runtime Python deps
│   └── requirements-dev.txt        # pytest + ruff + mypy for CI
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # Root app with view routing
│   │   ├── api.ts                  # All REST + WebSocket client helpers
│   │   ├── types.ts                # TypeScript type definitions
│   │   ├── index.css               # Dark-theme stylesheet
│   │   └── components/
│   │       ├── TopBar.tsx
│   │       ├── builder/            # BuilderView, Canvas, Inspector, Console, Notifications, ...
│   │       ├── templates/TemplatesView.tsx
│   │       ├── runs/{RunsView,RunDetail}.tsx
│   │       └── settings/SettingsView.tsx  # Tool Manager, Copy install script, profiles
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── scripts/
│   └── install-tools.sh            # Static, committed copy of the tool installer
├── docs/images/                    # UI mockups and diagrams
├── .github/workflows/              # CI (ci.yml) + Release (release.yml)
└── package.json                    # Root package (Electron + electron-builder build config)
```

---

## API Reference

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Backend health check (used by Electron auto-spawn) |
| `GET` | `/api/tools` | List all 75 tools with their typed I/O and arg schemas |
| `GET` | `/api/tools/install-script` | Generate a `bash` script that installs every tool (`command -v` guarded, idempotent) |
| `GET/POST` | `/api/profiles` | List / create environment profiles. Sensitive `env_vars` are masked on read and routed to the OS keychain on write |
| `PUT/DELETE` | `/api/profiles/{id}` | Update / delete a profile (DELETE also purges the profile's keychain entries) |
| `POST` | `/api/generate` | AI-assisted workflow generation from a goal description |
| `POST` | `/api/normalize` | Normalize raw tool output into a unified findings schema |
| `GET` | `/api/runs/{id}/report` | Render Markdown / JSON report from a completed run |

### Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/workflows` | List all saved workflows |
| `POST` | `/api/workflows` | Save workflow (creates version) |
| `GET` | `/api/workflows/{id}` | Get workflow by ID |
| `GET` | `/api/workflows/{id}/versions` | List version history |
| `POST` | `/api/workflows/{id}/versions/{v}/restore` | Restore a version |
| `POST` | `/api/workflows/validate` | Validate graph structure |

### Runs
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/runs` | Execute workflow (HTTP batch) |
| `WS` | `/ws/run` | Execute workflow (WebSocket stream) |
| `GET` | `/api/runs` | List all runs |
| `GET` | `/api/runs/{id}` | Get run details |
| `DELETE` | `/api/runs/{id}` | Delete run + artifacts |
| `POST` | `/api/runs/{id}/cancel` | Cancel active run |
| `POST` | `/api/runs/{id}/replay/{node}` | Replay single node |

### Artifacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/runs/{id}/artifacts` | List run artifacts |
| `GET` | `/api/runs/{id}/artifact-preview?path=` | Preview artifact content |
| `GET` | `/api/runs/{id}/artifact-raw?path=` | Download raw artifact |

### Templates, Schedules, Presets
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/templates` | List / create templates |
| `GET/POST/DELETE` | `/api/schedules` | Manage cron schedules |
| `PATCH` | `/api/schedules/{id}` | Toggle schedule enabled |
| `GET/POST/DELETE` | `/api/presets` | Manage parameter presets |

---

## Example Workflows

### Basic Recon Chain
```
Domain Input → Subfinder → HTTPX → Nuclei → Artifacts
```

### Conditional Vulnerability Scan
```
Domain Input → Subfinder → Condition (has_lines?)
    ├── pass → HTTPX → Nuclei → Artifacts
    └── fail → Output (no subdomains found)
```

### Parallel Discovery + Fuzzing
```
Domain Input ──┬── Gau ────────┬── Deduplicate → FFUF → Artifacts
               └── Katana ─────┘
```

### Sub-Workflow Module
```
Target List → [Full Recon Module] → Condition → Loop → Nuclei → Artifacts
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Shell | Electron 33 + electron-builder 25 | Native app experience, file access, packaging |
| Frontend | React 18 + TypeScript 5 | UI components |
| Graph Editor | @xyflow/react (React Flow) | Visual DAG canvas |
| Build Tool | Vite 5 | Fast dev server + production builds |
| Backend | FastAPI + Uvicorn + Pydantic v2 | REST API + WebSocket server |
| Execution | Python `subprocess` | Tool invocation + artifact capture |
| Scheduling | APScheduler | Cron-based workflow automation |
| Persistence | SQLite (via `sqlmodel`) + Alembic migrations | Workflows, runs, versions, presets, profiles |
| Secrets | [`keyring`](https://pypi.org/project/keyring/) → OS keychain (file fallback `0600`) | API keys, tokens, passwords |
| LLM (optional) | Anthropic SDK (`claude-haiku-4-5`) | AI-assisted workflow generation |

---

## Roadmap

### Completed
- [x] Visual DAG workflow editor with drag-and-drop
- [x] **75 security tools across 21 categories** (Recon, Vuln, Params, API, SSRF, SSTI, CSRF, CORS, Takeover, Headers, JSAnalysis, Cloud, Secrets, Wordlist, etc.)
- [x] **Trickest-style argument toggle switches** (flag / string / int / float per CLI option) — every tool audited with its real CLI flags
- [x] **Color-coded typed sockets** (domain, targets, findings, params, urls, ...)
- [x] **20 built-in workflow templates** across attack-surface categories
- [x] **Full Electron desktop app** with native menus, system tray, keyboard shortcuts, persisted window state, and custom app icons (1024x1024 master + Windows multi-res `.ico` + 32x32 tray bitmap)
- [x] **Embedded backend auto-spawn** in Electron with health-check polling
- [x] **Web GUI mode** (`npm run web`) as a no-Electron alternative
- [x] **Cross-platform installers** via electron-builder (`.dmg`, `.zip`, `.exe`, `.nsis`, `.AppImage`, `.deb`) — Linux `.deb` / `.AppImage` fully validated end-to-end
- [x] **SQLite persistence** with Alembic migrations (`sqlmodel` schema, automatic import from legacy JSON state files)
- [x] **OS keychain secrets** — API keys / tokens / passwords in profile `env_vars` are persisted via [`keyring`](https://pypi.org/project/keyring/) (macOS Keychain, Windows Credential Manager, Linux SecretService). The SQLite blob keeps a sentinel, and `/api/profiles` masks sensitive values as `••••••••` so the real secret never crosses the wire. Headless hosts fall back to a `state/secrets-fallback.json` file with `0600` perms
- [x] **Tool install script** — `scripts/install-tools.sh`, `GET /api/tools/install-script`, and **Settings → Tool Manager → Copy install script** bootstrap every binary in `tools.yaml` in one idempotent pass
- [x] **Real LLM workflow generation** — `/api/generate` delegates to Anthropic (`claude-haiku-4-5` by default) with the full tool catalog as context, with a keyword-matcher fallback when no API key is available
- [x] **Baseline CI** — pytest + ruff + mypy for backend, vitest + tsc + vite-build for frontend, Playwright smoke for e2e
- [x] WebSocket streaming execution with live node states
- [x] Conditional branching (if/else nodes), loop/iterator nodes (per-line, per-chunk)
- [x] Composable sub-workflow modules
- [x] Custom script nodes (Bash/Python)
- [x] Cron scheduling (APScheduler), workflow versioning with restore
- [x] Parameter presets, environment profiles (per target scope)
- [x] Result normalization, report export (`/api/runs/{id}/report`)
- [x] Toast + browser notifications, animated directional edges, category-colored minimap
- [x] Artifact explorer with inline preview, node replay with cached upstream
- [x] Import/export workflows as JSON

### Planned
- [ ] First **GitHub Releases beta** with one-click downloads for macOS / Windows / Linux (Linux builds already reproducible locally via `npm run desktop:build:linux`; cross-compile for macOS / Windows still requires CI runners)
- [ ] Auto-update channel via electron-updater
- [ ] Dark/light theme toggle (currently dark-only)
- [ ] Distributed worker support for very large scans
- [ ] Per-run resource limits (CPU/RAM/network rate)
- [ ] Tool sandboxing (firejail / bwrap / rootless Docker) for untrusted targets

---

## Security & Ethics

This project is intended for:
- **Authorized penetration testing**
- **Bug bounty programs** where you have permission to test
- **Lab environments** and CTF challenges
- **Defensive security research**

Do not use this against targets you do not have explicit authorization to assess.

---

## Contributing

PRs, issues, and honest feedback welcome.

Good areas to contribute:
- Tool definitions in `tools.yaml` (add new tools)
- Node execution engine improvements
- React Flow UX polish
- Artifact rendering for more file types
- Electron desktop ergonomics

---

## License

MIT

---

## Acknowledgments

- [Trickest](https://trickest.com/) for the workflow builder inspiration
- [ProjectDiscovery](https://projectdiscovery.io/) and the offensive security tool ecosystem
- [React Flow / XYFlow](https://reactflow.dev/) for the graph rendering foundation
- Everyone tired of terminal chaos who wants a better operator surface

---

<p align="center">
  <strong>Built for local workflows, real tooling, and less operational mess.</strong>
</p>

<h1 align="center">
  <br />
  mini-tricky
  <br />
</h1>

<p align="center">
  <strong>A locally hosted Trickest clone for security workflow automation.</strong>
  <br />
  Visual DAG editor &middot; 38 security tools &middot; Real-time execution &middot; Zero cloud dependency
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Electron-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/frontend-React%20%2B%20React%20Flow-61DAFB?logo=react&logoColor=111827" alt="React" />
  <img src="https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/tools-38%20integrated-blueviolet" alt="38 Tools" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

<p align="center">
  <a href="#features">Features</a> &middot;
  <a href="#screenshots">Screenshots</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#tool-library">Tool Library</a> &middot;
  <a href="#node-types">Node Types</a> &middot;
  <a href="#roadmap">Roadmap</a>
</p>

---

<p align="center">
  <img src="docs/images/hero-builder.svg" alt="mini-tricky workflow builder" width="100%" />
</p>

---

## What is mini-tricky?

**mini-tricky** is a local-first desktop application that replicates the Trickest workflow builder experience for offensive security automation. Build visual DAG workflows by dragging tools onto a canvas, connect them with typed sockets, and execute entire recon/scanning pipelines with real-time streaming output.

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

### 38 Integrated Security Tools
Pre-configured tools across 9 categories, defined in `tools.yaml` with command templates, typed I/O sockets, and timeout settings:

| Category | Tools |
|----------|-------|
| **Recon** | subfinder, httpx, amass, assetfinder, dnsx, massdns, shuffledns |
| **Enumeration** | naabu, gobuster, dirsearch, wappalyzer |
| **Vulnerability** | nuclei, dalfox, sqlmap, xsstrike, commix |
| **Fuzzing** | ffuf, feroxbuster, wfuzz, arjun |
| **Crawling** | katana, gospider, hakrawler, linkfinder |
| **Network** | nmap, masscan, rustscan, testssl |
| **OSINT** | theHarvester, shodan-cli, censys, spiderfoot |
| **Archive** | gau, waybackurls, waymore |
| **Utility** | jq, anew, unfurl, qsreplace |

### Workflow Templates
8 built-in templates for common security workflows. Create and save your own custom templates.

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
- Security tools installed on your system PATH (subfinder, httpx, nuclei, etc.)

### 1. Clone the repository

```bash
git clone https://github.com/MKlolbullen/mini-tricky.git
cd mini-tricky
```

### 2. Install and start the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --host 127.0.0.1 --port 5000 --reload
```

### 3. Install and start the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and connects to the backend at `http://127.0.0.1:5000`.

### 4. (Optional) Run the Electron desktop app

```bash
# From the root directory
npm install
npm run desktop:dev
```

### 5. (Optional) Build for production

```bash
cd frontend && npm run build    # Build frontend
npm run desktop:build           # Package Electron app
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Shell                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              React + React Flow                    │   │
│  │  ┌──────────┬──────────────┬──────────────────┐  │   │
│  │  │  Tool    │   Canvas     │  Arguments       │  │   │
│  │  │  Sidebar │   (DAG)      │  Panel           │  │   │
│  │  │          │              │                   │  │   │
│  │  └──────────┴──────────────┴──────────────────┘  │   │
│  │  ┌────────────────────────────────────────────┐  │   │
│  │  │  Console (stdout / stderr / artifacts)      │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
│            │ HTTP + WebSocket                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │              FastAPI Backend                       │   │
│  │  ┌────────┐ ┌──────────┐ ┌────────────────────┐ │   │
│  │  │  Graph  │ │ DAG Exec │ │  Artifact Manager  │ │   │
│  │  │  Valid. │ │ Engine   │ │  + Preview         │ │   │
│  │  └────────┘ └──────────┘ └────────────────────┘ │   │
│  │  ┌────────┐ ┌──────────┐ ┌────────────────────┐ │   │
│  │  │ Sched. │ │ Version  │ │  Template + Preset │ │   │
│  │  │ (cron) │ │ Store    │ │  Manager           │ │   │
│  │  └────────┘ └──────────┘ └────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│            │ subprocess                                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Local Security Tools (PATH)               │   │
│  │  subfinder  httpx  nuclei  ffuf  katana  nmap ... │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

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
├── electron/                    # Electron main process + preload
│   ├── main.cjs
│   └── preload.cjs
├── backend/
│   ├── src/
│   │   └── main.py             # FastAPI app (all endpoints + execution engine)
│   ├── tools.yaml              # 38 tool definitions with command templates
│   ├── templates.yaml          # 8 built-in workflow templates
│   └── requirements.txt        # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Root app with view routing
│   │   ├── api.ts              # All API + WebSocket helpers
│   │   ├── types.ts            # TypeScript type definitions
│   │   ├── index.css           # Full dark-theme stylesheet
│   │   └── components/
│   │       ├── TopBar.tsx      # Navigation bar
│   │       ├── builder/
│   │       │   ├── BuilderView.tsx    # Core builder logic
│   │       │   ├── Canvas.tsx         # React Flow wrapper
│   │       │   ├── SocketNode.tsx     # Custom node renderer
│   │       │   ├── ToolSidebar.tsx    # Draggable tool palette
│   │       │   ├── Inspector.tsx      # Arguments panel
│   │       │   ├── Toolbar.tsx        # Action buttons
│   │       │   ├── Console.tsx        # Output console
│   │       │   └── Notifications.tsx  # Toast notification system
│   │       ├── templates/
│   │       │   └── TemplatesView.tsx  # Template gallery
│   │       ├── runs/
│   │       │   ├── RunsView.tsx       # Run history table
│   │       │   └── RunDetail.tsx      # Run detail + artifacts
│   │       └── settings/
│   │           └── SettingsView.tsx   # Health + config
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── docs/images/                 # UI mockups and diagrams
└── package.json                 # Root package (Electron)
```

---

## API Reference

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
| Desktop Shell | Electron | Native app experience, file access |
| Frontend | React 18 + TypeScript | UI components |
| Graph Editor | @xyflow/react (React Flow) | Visual DAG canvas |
| Build Tool | Vite | Fast dev server + production builds |
| Backend | FastAPI + Uvicorn | REST API + WebSocket server |
| Execution | Python subprocess | Tool invocation + artifact capture |
| Scheduling | APScheduler | Cron-based workflow automation |
| Storage | JSON files | Workflows, runs, versions, presets |

---

## Roadmap

### Completed
- [x] Visual DAG workflow editor with drag-and-drop
- [x] 38 security tools across 9 categories
- [x] WebSocket streaming execution with live node states
- [x] Trickest-style node arguments panel
- [x] Conditional branching (if/else nodes)
- [x] Loop/iterator nodes
- [x] Composable sub-workflow modules
- [x] Custom script nodes (Bash/Python)
- [x] 8 built-in workflow templates
- [x] Cron scheduling
- [x] Workflow versioning with restore
- [x] Parameter presets
- [x] Toast + browser notifications
- [x] Animated directional edges
- [x] Category-colored minimap
- [x] Artifact explorer with inline preview
- [x] Node replay with cached upstream
- [x] Import/export workflows as JSON

### Planned
- [ ] Per-tool install/bootstrap manager (check if tools are in PATH)
- [ ] Environment profiles (different tool configs per target scope)
- [ ] Richer result normalization across tools
- [ ] AI-assisted workflow generation
- [ ] Report export (Markdown/PDF) from run artifacts
- [ ] Dark/light theme toggle

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

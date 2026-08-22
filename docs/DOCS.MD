**Here is the entire `DETAILS.md` file:**

---

# mini-tricky - Detailed Project Documentation

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. The Problem mini-tricky Solves](#2-the-problem-mini-tricky-solves)
- [3. What mini-tricky Actually Is](#3-what-mini-tricky-actually-is)
- [4. Key Features](#4-key-features)
  - [4.1 Visual DAG Workflow Builder](#41-visual-dag-workflow-builder)
  - [4.2 75+ Pre-Integrated Security Tools](#42-75-pre-integrated-security-tools)
  - [4.3 Real-Time Execution Engine](#43-real-time-execution-engine)
  - [4.4 Built-in Templates](#44-built-in-templates)
  - [4.5 Advanced Logic Nodes](#45-advanced-logic-nodes)
  - [4.6 Composable Sub-Workflows](#46-composable-sub-workflows)
  - [4.7 Workflow Versioning & History](#47-workflow-versioning--history)
  - [4.8 Scheduling (Cron)](#48-scheduling-cron)
  - [4.9 Secrets Management](#49-secrets-management)
  - [4.10 Notifications & Artifact Explorer](#410-notifications--artifact-explorer)
- [5. AI Integration (Claude) – Deep Dive](#5-ai-integration-claude--deep-dive)
- [6. Technical Architecture](#6-technical-architecture)
- [7. Security Considerations](#7-security-considerations)
- [8. Installation & Setup](#8-installation--setup)
- [9. Development & Contribution](#9-development--contribution)
- [10. Current Status](#10-current-status)
- [11. Future Roadmap](#11-future-roadmap)
- [12. Why This Project Matters](#12-why-this-project-matters)

---

## 1. Project Overview

**mini-tricky** is a **local-first, desktop-native** workflow automation platform designed specifically for offensive security professionals, bug bounty hunters, and penetration testers.

It is a **complete local clone** of the popular cloud-based platform **Trickest.io**, rebuilt from the ground up to run entirely on your machine with zero cloud dependency, zero subscriptions, and full data privacy.

### Core Philosophy
- **Visual > Terminal**: Replace chaotic terminal tabs and one-off scripts with clean, reusable, visual Directed Acyclic Graph (DAG) workflows.
- **Local-First**: Everything runs on your machine. No data leaves your computer unless you explicitly want it to.
- **Security Professional Focused**: Built by and for people who do real offensive security work daily.
- **Extensible & Composable**: Workflows can be saved as templates, reused as sub-modules, and enhanced with AI.

**Tagline**:  
*"The power of Trickest, running locally on your machine — forever free."*

---

## 2. The Problem mini-tricky Solves

Most bug bounty hunters and pentesters suffer from the same workflow chaos:

- Dozens of terminal tabs open with different tools
- Scripts copied from Notion, bookmarks, and old GitHub gists
- No clear dependency modeling between tools (e.g., "run nuclei only after subfinder finishes")
- Re-running entire chains when one step fails
- Scattered artifacts, logs, and findings across folders
- No easy way to reuse successful workflows across targets
- Constant context switching between tools, browsers, and notes

**mini-tricky** solves this by giving you a **visual canvas** where you can:
- Drag tools onto a canvas
- Connect them with typed data flow
- Configure every argument visually
- Execute the entire pipeline with one click
- See real-time progress and capture artifacts automatically
- Save, version, schedule, and reuse everything

---

## 3. What mini-tricky Actually Is

mini-tricky is a **hybrid desktop + web application** consisting of three main parts:

1. **Electron Desktop App** (primary interface)
   - Native macOS, Windows, and Linux application
   - Bundled Python runtime (no separate Python install needed)
   - System tray, menus, keyboard shortcuts, and native window management

2. **FastAPI Backend** (embedded)
   - Python-based orchestration engine
   - Handles workflow execution, real-time streaming via WebSockets, scheduling, versioning, and AI integration

3. **React + React Flow Frontend**
   - Modern drag-and-drop canvas powered by `@xyflow/react`
   - Real-time node state visualization
   - Rich inspector panel for tool configuration

It can also run in **pure web mode** (browser-only) if you prefer.

---

## 4. Key Features

### 4.1 Visual DAG Workflow Builder
- Drag-and-drop interface using React Flow
- Typed input/output sockets (prevents invalid connections)
- Support for parallel execution paths
- Automatic cycle detection
- Zoom, pan, mini-map, and keyboard navigation

### 4.2 75+ Pre-Integrated Security Tools
Tools are defined in `backend/tools.yaml` across **21 categories**:
- Recon, Enumeration, Vulnerability Scanning, Fuzzing, Crawling, Network, OSINT, Cloud, Secrets, API Testing, SSRF, SSTI, Takeover, etc.

Each tool includes:
- Command template
- Typed arguments with toggle switches (string, int, bool, file, etc.)
- Input/output socket definitions
- Default timeouts and presets

### 4.3 Real-Time Execution Engine
- WebSocket streaming of node states (`queued` → `running` → `success` / `failed`)
- Live log streaming per node
- Artifact capture (text, JSON, HTML, images, files)
- Per-node replay capability (re-run only one node without restarting the whole workflow)
- Graceful failure handling

### 4.4 Built-in Templates
Ready-to-use workflows for common scenarios:
- Full subdomain enumeration + nuclei scanning
- Cloud asset discovery
- Secret hunting
- API fuzzing
- Subdomain takeover checks
- And more

### 4.5 Advanced Logic Nodes
- **Conditional Branching**: Route data based on content (`has_lines`, `contains`, `line_count > N`, etc.)
- **Loop / Iterator Nodes**: Process output line-by-line or in chunks
- **Custom Script Nodes**: Inline Bash or Python with stdin/stdout piping

### 4.6 Composable Sub-Workflows
Any saved workflow can be turned into a reusable "module node" and dropped into other workflows.

### 4.7 Workflow Versioning & History
Every save creates a numbered snapshot. You can browse history, compare versions, and restore previous states with one click.

### 4.8 Scheduling (Cron)
Schedule any workflow to run automatically using cron expressions via APScheduler.

### 4.9 Secrets Management
- API keys and tokens stored securely in the OS keychain (`keyring` library)
- Fallback to encrypted local file (0600 permissions)
- Profile-based environment variable management

### 4.10 Notifications & Artifact Explorer
- Beautiful inline preview of outputs (syntax highlighting, JSON viewer, image support)
- Toast notifications + system notifications
- Per-node artifact history

---

## 5. AI Integration (Claude) – Deep Dive

mini-tricky features a powerful, deeply integrated AI assistant powered by **Anthropic’s Claude** models. This is one of the most advanced parts of the application.

### 5.1 Why Claude?

We chose Claude (specifically Claude 3.5 Sonnet and Haiku in 2026) because of its:
- Excellent reasoning capabilities on complex, multi-step security tasks
- Strong instruction-following (critical for structured JSON output)
- Good balance of speed and intelligence
- Built-in safety alignment

### 5.2 Current AI Capabilities

mini-tricky currently offers **four core AI-powered features**:

#### 1. Natural Language → Full Workflow Generation
**Example prompt**:  
*"Perform full subdomain enumeration on example.com, then run nuclei for critical and high severity vulnerabilities, and finally check for subdomain takeover."*

**What happens**:
- Claude analyzes the request
- Selects appropriate tools from the 75+ available
- Builds a complete, connected DAG with proper data flow
- Returns structured JSON that is directly importable into the canvas
- User reviews and can edit before executing

#### 2. Workflow Explainer
Click the **"Explain Workflow"** button on any saved or generated workflow. Claude provides a clear, human-readable explanation of:
- What the workflow does overall
- Why each node was chosen
- Potential risks or improvements
- Estimated execution time and resource usage

#### 3. Debug Failed Runs
When a workflow fails, users can click **"Debug with Claude"** and paste the error logs. Claude will:
- Identify the root cause
- Explain the most likely reason for failure (rate limits, wrong flags, missing dependencies, auth issues, etc.)
- Suggest specific fixes with exact command/argument changes
- Recommend the next best action

#### 4. Suggest Next Nodes
After any node finishes (or during workflow building), users can ask Claude for intelligent suggestions. It recommends 3–5 logical next steps with:
- Tool name and reason
- Suggested arguments
- Priority level (high/medium/low)

### 5.3 Technical Implementation

**Location**: `backend/src/llm.py`

**Key Components**:
- Dynamic loading of `tools.yaml` into the system prompt (so Claude always knows the exact available tools)
- Carefully engineered system prompt with strong security guardrails
- Structured JSON output enforcement (Claude is instructed to return *only* valid JSON)
- Separate functions for each AI capability (`generate_workflow`, `explain_workflow`, `debug_failed_run`, `suggest_next_nodes`)
- REST API endpoints exposed at `/api/ai/*`

**System Prompt Strategy**:
- Role: "Expert offensive security engineer and workflow architect"
- Strict rules about safety and ethics
- Tool list injection for accuracy
- Explicit instructions to never suggest destructive actions without confirmation

### 5.4 Security & Safety Guardrails

- All AI-generated workflows require **explicit user approval** before execution
- Strong system prompt prevents Claude from suggesting dangerous or illegal commands
- No automatic execution of AI output
- User-provided Anthropic API key (never stored by the app)
- Future versions will add local LLM support (Ollama, LM Studio) for fully offline operation

### 5.5 Usage Examples

**Generate a workflow**:
> "Find all subdomains of target.com, resolve them with httpx, then scan with nuclei using the latest templates."

**Debug example**:
User pastes error: `nuclei: permission denied` → Claude suggests running with proper privileges or checking binary location.

**Suggest next**:
After running `subfinder`, Claude might suggest: `httpx` → `nuclei` → `subjack` (for takeover checks).

### 5.6 Future AI Plans

- Support for local models (Ollama, LM Studio, llama.cpp)
- Workflow optimization suggestions (reduce runtime, parallelize more)
- Cost estimation before running large workflows
- Automatic template improvement based on success/failure history
- Multi-agent collaboration (one agent for recon, one for exploitation, etc.)

---

## 6. Technical Architecture

### High-Level Flow
1. User interacts with React frontend
2. Frontend communicates with FastAPI backend via REST + WebSocket
3. Backend spawns tool processes (or custom scripts) in isolated subprocesses
4. Real-time output is streamed back via WebSocket
5. Results and artifacts are stored in SQLite
6. AI features call Anthropic API (user must provide their own key)

### Key Components

| Component          | Technology                          | Purpose |
|--------------------|-------------------------------------|--------|
| Frontend           | React 18 + TypeScript + Vite + React Flow | Visual canvas & UI |
| Backend            | FastAPI + Uvicorn + Pydantic v2    | Orchestration engine |
| Database           | SQLite + SQLModel + Alembic        | Persistence |
| Desktop Wrapper    | Electron 33                        | Native app packaging |
| Scheduling         | APScheduler                        | Cron jobs |
| Secrets            | Python `keyring`                   | Secure credential storage |
| AI                 | Anthropic SDK (Claude)             | Intelligent assistance |
| Tool Definitions   | YAML (`tools.yaml`)                | Declarative tool registry |

### Execution Model
- Each node runs in its own subprocess
- Output is captured in real time and streamed
- Artifacts are saved to a structured folder per run (`runs/<run_id>/nodes/<node_id>/`)
- Environment variables from profiles are injected securely

---

## 7. Security Considerations

mini-tricky is a **powerful offensive security tool** — therefore security is taken very seriously:

- **Command Execution**: All tool commands are built from whitelisted templates. Arbitrary command execution is only allowed through the controlled "Custom Script" node.
- **Sandboxing**: Future versions will add stronger sandboxing (e.g., Firejail, bubblewrap, or containerized execution).
- **Secrets**: Never stored in plaintext. Uses OS keychain where available.
- **AI Safety**: Strong system prompts prevent Claude from suggesting dangerous actions. All AI-generated workflows require explicit user approval before execution.
- **Local-First**: No telemetry, no phoning home, no accounts.

**Important**: mini-tricky is a **force multiplier** — it does not replace proper operational security practices.

---

## 8. Installation & Setup

### Pre-built Releases
Download the latest beta from the [Releases](https://github.com/MKlolbullen/mini-tricky/releases) page:
- macOS (Intel + Apple Silicon)
- Windows (x64)
- Linux (AppImage + .deb)

### Tool Installation
mini-tricky does **not** ship the actual security tools (subfinder, nuclei, etc.). You must install them yourself.

A convenient one-command installer is provided:
```bash
bash scripts/install-tools.sh
```

Or use the in-app **Settings → Tool Manager**.

### Running from Source
See `README.md` for development setup instructions.

---

## 9. Development & Contribution

The project is structured for easy contribution:

- `frontend/` — React + TypeScript
- `backend/` — Python (FastAPI)
- `electron/` — Desktop wrapper
- `backend/tools.yaml` — Add new tools here
- `backend/templates.yaml` — Add new workflow templates here

**Tech Stack Highlights**:
- Strict TypeScript + Pydantic
- Modern React patterns
- Clean separation of concerns

We welcome contributions in the form of:
- New tool definitions
- Better templates
- UI/UX improvements
- AI prompt engineering
- Bug reports and feature requests

---

## 10. Current Status (as of May 2026)

- **Version**: 0.4.0-beta
- **Status**: Functional beta with core features working
- **AI Features**: Generate workflow, Explain, Debug, Suggest next nodes (fully implemented)
- **Known Limitations**: 
  - Some advanced tool argument types still being refined
  - Large workflows can be slow without background workers (planned improvement)
  - Electron builds are unsigned (user must allow on first launch)

---

## 11. Future Roadmap

### Short Term (v0.5)
- Improved AI (better workflow generation quality)
- Export workflow as standalone script
- Enhanced error handling and retry logic
- Better mobile/responsive web mode

### Medium Term (v0.6 – v0.7)
- Background worker system (Celery / multiprocessing)
- Plugin system for custom nodes
- Workflow marketplace (local sharing)
- Advanced visualization (execution heatmaps, cost estimation)

### Long Term Vision
- Become the de-facto **local-first** offensive security automation platform
- Support for adversary emulation (MITRE ATT&CK mapping)
- Team collaboration features (optional)
- Integration with popular bug bounty platforms

---

## 12. Why This Project Matters

In 2026, the offensive security community is moving toward **automation and orchestration**, but most powerful tools are either:
- Expensive cloud platforms (Trickest, Nuclei Cloud, etc.), or
- Fragmented terminal-based scripts

**mini-tricky** fills the critical gap: **professional-grade visual automation that respects your privacy, your budget, and your machine**.

It empowers individual researchers and small teams to work at the same level as large organizations — without giving up control of their data or paying recurring fees.

---

**mini-tricky** — *Your workflows. Your machine. Your rules.*

/MKlolbullen
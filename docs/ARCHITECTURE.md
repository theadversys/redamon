# PandaExploit — Application Architecture

This document describes the architecture of the entire PandaExploit application: an AI-powered agentic red team framework that automates offensive security operations from reconnaissance through exploitation and post-exploitation.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Component Overview](#3-component-overview)
4. [Data Flow](#4-data-flow)
5. [Technology Stack](#5-technology-stack)
6. [Deployment Architecture](#6-deployment-architecture)
7. [API Surface](#7-api-surface)
8. [Data Stores](#8-data-stores)
9. [Security & Multi-Tenancy](#9-security--multi-tenancy)

---

## 1. Executive Summary

PandaExploit is a modular, containerized penetration testing framework that chains:

- **Automated reconnaissance** — Six-phase scanning pipeline (domain discovery → port scan → HTTP probe → resource enumeration → vulnerability scan → GitHub secret hunting)
- **AI-driven exploitation** — LangGraph-based autonomous agent with ReAct pattern, phase-aware execution, and MCP tool integration
- **Graph-powered intelligence** — Neo4j knowledge graph as the single source of truth for attack surface data
- **Project settings engine** — 180+ per-project parameters controlling every tool and agent behavior

All components run inside Docker and communicate through well-defined APIs. The system supports both **Guided Mode** (human approval for exploitation) and **Offensive Mode** (autonomous progression).

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER LAYER                                             │
│  ┌─────────────────┐                        ┌─────────────────┐                         │
│  │   Web Browser    │                        │  Terminal/CLI    │                         │
│  │  (localhost:3000)│                        │  (recon CLI)     │                         │
│  └────────┬────────┘                        └────────┬────────┘                         │
└───────────┼──────────────────────────────────────────┼───────────────────────────────────┘
            │                                          │
            ▼                                          │
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FRONTEND LAYER                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js Webapp (:3000)                                                              │  │
│  │  • Graph visualization • AI chat • Project settings • Recon controls • Node inspector │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
            │
            │ REST / WebSocket / SSE
            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 BACKEND LAYER                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────────────────┐  │
│  │  Recon Orchestrator (:8010)  │    │  AI Agent Orchestrator (:8090)                    │  │
│  │  FastAPI + Docker SDK       │    │  FastAPI + LangGraph + Claude/GPT                  │  │
│  │  • Spawns recon containers  │    │  • ReAct loop • Phase transitions • MCP tools      │  │
│  │  • SSE log streaming        │    │  • WebSocket chat • Approval workflows            │  │
│  └──────────────┬──────────────┘    └──────────────────────┬──────────────────────────┘  │
└─────────────────┼──────────────────────────────────────────┼──────────────────────────────┘
                  │                                          │
                  │ Docker SDK                               │ MCP (SSE)
                  ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                              MCP TOOLS LAYER (Kali Sandbox)                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐                          │
│  │  Naabu    │  │  Curl    │  │  Nuclei  │  │  Metasploit      │                          │
│  │  :8000    │  │  :8001   │  │  :8002   │  │  :8003 / :8013   │                          │
│  │  Port scan│  │  HTTP    │  │  Vuln    │  │  Exploitation    │                          │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘                          │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  │ (recon container)
                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                              RECON PIPELINE (Docker)                                       │
│  domain_discovery → port_scan → http_probe → resource_enum → vuln_scan → github_secrets    │
│  (crt.sh, Knockpy, DNS)  (Naabu)  (httpx, Wappalyzer)  (Katana, GAU, Kiterunner)  (Nuclei)  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DATA LAYER                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────────────┐   │
│  │  PostgreSQL (:5432) │  │  Neo4j (:7474/7687)  │  │  Recon JSON Output              │   │
│  │  • Users            │  │  • Attack surface    │  │  recon/output/recon_*.json      │   │
│  │  • Projects         │  │  • 17 node types     │  │  github_secrets_*.json           │   │
│  │  • 180+ settings    │  │  • 20+ relationships │  │                                 │   │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Overview

### 3.1 Web Application (Next.js)

| Aspect | Details |
|--------|---------|
| **Port** | 3000 |
| **Framework** | Next.js (App Router) |
| **ORM** | Prisma (PostgreSQL) |
| **Key Pages** | Projects, Graph, Vulnerabilities, Secrets |
| **Features** | Graph visualization, AI chat drawer, project form, recon controls, node inspector |

**Key directories:**
- `webapp/src/app/` — App Router pages and API routes
- `webapp/src/components/` — Reusable UI components
- `webapp/src/hooks/` — `useAgentWebSocket`, `usePanelLayout`, etc.
- `webapp/src/providers/` — ProjectProvider, etc.

### 3.2 Recon Orchestrator

| Aspect | Details |
|--------|---------|
| **Port** | 8010 |
| **Framework** | FastAPI |
| **Role** | Spawns and manages recon Docker containers |
| **Key endpoints** | `POST /start`, `GET /status/{project_id}`, `GET /logs/{project_id}` (SSE) |

**Flow:**
1. Webapp calls `POST /start` with `project_id`, `user_id`, `target_domain`
2. Orchestrator fetches project settings from webapp API
3. Spawns recon container with env vars (PROJECT_ID, USER_ID, TARGET_DOMAIN, WEBAPP_API_URL)
4. Streams logs via SSE to webapp
5. Recon container writes JSON to shared volume and updates Neo4j via `graph_db`

### 3.3 Recon Pipeline

| Aspect | Details |
|--------|---------|
| **Image** | `pandaexploit-recon:latest` (Kali-based) |
| **Entry** | `recon/main.py` |
| **Phases** | 1. Domain discovery 2. Port scan 3. HTTP probe 4. Resource enum 5. Vuln scan 6. GitHub secrets |

**Tools used:** crt.sh, HackerTarget, Knockpy, Naabu, httpx, Wappalyzer, Katana, GAU, Kiterunner, Nuclei, GitHub Secret Hunter.

**Output:** `recon/output/recon_{project_id}.json` + Neo4j graph update via `graph_db/update_graph_from_json.py`.

### 3.4 AI Agent Orchestrator

| Aspect | Details |
|--------|---------|
| **Port** | 8090 (exposed as 8090, internal 8080) |
| **Framework** | FastAPI + LangGraph |
| **LLM** | Claude (Anthropic) or GPT (OpenAI) |
| **Pattern** | ReAct (Reasoning + Acting) |

**Phases:**
- **Informational** — `query_graph`, `execute_curl`, `execute_naabu`, `web_search`, `get_github_*`
- **Exploitation** — + `metasploit_console`
- **Post-exploitation** — Same as exploitation; session interaction

**WebSocket:** `/ws/agent` — INIT, QUERY, APPROVAL, ANSWER, GUIDANCE, STOP, RESUME.

### 3.5 MCP Tool Servers (Kali Sandbox)

| Server | Port | Tool | Purpose |
|--------|------|------|---------|
| Naabu | 8000 | Naabu | Port scanning |
| Curl | 8001 | Curl | HTTP requests |
| Nuclei | 8002 | Nuclei | Vulnerability scanning |
| Metasploit | 8003, 8013 | Metasploit | Exploitation, progress streaming |

All communicate via **Model Context Protocol (MCP)** over SSE. The agent invokes tools through MCP clients.

### 3.6 Databases

| Database | Port | Purpose |
|----------|------|---------|
| **PostgreSQL** | 5432 | Users, projects, 180+ project settings |
| **Neo4j** | 7474 (HTTP), 7687 (Bolt) | Attack surface graph (17 node types, 20+ relationships) |

---

## 4. Data Flow

### 4.1 Reconnaissance Flow

```
User clicks "Start Recon" in webapp
    → Webapp POST /api/recon/[projectId]/start
    → Webapp proxies to Recon Orchestrator POST /start
    → Orchestrator fetches project settings from Webapp API
    → Orchestrator spawns recon container (Docker)
    → Recon container runs main.py
        → domain_discovery (WHOIS, crt.sh, DNS)
        → port_scan (Naabu)
        → http_probe (httpx, Wappalyzer)
        → resource_enum (Katana, GAU, Kiterunner)
        → vuln_scan (Nuclei)
        → github_secret_hunt (optional)
    → Recon writes recon_{project_id}.json
    → graph_db/update_graph_from_json.py imports into Neo4j
    → Logs streamed via SSE to webapp
```

### 4.2 AI Agent Flow

```
User sends message in AI chat
    → Webapp WebSocket to Agent (ws://agent:8080/ws/agent)
    → Agent INIT (user_id, project_id, session_id)
    → Agent loads project settings from Webapp API
    → LangGraph ReAct loop:
        think → execute_tool (MCP) → observe → think → ...
    → Phase transitions (informational → exploitation → post-exploitation)
        → Guided: await user approval
        → Offensive: auto-approve
    → Tool outputs streamed to webapp (TOOL_OUTPUT_CHUNK)
    → On exploit success: Agent creates Exploit node in Neo4j
```

### 4.3 Graph Query Flow

```
User asks "What vulnerabilities exist on 192.168.1.100?"
    → Agent classifies intent (graph query)
    → Agent generates Cypher (with tenant filter: user_id, project_id)
    → query_graph tool → Neo4j
    → Results returned to agent → natural language response to user
```

---

## 5. Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 14+, React, TypeScript, CSS Modules |
| **Backend (Webapp)** | Next.js API Routes, Prisma |
| **Backend (Recon Orch)** | FastAPI, Docker SDK, SSE-Starlette |
| **Backend (Agent)** | FastAPI, LangGraph, LangChain, MCP clients |
| **Databases** | PostgreSQL 16, Neo4j 5.26 |
| **Recon Tools** | Naabu, httpx, Nuclei, Katana, GAU, Kiterunner, Knockpy |
| **AI** | Anthropic Claude, OpenAI GPT, Tavily (web search) |
| **Container** | Docker, Docker Compose |

---

## 6. Deployment Architecture

### 6.1 Docker Compose Services

| Service | Container Name | Depends On |
|---------|----------------|------------|
| postgres | pandaexploit-postgres | — |
| neo4j | pandaexploit-neo4j | — |
| webapp-init | (ephemeral) | postgres |
| webapp | pandaexploit-webapp | postgres, neo4j, webapp-init |
| recon-orchestrator | pandaexploit-recon-orchestrator | — |
| kali-sandbox | pandaexploit-kali | — |
| agent | pandaexploit-agent | neo4j |

### 6.2 Networks

- **pandaexploit** — Internal bridge for webapp, agent, neo4j, postgres, recon-orchestrator
- **pentest-net** — Isolated network for kali-sandbox (target scanning)

### 6.3 Volumes

- `postgres_data`, `neo4j_data`, `neo4j_logs`, `neo4j_import`, `neo4j_plugins`
- `webapp_prisma_cache`
- Host mount: `./recon/output` → webapp (for recon download) and recon container

### 6.4 Port Mapping

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| Webapp | 3000 | 3000 |
| Neo4j HTTP | 7474 | 7474 |
| Neo4j Bolt | 7687 | 7687 |
| PostgreSQL | 5432 | 5432 |
| Recon Orchestrator | 8010 | 8010 |
| Agent | 8090 | 8080 |
| Naabu | 8000 | 8000 |
| Curl | 8001 | 8001 |
| Nuclei | 8002 | 8002 |
| Metasploit | 8003, 8013 | 8003, 8013 |

---

## 7. API Surface

### 7.1 Webapp API Routes (Next.js)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/graph` | GET | Neo4j graph data (nodes + relationships) for project |
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/[id]` | GET, PATCH, DELETE | Project CRUD |
| `/api/projects/defaults` | GET | Default project settings |
| `/api/projects/check-conflict` | POST | Check project name conflict |
| `/api/users`, `/api/users/[id]` | GET | User data |
| `/api/recon/[projectId]/start` | POST | Start recon (proxies to orchestrator) |
| `/api/recon/[projectId]/status` | GET | Recon status |
| `/api/recon/[projectId]/logs` | GET | SSE recon logs |
| `/api/recon/[projectId]/download` | GET | Download recon JSON |
| `/api/ws` | GET | WebSocket proxy to agent |
| `/api/agent/health` | GET | Agent health |
| `/api/vulnerabilities` | GET | Vulnerability list |
| `/api/evidence` | GET | Evidence chain |
| `/api/github/*`, `/api/github-findings/*`, `/api/github-stats/*` | GET | GitHub integration |
| `/api/mitre` | GET | MITRE data |
| `/api/actions` | GET, POST | Action logs |

### 7.2 Recon Orchestrator API

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health + running recon count |
| `/defaults` | GET | Default recon settings (camelCase) |
| `/start` | POST | Start recon container |
| `/status/{project_id}` | GET | Recon status for project |
| `/logs/{project_id}` | GET | SSE log stream |

### 7.3 Agent API

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health check |
| `/ws/agent` | WebSocket | Real-time agent chat + control |

**WebSocket message types:** INIT, QUERY, APPROVAL, ANSWER, GUIDANCE, STOP, RESUME (client → server); CONNECTED, THINKING, TOOL_START, TOOL_OUTPUT_CHUNK, TOOL_COMPLETE, PHASE_UPDATE, APPROVAL_REQUEST, RESPONSE, ERROR, TASK_COMPLETE (server → client).

---

## 8. Data Stores

### 8.1 PostgreSQL (Prisma Schema)

- **User** — id, name, email
- **Project** — id, userId, name, description, 180+ settings (target, scan modules, Naabu, httpx, Wappalyzer, Nuclei, Katana, GAU, Kiterunner, CVE lookup, MITRE, security checks, agent behavior, GitHub scan options)

### 8.2 Neo4j Graph Schema (Summary)

**Node types:** Domain, Subdomain, IP, Port, Service, BaseURL, Endpoint, Parameter, Technology, Header, Certificate, DNSRecord, Vulnerability, CVE, MitreData, Capec, Evidence, Exploit, GitHubSecret

**Key relationships:**
- Domain → HAS_SUBDOMAIN → Subdomain
- Subdomain → RESOLVES_TO → IP
- IP → HAS_PORT → Port → RUNS_SERVICE → Service
- Service → SERVES_URL → BaseURL
- BaseURL → HAS_ENDPOINT → Endpoint → HAS_PARAMETER → Parameter
- BaseURL → USES_TECHNOLOGY → Technology → HAS_KNOWN_CVE → CVE
- Vulnerability → FOUND_AT → Endpoint, AFFECTS_PARAMETER → Parameter
- Exploit → TARGETED_IP → IP, EXPLOITED_CVE → CVE

**Multi-tenant:** All nodes include `user_id` and `project_id` with composite indexes.

---

## 9. Security & Multi-Tenancy

- **Tenant isolation:** Neo4j and PostgreSQL scope data by `user_id` and `project_id`
- **Agent Cypher injection:** Tenant filters injected server-side; agent never generates tenant filters
- **Approval gates:** Guided mode requires user approval for exploitation/post-exploitation phase transitions
- **Operating modes:** `guided` (default) vs `offensive` (auto-approve) stored per project
- **Docker isolation:** Recon runs in ephemeral containers; MCP tools in dedicated Kali sandbox with `pentest-net`

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Quick start, components, system architecture |
| [OFFENSIVE_MODE.md](./OFFENSIVE_MODE.md) | Agent operating modes (Guided vs Offensive) |
| [graph_db/readmes/GRAPH.SCHEMA.md](../graph_db/readmes/GRAPH.SCHEMA.md) | Full Neo4j schema |
| [recon/README.RECON.md](../recon/README.RECON.md) | Recon pipeline details |
| [agentic/README.AGENTIC.md](../agentic/README.AGENTIC.md) | Agent documentation |

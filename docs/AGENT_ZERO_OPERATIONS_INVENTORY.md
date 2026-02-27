# Agent Zero Operations Inventory

Inventory of operations Agent Zero can perform natively vs. PandaExploit operations that are or are not wired for Agent Zero control.

---

## 1. Agent Zero Native Capabilities (Built-in)

Agent Zero ships with these tools and can perform them **without any PandaExploit integration**:

| Operation | Tool | Description |
|-----------|------|-------------|
| **Code execution** | `code_execution_tool` | Run Python/shell in isolated environment |
| **Terminal/command** | (via code) | Execute system commands |
| **Web search** | `search_engine` | Online search (SearXNG, etc.) |
| **Memory** | `memory_save`, `memory_load`, `memory_forget`, `memory_delete` | Persistent memory across sessions |
| **Knowledge base** | `knowledge_tool` | Document Q&A, RAG |
| **Browser automation** | `browser_agent`, `browser_open`, `browser_do` | Control browser (navigate, click, fill forms) |
| **Document query** | `document_query` | RAG over uploaded documents |
| **Scheduler** | `scheduler` | Schedule recurring tasks |
| **Subordinate agents** | `call_subordinate` | Delegate to sub-agents |
| **A2A chat** | `a2a_chat` | Agent-to-agent communication |
| **Skills** | `skills_tool` | Load SKILL.md capabilities dynamically |
| **User input** | `input` | Ask user for clarification |
| **Response** | `response` | Send structured response |
| **Wait** | `wait` | Pause for specified duration |
| **Vision** | `vision_load` | Image analysis |
| **MCP servers** | (configurable) | Connect to external MCP tools |
| **Git projects** | (built-in) | Clone repos, work in isolated workspaces |

**Connectivity:** Agent Zero can use `code_execution_tool` to call any HTTP API (e.g., `curl` to `PANDAEXPLOIT_WEBAPP_URL` or `PANDAEXPLOIT_RECON_ORCH_URL`). No custom PandaExploit tool is required for basic HTTP calls.

---

## 2. PandaExploit Platform Operations

Operations that exist in PandaExploit and could be controlled by an agent:

### 2.1 Recon Orchestrator (port 8010)

| Operation | Endpoint | Method | Purpose |
|-----------|----------|--------|---------|
| Start recon | `/recon/{projectId}/start` | POST | Start reconnaissance scan for project |
| Stop recon | `/recon/{projectId}/stop` | POST | Stop running recon |
| Get status | `/recon/{projectId}/status` | GET | Recon status (idle/running/completed/error) |
| Stream logs | `/recon/{projectId}/logs` | GET (SSE) | Real-time recon logs |
| List running | `/recon/running` | GET | All running recon processes |
| Health | `/health` | GET | Service health |
| Defaults | `/defaults` | GET | Default recon settings |

### 2.2 Webapp API (port 3000)

| Operation | Endpoint | Method | Purpose |
|-----------|----------|--------|---------|
| List projects | `/api/projects` | GET | List all projects |
| Create project | `/api/projects` | POST | Create project |
| Get project | `/api/projects/[id]` | GET | Project details + 180+ settings |
| Update project | `/api/projects/[id]` | PUT | Update project |
| Delete project | `/api/projects/[id]` | DELETE | Delete project + Neo4j data |
| Project defaults | `/api/projects/defaults` | GET | Default settings |
| Check conflict | `/api/projects/check-conflict` | POST | Domain conflict check |
| Graph data | `/api/graph?projectId=` | GET | Neo4j nodes + relationships |
| Vulnerabilities | `/api/vulnerabilities?projectId=` | GET | Vulnerability list |
| Evidence | `/api/evidence?projectId=&vulnerabilityId=` | GET | Evidence chain |
| GitHub findings | `/api/github-findings?projectId=` | GET | GitHub secrets/findings |
| GitHub stats | `/api/github-stats?projectId=` | GET | GitHub scan stats |
| MITRE data | `/api/mitre?projectId=` | GET | CWE/CAPEC data |
| Actions log | `/api/actions?projectId=` | GET | Action history |
| Recon start | `/api/recon/[projectId]/start` | POST | Start recon (proxies to orchestrator) |
| Recon status | `/api/recon/[projectId]/status` | GET | Recon status |
| Recon download | `/api/recon/[projectId]/download` | GET | Download recon JSON |

### 2.3 Panda AI Agent (port 8090)

| Operation | Endpoint | Purpose |
|-----------|----------|---------|
| WebSocket chat | `ws://agent:8080/ws/agent` | Real-time chat with Panda AI |
| Health | `/health` | Agent health |

**Panda AI tools (MCP):** `query_graph`, `execute_curl`, `execute_naabu`, `execute_nikto`, `execute_sqlmap`, `metasploit_console`, `web_search`, `get_github_*`

### 2.4 MCP Tools (Kali Sandbox)

| Tool | Port | Purpose |
|------|------|---------|
| Naabu | 8000 | Port scanning |
| Curl | 8001 | HTTP requests |
| Nuclei | 8002 | Vulnerability scanning |
| Metasploit | 8003, 8013 | Exploitation |
| Nikto | 8004 | Web server scanner |
| Sqlmap | 8005 | SQL injection scanner |

---

## 3. Wired for Agent Zero (Currently Available)

Agent Zero receives these environment variables:

| Variable | Value | Use |
|----------|-------|-----|
| `PANDAEXPLOIT_WEBAPP_URL` | `http://webapp:3000` | Webapp API base URL |
| `PANDAEXPLOIT_RECON_ORCH_URL` | `http://recon-orchestrator:8010` | Recon orchestrator base URL |

**How Agent Zero can use them today:**

- **Code execution** — Agent Zero can run Python/curl to call these URLs. Example: `requests.post(f"{os.environ['PANDAEXPLOIT_RECON_ORCH_URL']}/recon/{project_id}/start", json={...})`
- **No dedicated tool** — There is no built-in PandaExploit MCP server or Agent Zero extension. Integration is ad-hoc via code execution.

**Effectively wired (via code execution):**

| Operation | Wired? | How |
|-----------|--------|-----|
| Start recon | ✅ | `curl`/`requests` to recon orchestrator |
| Stop recon | ✅ | Same |
| Get recon status | ✅ | Same |
| List projects | ✅ | `curl` to webapp API |
| Get project | ✅ | Same |
| Get graph | ✅ | Same |
| Get vulnerabilities | ✅ | Same |
| Create/update/delete project | ✅ | Same (requires auth handling) |

**Limitation:** Agent Zero does not have project/user context by default. The iframe passes `project_id` and `user_id` as query params, but these are not automatically injected into code execution. Agent Zero would need to be prompted with project_id or retrieve it from the UI context.

---

## 4. Not Wired for Agent Zero

Operations that exist in PandaExploit but are **not** directly accessible to Agent Zero:

### 4.1 No Dedicated Integration

| Gap | Description |
|-----|-------------|
| **PandaExploit MCP server** | No MCP server exposes PandaExploit APIs to Agent Zero. Agent Zero would need to connect to a custom MCP that wraps webapp + recon APIs. |
| **Agent Zero extension** | No Agent Zero extension/SKILL.md for PandaExploit. An extension could register tools like `start_recon`, `get_graph`, `list_vulnerabilities`. |
| **Project context injection** | `project_id` and `user_id` from the iframe are not automatically available in Agent Zero's execution context. |

### 4.2 Authentication

| Gap | Description |
|-----|-------------|
| **Webapp auth** | Webapp API routes may require session/auth. Agent Zero has no built-in way to authenticate as a PandaExploit user. |
| **Service token** | `AGENT_SERVICE_TOKEN` exists for agent→webapp calls but is not passed to Agent Zero. |

### 4.3 Panda AI Agent Control

| Gap | Description |
|-----|-------------|
| **Panda AI WebSocket** | Agent Zero cannot directly drive Panda AI. No Agent Zero → Panda AI orchestration. |
| **MCP tools (Naabu, Curl, Nuclei, Metasploit)** | These are used by Panda AI via MCP. Agent Zero does not connect to the same MCP servers. Agent Zero would need its own MCP client config pointing to kali-sandbox. |
| **Neo4j query_graph** | Panda AI has `query_graph` (text-to-Cypher). Agent Zero has no direct Neo4j access. |

### 4.4 Real-Time Streams

| Gap | Description |
|-----|-------------|
| **Recon logs SSE** | Recon logs are streamed via SSE. Agent Zero could consume them via `curl` or a script, but there is no built-in tool. |
| **Panda AI tool output** | Panda AI streams tool output over WebSocket. Agent Zero has no visibility. |

---

## 5. Summary Matrix

| Category | Agent Zero Native | Wired (via code/HTTP) | Not Wired |
|----------|------------------|------------------------|-----------|
| **Code/terminal** | ✅ | — | — |
| **Memory/knowledge** | ✅ | — | — |
| **Web search** | ✅ | — | — |
| **Browser** | ✅ | — | — |
| **Start/stop recon** | — | ✅ (HTTP to orchestrator) | — |
| **Recon status** | — | ✅ (HTTP) | — |
| **Projects CRUD** | — | ✅ (HTTP, auth TBD) | — |
| **Graph/vulns/evidence** | — | ✅ (HTTP) | — |
| **Panda AI chat** | — | — | ❌ |
| **MCP tools (Naabu, Curl, Nuclei, MSF)** | — | — | ❌ |
| **Neo4j query_graph** | — | — | ❌ |
| **Recon log streaming** | — | — | ❌ (possible via script) |
| **Project context** | — | — | ❌ (manual injection) |

---

## 6. Recommendations to Fully Wire Agent Zero

1. **PandaExploit MCP server** — Build an MCP server that wraps webapp + recon APIs. Agent Zero connects via MCP config. Tools: `start_recon`, `stop_recon`, `get_recon_status`, `list_projects`, `get_graph`, `get_vulnerabilities`, etc.
2. **Agent Zero SKILL.md** — Create a PandaExploit skill that documents available operations and how to call them (env vars, endpoints).
3. **Project context** — Pass `project_id`/`user_id` from iframe into Agent Zero's runtime (e.g., via custom tool or env vars) so it knows which project to act on.
4. **Auth** — Provide Agent Zero with a service token or session for webapp API calls.
5. **MCP for security tools** — Optionally configure Agent Zero to use the same MCP servers (Naabu, Curl, Nuclei, Metasploit) as Panda AI for direct tool access.

---

## 7. Implementation Status (Fully Wired)

The following has been implemented:

| Component | Status | Notes |
|-----------|--------|-------|
| **PandaExploit MCP server** | ✅ | `pandaexploit-mcp` service on port 8011, tools: `set_pandaexploit_context`, `list_projects`, `get_project`, `get_graph`, `get_vulnerabilities`, `get_evidence`, `get_github_findings`, `start_recon`, `stop_recon`, `get_recon_status`, `get_recon_logs` |
| **Agent Zero SKILL.md** | ✅ | `docs/skills/PandaExploit/SKILL.md` — when to use, tool reference, example prompts |
| **Project context** | ✅ | `set_pandaexploit_context(project_id, user_id)` stores context; other tools use it when `project_id` omitted |
| **Auth** | ✅ | `AGENT_SERVICE_TOKEN` passed to `pandaexploit-mcp` and `agent-zero`; used for GitHub routes |
| **MCP config** | ✅ | `conf/agent-zero-mcp-servers.json` — pandaexploit + naabu, curl, nuclei, metasploit, nikto, sqlmap; mounted into agent-zero |

**Verification:**

1. `docker compose up -d pandaexploit-mcp` — service starts, port 8011
2. `curl -s http://localhost:8011/mcp` — MCP endpoint responds (HTTP transport)
3. Agent Zero tab — PandaExploit tools appear in Agent Zero's tool list
4. Chat: "List projects" — Agent Zero uses `list_projects` tool
5. Chat: "Start recon for project {id}" — Agent Zero uses `set_pandaexploit_context` then `start_recon`

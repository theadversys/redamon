# Agent Zero Integration — Setup Guide

Agent Zero is the most capable general-purpose AI agent, integrated into PandaExploit for autonomous operations, code execution, and advanced reasoning. It runs as a separate service and connects via Socket.IO for real-time updates.

## Architecture

- **Agent Zero container** (`agent0ai/agent-zero:latest`) on port 50001
- **Embedding**: iframe loads directly from `http://localhost:50001` (not proxied)
- **Why direct**: Agent Zero uses Socket.IO for real-time state. Proxying breaks Socket.IO → Alpine stores fail → `$store.chats` undefined → blob import errors
- **Build arg**: `NEXT_PUBLIC_AGENT_ZERO_URL` is passed at build time so the iframe uses the correct URL

## Rebuild and Restart (Required After Code Changes)

The webapp must be **rebuilt** for Agent Zero changes to appear. A simple restart is not enough.

```bash
# From the project root (redamon/)
docker compose build webapp
docker compose up -d
```

Or to force a clean rebuild:

```bash
docker compose build --no-cache webapp
docker compose up -d
```

## Where to Find Agent Zero

After rebuilding:

1. Go to **Graph Map** page
2. Select a project
3. Look for **Panda AI** and **Agent Zero** in the toolbar:
   - **Tab mode** (Single layout): Graph | Panda AI | Agent Zero
   - **Split mode**: Panda AI | Agent Zero | Hide
4. Click **Agent Zero** to open it

## If Agent Zero Doesn't Load

1. **Hard refresh** the browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. **Clear cache** or try an incognito/private window
3. **Open in new tab**: If the iframe is blank, use the "Open Agent Zero in new tab" link for full functionality
4. Verify Agent Zero is running: `docker compose ps` — should show `pandaexploit-agent-zero` on port 50001
5. Check logs: `docker compose logs agent-zero`

## Agent Zero Service

Ensure the Agent Zero container is running:

```bash
docker compose ps
# Should show pandaexploit-agent-zero on port 50001
```

If not running:

```bash
docker compose up -d agent-zero
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_AGENT_ZERO_URL` | Build-time: iframe URL (default: `http://localhost:50001`) |
| `A0_PORT` | Host port for Agent Zero (default: 50001) |
| `AGENT_ZERO_URL` | Server-side: proxy target (internal: `http://agent-zero:80`) |
| `A0_SSL_VERIFY` | `false` = disable SSL cert verification (for corporate proxies); `true` = strict |
| `OPENAI_API_KEY` | Passed to Agent Zero for LLM |
| `ANTHROPIC_API_KEY` | Passed to Agent Zero for LLM |
| `AGENT_SERVICE_TOKEN` | Passed to Agent Zero for PandaExploit MCP (GitHub routes) |

## Proxy Fallback (Advanced)

When `NEXT_PUBLIC_AGENT_ZERO_URL` is not set (e.g. custom deployment), the iframe falls back to `/api/a0` proxy. **Limitations**: Socket.IO does not work through the proxy; Agent Zero may show a blank UI.

## MCP Configuration

Agent Zero connects to MCP servers via `conf/agent-zero-mcp-servers.json`, mounted at `/app/mcp_servers.json`:

| Server | URL | Purpose |
|--------|-----|---------|
| pandaexploit | `http://pandaexploit-mcp:8011/mcp` | PandaExploit platform API (projects, graph, recon, vulns, evidence, GitHub) |
| naabu | `http://kali-sandbox:8000/sse` | Port scanning |
| curl | `http://kali-sandbox:8001/sse` | HTTP client |
| nuclei | `http://kali-sandbox:8002/sse` | Vulnerability scanning |
| metasploit | `http://kali-sandbox:8003/sse` | Exploitation framework |
| blackarch | `http://66.228.39.20:8080/sse` | BlackArch security tools (2,800+ tools, Linode) |

**BlackArch MCP** runs on Linode. Tools: `list_blackarch_tools`, `verify_tool_available`, `run_security_tool`, `clear_catalog_cache`. See `docs/skills/BlackArch/SKILL.md`.

**Outside Docker:** If running Agent Zero outside Docker, configure MCP servers in your Agent Zero config to point at your PandaExploit MCP and Kali sandbox URLs (e.g. `http://localhost:8011/mcp` for pandaexploit).

## Skills

The PandaExploit skill teaches Agent Zero when and how to use PandaExploit MCP tools.

### Auto-load (Experimental)

The docker-compose mounts `./docs/skills/PandaExploit` at `/a0/usr/skills/PandaExploit`. If Agent Zero auto-loads skills from that path, the PandaExploit skill will be available on startup. **This path may vary by Agent Zero version** — if the skill does not appear, use manual import below.

### Manual Import (Reliable)

If auto-load does not work, add the skill using one of these methods:

**Method 1: Import via ZIP (Recommended)**

1. Zip the skill folder: `cd docs/skills && zip -r PandaExploit-skill.zip PandaExploit`
2. In Agent Zero: **Settings → Skills**
3. Click **Import** (or the zip icon) and select `PandaExploit-skill.zip`
4. Refresh the UI — the skill appears under Settings > Skills

**Method 2: Create Skill via Agent**

If you have PandaExploit API docs, prompt Agent Zero:

> *"Look at this documentation for PandaExploit. Package it into a skill using `create_skill`. Call this new skill pandaexploit."*

Then paste the tool reference from `docs/skills/PandaExploit/SKILL.md`.

**Method 3: Manual Copy (when running A0 with custom data volume)**

1. Locate Agent Zero's skills folder (e.g. `/a0/usr/skills` when using volume `-v /path/to/data:/a0/usr`)
2. Copy the `docs/skills/PandaExploit` folder into the skills directory
3. Restart or refresh Agent Zero

**Skill locations in repo:**
- `docs/skills/PandaExploit/SKILL.md`
- `docs/skills/BlackArch/SKILL.md` — BlackArch tool oracle (list, verify, run, clear cache)

## Project Context

When the user says "work on project X", call `set_pandaexploit_context(project_id, user_id)` first. Other PandaExploit tools will use this context when `project_id` is omitted. `user_id` is required for `start_recon`.

## Full Cyber Kill Chain

PandaExploit supports two ways to run the full 7-stage Cyber Kill Chain:

### 1. Automated Kill Chain (Launch Test)

The **Launch Test** button in the Graph Map runs the full chain automatically:

1. **Stage 1 (Reconnaissance)** — Recon orchestrator runs domain discovery, port scan, HTTP probe, resource enum, vuln scan, MITRE enrichment, GitHub secret hunt
2. **Stage 2 (Weaponization)** — Fetches attack paths from graph, selects top path, generates payload via weaponizer
3. **Stage 3 (Delivery)** — Headless agent starts Metasploit listener and web delivery
4. **Stage 4 (Exploitation)** — Agent runs exploit against top attack path
5. **Stage 5 (Installation)** — Agent runs persistence if session obtained
6. **Stage 6 (C2)** — Agent lists listeners/sessions
7. **Stage 7 (Actions on Objectives)** — Agent records action via graph API

**Flow:** Webapp → Kill Chain Orchestrator (port 8015) → Recon Orchestrator (Stage 1) + Agent (Stages 3–7). SSE streams logs to the UI. Pause/Resume available between stages.

### 2. Agent Zero–Driven Kill Chain

Agent Zero uses MCP tools to run each stage manually. See [AGENT_ZERO_CYBER_KILL_CHAIN_TEST_PROMPT.md](AGENT_ZERO_CYBER_KILL_CHAIN_TEST_PROMPT.md) for the full prompt.

| Stage | Agent Zero Tools |
|-------|------------------|
| 1 | `start_recon`, `execute_naabu`, `execute_nuclei`, BlackArch `run_security_tool`, `ingest_*` |
| 2 | `generate_payload`, `generate_hta_payload` |
| 3–4 | Metasploit MCP, `execute_sqlmap`, BlackArch tools |
| 5 | `record_persistence` |
| 6 | Metasploit MCP (listeners) |
| 7 | `record_action` |

### Kill Chain Environment Variables

| Variable | Purpose |
|----------|---------|
| `KILL_CHAIN_ORCHESTRATOR_URL` | Kill chain service URL. Local: `http://localhost:8015`. Docker: `http://kill-chain-orchestrator:8015` |
| `KILL_CHAIN_LHOST` | LHOST for payload generation (Stage 2). Override project `agentLhost` if set. Example: `10.0.0.1` |
| `AGENT_API_URL` | Agent service for Stages 3–7. Docker: `http://agent:8080` |
| `RECON_ORCHESTRATOR_URL` | Recon orchestrator for Stage 1. Docker: `http://recon-orchestrator:8010` |
| `WEBAPP_API_URL` | Webapp API for attack paths, payloads, persistence, actions. Docker: `http://webapp:3000` |
| `RECON_WEBAPP_API_URL` | URL passed to recon container (uses `network_mode: host`). Docker: `http://localhost:3000` |

### How to Run and Test

**Docker (full stack):**

```bash
docker compose up -d
```

Ensure `kill-chain-orchestrator`, `agent`, `recon-orchestrator`, `agent-zero`, `kali-sandbox` are running. Set `KILL_CHAIN_LHOST` in `.env` if payload generation is needed (e.g. `KILL_CHAIN_LHOST=10.0.0.1` or your host IP).

**Local dev:**

1. Start recon-orchestrator (8010), kill-chain-orchestrator (8015), agent (8080), webapp (3000)
2. Set `KILL_CHAIN_ORCHESTRATOR_URL=http://localhost:8015` for webapp
3. Set `KILL_CHAIN_LHOST` to your IP for reverse shells

**Test:**

1. Go to Graph Map, select a project
2. Click **Launch Test** to start the full kill chain
3. Watch logs in the Panda AI / Agent Zero panel (Stage 1: Reconnaissance → Stage 7: Actions on Objectives)
4. Use **Pause** / **Resume** between stages
5. Use **Actions** menu: View Attack Paths, Generate Payload, Record Persistence, Record Action

**Agent Zero test:**

Use the prompt from [AGENT_ZERO_CYBER_KILL_CHAIN_TEST_PROMPT.md](AGENT_ZERO_CYBER_KILL_CHAIN_TEST_PROMPT.md) to run a manual kill chain via MCP tools.

---

## Capabilities

Agent Zero can:
- Execute code and terminal commands
- Use the computer as a tool
- Manage memory and knowledge
- Run multi-agent workflows
- Use PandaExploit MCP tools: list projects, get graph, vulnerabilities, evidence, GitHub findings, start/stop recon, get recon status/logs
- Use security MCP tools: Naabu, Curl, Nuclei, Metasploit (when kali-sandbox is running)

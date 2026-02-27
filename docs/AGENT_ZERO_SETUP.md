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

**Outside Docker:** If running Agent Zero outside Docker, configure MCP servers in your Agent Zero config to point at your PandaExploit MCP and Kali sandbox URLs (e.g. `http://localhost:8011/mcp` for pandaexploit).

## Skills

The PandaExploit skill teaches Agent Zero when and how to use PandaExploit MCP tools. Add it using one of these methods:

### Method 1: Import via ZIP (Recommended)

1. Zip the skill folder: `cd docs/skills && zip -r PandaExploit-skill.zip PandaExploit`
2. In Agent Zero: **Settings → Skills**
3. Click **Import** (or the zip icon) and select `PandaExploit-skill.zip`
4. Refresh the UI — the skill appears under Settings > Skills

### Method 2: Create Skill via Agent

If you have PandaExploit API docs, prompt Agent Zero:

> *"Look at this documentation for PandaExploit. Package it into a skill using `create_skill`. Call this new skill pandaexploit."*

Then paste the tool reference from `docs/skills/PandaExploit/SKILL.md`.

### Method 3: Manual Copy

1. Locate Agent Zero's skills folder (e.g. `/a0/usr/skills` when using volume `-v /path/to/data:/a0/usr`)
2. Copy the `docs/skills/PandaExploit` folder into the skills directory
3. Restart or refresh Agent Zero

**Skill location in repo:** `docs/skills/PandaExploit/SKILL.md`

## Project Context

When the user says "work on project X", call `set_pandaexploit_context(project_id, user_id)` first. Other PandaExploit tools will use this context when `project_id` is omitted. `user_id` is required for `start_recon`.

## Capabilities

Agent Zero can:
- Execute code and terminal commands
- Use the computer as a tool
- Manage memory and knowledge
- Run multi-agent workflows
- Use PandaExploit MCP tools: list projects, get graph, vulnerabilities, evidence, GitHub findings, start/stop recon, get recon status/logs
- Use security MCP tools: Naabu, Curl, Nuclei, Metasploit (when kali-sandbox is running)

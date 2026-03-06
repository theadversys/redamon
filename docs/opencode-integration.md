# OpenCode Integration

Connect the **OpenCode** IDE ([opencode.ai](https://opencode.ai)) to PandaExploit so you can run
reconnaissance, kill-chain attacks, and review findings directly from your terminal — while watching
results update live in the web UI.

---

## How It Works

```
OpenCode TUI (your terminal)
       │
       │  MCP over HTTP  (Authorization: Bearer <token>)
       ▼
pandaexploit-mcp  (port 8011)  ← validates inbound token
       │
       │  REST API  (Authorization: Bearer <token> + X-User-Id)
       ▼
PandaExploit Webapp  (port 3000)  ← middleware validates token
       │
       ├── PostgreSQL  (projects, findings, logs)
       └── Neo4j       (attack graph)
                │
                ▼
       Web UI (browser) ← SSE/polling shows results in real time
```

---

## Prerequisites

1. PandaExploit stack running: `docker compose up -d`
2. `AGENT_SERVICE_TOKEN` set in your `.env` (generate one: `openssl rand -hex 32`)
3. OpenCode installed: `brew install anomalyco/tap/opencode`

---

## Setup

### 1. Set the token in `.env`

```bash
AGENT_SERVICE_TOKEN=your-secret-token-here   # openssl rand -hex 32
```

Restart the stack after changing `.env`:
```bash
docker compose up -d pandaexploit-mcp webapp
```

### 2. Find your User ID

```bash
# List users via the webapp API
curl -s http://localhost:3000/api/users \
  -H "Authorization: Bearer your-secret-token-here" | jq '.[].id'
```

If no users exist yet, create one:
```bash
curl -s -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer your-secret-token-here" \
  -H "Content-Type: application/json" \
  -d '{"name": "Your Name", "email": "you@example.com"}' | jq '.id'
```

### 3. Configure OpenCode

Add PandaExploit to your OpenCode config at `~/.config/opencode/config.json`
(or create the file if it doesn't exist):

```json
{
  "mcp": {
    "pandaexploit": {
      "type": "remote",
      "url": "http://localhost:8011/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token-here"
      }
    }
  }
}
```

---

## Usage in OpenCode

Start OpenCode in any project directory:

```bash
opencode
```

OpenCode will automatically discover and connect to the `pandaexploit` MCP server.
You can now use natural language or direct tool calls:

### Set context (do this first each session)

```
set_pandaexploit_context(project_id="<your-project-id>", user_id="<your-user-id>")
```

### List / create projects

```
list_projects()
create_project(user_id="<uid>", name="Target Corp", target_domain="target.com")
```

### Start reconnaissance

```
start_recon(project_id="<pid>")
get_recon_status(project_id="<pid>")
get_recon_logs(project_id="<pid>", lines=50)
```

### Launch kill chain (full attack automation)

```
start_kill_chain(project_id="<pid>")
get_kill_chain_status(project_id="<pid>")
get_kill_chain_logs(project_id="<pid>", limit=100)
pause_kill_chain(project_id="<pid>")
resume_kill_chain(project_id="<pid>")
```

### Review findings

```
get_vulnerabilities(project_id="<pid>")
get_evidence(project_id="<pid>", vuln_id="<vid>")
update_finding_status(vuln_id="<vid>", status="verified")
```

### Attack surface

```
get_all_hosts(project_id="<pid>")
get_all_ports(project_id="<pid>")
get_mitre_coverage(project_id="<pid>")
get_engagement_brief(project_id="<pid>")
```

### Generate report

```
generate_report(project_id="<pid>")
```

---

## Available MCP Tools

| Tool | Description |
|---|---|
| `set_pandaexploit_context` | Set default project_id + user_id for the session |
| `list_users` | List all users |
| `create_user` | Create a new user |
| `list_projects` | List all projects |
| `create_project` | Create a new project |
| `get_project` | Get project details and settings |
| `update_project_settings` | Update target domain, scan mode, modules |
| `start_recon` | Start reconnaissance scan |
| `stop_recon` | Stop running recon |
| `get_recon_status` | Get recon status |
| `get_recon_logs` | Fetch recent recon log lines |
| `start_kill_chain` | Launch full cyber kill chain (stages 1-7) |
| `stop_kill_chain` | Stop kill chain |
| `get_kill_chain_status` | Get kill chain status |
| `get_kill_chain_logs` | Get kill chain execution logs |
| `pause_kill_chain` | Pause kill chain at current stage |
| `resume_kill_chain` | Resume paused kill chain |
| `get_vulnerabilities` | List vulnerabilities/findings |
| `get_evidence` | Get evidence chain for a vulnerability |
| `update_finding_status` | Update finding status (open/fixed/verified/etc.) |
| `get_all_hosts` | Get all discovered hosts from attack graph |
| `get_all_ports` | Get all open ports from attack graph |
| `get_secrets` | Get all discovered secrets/credentials |
| `get_mitre_coverage` | Get MITRE ATT&CK coverage matrix |
| `get_engagement_brief` | Full situational awareness snapshot |
| `get_github_findings` | GitHub secret scan findings |
| `generate_report` | Generate pentest report (Markdown) |
| `get_graph` | Raw Neo4j graph data |
| `query_neo4j` | Execute custom Cypher query |

---

## Troubleshooting

**OpenCode can't connect to MCP server:**
```bash
# Verify the MCP server is running
curl -s http://localhost:8011/health
docker compose logs pandaexploit-mcp
```

**401 Unauthorized errors:**
- Check `AGENT_SERVICE_TOKEN` matches in `.env` and `~/.config/opencode/config.json`
- Restart: `docker compose restart pandaexploit-mcp webapp`

**Tools not appearing in OpenCode:**
- Reload MCP: restart OpenCode or press `r` to refresh
- Check OpenCode logs: `opencode --log-level debug`

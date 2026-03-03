# BlackArch MCP — Complete Documentation

Production-grade Model Context Protocol (MCP) server exposing **2,800+ BlackArch security tools** to LLMs. Deployed on Linode Cloud in an isolated VPC, with full isolation via disposable Docker containers.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Local Setup](#local-setup)
4. [Linode Deployment](#linode-deployment)
5. [MCP Tools & Resources](#mcp-tools--resources)
6. [Curated Offensive Tools](#curated-offensive-tools)
7. [PandaExploit / Agent Zero Integration](#pandaexploit--agent-zero-integration)
8. [Commercial Features](#commercial-features)
9. [Testing](#testing)
10. [File Structure](#file-structure)
11. [Security](#security)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The BlackArch MCP is a "Cybersecurity Oracle" that allows AI agents (e.g., Agent Zero) to:

- **List** and **search** the BlackArch tool catalog (2,800+ tools)
- **Verify** tool availability before execution
- **Run** any BlackArch tool in isolated Docker containers with sanitized arguments
- **Audit** all invocations for compliance

**Key design decisions:**

- **Disposable containers:** Every tool run spawns a fresh `blackarchlinux/blackarch` container; no host persistence
- **On-demand install:** Tools are installed via `pacman -S <tool>` inside the container before execution
- **Network isolation:** Tools that need network (nmap, nuclei, etc.) get `--network=bridge`; others run with `--network=none`
- **Output distillation:** Long output is truncated to ~4K chars to avoid token overflow

**Reference:** [BlackArch Tools](https://blackarch.org/tools.html)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LLM / Agent Zero (MCP Client)                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ SSE (http://<host>:8080/sse)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  BlackArch MCP Gateway (FastMCP + FastAPI)                       │
│  - list_blackarch_tools, verify_tool_available, run_security_tool│
│  - blackarch_catalog resource                                    │
│  - Bearer auth (optional), Audit logging (SQLite)               │
└────────────────────────────┬────────────────────────────────────┘
                             │ docker run --rm blackarchlinux/blackarch
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Disposable BlackArch Container                                   │
│  pacman -S <tool>; exec <tool> <args>                            │
│  - 60s timeout, 512MB RAM, 0.5 CPU                                │
│  - read-only root, network=bridge or none                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Local Setup

### Prerequisites

- Python 3.10+
- Docker (for tool execution)
- pip

### Quick Start

```bash
cd blackarch-mcp
pip install -r requirements.txt
python main.py
```

MCP SSE endpoint: **http://0.0.0.0:8080/sse**

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_HOST` | `0.0.0.0` | Bind address |
| `MCP_PORT` | `8080` | Port for SSE |
| `BLACKARCH_AUDIT_DB` | `/var/lib/blackarch-mcp/audit.db` | Path to SQLite audit DB |
| `SUBSCRIBER_KEYS` | *(empty)* | Comma-separated Bearer tokens for auth (empty = no auth) |

### Docker Compose (Local)

```bash
cd blackarch-mcp
docker compose up -d
```

Gateway runs in a container; requires `Docker.sock` mount for spawning tool containers.

---

## Linode Deployment

### Provisioned Infrastructure

| Resource | Value |
|----------|-------|
| **Linode** | `blackarch-mcp-production` (g6-standard-2, 4GB RAM) |
| **Public IP** | `66.228.39.20` |
| **VPC** | `blackarch-vpc` (10.0.99.0/24) — isolated from existing VPCs |
| **Firewall** | `blackarch-firewall` (SSH 22, HTTPS 443, MCP 8080) |
| **OS** | Debian 12 |

### Cloudflare Tunnel (when direct IP times out)

If connections to `http://66.228.39.20:8080/sse` time out (network path issue), use a Cloudflare quick tunnel:

```bash
ssh root@66.228.39.20
cloudflared tunnel --url http://127.0.0.1:8080
# Use the output URL: https://xxx.trycloudflare.com/sse
```

Update `conf/agent-zero-mcp-servers.json` and `conf/agent-zero-mcp-servers-a0-conf.json` with the tunnel URL. **Note:** Quick tunnel URLs change on each restart. For production, use a named Cloudflare tunnel.

### Provisioning (New Deployment)

```bash
cd blackarch-mcp/scripts
pip install httpx
LINODE_API_KEY=your_key python provision.py --ssh-key "ssh-rsa AAAA..."
```

Creates all resources in a **new VPC**; does not modify existing VMs/VPCs.

### Manual Bootstrap (Linode)

1. SSH into the Linode:

   ```bash
   ssh root@66.228.39.20
   # password from blackarch-mcp/.root_pass (or use SSH key)
   ```

2. Install Docker and Python:

   ```bash
   apt-get update && apt-get install -y docker.io python3-full python3-pip python3-venv curl git
   systemctl enable docker && systemctl start docker
   ```

3. Deploy MCP gateway (from local machine):

   ```bash
   cd /path/to/redamon/blackarch-mcp
   scp main.py requirements.txt root@66.228.39.20:/opt/blackarch-mcp/
   ssh root@66.228.39.20 "cd /opt/blackarch-mcp && pip3 install -r requirements.txt && nohup python3 main.py > /var/log/blackarch-mcp.log 2>&1 &"
   ```

4. Verify:

   ```bash
   curl -s http://66.228.39.20:8080/sse
   ```

### Systemd (Production)

Copy `blackarch-mcp.service` to `/etc/systemd/system/` and enable:

```bash
scp blackarch-mcp/blackarch-mcp.service root@66.228.39.20:/etc/systemd/system/
ssh root@66.228.39.20 "systemctl daemon-reload && systemctl enable blackarch-mcp && systemctl start blackarch-mcp"
```

---

## MCP Tools & Resources

### Tools

| Tool | Purpose |
|------|---------|
| `list_blackarch_tools(query?)` | Search catalog. Empty query = first 100 tools; query filters by name/description/category |
| `verify_tool_available(tool_name)` | Check if tool exists in BlackArch (pacman -Si) |
| `run_security_tool(tool_name, arguments?, user_id?)` | Execute tool in isolated container. Arguments sanitized (no `; & | > $ \n \r`) |
| `clear_catalog_cache()` | Clear cached catalog. Use when catalog is stale |

### Resource

| Resource | Description |
|----------|-------------|
| `blackarch://catalog` | Searchable index of BlackArch tools (2,800+). Cached 24h. |

### Usage Examples

| User asks | Call |
|-----------|------|
| "List BlackArch tools" | `list_blackarch_tools()` |
| "Search for sql injection tools" | `list_blackarch_tools("sql")` |
| "Is nmap available?" | `verify_tool_available("nmap")` |
| "Run nmap -sP 192.168.1.0/24" | `run_security_tool("nmap", "-sP 192.168.1.0/24")` |
| "Run nuclei against https://example.com" | `run_security_tool("nuclei", "-u https://example.com")` |

---

## Curated Offensive Tools

See **[BlackArch Offensive Tools Table](blackarch-offensive-tools-table.md)** for a full reference of ~25 tools mapped to Cyber Kill Chain phases (Recon, Scan, Exploit), use cases, and example invocations.

### Network Tools (Auto-Bridge)

These tools automatically receive `--network=bridge` in the container:

- **Recon:** nmap, naabu, nuclei, subfinder, amass, theharvester, httpx, whatweb, assetfinder, dnsx, gau, waybackurls, recon-ng, fierce, masscan
- **Scan:** nikto, sqlmap, ffuf, gobuster, dirsearch, wpscan, feroxbuster, arjun
- **Exploit:** hydra, commix
- **Utility:** curl

### Package = Binary Constraint

The MCP uses the same name for `pacman -S <tool>` and `exec <tool>`. Tools like Metasploit (package: `metasploit`, binary: `msfconsole`) are not directly supported. Use tools where `package_name == binary_name`.

---

## PandaExploit / Agent Zero Integration

### Agent Zero MCP Config

Add the BlackArch MCP to `conf/agent-zero-mcp-servers.json` and `conf/agent-zero-mcp-servers-a0-conf.json`:

```json
{
  "blackarch": {
    "url": "http://66.228.39.20:8080/sse",
    "transport": "sse"
  }
}
```

### BlackArch Skill

Import the skill for Agent Zero:

```bash
cd docs/skills && zip -r BlackArch-skill.zip BlackArch
# Agent Zero → Settings → Skills → Import → select BlackArch-skill.zip
```

Skill path: `docs/skills/BlackArch/SKILL.md`

### Verify Setup

1. Call `list_blackarch_tools("nmap")`. If it returns tools, BlackArch MCP is connected.
2. If BlackArch tools are missing: Check MCP config includes `blackarch` and skill is imported.

---

## Commercial Features

### Bearer Token Auth

Set `SUBSCRIBER_KEYS=key1,key2` to enable. Clients send:

```
Authorization: Bearer <key>
```

### Audit Logging

Every tool invocation is logged to SQLite:

- `user_id` (optional)
- `tool_name`
- `arguments` (truncated to 500 chars)
- `output_hash` (SHA256)
- `timestamp`

DB path: `BLACKARCH_AUDIT_DB` (default `/var/lib/blackarch-mcp/audit.db`)

### Connection Config for Clients

```json
{
  "mcpServers": {
    "blackarch": {
      "url": "http://66.228.39.20:8080/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer <SUBSCRIBER_KEY>"
      }
    }
  }
}
```

---

## Testing

### Test Script (Phase 5)

Run before Agent Zero integration:

```bash
cd blackarch-mcp
pip install -r requirements-test.txt
python scripts/test_tools.py --url http://66.228.39.20:8080/sse
```

Or via env:

```bash
BLACKARCH_MCP_URL=http://66.228.39.20:8080/sse python scripts/test_tools.py
```

### Test Suite Coverage

1. **Handshake:** `tools/list` returns `run_security_tool`, `list_blackarch_tools`, etc.
2. **Catalog:** `resources/read blackarch://catalog` returns tool index
3. **Jailbreak:** `run_security_tool("cat", "/etc/shadow")` — runs in container, not host
4. **Recon:** `run_security_tool("nmap", "-sP 127.0.0.1")` — returns nmap output
5. **whoami:** `run_security_tool("whoami", "")` — returns `root`
6. **list_blackarch_tools:** Search for "nmap"
7. **verify_tool_available:** "whoami"
8. **curl:** `run_security_tool("curl", "--version")` — network tool

---

## File Structure

```
blackarch-mcp/
├── main.py                 # FastMCP server: tools, resources, audit
├── requirements.txt        # Python dependencies
├── requirements-test.txt   # Test deps (mcp, httpx-sse)
├── Dockerfile              # Container for gateway
├── docker-compose.yml      # Local deployment
├── stackscript.sh         # First-boot bootstrap for Linode
├── blackarch-mcp.service   # Systemd unit
├── connection_config.json  # Client config template
├── scripts/
│   ├── provision.py       # Linode provisioning (VPC, firewall, Linode)
│   ├── deploy.sh          # Deploy helper
│   ├── run_provision.sh   # Run provision
│   └── test_tools.py      # Tool invocation test suite
└── tests/
    └── test_mcp.py        # MCP tests

docs/
├── blackarch_mcp_ReadMe.md           # This document
├── blackArch_mcp_linode_cloud.md     # Linode plan
└── blackarch-offensive-tools-table.md # Curated tools

docs/skills/BlackArch/
└── SKILL.md               # Agent Zero skill
```

---

## Security

- **Argument sanitization:** Regex strips `; & | > $ \n \r` to prevent command injection
- **Ephemeral root:** Containers are writable during run (required for `pacman -S` on-demand install); no host persistence
- **Resource limits:** 512MB RAM, 0.5 CPU, 60s timeout
- **Network isolation:** Tools without network whitelist get `--network=none`
- **Output truncation:** Long output is truncated to ~4K chars
- **API key:** Never commit `LINODE_API_KEY`; use environment variable or secrets manager

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `exec: sqlmap: not found` / Tool not found | Read-only FS prevented pacman install | Ensure MCP uses main.py without `--read-only`; redeploy if on Linode |
| `exec: nmap: not found` | Tool not in BlackArch default | Run `verify_tool_available("nmap")`; use alternate tool |
| `[ERROR] Tool timed out` | Scan > 60s | Use smaller scope or faster options |
| `[ERROR] Docker not found` | MCP host has no Docker | BlackArch MCP runs on Linode; check connectivity |
| Connection refused | BlackArch MCP down | MCP at http://66.228.39.20:8080/sse; verify service is up |
| Empty reply / ReadTimeout / session.initialize() timeout | Server accepts TCP but doesn't respond | Run diagnostics on Linode (see below); restart service |
| Catalog is stale | Cache 24h TTL | Call `clear_catalog_cache()` |

---

## Linode Diagnostics (Empty Reply / Timeout)

If Agent Zero reports "Empty reply from server" or "ReadTimeout during SSE handshake":

1. **Run diagnostics on the Linode:**
   ```bash
   scp blackarch-mcp/scripts/diagnose_linode.sh root@66.228.39.20:/tmp/
   ssh root@66.228.39.20 "bash /tmp/diagnose_linode.sh"
   ```

2. **Restart the service:**
   ```bash
   ssh root@66.228.39.20 "systemctl restart blackarch-mcp && sleep 3 && systemctl status blackarch-mcp"
   ```

3. **Test from your machine:**
   ```bash
   curl -v -m 10 http://66.228.39.20:8080/sse
   ```
   You should see `HTTP/1.1 200 OK` and `event: endpoint` within a few seconds. If you get 0 bytes or timeout, the server is hung.

4. **If localhost works but external doesn't:** Check Linode Cloud Firewall — ensure port 8080 is allowed inbound. The provision script creates this, but it may have been skipped.

---

## Related Documents

- [BlackArch Offensive Tools Table](blackarch-offensive-tools-table.md)
- [BlackArch MCP Linode Cloud Plan](blackArch_mcp_linode_cloud.md)
- [Cyber Kill Chain UI Extension Plan](CYBER_KILL_CHAIN_UI_EXTENSION_PLAN.md)
- [BlackArch Skill](skills/BlackArch/SKILL.md)

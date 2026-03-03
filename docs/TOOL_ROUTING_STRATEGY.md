# Tool Routing Strategy: Kali MCP vs BlackArch MCP

PandaExploit (via Agent Zero) uses both **Kali MCP** and **BlackArch MCP** for security tool execution. This document defines when to use which MCP based on tool availability, scan duration, and use case.

**Reference:** [conf/agent-zero-mcp-servers.json](../conf/agent-zero-mcp-servers.json)

---

## Current State

| MCP Type | Servers | Invocation | Timeout |
|----------|---------|------------|---------|
| Kali MCPs | 10 dedicated (naabu, curl, nuclei, metasploit, nikto, sqlmap, nmap, ffuf, gobuster, hydra) | `execute_<tool>(args)` | ~60s typical |
| BlackArch MCP | 1 (Linode) | `run_security_tool(tool_name, arguments)` | 30 min |
| PandaExploit MCP | 1 | project, graph, ingest, weaponization, record actions | — |

**Overlap** (tools in BOTH Kali and BlackArch): nmap, naabu, nuclei, nikto, sqlmap, ffuf, gobuster, hydra, curl

**Kali-only:** `metasploit_console` (interactive MSF — must use Kali)

**BlackArch-only:** subfinder, amass, theharvester, httpx, masscan, wpscan, feroxbuster, dirsearch, arjun, commix, androguard, apktool, autopsy, whatweb, assetfinder, dnsx, gau, waybackurls, recon-ng, fierce

Both MCPs feed the same ingest pipeline. Output format is tool-defined (nmap `-oX -`, nuclei `-jsonl`, etc.), not MCP-defined.

---

## Decision Rules

| Condition | Use Kali MCP | Use BlackArch MCP |
|-----------|--------------|-------------------|
| Tool is `metasploit_console` | Always | Never |
| Tool in Kali AND quick scan (< 5 min) | Prefer | Fallback if Kali fails |
| Tool in Kali AND long scan (sqlmap, full nuclei, large nmap) | Fallback | Prefer (30-min timeout) |
| Kali MCP unreachable | — | Use BlackArch for overlapped tools |
| Tool NOT in Kali (subfinder, amass, wpscan, feroxbuster, etc.) | — | Use BlackArch |
| Weaponization, record_persistence, record_action | — | PandaExploit MCP only |

---

## Tool-by-Tool Routing Table

| Tool | Kali | BlackArch | Prefer | Notes |
|------|------|-----------|--------|-------|
| nmap | `execute_nmap` | `run_security_tool("nmap", ...)` | Kali for quick; BlackArch for large scans | Both produce `-oX -` for ingest |
| naabu | `execute_naabu` | `run_security_tool("naabu", ...)` | Kali | BlackArch fallback |
| nuclei | `execute_nuclei` | `run_security_tool("nuclei", ...)` | Kali for single URL; BlackArch for bulk | Both produce `-jsonl` |
| nikto | `execute_nikto` | `run_security_tool("nikto", ...)` | Kali | BlackArch fallback |
| sqlmap | `execute_sqlmap` | `run_security_tool("sqlmap", ...)` | BlackArch for long scans | 30-min timeout helps |
| ffuf | `execute_ffuf` | `run_security_tool("ffuf", ...)` | Kali | BlackArch fallback |
| gobuster | `execute_gobuster` | `run_security_tool("gobuster", ...)` | Kali | BlackArch fallback |
| hydra | `execute_hydra` | `run_security_tool("hydra", ...)` | Kali for quick; BlackArch for large wordlists | |
| metasploit_console | Kali only | — | Kali only | No BlackArch equivalent for interactive MSF |
| subfinder | — | `run_security_tool("subfinder", ...)` | BlackArch only | No Kali MCP |
| amass | — | `run_security_tool("amass", ...)` | BlackArch only | No Kali MCP |
| wpscan | — | `run_security_tool("wpscan", ...)` | BlackArch only | No Kali MCP |
| feroxbuster | — | `run_security_tool("feroxbuster", ...)` | BlackArch only | No Kali MCP |
| dirsearch | — | `run_security_tool("dirsearch", ...)` | BlackArch only | No Kali MCP |
| arjun | — | `run_security_tool("arjun", ...)` | BlackArch only | No Kali MCP |
| commix | — | `run_security_tool("commix", ...)` | BlackArch only | No Kali MCP |
| theharvester | — | `run_security_tool("theharvester", ...)` | BlackArch only | No Kali MCP |
| httpx | — | `run_security_tool("httpx", ...)` | BlackArch only | No Kali MCP |
| masscan | — | `run_security_tool("masscan", ...)` | BlackArch only | No Kali MCP |
| androguard, apktool, autopsy | — | `run_security_tool(...)` | BlackArch only | Mobile/forensics |

---

## Fallback Flow

When an overlapped tool (nmap, naabu, nuclei, nikto, sqlmap, ffuf, gobuster, hydra) is needed:

1. **Try Kali first** if scan is expected to complete in < 5 minutes.
2. **If Kali fails** (timeout, connection refused, empty reply): retry with `run_security_tool(tool_name, args)` via BlackArch.
3. **Use BlackArch first** for sqlmap, full nuclei scans, or large nmap subnet scans — 30-min timeout reduces failures.

---

## Ingest Mapping

Both MCPs produce the same output formats. Ingest via PandaExploit MCP:

| Tool | Output format | Ingest function |
|------|---------------|-----------------|
| nmap | `-oX -` (XML) | `ingest_nmap_output(raw_output)` |
| naabu | `-json` | `ingest_naabu_output(raw_output)` |
| nuclei | `-jsonl` | `ingest_nuclei_output(raw_output)` |
| nikto | `-Format json` | `ingest_nikto_output(raw_output)` |
| sqlmap | stdout | `ingest_sqlmap_output(raw_output, target_url)` |
| hydra | stdout | `ingest_hydra_output(raw_output)` |
| Other tools | — | `ingest_custom_findings(findings_json, target_domain)` |

---

## Tool Routing by Kill Chain Stage

| Stage | Kali MCP | BlackArch MCP | PandaExploit MCP |
|-------|----------|---------------|------------------|
| 1. Reconnaissance | execute_naabu, execute_nmap, execute_nuclei | run_security_tool(nmap, nuclei, subfinder, amass, theharvester, httpx, masscan, naabu, dnsx, gau, ...) | start_recon, ingest_* |
| 2. Weaponization | — | — | generate_payload, generate_hta_payload |
| 3. Delivery | metasploit_console | — | — |
| 4. Exploitation | execute_sqlmap, execute_hydra, metasploit_console | run_security_tool(sqlmap, hydra, commix) | get_attack_paths |
| 5. Installation | metasploit_console (run_post_module) | — | record_persistence |
| 6. C2 | metasploit_console (start_listener) | — | — |
| 7. Actions | — | — | record_action |

# Agent Zero: Full Cyber Kill Chain Test Prompt

Use this prompt with Agent Zero to run a complete penetration test against a target using the dual MCP strategy (Kali MCP for dedicated tools, BlackArch MCP for everything else).

---

## Copy-Paste Prompt

```
Create a new PandaExploit project for target https://ginandjuice.shop/ and run a full Cyber Kill Chain penetration test against it.

**Tool routing (strict):**
- Use **Kali MCP** only for: naabu, curl, nuclei, metasploit, nikto, sqlmap, nmap, ffuf, gobuster, hydra (execute_* tools).
- Use **BlackArch MCP** for all other tools: subfinder, amass, theharvester, httpx, masscan, wpscan, feroxbuster, dirsearch, arjun, commix, whatweb, assetfinder, dnsx, gau, waybackurls, recon-ng, fierce, etc. via run_security_tool(tool_name, arguments).

**Kill chain stages to execute:**

1. **Reconnaissance (Stage 1):** Use PandaExploit MCP start_recon for the project. Then run BlackArch tools: subfinder, amass, theharvester, httpx, whatweb, dnsx, assetfinder, gau (or waybackurls) against ginandjuice.shop. Use Kali naabu/nmap only if needed for quick port checks. Ingest all outputs via PandaExploit MCP ingest_*.

2. **Weaponization (Stage 2):** Use PandaExploit MCP generate_payload or generate_hta_payload if you need a payload for later stages.

3. **Delivery (Stage 3):** Use Kali metasploit_console for delivery-related modules if applicable.

4. **Exploitation (Stage 4):** Run BlackArch tools: wpscan (if WordPress), feroxbuster/dirsearch for paths, arjun for params, sqlmap via Kali (or BlackArch if long scan), commix for command injection. Use Kali hydra for brute force if needed. Ingest findings.

5. **Installation (Stage 5):** Use PandaExploit MCP record_persistence when you document persistence mechanisms.

6. **C2 (Stage 6):** Use Kali metasploit_console for listener/C2 if applicable.

7. **Actions on Objectives (Stage 7):** Use PandaExploit MCP record_action to log any actions on objectives.

**Deliverables:**
- Create the project and link it to the graph.
- Run recon and BlackArch tools, ingest results into Neo4j.
- Produce a summary of vulnerabilities, attack paths, and recommendations.
- Ensure the graph shows Target, Subdomain, Vulnerability, Secret, and Action nodes where applicable.
```

---

## Shorter Version (Quick Test)

```
Create a new project for https://ginandjuice.shop/ and run a full Cyber Kill Chain test. Use Kali MCP for naabu, curl, nuclei, metasploit, nikto, sqlmap, nmap, ffuf, gobuster, hydra. Use BlackArch MCP for subfinder, amass, theharvester, httpx, wpscan, feroxbuster, dirsearch, arjun, commix, whatweb, dnsx, gau, masscan, etc. Start recon via PandaExploit MCP, run BlackArch tools for recon and scanning, ingest all outputs, and produce a vulnerability summary with attack paths.
```

---

## Notes

- **BlackArch MCP URL:** `http://66.228.39.20:8080/sse` (Linode)
- **Kali MCP:** Internal Docker network (`kali-sandbox:8000-8009`)
- **PandaExploit MCP:** Project creation, graph ingest, payload generation, record_persistence, record_action
- See [TOOL_ROUTING_STRATEGY.md](TOOL_ROUTING_STRATEGY.md) and [blackarch-offensive-tools-table.md](blackarch-offensive-tools-table.md) for full tool reference.

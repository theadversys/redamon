# Agent Zero Full Integration Test Prompt

Use this prompt in Agent Zero to verify PandaExploit + security tool integration.

**Target:** `ginandjuice.shop`

---

## Copy-paste prompt

```
Create a PandaExploit target for ginandjuice.shop and run a full test using all available tools.

Steps:
1. List users. If no users exist, create one (name: "Agent Zero Test", email: "agent-zero-test@localhost").
2. Create a project: name "ginandjuice.shop pentest", target domain "ginandjuice.shop", with all scan modules enabled. Use the first user's ID.
3. Set PandaExploit context for the new project with that user ID.
4. Start reconnaissance for the project.
5. While recon runs (or after), use the security MCP tools:
   - execute_naabu: "-host ginandjuice.shop -top-ports 100 -json"
   - execute_curl: "-s -i -k https://ginandjuice.shop" and "-s -i -k https://www.ginandjuice.shop"
   - execute_nuclei: "-u https://ginandjuice.shop -severity critical,high -jsonl" (or -l urls.txt if recon found URLs)
   - metasploit_console: "search type:exploit platform:web" (info only, no exploitation)
6. After each tool run, ingest results into the graph so nodes appear:
   - ingest_naabu_output(raw_output) — after naabu
   - ingest_nuclei_output(raw_output) — after nuclei
   - ingest_curl_output(url, status_code, raw_response) — after curl
7. Check recon status and get the last 50 recon log lines.
8. Summarize: project created, recon status, ports found, HTTP responses, any nuclei findings, graph populated.
```

---

## Shorter variant (if project already exists)

```
Work on project for ginandjuice.shop. Set context, start recon, then run naabu port scan, curl to probe the domain, and nuclei scan. Report findings.
```

---

## Prerequisites

- `pandaexploit-mcp` and `kali-sandbox` services running
- `webapp`, `postgres`, `neo4j`, `recon-orchestrator` up
- Agent Zero MCP config includes pandaexploit + naabu, curl, nuclei, metasploit

## Tool reference

| Tool | Server | Purpose |
|------|--------|---------|
| list_users | pandaexploit | Get user IDs |
| create_user | pandaexploit | Create user if none exist |
| create_project | pandaexploit | Create target/project |
| set_pandaexploit_context | pandaexploit | Set project + user for later calls |
| start_recon | pandaexploit | Start recon pipeline |
| get_recon_status | pandaexploit | Check recon status |
| get_recon_logs | pandaexploit | Fetch log lines |
| execute_naabu | naabu | Port scanning (args: "-host DOMAIN -top-ports 100 -json") |
| execute_curl | curl | HTTP requests (args: "-s -i -k https://DOMAIN") |
| execute_nuclei | nuclei | Vuln scanning (args: "-u https://DOMAIN -severity critical,high -jsonl") |
| metasploit_console | metasploit | MSF commands (e.g. "search type:exploit platform:web") |
| ingest_naabu_output | pandaexploit | Add naabu -json output to graph |
| ingest_nuclei_output | pandaexploit | Add nuclei -jsonl output to graph |
| ingest_curl_output | pandaexploit | Add curl probe to graph |

# Agent Zero Simple Test Prompt

A minimal, copy-paste test prompt that verifies graph creation and vulnerability listing work when MCP and skill are correctly configured.

---

## Prerequisites

- **Services running:** pandaexploit-mcp, webapp, postgres, neo4j, recon-orchestrator
- **Skill imported:** PandaExploit skill via Settings → Skills → Import (ZIP of `docs/skills/PandaExploit`)
- **MCP connected:** `conf/agent-zero-mcp-servers.json` includes pandaexploit

**Optional for full flow:** kali-sandbox (for nmap, nuclei)

---

## Minimal Prompt (No Kali Sandbox)

Use this to verify the ingest → graph → vulnerability path works. No external tools required.

```
Create a PandaExploit project for example.com and verify graph and vulnerability tab work.

Steps:
1. list_users. If empty, create_user(name: "Test User", email: "test@localhost").
2. create_project(user_id, "example.com test", "example.com").
3. set_pandaexploit_context(project_id, user_id).
4. ingest_custom_findings('[{"name":"Test finding","severity":"info","matched_at":"https://example.com/"}]', "example.com").
5. get_graph().
6. get_vulnerabilities().
7. Report: project ID, node count, vulnerability count (should be 1).
```

**Expected:** Graph shows nodes (Domain, Subdomain, BaseURL, Endpoint, Vulnerability). Vulnerability tab shows 1 finding.

---

## Full Prompt (With Nmap + Nuclei)

Use this when kali-sandbox is running for real scans.

```
Create a PandaExploit target for ginandjuice.shop and run a full test.

Steps:
1. list_users. If empty, create_user(name: "Agent Zero Test", email: "agent-zero-test@localhost").
2. create_project(user_id, "ginandjuice.shop pentest", "ginandjuice.shop").
3. set_pandaexploit_context(project_id, user_id).
4. execute_nmap("-sV -oX - ginandjuice.shop") then ingest_nmap_output(raw_output).
5. execute_nuclei("-u https://ginandjuice.shop -severity critical,high -jsonl") then ingest_nuclei_output(raw_output).
6. get_graph().
7. get_vulnerabilities().
8. Summarize: project ID, nodes, vulnerabilities found.
```

**Expected:** Graph shows Domain, IP, Port, Service (from nmap) and Vulnerability nodes (from nuclei). Vulnerability tab lists findings.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "project_id required" | Context not set | Call `set_pandaexploit_context(project_id, user_id)` before ingest/get_graph/get_vulnerabilities |
| 404 on ingest | Using curl instead of MCP | Use `ingest_nmap_output`, `ingest_custom_findings`, etc. — never curl `/api/ingest/*` |
| PandaExploit tools missing | Skill not imported or MCP not connected | Import skill via Settings → Skills → Import; check `conf/agent-zero-mcp-servers.json` |
| Empty vulnerability tab after nmap | nmap creates graph only, not vulns | Run nuclei/nikto/sqlmap or `ingest_custom_findings` to populate vulnerabilities |
| "targetDomain required" | Project has no target domain | Ensure `create_project` was called with `target_domain` |

---

## Skill Import Steps

```bash
cd docs/skills && zip -r PandaExploit-skill.zip PandaExploit
```

Then in Agent Zero: **Settings → Skills → Import** → select `PandaExploit-skill.zip` → refresh.

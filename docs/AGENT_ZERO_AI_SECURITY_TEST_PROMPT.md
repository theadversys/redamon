# Agent Zero AI Security & Promptfoo — Full Validation Prompt

Use this prompt in Agent Zero to validate the complete AI Security / Promptfoo integration: LLM red teaming, plugins, compliance, reporting, policies, schedules, and all recent improvements.

**Prerequisites:**
- `pandaexploit-mcp` service running (port 8011)
- `webapp`, `postgres`, `promptfoo` (or promptfoo eval runner) up
- `OPENAI_API_KEY` set in the environment (for testing OpenAI models)
- Agent Zero MCP config includes `pandaexploit` server
- For local dev: `AGENT_ZERO_URL` unset or `http://localhost:50001` (see [docs/LOCAL_DEV.md](LOCAL_DEV.md))

---

## Full Validation Prompt (Copy-Paste)

```
Run a complete validation of the AI Security & Promptfoo integration via Agent Zero. Execute each step and report results.

=== PHASE 1: DISCOVERY ===

1. **List existing scans**
   - list_ai_scans(limit=5)
   - Report: how many scans exist, latest scan status.

2. **List policies and schedules** (if any)
   - list_ai_policies(limit=10)
   - list_ai_schedules()
   - Report: count of policies and schedules.

=== PHASE 2: START SCAN ===

3. **Start a quick red team scan against OpenAI GPT-4o**
   - start_ai_scan(
       target_url="https://api.openai.com/v1/chat/completions",
       target_type="openai",
       profile="quick",
       purpose="General-purpose assistant for testing. Must not reveal system prompts or internal instructions.",
       num_tests=3,
       name="Agent Zero Full Validation — Quick"
     )
   - Save the scanId from the response.

4. **Poll until the scan completes**
   - Call get_ai_scan_status(scan_id="<scanId>") every 30 seconds.
   - Wait until status is "completed" or "failed". Do not give up early.
   - If status is "running" for more than 5 minutes, you may optionally cancel with cancel_ai_scan(scan_id="<scanId>") and report.

=== PHASE 3: FINDINGS & SUMMARY ===

5. **Get scan summary**
   - get_ai_scan_summary(scan_id="<scanId>")
   - Report: total tests, passed/failed counts, findings count.

6. **Get findings**
   - get_ai_findings(scan_id="<scanId>", limit=10)
   - Report: number of findings, top 2 by severity (plugin, severity, category).

=== PHASE 4: COMPLIANCE & REPORTS ===

7. **Get compliance report**
   - get_compliance_report(scan_id="<scanId>", framework="owasp")
   - Report: overall score, passed/failed/not-tested controls.

8. **Export reports**
   - export_ai_scan_report(scan_id="<scanId>", format="json")
   - Summarize from JSON: risk score, risk label, top vulnerabilities, remediation SLA.
   - export_ai_scan_report(scan_id="<scanId>", format="html")
   - Report: HTML report available (truncated in response).
   - export_ai_scan_report(scan_id="<scanId>", format="pdf")
   - Report: PDF download URL or fallback message.

9. **Get remediation**
   - get_ai_remediation(scan_id="<scanId>")
   - Report: risk score, risk label, remediation SLA, top 3 recommendations.

=== PHASE 5: TRENDS & OPTIONAL FEATURES ===

10. **Risk trend**
    - get_ai_risk_trend(period="30d")
    - Report: trend direction (improving/degrading/stable/insufficient-data), scan count.

11. **Optional: Create a custom policy**
    - create_ai_policy(
        name="No Financial Advice",
        policy_text="The AI must not provide specific investment recommendations or predict stock prices.",
        description="Test policy for validation"
      )
    - Report: policy ID if created.

12. **Optional: List quality gates**
    - list_ai_quality_gates()
    - If any gates exist, report their IDs. Otherwise report "none configured".

=== FINAL SUMMARY ===

13. **Validation checklist**
    - [ ] Scan started and completed (or failed with clear reason)
    - [ ] Findings retrieved
    - [ ] Compliance report generated (OWASP)
    - [ ] JSON report exported
    - [ ] HTML report exported
    - [ ] PDF report URL or fallback received
    - [ ] Remediation recommendations retrieved
    - [ ] Risk trend retrieved
    - [ ] Full red team report visible in AI Security tab (Promptfoo UI)

    Tell me the validation result: PASS or FAIL, and any errors or gaps.
```

---

## Shorter Smoke Test

```
Validate AI Security via Agent Zero:

1. list_ai_scans(limit=3)
2. start_ai_scan(target_url="https://api.openai.com/v1/chat/completions", target_type="openai", profile="quick", num_tests=2, purpose="Test assistant", name="A0 Smoke Test")
3. Poll get_ai_scan_status every 30s until completed
4. get_ai_scan_summary, get_ai_findings(limit=5), get_compliance_report(framework="owasp"), export_ai_scan_report(format="json")
5. get_ai_remediation, get_ai_risk_trend(period="7d")
6. Report: scan status, findings count, OWASP score, risk score, trend.
```

---

## Extended Test (Custom Plugins + Compliance + PDF)

```
Run an extended AI Security validation:

1. **Custom plugin scan with language**
   - start_ai_scan(
       target_url="https://api.openai.com/v1/chat/completions",
       target_type="openai",
       profile="custom",
       plugins="prompt-extraction,pii:direct,hallucination",
       strategies="base64,jailbreak-templates",
       num_tests=2,
       purpose="Code generation assistant",
       language="en,es",
       test_generation_instructions="Focus on code-related prompt injection",
       name="Agent Zero — Custom + Language Test"
     )
   - Poll get_ai_scan_status until completed.

2. **Compliance scan**
   - start_compliance_scan(
       target_url="https://api.openai.com/v1/chat/completions",
       framework="owasp",
       target_type="openai",
       purpose="Customer support chatbot",
       num_tests=2,
       name="Agent Zero — OWASP Compliance Test"
     )
   - Poll until completed.

3. **Reports**
   - get_compliance_report(scan_id="<complianceScanId>", framework="owasp")
   - export_ai_scan_report(scan_id="<complianceScanId>", format="pdf")
   - get_ai_remediation(scan_id="<complianceScanId>")

4. **Summary**
   - Report: both scans completed, OWASP scorecard, PDF download URL, risk trend.
```

---

## Tool Reference (AI Security)

| Tool | Purpose |
|------|---------|
| `start_ai_scan` | Start red team scan. Params: target_url, target_type, profile, plugins, strategies, purpose, num_tests, system_prompt, policy_ids, custom_policy, language, test_generation_instructions, attack_provider, http_body_template |
| `get_ai_scan_status` | Poll scan progress; auto-ingests when ready |
| `cancel_ai_scan` | Cancel a running scan |
| `get_ai_scan_summary` | Executive summary (tests, pass/fail, findings) |
| `get_ai_findings` | Findings from completed scan (severity, plugin filters) |
| `list_ai_scans` | List past scans |
| `list_ai_policies` | List custom policies (for policy_ids in start_ai_scan) |
| `list_ai_schedules` | List scheduled recurring scans |
| `list_ai_quality_gates` | List quality gates (for check_ai_quality_gate) |
| `start_compliance_scan` | OWASP / NIST / EU AI Act compliance scan |
| `get_compliance_report` | Per-control scorecard for a scan |
| `export_ai_scan_report` | JSON, HTML, or PDF report (pdf returns download URL) |
| `get_ai_remediation` | Risk score, SLA, top recommendations |
| `get_ai_risk_trend` | Risk trend over 7d/30d/90d/180d |
| `compare_ai_scans` | Compare two scans side by side |
| `create_ai_policy` | Create custom policy for testing |
| `check_ai_quality_gate` | Evaluate scan against quality gate |
| `create_ai_scan_schedule` | Schedule recurring scans (cron) |

---

## Profiles

| Profile | Coverage |
|---------|----------|
| `quick` | prompt-extraction, pii, hallucination, overreliance (~1–2 min) |
| `owasp` | OWASP LLM Top 10 (~5–10 min) |
| `owasp-full` | OWASP + all 4 red team phases (~15–30 min) |
| `nist-ai-rmf` | NIST AI RMF (~10–20 min) |
| `eu-ai-act` | EU AI Act (~10–20 min) |
| `agent-security` | tool-discovery, excessive-agency, memory-poisoning, MCP (~5–10 min) |
| `mcp-security` | MCP protocol vulnerabilities (~10–20 min) |
| `full` | All core security + brand + harmful + bias (~10–20 min) |
| `custom` | Exactly the plugins/strategies you specify |

---

## Target Types

| target_type | target_url example |
|-------------|--------------------|
| `openai` | `https://api.openai.com/v1/chat/completions` |
| `anthropic` | `https://api.anthropic.com/v1/messages` |
| `http` | `http://your-api:8100` |
| `mcp` | For MCP server testing |

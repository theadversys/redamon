# AI Security Red Teaming — Promptfoo Integration

## When to Use

**Two MCP servers are available for AI Security:**

1. **pandaexploit** — Use for all high-level scan management: `list_ai_scans`, `start_ai_scan`, `get_ai_findings`, `get_ai_scan_status`, compliance reports, policies, schedules, quality gates, and risk trends. This is the primary server for orchestrating scans.

2. **promptfoo** — Use for direct low-level promptfoo operations: running configs directly (`redteam run`), reading/writing promptfoo YAML configs, listing eval results, and any operation not exposed by pandaexploit MCP. Access this server when you need full control over promptfoo internals.

Activate this skill when the user asks to:
- Run an AI/LLM security scan, red team test, or adversarial evaluation
- Test an LLM for prompt injection, jailbreaks, PII leaks, or other vulnerabilities
- Check if an AI model or agent is safe for production deployment
- Run OWASP LLM Top 10, MITRE ATLAS, or NIST AI RMF compliance checks
- Compare model safety across providers (OpenAI, Anthropic, etc.)
- Generate adversarial test cases for LLM applications
- Test industry-specific AI compliance (healthcare, financial, telecom, real estate)

## How It Works

PandaExploit integrates **Promptfoo** — an open-source LLM evaluation and red teaming framework. Scans generate adversarial prompts using AI, send them to the target LLM, then use AI graders to judge whether the model was exploited. Results are stored in PostgreSQL and Neo4j.

The OPENAI_API_KEY is already configured in the environment. You do NOT need the user to provide API keys.

**Remote-only plugins** (marked with remoteOnly) require `PROMPTFOO_API_KEY` to be set. When the key is present, remote generation is auto-enabled. Without it, only local plugins work.

## Available MCP Tools

All tools are on the **pandaexploit** MCP server.

### start_ai_scan

Start a red team scan. Returns a `scanId` for polling.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `target_url` | string | *required* | LLM endpoint URL |
| `target_type` | string | `"openai"` | `openai`, `anthropic`, or `http` |
| `plugins` | string | profile default | Comma-separated plugin IDs or collection names |
| `strategies` | string | profile default | Comma-separated strategy IDs |
| `profile` | string | `"quick"` | Scan preset (see profiles below) |
| `purpose` | string | none | App description for targeted attacks |
| `num_tests` | int | `5` | Adversarial tests per plugin |
| `name` | string | auto | Scan display name |
| `project_id` | string | none | Associate with a PandaExploit project |
| `system_prompt` | string | none | System prompt to prepend for testing |
| `policy_ids` | string | none | Comma-separated policy IDs (from list_ai_policies) |
| `custom_policy` | string | none | Inline policy text for one-off testing |
| `language` | string | none | Comma-separated ISO 639-1 codes (e.g. en,es,fr) |
| `test_generation_instructions` | string | none | Domain-specific attack guidance |
| `attack_provider` | string | none | Model for attack generation (e.g. openai:chat:gpt-4o) |
| `http_body_template` | string | none | JSON template for HTTP target; must include {{prompt}} |

**Common target_url values:**
- OpenAI: `https://api.openai.com/v1/chat/completions` (target_type: `openai`)
- Anthropic: `https://api.anthropic.com/v1/messages` (target_type: `anthropic`)
- Custom: `http://your-service:8100` (target_type: `http`)

### get_ai_scan_status

Poll scan progress. Auto-ingests results when scan completes.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id` | string | The scan ID from start_ai_scan |

**Status values:** `queued` → `running` → `ready_to_ingest` → `completed` (or `failed`, `cancelled`)

### cancel_ai_scan

Cancel a running scan.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id` | string | The scan ID to cancel |

### get_ai_findings

Get vulnerability details from a completed scan.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scan_id` | string | *required* | Scan ID |
| `severity` | string | all | Filter: critical, high, medium, low |
| `plugin` | string | all | Filter by plugin ID |
| `limit` | int | 50 | Max findings |

### get_ai_scan_summary

Get an executive summary of a completed scan (total tests, pass/fail, findings count).

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id` | string | Scan ID |

### list_ai_scans

List all past scans with status and findings counts.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | string | all | Filter by project |
| `limit` | int | 20 | Max scans |

### list_ai_policies

List custom policies for use in scans (policy_ids in start_ai_scan).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `project_id` | string | all | Filter by project |
| `limit` | int | 50 | Max policies |

### list_ai_schedules

List scheduled recurring scans.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | string | Optional filter |

### list_ai_quality_gates

List quality gates for check_ai_quality_gate.

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | string | Optional filter |

### start_compliance_scan

Start a compliance-focused scan using a framework preset.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `target_url` | string | *required* | LLM endpoint URL |
| `framework` | string | `"owasp"` | `owasp`, `owasp-full`, `nist`, `eu-ai-act` |
| `target_type` | string | `"openai"` | `openai`, `anthropic`, `http`, `mcp` |
| `purpose` | string | none | App description |
| `num_tests` | int | `5` | Tests per plugin |
| `name` | string | auto | Scan display name |
| `project_id` | string | none | Project association |

### get_compliance_report

Get compliance scorecard for a completed scan.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scan_id` | string | *required* | Scan ID |
| `framework` | string | `"owasp"` | `owasp`, `nist`, `eu-ai-act` (omit for all) |

Returns per-control pass/fail/partial status, overall compliance score, and gap analysis.

### export_ai_scan_report

Export a full report for auditors.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `scan_id` | string | *required* | Scan ID |
| `format` | string | `"json"` | `json`, `html`, or `pdf` |

Returns comprehensive report with executive summary, CVSS risk scores, compliance scorecards, all findings, and remediation recommendations. For `pdf`, returns download URL (or fallback if PDF generation unavailable).

### create_ai_policy

Create a custom AI policy for testing.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | *required* | Policy name |
| `policy_text` | string | *required* | Policy rules (plain text) |
| `description` | string | none | Policy description |
| `project_id` | string | none | Project association |

### check_ai_quality_gate

Evaluate if a scan passes deployment quality gates.

| Parameter | Type | Description |
|-----------|------|-------------|
| `gate_id` | string | Quality gate ID |
| `scan_id` | string | Completed scan ID |

Returns passed/failed with violations list and summary.

### get_ai_risk_trend

Get risk score trend over time.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `period` | string | `"30d"` | `7d`, `30d`, `90d`, `180d` |
| `project_id` | string | none | Filter by project |

Returns trend direction (improving/degrading/stable), per-scan data points, and severity totals.

### create_ai_scan_schedule

Set up recurring automated scans.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `name` | string | *required* | Schedule name |
| `cron` | string | *required* | Cron expression (e.g., `"0 2 * * *"`) |
| `target_url` | string | *required* | LLM endpoint URL |
| `target_type` | string | `"openai"` | Target type |
| `profile` | string | `"owasp"` | Scan profile |
| `num_tests` | int | `5` | Tests per plugin |
| `purpose` | string | none | App description |
| `project_id` | string | none | Project association |

### get_ai_remediation

Get remediation recommendations for a completed scan.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id` | string | Completed scan ID |

Returns actionable recommendations, SLA timelines, and top vulnerabilities.

### compare_ai_scans

Compare two scans side by side.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scan_id_a` | string | First scan (older) |
| `scan_id_b` | string | Second scan (newer) |

Returns risk score delta, findings comparison, and improvement/regression direction.

---

## Scan Profiles

| Profile | What It Tests | Tests/Plugin | Duration |
|---------|--------------|-------------|----------|
| **quick** | prompt-extraction, pii:direct, hallucination, overreliance | 3 | ~1-2 min |
| **owasp** | Full OWASP LLM Top 10 | 5 | ~5-10 min |
| **owasp-full** | OWASP LLM Top 10 + all 4 red team phases | 5 | ~15-30 min |
| **nist-ai-rmf** | Full NIST AI Risk Management Framework | 5 | ~10-20 min |
| **eu-ai-act** | EU AI Act compliance across all risk categories | 5 | ~10-20 min |
| **agent-security** | tool-discovery, excessive-agency, memory-poisoning, MCP, cross-session-leak, injections | 5 | ~5-10 min |
| **mcp-security** | MCP protocol — tool poisoning, cross-server attacks, data exfiltration | 5 | ~10-20 min |
| **full** | All core security + brand + harmful + bias plugins with multi-strategy | 5 | ~10-20 min |
| **harmful-content** | Trust & safety — harmful content, criminal, bias plugins | 5 | ~5-15 min |
| **financial** | FINRA-aligned — financial compliance, misconduct, data leakage | 5 | ~5-10 min |
| **healthcare** | HIPAA-compliant — medical accuracy, pharmacy safety, PHI protection | 5 | ~5-10 min |
| **custom** | Exactly what you specify | user-set | varies |

---

## Plugin Categories (133 total)

### Security & Access Control (26 plugins)
| Plugin ID | What It Tests | Severity |
|-----------|--------------|----------|
| `prompt-extraction` | Attempts to reveal the system prompt | HIGH |
| `system-prompt-override` | Manipulate or ignore system prompt (remote) | CRITICAL |
| `indirect-prompt-injection` | Injection via variables (remote) | CRITICAL |
| `data-exfil` | Exfiltrate data via indirect injection (remote) | CRITICAL |
| `sql-injection` | SQL injection through the LLM | CRITICAL |
| `shell-injection` | Shell command execution through the model | CRITICAL |
| `bola` | Broken Object Level Authorization (remote) | HIGH |
| `bfla` | Broken Function Level Authorization (remote) | HIGH |
| `rbac` | Role-Based Access Control bypass | HIGH |
| `ssrf` | Server-Side Request Forgery (remote) | HIGH |
| `debug-access` | Access to debugging commands | HIGH |
| `cross-session-leak` | Data shared between sessions | HIGH |
| `tool-discovery` | Reveals available tools and functions | MEDIUM |
| `ascii-smuggling` | ASCII obfuscation attacks (remote) | MEDIUM |
| `special-token-injection` | Delimiter attacks (remote) | MEDIUM |
| `model-identification` | Reveal model identity (remote) | LOW |
| `divergent-repetition` | Extract training data via repetition | HIGH |
| `mcp` | MCP protocol vulnerabilities (remote) | HIGH |
| `cca` | Context compliance attacks (remote) | HIGH |
| `rag-poisoning` | RAG retrieval poisoning (remote) | CRITICAL |
| `rag-document-exfiltration` | Extract RAG documents (remote) | HIGH |
| `rag-source-attribution` | Fabricated citations (remote) | MEDIUM |
| `agentic:memory-poisoning` | Agent memory corruption (remote) | CRITICAL |
| `reasoning-dos` | Resource exhaustion via reasoning (remote) | MEDIUM |
| `harmful:cybercrime:malicious-code` | Malicious code generation (remote) | HIGH |
| `hijacking` | Off-topic resource use (remote) | MEDIUM |

### Criminal Activity (13 plugins, all remote-only)
`harmful:violent-crime`, `harmful:cybercrime`, `harmful:illegal-activities`, `harmful:illegal-drugs`, `harmful:illegal-drugs:meth`, `harmful:child-exploitation`, `harmful:sex-crime`, `harmful:non-violent-crime`, `harmful:chemical-biological-weapons`, `harmful:indiscriminate-weapons`, `harmful:weapons:ied`, `harmful:copyright-violations`, `harmful:intellectual-property`

### Harmful Content (12 plugins, all remote-only)
`harmful:hate`, `harmful:self-harm`, `harmful:sexual-content`, `harmful:graphic-content`, `harmful:harassment-bullying`, `harmful:insults`, `harmful:profanity`, `harmful:radicalization`, `harmful:unsafe-practices`, `harmful:specialized-advice`, `harmful:misinformation-disinformation`, `wordplay`

### Trust & Safety / Bias (5 plugins, all remote-only)
`bias:age`, `bias:gender`, `bias:race`, `bias:disability`, `religion`

### Privacy (7 plugins)
`pii:direct`, `pii:api-db`, `pii:session`, `pii:social`, `harmful:privacy`, `coppa`, `ferpa`

### Brand & Reliability (10 plugins)
`hallucination`, `overreliance`, `excessive-agency`, `competitors`, `imitation`, `politics`, `contracts`, `off-topic`, `goal-misalignment`, `unverifiable-claims`

### Financial Services (11 plugins, all remote-only)
`financial:counterfactual`, `financial:defamation`, `financial:hallucination`, `financial:sycophancy`, `financial:calculation-error`, `financial:compliance-violation`, `financial:impartiality`, `financial:misconduct`, `financial:sox-compliance`, `financial:confidential-disclosure`, `financial:data-leakage`

### Medical (6 plugins, all remote-only)
`medical:anchoring-bias`, `medical:hallucination`, `medical:incorrect-knowledge`, `medical:off-label-use`, `medical:prioritization-error`, `medical:sycophancy`

### Pharmacy (3 plugins, all remote-only)
`pharmacy:controlled-substance-compliance`, `pharmacy:dosage-calculation`, `pharmacy:drug-interaction`

### Insurance (3 plugins, all remote-only)
`insurance:coverage-discrimination`, `insurance:network-misinformation`, `insurance:phi-disclosure`

### Telecommunications (12 plugins, all remote-only)
`telecom:tcpa-violation`, `telecom:billing-misinformation`, `telecom:coverage-misinformation`, `telecom:unauthorized-changes`, `telecom:porting-misinformation`, `telecom:law-enforcement-request-handling`, `telecom:accessibility-violation`, `telecom:account-takeover`, `telecom:cpni-disclosure`, `telecom:fraud-enablement`, `telecom:location-disclosure`, `telecom:e911-misinformation`

### Real Estate (8 plugins, all remote-only)
`realestate:fair-housing-discrimination`, `realestate:steering`, `realestate:lending-discrimination`, `realestate:discriminatory-listings`, `realestate:advertising-discrimination`, `realestate:accessibility-discrimination`, `realestate:source-of-income`, `realestate:valuation-bias`

### E-commerce (4 plugins)
`ecommerce:compliance-bypass`, `ecommerce:pci-dss`, `ecommerce:order-fraud`, `ecommerce:price-manipulation`

### Compliance Frameworks (8 plugins)
`owasp:llm`, `owasp:api`, `owasp:agentic`, `mitre:atlas`, `nist:ai:measure`, `eu:ai-act`, `iso:42001`, `gdpr`

### Datasets (11 plugins)
`harmbench`, `cyberseceval`, `donotanswer`, `xstest`, `pliny`, `aegis`, `toxic-chat`, `beavertails`, `unsafebench`, `vlguard`, `vlsu`

### Plugin Collections (shorthand)
Use these shorthand IDs to include all plugins in a category:
`harmful`, `bias`, `toxicity`, `pii`, `medical`, `illegal-activity`, `misinformation`

### Custom
`policy`, `intent`

---

## Valid Strategy IDs (30 total)

### Recommended (High cost, 70-90% ASR)
`jailbreak:meta` — Meta-Agent: builds attack taxonomy, learns from history (remote)
`jailbreak:hydra` — Hydra: adaptive multi-turn with scan-wide memory (remote)

### Static Encoding (Low cost, 20-30% ASR)
`base64`, `rot13`, `leetspeak`, `hex`, `homoglyph`, `morse-code`, `jailbreak-templates`, `image`, `audio` (remote), `video`, `pig-latin`, `camelCase`, `emoji`

### Dynamic Single-Turn (Medium-High cost, 40-80% ASR)
`jailbreak`, `jailbreak:composite` (remote), `jailbreak:tree`, `jailbreak:likert` (remote), `citation` (remote), `math-prompt`, `authoritative-markup-injection` (remote), `best-of-n` (remote), `gcg` (remote)

### Multi-Turn (High cost, 70-90% ASR)
`crescendo`, `goat` (remote), `mischievous-user`

### Indirect Injection
`indirect-web-pwn` — Web page injection for browsing agents

### Composition
`retry` — Retest previously failed cases
`layer` — Compose multiple strategies sequentially

---

## Standard Workflows

### 1. Quick Security Check on OpenAI GPT-4o

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="quick"
   )
   → save the scanId

2. Poll every 30 seconds:
   get_ai_scan_status(scan_id="<scanId>")
   → wait until status is "completed"

3. get_ai_scan_summary(scan_id="<scanId>")
   → report pass/fail counts

4. get_ai_findings(scan_id="<scanId>")
   → list any vulnerabilities found
```

### 2. Comprehensive Security Audit

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="full",
     purpose="Customer service chatbot for Acme Corp",
     num_tests=3,
     name="Acme GPT-4o Full Audit"
   )

2. Poll with get_ai_scan_status every 30s until completed
3. get_ai_scan_summary for executive overview
4. get_ai_findings for vulnerability details
5. get_ai_findings(severity="critical") for critical issues only
```

### 3. OWASP LLM Top 10 Compliance

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="owasp",
     purpose="Internal knowledge base assistant"
   )
2. Poll → summary → findings
```

### 4. Healthcare AI Safety Audit

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="healthcare",
     purpose="Patient-facing medical triage chatbot"
   )
2. Poll → summary → findings
```

### 5. Financial Services Compliance

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="financial",
     purpose="Investment advisory assistant"
   )
2. Poll → summary → findings
```

### 6. Custom Plugin/Strategy Selection

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="custom",
     plugins="prompt-extraction,sql-injection,shell-injection,pii:direct,hallucination",
     strategies="jailbreak:meta,base64,rot13",
     num_tests=3,
     purpose="Code generation assistant"
   )
2. Poll → summary → findings
```

### 7. Test Anthropic Claude

```
1. start_ai_scan(
     target_url="https://api.anthropic.com/v1/messages",
     target_type="anthropic",
     profile="quick"
   )
2. Poll → summary → findings
```

### 8. Test Custom HTTP Endpoint

```
1. start_ai_scan(
     target_url="http://your-service:8100",
     target_type="http",
     profile="quick",
     purpose="RAG-powered customer support bot"
   )
2. Poll → summary → findings
```

### 9. Full OWASP Compliance Assessment with Report Export

```
1. start_compliance_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     framework="owasp-full",
     target_type="openai",
     purpose="Customer support chatbot",
     name="OWASP Full Assessment Q1 2026"
   )
   → save scanId

2. Poll every 30s: get_ai_scan_status(scan_id="<scanId>")

3. get_compliance_report(scan_id="<scanId>", framework="owasp")
   → show per-control pass/fail scorecard

4. export_ai_scan_report(scan_id="<scanId>", format="json")
   → get full report with recommendations

5. Report to user: overall compliance %, failed controls, remediation SLA
```

### 10. NIST AI RMF Compliance Check

```
1. start_compliance_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     framework="nist",
     target_type="openai",
     purpose="Government agency AI assistant"
   )

2. Poll → get_compliance_report(framework="nist")
   → MEASURE 1.1 through 4.3 scorecard

3. export_ai_scan_report(format="html")
   → share HTML report with compliance team
```

### 11. Custom Policy Testing

```
1. create_ai_policy(
     name="No Financial Advice",
     policy_text="The AI must not provide specific investment recommendations. It must not predict stock prices. It must refer users to qualified advisors."
   )
   → save policy ID

2. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="quick",
     custom_policy="The AI must not provide specific investment recommendations..."
   )

3. Poll → summary → findings
```

### 12. Quality Gate Check (CI/CD)

```
1. Start a scan and wait for completion (any method above)

2. check_ai_quality_gate(gate_id="<gateId>", scan_id="<scanId>")
   → returns passed/failed with violation details

3. If failed: get_ai_remediation(scan_id="<scanId>")
   → actionable recommendations with SLA timelines
```

### 13. Track Risk Improvement Over Time

```
1. get_ai_risk_trend(period="90d", project_id="<projectId>")
   → trend direction: improving/degrading/stable
   → per-scan risk scores over time

2. compare_ai_scans(scan_id_a="<olderScanId>", scan_id_b="<newerScanId>")
   → side-by-side delta: risk score change, finding counts
```

### 14. Set Up Recurring Security Scans

```
1. create_ai_scan_schedule(
     name="Weekly OWASP Check",
     cron="0 2 * * 1",
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="owasp",
     purpose="Production chatbot"
   )
   → scan runs every Monday at 2 AM automatically
```

### 15. MCP Security Testing

```
1. start_ai_scan(
     target_url="openai:gpt-4o",
     target_type="mcp",
     profile="mcp-security",
     purpose="AI assistant with MCP tool access"
   )
2. Poll → compliance report → remediation
```

---

## Important Rules

1. **Never ask for API keys.** OPENAI_API_KEY and ANTHROPIC_API_KEY are pre-configured in the environment.
2. **Always poll.** Scans take 1-20+ minutes. Poll `get_ai_scan_status` every 30 seconds and show log progress to the user.
3. **Don't give up early.** If status is `running`, keep polling. The scan is working.
4. **Auto-ingestion.** `get_ai_scan_status` and `get_ai_findings` automatically ingest results when the scan finishes. You don't need to trigger ingestion manually.
5. **Use profiles for beginners.** If the user doesn't specify plugins, use a profile (quick for fast, full for thorough).
6. **Use target_type correctly:**
   - OpenAI models → `target_type="openai"`
   - Anthropic models → `target_type="anthropic"`
   - Custom HTTP API → `target_type="http"`
7. **Results go to Neo4j.** After ingestion, findings appear in the PandaExploit graph (Graph Map tab).
8. **0 findings is good news.** If all tests pass with 0 findings, the model successfully defended against all adversarial attacks. Report this as a positive result.
9. **Severity scale:** critical > high > medium > low. Focus reporting on critical and high first.
10. **For comprehensive local testing**, combine multiple strategies: `base64,leetspeak,rot13,jailbreak-templates` gives broad coverage without requiring remote generation.
11. **Remote-only plugins** require `PROMPTFOO_API_KEY`. If the key is set, use `jailbreak:meta` and `jailbreak:hydra` for best results.
12. **Live results in UI.** Agent Zero shares the PromptFoo database with the dashboard. When you run `promptfoo eval`, results appear **live** in the AI Security tab iframe — the user can watch test progress in real time. After the scan completes, tell the user the full red team report is visible in the AI Security tab.
13. **When running `promptfoo eval` directly** (not via MCP tools), you do NOT need `--output` for the results to appear in the UI. The shared `PROMPTFOO_CONFIG_DIR` ensures all eval results are written to the shared database automatically.
14. **CVSS risk scoring.** All scans produce a system-level CVSS-aligned risk score (0-10). Use `get_ai_remediation` to get the score and SLA timeline. Scores: Critical (9-10) = 24-48h fix, High (7-8.9) = 1-2 weeks, Medium (4-6.9) = 30-90 days, Low (0-3.9) = next cycle.
15. **Compliance reports.** After any scan, use `get_compliance_report` to map findings to OWASP LLM Top 10, NIST AI RMF, or EU AI Act. For regulatory audits, use `export_ai_scan_report(format="html")` for a styled report.
16. **Quality gates for CI/CD.** Use `check_ai_quality_gate` to enforce deployment thresholds. If a scan fails the gate, block the deployment and show the violations.
17. **Custom policies for enterprises.** When a user has specific AI policies (no medical advice, no competitor mentions, etc.), use `create_ai_policy` then reference the policy ID in scans.
18. **Scheduled scans for compliance.** NIST requires "regular" risk assessment. Use `create_ai_scan_schedule` with a cron expression for automated recurring scans.
19. **Trend analysis for boards.** Use `get_ai_risk_trend` to show risk improvement over time and `compare_ai_scans` to quantify changes between runs.

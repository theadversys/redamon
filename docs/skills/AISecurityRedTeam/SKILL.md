# AI Security Red Teaming — Promptfoo Integration

## When to Use

Activate this skill when the user asks to:
- Run an AI/LLM security scan, red team test, or adversarial evaluation
- Test an LLM for prompt injection, jailbreaks, PII leaks, or other vulnerabilities
- Check if an AI model or agent is safe for production deployment
- Run OWASP LLM Top 10, MITRE ATLAS, or NIST AI RMF compliance checks
- Compare model safety across providers (OpenAI, Anthropic, etc.)
- Generate adversarial test cases for LLM applications

## How It Works

PandaExploit integrates **Promptfoo** — an open-source LLM evaluation and red teaming framework. Scans generate adversarial prompts using AI, send them to the target LLM, then use AI graders to judge whether the model was exploited. Results are stored in PostgreSQL and Neo4j.

The OPENAI_API_KEY is already configured in the environment. You do NOT need the user to provide API keys.

## Available MCP Tools

All tools are on the **pandaexploit** MCP server.

### start_ai_scan

Start a red team scan. Returns a `scanId` for polling.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `target_url` | string | *required* | LLM endpoint URL |
| `target_type` | string | `"openai"` | `openai`, `anthropic`, or `http` |
| `plugins` | string | profile default | Comma-separated plugin IDs |
| `strategies` | string | profile default | Comma-separated strategy IDs |
| `profile` | string | `"quick"` | Scan preset: quick, owasp, agent-security, full, custom |
| `purpose` | string | none | App description for targeted attacks |
| `num_tests` | int | `5` | Adversarial tests per plugin |
| `name` | string | auto | Scan display name |
| `project_id` | string | none | Associate with a PandaExploit project |

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

---

## Scan Profiles

| Profile | What It Tests | Tests/Plugin | Duration |
|---------|--------------|-------------|----------|
| **quick** | prompt-extraction, pii:direct, hallucination, overreliance | 3 | ~1-2 min |
| **owasp** | Full OWASP LLM Top 10 | 5 | ~5-10 min |
| **agent-security** | tool-discovery, excessive-agency, cross-session-leak, debug-access, rbac, shell/sql injection | 5 | ~5-10 min |
| **full** | All 15 local security + brand plugins | 5 | ~10-20 min |
| **custom** | Exactly what you specify | user-set | varies |

---

## Valid Plugin IDs

These plugins run locally with OPENAI_API_KEY (no Promptfoo cloud needed):

### Security & Access Control
| Plugin ID | What It Tests | Severity |
|-----------|--------------|----------|
| `prompt-extraction` | Attempts to reveal the system prompt | HIGH |
| `sql-injection` | SQL injection through the LLM | CRITICAL |
| `shell-injection` | Shell command execution through the model | CRITICAL |
| `rbac` | Role-Based Access Control bypass | HIGH |
| `pii:direct` | Direct exposure of personal information | HIGH |
| `pii:api-db` | PII leaked through API or database | HIGH |
| `pii:session` | PII exposed in session data | HIGH |
| `pii:social` | PII extracted via social engineering | MEDIUM |
| `debug-access` | Access to debugging commands | HIGH |
| `cross-session-leak` | Data shared between sessions | HIGH |
| `tool-discovery` | Reveals available tools and functions | MEDIUM |
| `divergent-repetition` | Extracts training data via repetition | HIGH |

### Brand & Reliability
| Plugin ID | What It Tests | Severity |
|-----------|--------------|----------|
| `hallucination` | False or fabricated information | MEDIUM |
| `overreliance` | Accepts incorrect user assumptions | MEDIUM |
| `excessive-agency` | Takes actions beyond its mandate | MEDIUM |
| `contracts` | Makes unsupervised commitments | HIGH |
| `imitation` | Impersonates people, brands, organizations | MEDIUM |
| `politics` | Makes political statements | LOW |

### Compliance Frameworks
| Plugin ID | What It Tests |
|-----------|--------------|
| `owasp:llm` | OWASP LLM Top 10 (expands to multiple tests) |
| `owasp:api` | OWASP API Security Top 10 |
| `mitre:atlas` | MITRE ATLAS adversarial ML framework |
| `nist:ai:measure` | NIST AI Risk Management Framework |
| `gdpr` | GDPR data protection compliance |
| `eu:ai-act` | EU AI Act compliance |

### Datasets (Pre-built adversarial test sets)
| Plugin ID | Description |
|-----------|-------------|
| `harmbench` | HarmBench prompt injection dataset |
| `cyberseceval` | Meta CyberSecEval dataset |
| `pliny` | Curated L1B3RT4S jailbreak prompts |
| `donotanswer` | Harmful query refusal dataset |
| `xstest` | Ambiguous homonym handling |
| `aegis` | NVIDIA Aegis safety dataset |
| `toxic-chat` | Toxic user prompts |

### Custom
| Plugin ID | Description |
|-----------|-------------|
| `policy` | Test against a custom policy (provide in purpose field) |
| `intent` | Probe with specific custom inputs |

---

## Valid Strategy IDs

Strategies modify HOW adversarial prompts are delivered:

### Encoding Bypasses (Low cost, 20-30% ASR)
`base64`, `rot13`, `leetspeak`, `hex`, `homoglyph`, `morse-code`

### Static Templates (Low cost, 20-30% ASR)
`jailbreak-templates` — DAN, Skeleton Key, etc.

### Dynamic Single-Turn (Medium-High cost, 40-80% ASR)
`jailbreak:composite`, `jailbreak`, `jailbreak:tree`, `jailbreak:likert`, `citation`, `math-prompt`, `authoritative-markup-injection`, `best-of-n`

### Multi-Turn (High cost, 70-90% ASR)
`crescendo`, `goat`

### Image
`image` — Text embedded in base64 images

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

### 4. Custom Plugin/Strategy Selection

```
1. start_ai_scan(
     target_url="https://api.openai.com/v1/chat/completions",
     target_type="openai",
     profile="custom",
     plugins="prompt-extraction,sql-injection,shell-injection,pii:direct,hallucination",
     strategies="jailbreak:composite,base64,rot13",
     num_tests=3,
     purpose="Code generation assistant"
   )
2. Poll → summary → findings
```

### 5. Test Anthropic Claude

```
1. start_ai_scan(
     target_url="https://api.anthropic.com/v1/messages",
     target_type="anthropic",
     profile="quick"
   )
2. Poll → summary → findings
```

### 6. Test Custom HTTP Endpoint

```
1. start_ai_scan(
     target_url="http://your-service:8100",
     target_type="http",
     profile="quick",
     purpose="RAG-powered customer support bot"
   )
2. Poll → summary → findings
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
10. **For comprehensive testing**, combine multiple strategies: `base64,leetspeak,rot13,jailbreak-templates` gives broad coverage without requiring remote generation.
11. **Avoid `jailbreak:composite`** — it requires PromptFoo cloud remote generation which is disabled. Use `base64`, `leetspeak`, `rot13`, `jailbreak-templates` instead.
12. **Live results in UI.** Agent Zero shares the PromptFoo database with the dashboard. When you run `promptfoo eval`, results appear **live** in the AI Security tab iframe — the user can watch test progress in real time. After the scan completes, tell the user the full red team report is visible in the AI Security tab.
13. **When running `promptfoo eval` directly** (not via MCP tools), you do NOT need `--output` for the results to appear in the UI. The shared `PROMPTFOO_CONFIG_DIR` ensures all eval results are written to the shared database automatically. You may still use `--output` if the user wants a local JSON copy.

````markdown
# GitHub Attack Surface & Secret Scanning Module – Implementation Plan

> **Purpose:** Extend PandaExploit with a first‑class, GitHub‑aware module that discovers secrets, AI/LLM usage, and code‑level risks across repositories; maps them into the attack graph; and exposes rich UI + agent workflows for triage and exploitation (where allowed).

> **Note:** This module is **only for scanning GitHub assets that the user is authorized to test** (their own orgs/repos). Because this deals with real secrets, we must treat storage, access control, and auditability as critical concerns.

---

## 1. Objectives

1. **Discover & classify secrets** across GitHub orgs/repos (including AI/LLM keys).
2. **Detect AI/LLM usage** (even when keys are in env/config), building an “AI attack surface” view.
3. **Integrate findings into Neo4j** as first‑class nodes/relationships linked to projects/domains.
4. **Expose a powerful UI** for browsing, filtering, and prioritizing GitHub findings.
5. **Enable the AI agent** to query and reason over GitHub findings (e.g., leaked keys, AI usage).
6. Provide a **realistic, performant, and configurable** pipeline that fits the existing recon architecture.

---

## 2. High-Level Architecture

1. **Scanner (Recon Stage):**  
   `recon/github_secret_hunt.py` extended to:
   - Scan repos for **secrets**, **high‑entropy values**, **AI/LLM usage**.
   - Output project‑scoped JSON: `recon/output/github_secrets_{project_id}.json`.

2. **Graph Integration (Neo4j):**
   - New `GitHubSecret` nodes and optional `GitHubRepo` / `GitHubOrg` nodes.
   - Relationships to `Project` and optionally to `Domain`.

3. **Webapp API:**
   - `GET /api/github-findings?projectId=...` for listing/filtering findings.
   - `GET /api/github-stats?projectId=...` for summary/insights cards.

4. **Webapp UI:**
   - New `/secrets` page:
     - **Secrets table**, **AI attack surface insights**, **trend charts**.
   - Links from:
     - Graph map (nodes related to GitHub).
     - Vulnerabilities page (quick jump to secrets).

5. **Agent Integration:**
   - Tools to:
     - Query GitHub findings for a project.
     - Summarize risk (e.g., “show me leaked cloud keys”).
     - Propose remediation steps.

---

## 3. Scanner: GitHub Secret & AI Usage Hunting

### 3.1. Inputs & Configuration

**Config fields (in `recon/project_settings.py`):**

- `GITHUB_TARGET_ORG: string` – required for org‑wide scans.
- `GITHUB_REPO_ALLOWLIST: string[]` – optional; subset of repos to scan.
- `GITHUB_INCLUDE_FORKS: boolean` – default `false`.
- `GITHUB_SCAN_SECRETS: boolean` – default `true`.
- `GITHUB_SCAN_HIGH_ENTROPY: boolean` – default `true`.
- `GITHUB_SCAN_AI_LLM_KEYS: boolean` – default `true`.
- `GITHUB_SCAN_AI_LLM_USAGE: boolean` – default `true`.
- `GITHUB_MAX_FILES_PER_REPO: number` – sane default (e.g., 10k).
- `GITHUB_MAX_FILE_SIZE_BYTES: number` – e.g., 1–2 MB.
- `GITHUB_API_TOKEN: string` – passed via env; not stored in project DB.

**UI toggles (in `GithubSection.tsx`):**

- “Scan for secrets”
- “Scan for high‑entropy candidates”
- “Scan for AI/LLM API keys”
- “Scan for AI/LLM usage (code patterns)”
- “Include forks”
- “Max files per repo”, “Max file size”

---

### 3.2. Secret Pattern Detection (Phase 1.1)

Extend `recon/github_secret_hunt.py`:

- Existing: AWS, Azure, GCP, Stripe, GitHub, DB strings, etc.
- **New AI/LLM key patterns** to add to `SECRET_PATTERNS`, e.g.:

  - OpenAI legacy: `sk-[a-zA-Z0-9]{48}`
  - OpenAI project: `sk-proj-[a-zA-Z0-9-_]{64,}`
  - Anthropic: `sk-ant-[a-zA-Z0-9-]{95}`
  - HuggingFace: `hf_[a-zA-Z0-9]{34}`
  - Cohere: `[a-f0-9]{40}` with nearby `cohere` context
  - Groq: `gsk_[a-zA-Z0-9]{32}`
  - Replicate: `r8_[a-zA-Z0-9]{32,}`
  - Together AI: `[a-f0-9]{64}` with `together` context
  - DeepSeek / Google AI / others: patterns derived from public docs / GitGuardian‑style references.

**File types to scan for secrets:**

- All text files except:
  - `node_modules/`, `.git/`, `dist/`, `build/`, `.venv/`, `vendor/`, `coverage/`, etc.
- Enforce size and file count limits from config.

---

### 3.3. AI/LLM Usage Detection (Phase 1.2)

Add a separate pass (e.g., `scan_ai_usage(file_content, path)`) that detects AI usage even without keys.

**Signals:**

- Imports:
  - `import openai`, `from openai import ...`
  - `import anthropic`, `from anthropic import ...`
  - `import langchain`, `from llama_index import`, `from langgraph import`
- Client usage:
  - `OpenAI(`, `ChatOpenAI(`, `Anthropic(`, `Claude(`, `AgentExecutor(`, `@llm_chain`, etc.
- Env variables:
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HUGGINGFACE_TOKEN`, `COHERE_API_KEY`, etc.
- Config keys in YAML/JSON:
  - `openai_api_key`, `anthropic_api_key`, etc.

**File extensions to scan:**

- `.py`, `.js`, `.ts`, `.tsx`, `.go`, `.rb`, `.java`, `.cs`, `.php`
- `.yaml`, `.yml`, `.json`, `.env*`, `.config.*`

**Output classification:**

- `finding_type = "AI_LLM_USAGE"`
- `provider` (best effort: `openai`, `anthropic`, `huggingface`, etc.)
- `severity`:
  - `info` if no key detected.
  - `high` if usage + key are present in same file.

---

### 3.4. Output Format (Project-Scoped)

Change hunter output from org‑scoped to **project‑scoped**:

- `recon/output/github_secrets_{project_id}.json`

Example structure:

```json
{
  "project_id": "proj_123",
  "user_id": "user_456",
  "target_org": "acme-corp",
  "scanned_at": "2025-02-12T10:00:00Z",
  "findings": [
    {
      "type": "SECRET",
      "secret_type": "OpenAI API Key",
      "provider": "openai",
      "severity": "critical",
      "repository": "acme-corp/payments-service",
      "path": "src/config.py",
      "line": 42,
      "secret_value": "sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "commit_sha": "abc123...",
      "source": "github",
      "finding_timestamp": "2025-02-12T09:59:00Z"
    },
    {
      "type": "AI_LLM_USAGE",
      "provider": "openai",
      "severity": "info",
      "repository": "acme-corp/chat-ui",
      "path": "pages/api/chat.ts",
      "line": 10,
      "pattern": "import OpenAI from 'openai'",
      "secret_value": null,
      "source": "github",
      "finding_timestamp": "2025-02-12T09:58:00Z"
    }
  ]
}
````

> **Note:** As requested, this plan includes the **full `secret_value`** in storage and UI. When implementing, you may still want to consider optional encryption at rest and strict RBAC.

***

## 4. Graph Integration (Neo4j)

### 4.1. Node & Relationship Schema

Extend `graph_db/readmes/GRAPH.SCHEMA.md`:

#### 4.1.1. GitHubSecret Node

```cypher
(:GitHubSecret {
  id: string,                // deterministic: hash(project_id + repository + path + type + line + secret_value?)
  user_id: string,
  project_id: string,

  repository: string,        // "org/repo"
  path: string,              // "src/config.py"
  line: integer,

  secret_type: string,       // "OpenAI API Key", "AWS Access Key ID", etc.
  finding_type: string,      // "SECRET" | "HIGH_ENTROPY" | "AI_LLM_USAGE"
  provider: string,          // "openai", "aws", "stripe", "huggingface", etc.
  severity: string,          // critical | high | medium | low | info

  secret_value: string,      // full value
  pattern: string,           // regex or rule name (for usage findings)
  commit_sha: string,
  source: string,            // "github"
  scan_timestamp: datetime
})
```

#### 4.1.2. Optional: GitHubOrg & GitHubRepo Nodes (v1 or v2)

```cypher
(:GitHubOrg { name: string })          // "acme-corp"
(:GitHubRepo { full_name: string })    // "acme-corp/payments-service"
```

Relationships:

*   `(org:GitHubOrg)-[:OWNS_REPO]->(repo:GitHubRepo)`
*   `(repo:GitHubRepo)-[:HAS_SECRET]->(gs:GitHubSecret)`
*   `(p:Project)-[:HAS_GITHUB_REPO]->(repo:GitHubRepo)`
*   `(p:Project)-[:HAS_GITHUB_SECRET]->(gs:GitHubSecret)` (for direct filtering)
*   `(d:Domain)-[:HAS_GITHUB_ORG]->(org:GitHubOrg)` (optional, based on correlation from `TARGET_DOMAIN`)

For v1, the minimal must‑have relationship is:

```cypher
(Project)-[:HAS_GITHUB_SECRET]->(GitHubSecret)
```

***

### 4.2. Constraints & Indexes

In `graph_db/neo4j_client.py`:

```cypher
CREATE CONSTRAINT github_secret_unique IF NOT EXISTS
FOR (g:GitHubSecret)
REQUIRE g.id IS UNIQUE;

CREATE INDEX idx_github_secret_tenant IF NOT EXISTS
FOR (g:GitHubSecret)
ON (g.user_id, g.project_id, g.repository);
```

***

### 4.3. update\_graph\_from\_github

Add a new function to `graph_db/neo4j_client.py`:

*   `update_graph_from_github(project_id: str, user_id: str, github_json_path: str)`

Responsibilities:

1.  Load `github_secrets_{project_id}.json`.

2.  For each `finding`:
    *   Compute deterministic `id` (e.g., hash of project\_id + repository + path + type + line + secret\_value).
    *   `MERGE (g:GitHubSecret {id: $id})` and set properties.

3.  Link to project:

    ```cypher
    MATCH (p:Project {id: $project_id, user_id: $user_id})
    MERGE (p)-[:HAS_GITHUB_SECRET]->(g)
    ```

4.  Optionally create / link `GitHubOrg`, `GitHubRepo` nodes.

***

### 4.4. Wiring into JSON Update Pipeline

In `graph_db/update_graph_from_json.py`:

*   Add to `UPDATE_FUNCTION_MAP`:

    ```python
    UPDATE_FUNCTION_MAP = {
        # ...
        "github": neo4j_client.update_graph_from_github,
    }
    ```

*   Add `"github"` to `UPDATE_ORDER` after vuln scanning but before GVM (or wherever appropriate):

    ```python
    UPDATE_ORDER = ["recon", "vuln_scan", "github", "gvm_scan", ...]
    ```

In `recon/main.py`:

*   After GitHub scan (if enabled and `UPDATE_GRAPH_DB` is true), call the JSON update pipeline for `"github"`.

***

## 5. Webapp API

### 5.1. List Findings

New route: `webapp/src/app/api/github-findings/route.ts`

**Endpoint:**

```http
GET /api/github-findings?projectId=...&findingType=...&secretType=...&severity=...
```

**Behavior:**

1.  Validate:
    *   User is authenticated.
    *   Project exists and belongs to user (or user is member).

2.  Query Neo4j:

    ```cypher
    MATCH (p:Project {id: $projectId, user_id: $userId})-[:HAS_GITHUB_SECRET]->(g:GitHubSecret)
    WHERE
      ($findingType IS NULL OR g.finding_type = $findingType) AND
      ($secretType IS NULL OR g.secret_type = $secretType) AND
      ($severity IS NULL OR g.severity = $severity)
    RETURN g
    ORDER BY g.scan_timestamp DESC, g.severity DESC
    ```

3.  Return JSON:

```json
{
  "findings": [
    {
      "id": "ghsec_...",
      "repository": "acme-corp/payments-service",
      "path": "src/config.py",
      "line": 42,
      "secretType": "OpenAI API Key",
      "findingType": "SECRET",
      "provider": "openai",
      "severity": "critical",
      "secretValue": "sk-proj-XXXXXXXXXXXXXXXXXXXXXXXX",
      "commitSha": "abc123...",
      "scanTimestamp": "2025-02-12T10:00:00Z"
    }
  ]
}
```

***

### 5.2. Stats & Insights API

New route: `webapp/src/app/api/github-stats/route.ts`

```http
GET /api/github-stats?projectId=...
```

Return aggregates:

```json
{
  "totalFindings": 42,
  "bySeverity": {
    "critical": 3,
    "high": 8,
    "medium": 10,
    "low": 12,
    "info": 9
  },
  "bySecretType": {
    "OpenAI API Key": 4,
    "AWS Access Key": 5,
    "DB Connection String": 3,
    "Other": 30
  },
  "aiLlmUsageCount": 12,
  "aiLlmSecretsCount": 5,
  "reposWithAiUsage": 7
}
```

***

## 6. Webapp UI – Secrets & AI Attack Surface

### 6.1. New Page: `/secrets`

File: `webapp/src/app/secrets/page.tsx`

**Layout:**

1.  **Header:**
    *   Project selector.
    *   Short description: “GitHub Secrets & AI Attack Surface”.

2.  **Stats row (cards):**
    *   Total findings.
    *   Critical secrets.
    *   AI/LLM usage (repos & files).
    *   Secrets related to AI/LLM providers (OpenAI, Anthropic, etc.).

3.  **Filters bar:**
    *   Severity dropdown.
    *   Finding type: `SECRET`, `HIGH_ENTROPY`, `AI_LLM_USAGE`.
    *   Secret type dropdown.
    *   Provider dropdown.
    *   Text search (repo/path).

4.  **Findings table:**
    *   Columns:
        *   Severity (badge)
        *   Finding type
        *   Secret type
        *   Provider
        *   Repository
        *   Path:Line
        *   Secret value (full value, truncated in cell but expandable)
        *   Commit (link to GitHub)
        *   Scan timestamp
    *   Row click → detail drawer.

5.  **Detail drawer (FindingDetailsDrawer.tsx):**
    *   Full context:
        *   Repo, path, line, snippet (show 10–20 lines around).
        *   Full `secretValue`.
        *   Commit SHA + GitHub links.
        *   AI usage context (if `finding_type == "AI_LLM_USAGE"`).
    *   One-click actions:
        *   “Copy secret value”.
        *   “Copy GitHub URL”.
        *   “Copy remediation snippet” (e.g., instructions to revoke/rotate).

6.  **AI/LLM Insights panel:**
    *   Charts:
        *   “Repos using AI/LLM libs”.
        *   “AI‑related secrets by provider”.
    *   Textual insights:
        *   “Top 3 AI‑exposed repos”.
        *   “Most common AI key types”.

***

### 6.2. Integration Points

*   **Graph Page:**
    *   When clicking a `GitHubSecret` node (if rendered), show:
        *   Key properties.
        *   Button: “Open in Secrets view” → deep link to `/secrets?projectId=...&id=...`.
*   **Vulnerabilities Page:**
    *   Add a link or tab:
        *   “Secrets & GitHub Findings” that navigates to `/secrets` with the current project preselected.

***

## 7. Agent Integration

### 7.1. New Agent Tools

In `agentic`:

1.  `get_github_findings(project_id, filters)`
    *   Calls `/api/github-findings`.
2.  `get_github_stats(project_id)`
    *   Calls `/api/github-stats`.

### 7.2. Example Agent Behaviors

*   “Show me the most critical GitHub secrets for this project.”
*   “List AI/LLM providers used in our repos and where keys were found.”
*   “Suggest remediation steps for leaked OpenAI keys.”
*   “Which GitHub secrets could help pivot into cloud infrastructure for this domain?”

Agent should:

*   Use the values to:
    *   Explain risk.
    *   Propose remediation.
    *   Optionally suggest exploitation steps where explicitly allowed in Rules of Engagement.

***

## 8. Implementation Order (for Cursor)

1.  **Scanner (Phase 1)**
    *   Extend `recon/github_secret_hunt.py`:
        *   Add AI/LLM secret patterns.
        *   Implement AI/LLM usage detection.
        *   Implement project‑scoped JSON output (`github_secrets_{project_id}.json`).

2.  **Project config & UI toggles**
    *   Update `recon/project_settings.py`.
    *   Update `GithubSection.tsx` to expose toggles & inputs.

3.  **Graph Integration (Phase 2)**
    *   Add `GitHubSecret` node schema to `GRAPH.SCHEMA.md`.
    *   Implement `update_graph_from_github` in `graph_db/neo4j_client.py`.
    *   Register “github” in `graph_db/update_graph_from_json.py` and call from `recon/main.py`.

4.  **API Layer (Phase 3)**
    *   `webapp/src/app/api/github-findings/route.ts`
    *   `webapp/src/app/api/github-stats/route.ts`
    *   Ensure proper auth + project ownership checks.

5.  **UI (Phase 3)**
    *   Create `/secrets/page.tsx` with:
        *   Stats cards.
        *   Filters.
        *   Table + details drawer.
    *   Wire Graph and Vulnerabilities pages to link into `/secrets`.

6.  **Agent Integration (Phase 4)**
    *   Add tools to agent backend.
    *   Update prompts/skills to leverage the new GitHub insights.

7.  **Polish & Tests**
    *   Unit tests for:
        *   Pattern detection (AI keys, usage).
        *   Graph update logic.
        *   API filters.
    *   UI smoke tests for `/secrets`.

***

## 9. Acceptance Criteria

*   Running a GitHub scan for a project produces `recon/output/github_secrets_{project_id}.json` with secrets and AI usage findings.
*   After graph update, Neo4j contains:
    *   `(:GitHubSecret)` nodes with correct `project_id`, `user_id`, `repository`, `path`, `finding_type`, `secret_value`, etc.
    *   `(Project)-[:HAS_GITHUB_SECRET]->(GitHubSecret)` relationships.
*   `/api/github-findings?projectId=...` returns a filtered list of findings for the current user’s project.
*   `/secrets` page:
    *   Shows stats, filters, and a table of findings.
    *   Clicking a row opens a detail view with full secret value and context.
*   From Graph and Vulnerabilities views:
    *   Users can navigate into `/secrets` for the same project.
*   Agent can summarize GitHub findings and AI attack surface for a project using the new tools.

***

```
```
UI

Love this question. This GitHub module is a huge “wow” moment if the UX is done right. Let me describe it as if you’re walking through it in the app so you and Cursor have a clear mental model.

I’ll break it down into:

1.  **Where users see GitHub in the product (entry points)**
2.  **Main `/secrets` page layout & interactions**
3.  **Finding details UX (how a single secret looks/feels)**
4.  **Project configuration & scan controls**
5.  **Graph & Vulnerabilities integration**
6.  **Agent/Chat UX around GitHub**
7.  **Responsive / power-user touches**

***

## 1. Entry Points – Where GitHub Shows Up

Security engineers should *naturally* stumble into this feature from several places:

*   **Top navigation:**
    *   New item: **“Secrets”** (or “GitHub Secrets”) next to *Vulnerabilities* and *MITRE ATT\&CK*.
    *   It opens `/secrets` scoped to the currently selected project.

*   **Projects → GitHub section (config):**
    *   When editing/creating a project, a **“GitHub”** section lets you configure:
        *   `GITHUB_TARGET_ORG`
        *   Repo allowlist
        *   Toggles for *Secrets*, *High entropy*, *AI keys*, *AI usage*
    *   Inline status: last scan timestamp, # of secrets found.

*   **Graph Map:**
    *   If the graph has `GitHubSecret` or `GitHubRepo` nodes:
        *   Clicking one opens a node drawer with a **“View in Secrets”** link to `/secrets` filtered to that repo/secret.

*   **Vulnerabilities page:**
    *   A subtle link or secondary tab:
        *   “GitHub Secrets & AI Attack Surface →”
        *   Navigates to `/secrets` with the same project selected.

***

## 2. Main `/secrets` Page – Layout & Flow

Think of this as a **GitHub attack surface control center** for a project.

### 2.1 Layout

**Top Header (same dark theme as rest of app)**

*   Left:
    *   Title: **“GitHub Secrets & AI Attack Surface”**
    *   Subtitle (small, muted text):
        > “Secrets, AI usage, and high-entropy candidates discovered in your GitHub org for this project.”

*   Right:
    *   Project selector (if not global elsewhere).
    *   `Last scan: <timestamp>` + a status chip (`Completed`, `Running`, `Failed`).
    *   **“Run GitHub Scan”** button (green, same style as Recon button).

***

### 2.2 Stats Row (Cards)

A row of 3–4 compact cards:

*   **Total Secrets**
    *   Big number, small label.
*   **Critical & High**
    *   “3 Critical / 8 High”
*   **AI/LLM Secrets**
    *   Count of findings where `provider` in (`openai`, `anthropic`, `huggingface`, etc.).
*   **AI Usage (No Keys)**
    *   e.g., `12 files in 7 repos`.

Hovering a card shows a small tooltip: “Click to filter table by this category.”  
Clicking a card applies filters and scrolls to the table.

***

### 2.3 Filters Bar

Just under the cards:

*   **Severity** dropdown:
    *   All, Critical, High, Medium, Low, Info
*   **Finding Type** dropdown:
    *   All, `SECRET`, `HIGH_ENTROPY`, `AI_LLM_USAGE`
*   **Secret Type** dropdown:
    *   e.g., AWS Access Key, OpenAI API Key, DB Connection String, etc.
*   **Provider** dropdown:
    *   openai, aws, stripe, github, huggingface, etc.
*   **Repo search** textbox:
    *   Placeholder: `Filter by repo or path...`

Filters update the table below in real time (no page reload).

***

### 2.4 Findings Table

This is the workhorse.

**Columns (configurable but roughly):**

1.  **Severity**
    *   Colored badge: red (critical), orange (high), yellow (medium), etc.
2.  **Finding Type**
    *   `SECRET`, `HIGH_ENTROPY`, `AI_LLM_USAGE`.
3.  **Secret Type**
    *   “OpenAI API Key”, “AWS Access Key”, “DB Connection String”, “Unknown High-Entropy String”, etc.
4.  **Provider**
    *   `openai`, `aws`, `stripe`, `github`, …
5.  **Repo**
    *   `acme-corp/payments-service`.
    *   Click opens GitHub repo in a new tab.
6.  **Path:Line**
    *   `src/config.py:42`
    *   Click = open GitHub blob/line.
7.  **Secret Value**
    *   Shows full value, but truncated in the cell for readability:
        *   e.g., `sk-proj-abc123...xyz789`
    *   On hover or expand, full value is visible.
8.  **Commit**
    *   Short SHA, e.g., `abc1234`
    *   Click opens the commit diff in GitHub.
9.  **Scanned**
    *   Relative time `2h ago` with tooltip for full datetime.

**Row interaction:**

*   Click anywhere on a row → opens the **Finding Details Drawer** from the right.
*   Small action icons in row:
    *   Copy secret
    *   Copy GitHub URL
    *   Copy “rotate/revoke” snippet (optional)

***

## 3. Finding Details UX (Drawer)

When a user clicks a row, a **right-side drawer** slides in (same style as your Graph node / Evidence drawer).

### 3.1 Header

*   Title: `<Secret Type> in <repo>`  
    (e.g., `OpenAI API Key in acme-corp/chat-api`)
*   Subline: `<path>:<line> • <severity badge> • <finding_type badge>`

### 3.2 Body Sections

1.  **Key Metadata**

    *   Severity badge (“Critical” in red, etc.).
    *   Finding type (`SECRET` / `AI_LLM_USAGE`).
    *   Provider (“OpenAI”, “AWS”).
    *   Repo + path + line (with GitHub icons/links).
    *   Commit SHA + link to commit.

2.  **Secret Value (Full)**

    *   Big monospace field:
        *   Full `secret_value` visible.
    *   Copy button:
        *   Simple icon and tooltip: “Copy to clipboard”.

3.  **Source Code Snippet**

    *   Show \~10–20 lines around the finding from GitHub API (optional on v1 or mocked from stored content).
    *   Highlight the exact line where secret was found.

4.  **AI Context (for AI\_LLM\_USAGE)**

    *   Small box: “AI usage detected in this file”
    *   Fields:
        *   Provider: `openai`
        *   Pattern: `import OpenAI from 'openai'`
        *   Severity: info/high
    *   If both AI usage + key, call that out visually:  
        “AI client + key found in same file (high risk).”

5.  **Actions**

    *   `Open in GitHub (file)`
    *   `Open commit`
    *   `Copy secret value`
    *   (Future) `Mark as resolved/ignored`

***

## 4. Project Configuration & Scan Controls (GitHub Section)

On the **Project Form → GitHub section**:

### 4.1 Layout

*   Simple card with:
    *   Title: “GitHub Scan Settings”
    *   `GITHUB_TARGET_ORG` text input
    *   `GITHUB_REPO_ALLOWLIST` tags input (comma-separated)
    *   Toggles:
        *   “Scan for secrets”
        *   “Scan for high‑entropy values”
        *   “Scan for AI/LLM API keys”
        *   “Scan for AI/LLM usage”
        *   “Include forks”
    *   Numeric inputs:
        *   “Max files per repo”
        *   “Max file size (KB)”

### 4.2 Status

*   Mini status block at the bottom:
    *   `Last GitHub scan: <timestamp or "Never">`
    *   `Total findings: X (Critical: Y, High: Z)`
    *   Link: “View details →” goes to `/secrets` page.

This lets PMs / engineers quickly see if GitHub scanning is active per project.

***

## 5. Graph & Vulnerabilities Integration

### 5.1 Graph

If you choose to visualize `GitHubSecret` or `GitHubRepo` nodes:

*   **Node appearance:**
    *   `GitHubOrg` – octocat-like icon or org icon.
    *   `GitHubRepo` – folder/repo icon.
    *   `GitHubSecret` – small key/lock icon, colored by severity.

*   **Node Drawer content for GitHubSecret:**
    *   Very similar to the findings row:
        *   Secret type, provider, severity.
        *   Repo + path.
        *   Button: **“Open in Secrets View”** (deep link to `/secrets?id=<ghsec_id>`).

### 5.2 Vulnerabilities Page

*   On `/vulnerabilities`, a small banner at the top could say:

    > “This project has **X GitHub secrets** and **Y AI usage findings**. View →”

*   Clicking goes to `/secrets`.

This keeps secrets in the mental model of “vulnerabilities” without mixing them into the main vuln table.

***

## 6. Agent / Chat UX Around GitHub

On the **Graph page with AI assistant open**, you’ll get a really nice workflow:

### 6.1 New Chat Intents

Examples the agent can answer via the new APIs:

*   “List the top 5 most critical GitHub secrets for this project.”
*   “Show me AI/LLM providers used in our repos and which have leaked keys.”
*   “Is there any OpenAI key exposed for this project?”
*   “What’s the riskiest repo from a secrets standpoint?”

### 6.2 Output Style

*   The agent responds with:
    *   Short **summary** sentence.
    *   A **table** of top secrets:
        *   Repo | Secret type | Severity | Provider | Link to `/secrets` detail.
    *   A **call to action**:
        *   “You can view and manage all GitHub findings in the **Secrets** tab.”

*   When referencing a specific secret, agent messages can include clickable links that:
    *   Open `/secrets` pre-filtered to that `GitHubSecret.id`.

***

## 7. Responsive & Power-User Details

### 7.1 Desktop

*   The `/secrets` page shines on desktop:
    *   Full-width table.
    *   Detail drawer on the right, not overlapping filters or header.
*   Shortcuts:
    *   Filter persistence per project (remember last filter state).
    *   Column sorting (click on Severity, Repo, SecretType headers).

### 7.2 Smaller Screens

*   For smaller viewports:
    *   Table can collapse into **cards** with key info:
        *   Severity, SecretType, Repo, Path.
    *   Tapping opens the detail drawer.
*   Some heavy charts in AI/LLM insights can be hidden or minimized on mobile.

***

### TL;DR UX Concept

*   **One new primary surface:** `/secrets` that feels like a GitHub-specific vuln dashboard.
*   **Seamless entry from Graph, Vulns, and Project settings.**
*   **Rich, detail-first experience for each secret** (full value, code context, links to GitHub).
*   **Agent + stats layer on top** to elevate it from “just another table” to an **AI-aware attack surface module**.

If you’d like, I can next turn this UX description into a **component-level checklist** for Cursor (e.g., exact React components/files to create or modify, prop contracts, and example JSON responses) so the implementation stays consistent with this vision.

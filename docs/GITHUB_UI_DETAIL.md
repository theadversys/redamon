# GitHub Secrets UI – Detailed Specification

This document describes how the GitHub Secrets UI works, how it looks, and what is implemented for production readiness.

---

## 0. Getting Started (End User)

To get GitHub findings:

1. **Project Settings → Integrations** → Configure **GitHub Access Token** (PAT with `repo` scope) and **Target Organization** (e.g. `Adversys`).
2. **Project Settings → Target & Modules** → Enable **GitHub Secrets & AI Attack Surface** in Scan Modules.
3. **Save** the project.
4. **Start Recon** from the project page. The GitHub scan runs when you start a scan (with domain or GitHub-only mode).

Results appear in **Secrets** (top nav) and in the Integrations section as "View findings".

---

## 1. Overview

The GitHub module exposes a **Secrets** view for browsing leaked secrets, AI/LLM keys, high-entropy candidates, and AI usage patterns discovered in GitHub repositories. It integrates with the project config, graph map, and vulnerabilities page.

---

## 2. Entry Points

### 2.1 Top Navigation

| Item | Status | Location | Behavior |
|------|--------|----------|----------|
| **Secrets** | ✅ Done | `NavigationBar.tsx` | Link with Key icon to `/secrets`. Renders next to Vulnerabilities, MITRE ATT&CK. Uses project from `ProjectProvider` (header dropdown). |

### 2.2 Project Config

| Item | Status | Location | Behavior |
|------|--------|----------|----------|
| **Scan Modules: GitHub** | ✅ Done | `ScanModulesSection.tsx` | "GitHub Secrets & AI Attack Surface" toggle in Target & Modules. Independent module (no parent). |
| **GithubSection** | ✅ Done | `GithubSection.tsx` (Integrations tab) | Token, Target Org, allowlist, scan toggles. |
| **Status block** | ✅ Done | Same | Last scan timestamp, total findings, Critical/High count. |
| **View findings link** | ✅ Done | Same | Link to `/secrets?project={projectId}`. |
| **Config hints** | ✅ Done | `ProjectForm`, `ScanModulesSection`, `GithubSection` | Banner when GitHub enabled but not configured; tip when configured but module disabled. |

### 2.3 Graph Map

| Item | Status | Location | Behavior |
|------|--------|----------|----------|
| **GitHubSecret node drawer** | ✅ Done | `NodeDrawer.tsx` | "View in Secrets" button → `/secrets?project=...&id=...`. |

### 2.4 Vulnerabilities Page

| Item | Status | Location | Behavior |
|------|--------|----------|----------|
| **Secrets link** | ✅ Done | `vulnerabilities/page.tsx` | "GitHub Secrets & AI Attack Surface →" link to `/secrets?project=...`. |

---

## 3. Main `/secrets` Page

### 3.1 Layout & Structure

**File:** `webapp/src/app/secrets/page.tsx`  
**Styles:** `webapp/src/app/secrets/page.module.css`

```
┌─────────────────────────────────────────────────────────────────┐
│  [Key] GitHub Secrets & AI Attack Surface          [badge: N]    │
│  Secrets, AI usage, and high-entropy candidates discovered...    │
├─────────────────────────────────────────────────────────────────┤
│  [Total Secrets] [Critical & High] [AI/LLM] [AI Usage]           │  ← Stats row
├─────────────────────────────────────────────────────────────────┤
│  [Filter] [Severity ▼] [Type ▼] [Filter by repo or path...]       │  ← Filters
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Table: Severity | Type | Secret Type | Provider | Repo | ...]   │
│  ...                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Header Section

| Element | Status | Details |
|---------|--------|---------|
| **Title** | ✅ Done | "GitHub Secrets & AI Attack Surface" with Key icon |
| **Badge** | ✅ Done | Total findings count in accent-colored pill |
| **Subtitle** | ✅ Done | "Secrets, AI usage, and high-entropy candidates discovered in your GitHub org for this project." |
| **Project selector** | ✅ Done | Uses global header dropdown (ProjectProvider). Page shows "No Project Selected" when none selected. |
| **Last scan timestamp** | ❌ Not on page | Shown in GithubSection only. Plan: show in header with status chip (Completed/Running/Failed). |
| **Run GitHub Scan button** | ❌ Not done | Plan: green button to trigger scan. Currently scan is started via Recon (add "github" to scan modules). |

### 3.3 Stats Row (Cards)

| Card | Status | Clickable | Behavior |
|------|--------|-----------|----------|
| **Total Secrets** | ✅ Done | Yes | Bug: click currently filters to critical only; should clear filters or show all. |
| **Critical & High** | ✅ Done | Yes | Bug: click sets severity to `critical` only (API supports single severity); should filter to both critical and high. |
| **AI/LLM Secrets** | ✅ Done | No | Shows count. Plan: click to filter by AI provider. |
| **AI Usage (no keys)** | ✅ Done | No | Shows "X in Y repos". Plan: click to filter by AI_LLM_USAGE. |

**Appearance:** Cards use `var(--bg-primary)`, colored borders (critical=red, high=orange), `statLabel` + `statValue`. Responsive flex wrap.

### 3.4 Filters Bar

| Filter | Status | Options / Behavior |
|--------|--------|-------------------|
| **Severity** | ✅ Done | All, Critical, High, Medium, Low, Info |
| **Finding Type** | ✅ Done | All, SECRET, HIGH_ENTROPY, SENSITIVE_FILE, AI_LLM_USAGE |
| **Repo/Path search** | ✅ Done | Text input, substring match |
| **Secret Type** | ❌ Not done | Plan: dropdown (e.g. OpenAI API Key, AWS Access Key ID) — values from `bySecretType` |
| **Provider** | ❌ Not done | Plan: dropdown (openai, anthropic, huggingface, etc.) — values from `byProvider` |

Filters update the table in real time (no page reload). API called with `limit=200`, `offset=0`.

### 3.5 Findings Table

| Column | Status | Content |
|--------|--------|---------|
| **Severity** | ✅ Done | Colored badge (critical=red, high=orange, medium=yellow, low=blue, info=gray) |
| **Type** | ✅ Done | findingType (SECRET, HIGH_ENTROPY, etc.) |
| **Secret Type** | ✅ Done | e.g. "OpenAI API Key" |
| **Provider** | ✅ Done | openai, anthropic, etc. or "-" |
| **Repository** | ✅ Done | Link to `https://github.com/{repo}` with ExternalLink icon |
| **Path:Line** | ✅ Done | Link to GitHub blob at line |
| **Secret Value** | ✅ Done | Truncated to 30 chars + "..." (API returns masked value) |
| **Commit** | ✅ Done | Short SHA link to commit, or "-" |
| **Scanned** | ❌ Not done | Plan: relative time ("2h ago") with tooltip for full datetime |

**Row interaction:** Click opens detail drawer. Links use `stopPropagation` so they don’t open the drawer.

### 3.6 Detail Drawer

| Element | Status | Details |
|---------|--------|---------|
| **Trigger** | ✅ Done | Click any table row |
| **Title** | ✅ Done | "{secretType} in {repository}" |
| **Location** | ✅ Done | Repository + Path links to GitHub |
| **Details** | ✅ Done | Severity badge, Type, Provider |
| **Secret Value** | ✅ Done | Full value + "Copy to clipboard" button |
| **Scanned** | ✅ Done | Raw `scanTimestamp` if present |
| **Copy secret** | ✅ Done | Button in drawer |
| **Copy GitHub URL** | ❌ Not in row | Plan: icon in table row. Drawer has links but no dedicated "Copy URL" button. |

### 3.7 Empty & Error States

| State | Status | Message |
|-------|--------|---------|
| **No project** | ✅ Done | "No Project Selected" + select from dropdown |
| **Loading** | ✅ Done | "Loading GitHub findings..." |
| **Error** | ✅ Done | "Error: {message}" (handles 401, 403, 429) |
| **No findings** | ✅ Done | "No GitHub Findings" — if lastScan set: "No findings match your filters"; else: "Run a GitHub secret scan..." + config hint |

### 3.8 Deep Links

| URL | Status | Behavior |
|-----|--------|----------|
| `/secrets?project={id}` | ✅ Done | Uses project from URL; syncs with ProjectProvider |
| `/secrets?project={id}&id={findingId}` | ✅ Done | Opens drawer for that finding when loaded |

### 3.9 Polling

- Findings and stats fetched every 15 seconds when `projectId` is set.
- Fetch uses `limit=200`, `offset=0`. Pagination UI (load more, page info) is not implemented.

---

## 4. Project Config (GithubSection)

### 4.1 Fields

| Field | Status | Type |
|-------|--------|------|
| GitHub Access Token | ✅ Done | Password input |
| Test connection | ✅ Done | Button, shows @login or error |
| Target Organization | ✅ Done | Text input |
| Repo Allowlist | ✅ Done | Comma-separated input |
| Include Forks | ✅ Done | Toggle |
| Scan Member Repos | ✅ Done | Toggle |
| Scan Gists | ✅ Done | Toggle |
| Scan Commits | ✅ Done | Toggle |
| Max Commits | ✅ Done | Number (when Scan Commits on) |
| Scan for Secrets | ✅ Done | Toggle |
| Scan for High-Entropy | ✅ Done | Toggle |
| Scan for AI/LLM Keys | ✅ Done | Toggle |
| Scan for AI/LLM Usage | ✅ Done | Toggle |
| Max Files per Repo | ✅ Done | Number |
| Max File Size | ✅ Done | Number (bytes) |
| Output as JSON | ✅ Done | Toggle |
| Status (last scan, findings) | ✅ Done | Text + "View findings" link |

---

## 5. Visual Design

- **Theme:** Uses CSS variables (`--bg-primary`, `--text-primary`, `--accent-primary`, `--border-color`, etc.) for light/dark.
- **Severity colors:** critical=#ef4444, high=#f97316, medium=#eab308, low=#3b82f6, info=#6b7280.
- **Typography:** Standard app sizing (`--text-xl`, `--text-sm`, etc.).
- **Spacing:** `var(--space-*)`, `var(--radius-*)`.
- **Icons:** Lucide (Key, AlertTriangle, Filter, Github, ExternalLink, etc.).

---

## 6. Data Flow

```
ProjectProvider (projectId, userId)
       │
       ▼
/secrets page
       │
       ├──► GET /api/github-findings?projectId=...&severity=...&findingType=...&repo=...&limit=200&offset=0
       │         → { findings, pageInfo }
       │
       └──► GET /api/github-stats?projectId=...
                 → { totalFindings, lastScan, bySeverity, bySecretType, byFindingType, byProvider, aiLlmSecretsCount, aiLlmUsageCount, reposWithAiUsage }
```

- Both APIs use auth (Bearer or same-origin), project access check, rate limiting, and audit.
- `secretValue` is masked in API responses (`first4***...***last4`).

---

## 7. Production Readiness Checklist

### 7.1 Must-have (Not Done)

| Item | Effort | Description |
|------|--------|-------------|
| **Secret Type filter** | Low | Dropdown populated from `bySecretType` in stats |
| **Provider filter** | Low | Dropdown from `byProvider` |
| **Fix Total Secrets card** | Low | Card filters to critical only; should clear filters (show all) when clicked |
| **Fix Critical & High card** | Low | Currently filters to critical only; need API/UI support for "critical OR high" |
| **Vulnerabilities → Secrets link** | Low | Add "GitHub Secrets & AI Attack Surface →" link/tab |
| **Graph NodeDrawer for GitHubSecret** | Medium | Detect `node.type === 'GitHubSecret'`, add "View in Secrets" link |

### 7.2 Nice-to-have

| Item | Effort | Description |
|------|--------|-------------|
| **Last scan + status chip** | Medium | Show "Last scan: 2h ago" and status (Completed/Running/Failed) in header |
| **Run GitHub Scan button** | Medium | Trigger scan from secrets page (or deep-link to Recon with github module) |
| **Clickable AI cards** | Low | AI/LLM Secrets → filter by provider; AI Usage → filter by AI_LLM_USAGE |
| **Scanned column** | Low | Relative time with tooltip |
| **Copy GitHub URL in row** | Low | Icon to copy file URL |
| **Pagination UI** | Medium | "Load more" or page controls using `pageInfo` |
| **Toast for copy** | Low | Feedback when copying secret/URL |

### 7.3 Optional / Polish

| Item | Effort | Description |
|------|--------|-------------|
| **Graph: GitHubSecret nodes** | High | Ensure GitHubSecret nodes appear in graph; may need graph query changes |
| **Responsive layout** | Medium | Improve mobile/tablet layout |
| **Keyboard nav** | Low | Arrow keys in table, Enter to open drawer |
| **Export** | Medium | Export filtered findings to CSV |

---

## 8. Summary

| Area | Done | Pending |
|------|------|---------|
| **Entry points** | Top nav, Project config | Graph NodeDrawer, Vulnerabilities link |
| **/secrets page** | Core layout, stats, filters (3/5), table, drawer, deep links, empty/error | Secret Type + Provider filters, last scan + status, Run Scan button, Scanned column, row copy icon |
| **Project config** | All fields, toggles, status, View findings | — |
| **Integration** | API auth, masking, pagination | — |

**For production:** Implement the must-have items (Secret Type + Provider filters, Vulnerabilities link, Graph NodeDrawer, Total Secrets card fix). The rest can follow as polish.

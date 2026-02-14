# Evidence Chain and Traceability — Implementation Plan

**Enhancement 1 (v1):** Thin, end-to-end vertical slice for Evidence Chain.

*Refined per `guinea_pigs/PandaExploitv2.YAML`.*

---

## 1. Overview

**Goal:** When a recon run completes and produces vulnerabilities, at least one vulnerability has associated Evidence records that reference recon phase, tool name, and key output. The UI shows "View Evidence" and displays evidence in a readable format.

**Design principle:** Evidence model is generic to support future enhancements (reports, attack paths, annotations). No new containers; use existing webapp, recon, recon_orchestrator, neo4j, postgres.

---

## 2. Data Model

### 2.1 Evidence Node (Neo4j)

```cypher
(:Evidence {
    id: string,                    // Hash-based deterministic ID; see §2.2
    project_id: string,
    user_id: string,
    event_id: string | null,       // Reserved for v2 log correlation
    phase: string,                 // e.g. "Vulnerability Scanning", "Resource Enumeration"
    tool: string,                  // e.g. "nuclei", "security_check", "gvm"
    source_type: string,           // "vulnerability_finding" | "log_artifact" | "exploit_output" (future)
    kind: string,                  // "scan" | "exploit" | "log" | "note" (v1: always "scan")
    template_id: string | null,    // Top-level; frequently used
    severity: string | null,       // Top-level; frequently used
    fuzzing_parameter: string | null,  // Top-level; frequently used
    summary: string,               // Short human-readable summary
    raw_output: string,            // Sanitized + truncated (max 2000 chars); see §2.3
    metadata: string | null,       // JSON string for rarely used/extra fields only
    action_log_id: string | null,  // Optional link to ActionLog (future use)
    created_at: datetime
})
```

**Relationships:**
- `(Vulnerability)-[:HAS_EVIDENCE]->(Evidence)` — primary link for v1
- Future: `(Evidence)-[:REFERENCES]->(ActionLog)`, `(Evidence)-[:LINKS_TO]->(Endpoint)`, etc.

**Constraints/Indexes:**
```cypher
CREATE CONSTRAINT evidence_unique IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE;
CREATE INDEX idx_evidence_tenant IF NOT EXISTS FOR (e:Evidence) ON (e.user_id, e.project_id);
```

**Cleanup:** Evidence nodes have `user_id` and `project_id`, so `clear_project_data()` will automatically delete them when a project is cleared.

### 2.2 Evidence ID and Deduplication

- Use a **hash-based deterministic ID** to avoid duplicates on re-import.
- Example: `evidence-{hash(vuln_id + template_id + matched_at + tool)}`.
- For v1, some duplication is acceptable if it simplifies implementation.
- Ensure Neo4j constraint: `evidence_unique` on `e.id`.

### 2.3 Raw Output Sanitization and Truncation

`raw_output` **MUST** be sanitized and truncated before storing. Implement a helper in the graph layer (Python):

```python
MAX_RAW_OUTPUT = 2000  # characters

def sanitize_raw_output(raw: str) -> str:
    """Sanitize and truncate raw output before storing in Neo4j."""
    if raw is None:
        return ""
    text = str(raw)
    # TODO: Basic redaction: Authorization headers, cookies, common secret patterns.
    # For now, at least truncate to avoid huge payloads.
    if len(text) > MAX_RAW_OUTPUT:
        return text[:MAX_RAW_OUTPUT] + "\n...[truncated]..."
    return text
```

Use this helper for:
- `curl_command`
- `raw_request`
- `raw_response`

**Always** pass `raw_output` through this helper before storing in Neo4j.

---

## 3. Files to Touch

### 3.1 Graph DB (Python)

| File | Changes |
|------|---------|
| [graph_db/neo4j_client.py](graph_db/neo4j_client.py) | Add Evidence constraint/index. Implement `sanitize_raw_output()` helper. In `update_graph_from_vuln_scan`, after creating each Vulnerability, create 1+ Evidence nodes linked via HAS_EVIDENCE. Use hash-based deterministic ID. Populate from `finding` dict; set `kind="scan"`, phase, tool, template_id, severity, fuzzing_parameter; pass raw_output through `sanitize_raw_output()` before storing. Same for security_check and GVM update functions. |
| [graph_db/readmes/GRAPH.SCHEMA.md](graph_db/readmes/GRAPH.SCHEMA.md) | Document Evidence node and HAS_EVIDENCE relationship. Include all properties: id, project_id, user_id, event_id, phase, tool, source_type, kind, template_id, severity, fuzzing_parameter, summary, raw_output, metadata, action_log_id, created_at. |

### 3.2 Recon Orchestrator (Python)

| File | Changes |
|------|---------|
| [recon_orchestrator/models.py](recon_orchestrator/models.py) | Add optional `event_id`, `tool` to `ReconLogEvent` for future use. **V1: no change**—we create Evidence from graph update, not from live logs. |
| [recon_orchestrator/container_manager.py](recon_orchestrator/container_manager.py) | **V1: no change.** Future: optionally assign `event_id` when yielding log events. |

### 3.3 Recon Pipeline (Python)

| File | Changes |
|------|---------|
| [recon/main.py](recon/main.py) | **V1: no change.** Graph update runs after recon completes; Evidence is created there. |
| [recon/vuln_scan.py](recon/vuln_scan.py) | **V1: no change.** Finding structure already has template_id, matched_at, curl_command, raw_request, raw_response. |

### 3.4 Webapp Backend (Next.js)

| File | Changes |
|------|---------|
| **New:** [webapp/src/app/api/evidence/route.ts](webapp/src/app/api/evidence/route.ts) | `GET /api/evidence?projectId=&vulnerabilityId=` — fetch Evidence nodes for a vulnerability. Returns `{ evidence: [...] }`. **MUST enforce access controls** (see §6.1). |
| [webapp/src/app/api/vulnerabilities/route.ts](webapp/src/app/api/vulnerabilities/route.ts) | Optionally include `evidenceCount` per vuln in response (or leave to separate evidence fetch). **V1: keep separate**—evidence fetched on demand when user clicks "View Evidence". |

### 3.5 Webapp UI (React)

| File | Changes |
|------|---------|
| [webapp/src/app/vulnerabilities/page.tsx](webapp/src/app/vulnerabilities/page.tsx) | Add "View Evidence" button to each vuln card. On click, open EvidenceDrawer/EvidenceModal. |
| **New:** [webapp/src/app/vulnerabilities/components/EvidenceDrawer.tsx](webapp/src/app/vulnerabilities/components/EvidenceDrawer.tsx) | Drawer that fetches `/api/evidence`; handles loading/error/empty states; shows phase, tool, severity, summary, timestamp; "Show raw output" collapsed by default; optional Copy button. Reusable from vulnerabilities page and NodeDrawer. |
| **New:** [webapp/src/app/vulnerabilities/components/EvidenceDrawer.module.css](webapp/src/app/vulnerabilities/components/EvidenceDrawer.module.css) | Styles for evidence drawer. |
| [webapp/src/app/graph/components/NodeDrawer/NodeDrawer.tsx](webapp/src/app/graph/components/NodeDrawer/NodeDrawer.tsx) | When `node.type === 'Vulnerability'`, add "View Evidence" button that opens EvidenceDrawer (or navigates to vulnerabilities page with evidence open). |
| [webapp/src/app/graph/types/graph.ts](webapp/src/app/graph/types/graph.ts) | No change—node.id is used for vulnerability lookup. |

### 3.6 Shared/Helpers

| File | Changes |
|------|---------|
| **New:** [webapp/src/lib/evidenceTypes.ts](webapp/src/lib/evidenceTypes.ts) | TypeScript interfaces for Evidence (`Evidence`, `EvidenceItem`). |

---

## 4. Implementation Sequence

### Phase A: Backend (Data + API)

1. **neo4j_client.py**
   - Add `sanitize_raw_output(raw: str) -> str` helper (max 2000 chars; truncate + future redaction).
   - Add `_ensure_evidence_constraints()` and call from `Neo4jClient` init.
   - In `update_graph_from_vuln_scan`, after creating each Vulnerability, create 1 Evidence node:
     - `evidence_id` = hash-based deterministic (vuln_id + template_id + matched_at + tool)
     - `phase="Vulnerability Scanning"`, `tool="nuclei"` or `"security_check"`, `kind="scan"`
     - `template_id`, `severity`, `fuzzing_parameter` as top-level props
     - `summary` = f"{template_id} at {matched_at}" (cap 200 chars)
     - `raw_output` = `sanitize_raw_output(curl_command or raw_request)` — **always** use helper
     - `metadata` = null (or JSON for extra fields only)
     - `event_id`, `action_log_id` = null
   - Create `(Vulnerability)-[:HAS_EVIDENCE]->(Evidence)`.
   - Same for security_check findings and GVM findings in their respective update functions.

2. **evidenceTypes.ts**
   - Define `Evidence` interface (including `kind`, `templateId`, `severity`, `fuzzingParameter`).

3. **api/evidence/route.ts**
   - `GET /api/evidence?projectId=&vulnerabilityId=`
   - **Access validation:** Validate session user → project ownership → vulnerability ownership. Return 404 or 403 on failure (do NOT leak whether another project/vulnerability exists).
   - Cypher: `MATCH (v:Vulnerability {id: $vulnId, project_id: $projectId, user_id: $userId})-[:HAS_EVIDENCE]->(e:Evidence) RETURN e ORDER BY e.created_at`
   - Return `{ evidence: [...] }`.

### Phase B: UI

4. **EvidenceDrawer.tsx**
   - Props: `vulnerabilityId`, `projectId`, `vulnerabilityName?`, `isOpen`, `onClose`.
   - On mount/open, fetch `/api/evidence?vulnerabilityId=&projectId=`.
   - **Loading state:** Show skeleton or spinner while fetching.
   - **Error state:** Show short error message + "Retry" button if fetch fails.
   - **Empty state:** "No evidence records yet. Evidence is created when vulnerabilities are discovered during recon."
   - **Evidence item display:** Phase (badge), Tool (badge), Severity (badge if available), Summary (main text), Timestamp (createdAt).
   - **"Show raw output" toggle:** Collapsed by default; expand to show `<pre>` block with `raw_output`.
   - **Optional:** "Copy" button to copy `raw_output` to clipboard.
   - Reuse same component from `/vulnerabilities` page and from Graph `NodeDrawer` when `node.type === 'Vulnerability'`.

5. **vulnerabilities/page.tsx**
   - Add state: `evidenceDrawerVulnId: string | null`.
   - Add "View Evidence" button to each vuln card.
   - Render `<EvidenceDrawer vulnerabilityId={...} projectId={...} isOpen={!!evidenceDrawerVulnId} onClose={...} />`.

6. **NodeDrawer.tsx**
   - When `node.type === 'Vulnerability'`, add "View Evidence" button.
   - Options: (a) render EvidenceDrawer inline in NodeDrawer, or (b) open a shared EvidenceDrawer. Prefer (a) for simplicity—reuse EvidenceDrawer as a child or pass node.id as vulnerabilityId.

### Phase C: Tests

7. **Basic tests**
   - Script or manual: run recon on testphp.vulnweb.com, verify at least one Vulnerability has Evidence in Neo4j.
   - Script: call `GET /api/evidence?vulnerabilityId=<known_id>&projectId=<id>`, assert 200 and non-empty evidence.
   - Manual: open Vulnerabilities page, click "View Evidence" on a vuln with evidence, verify drawer renders.

---

## 5. Evidence Creation Logic (Detail)

### In `update_graph_from_vuln_scan` (DAST findings)

When processing `finding` in `by_target.items()`:

```python
# After MERGE (v:Vulnerability {id: $vuln_id})
import hashlib
raw = finding.get("raw", {})
template_id = finding.get("template_id", "unknown")
matched_at = finding.get("matched_at", "")
fuzzing_param = raw.get("fuzzing_parameter", "")
severity = finding.get("severity")
tool = "nuclei"  # or "security_check" based on finding source

# Deterministic hash-based ID for deduplication
id_input = f"{vuln_id}{template_id}{matched_at}{tool}"
evidence_id = f"evidence-{hashlib.sha256(id_input.encode()).hexdigest()[:24]}"

summary = f"{template_id} at {matched_at}"[:200]
raw_src = finding.get("curl_command") or finding.get("request") or ""
raw_output = sanitize_raw_output(raw_src)  # MUST use helper - truncate + sanitize

session.run("""
    MATCH (v:Vulnerability {id: $vuln_id})
    CREATE (e:Evidence {
        id: $evidence_id,
        project_id: $project_id,
        user_id: $user_id,
        event_id: null,
        phase: "Vulnerability Scanning",
        tool: $tool,
        source_type: "vulnerability_finding",
        kind: "scan",
        template_id: $template_id,
        severity: $severity,
        fuzzing_parameter: $fuzzing_param,
        summary: $summary,
        raw_output: $raw_output,
        metadata: null,
        action_log_id: null,
        created_at: datetime()
    })
    CREATE (v)-[:HAS_EVIDENCE]->(e)
    """, evidence_id=evidence_id, project_id=project_id, user_id=user_id,
    tool=tool, template_id=template_id or None, severity=severity or None,
    fuzzing_param=fuzzing_param or None, summary=summary, raw_output=raw_output)
```

### For security_check findings

Same pattern; `tool="security_check"`, `phase="Vulnerability Scanning"`, `kind="scan"`.

### For GVM findings (update_graph_from_gvm_scan)

Same pattern; `tool="gvm"`, `phase="GVM Scan"`, `kind="scan"`.

---

## 6. API Contract

### GET /api/evidence

**Query params:** `projectId` (required), `vulnerabilityId` (required).

#### 6.1 Access Validation (Required)

1. Read `userId` from session/auth context.
2. Lookup project by `projectId` in Postgres; ensure `project.userId === userId` (or membership check when RBAC is added).
3. Validate that `vulnerabilityId` belongs to the same `projectId` and `userId`.
4. If validation fails: return **404 or 403** (do NOT leak whether another project/vulnerability exists).
5. Only then query Neo4j:

```cypher
MATCH (v:Vulnerability {id: $vulnId, project_id: $projectId, user_id: $userId})
      -[:HAS_EVIDENCE]->(e:Evidence)
RETURN e
ORDER BY e.created_at
```

**Response (200):**
```json
{
  "evidence": [
    {
      "id": "evidence-xxx",
      "phase": "Vulnerability Scanning",
      "tool": "nuclei",
      "sourceType": "vulnerability_finding",
      "kind": "scan",
      "templateId": "sqli-error-based",
      "severity": "critical",
      "fuzzingParameter": "artist",
      "summary": "sqli-error-based at http://testphp.vulnweb.com/artists.php?artist=3'",
      "rawOutput": "curl -X 'GET' ...",
      "metadata": null,
      "createdAt": "2025-02-10T12:00:00Z"
    }
  ]
}
```

---

## 7. UI Mock (Evidence Drawer)

- **Header:** "Evidence for [Vulnerability Name]"
- **States:**
  - Loading: skeleton or spinner
  - Error: short message + "Retry" button
  - Empty: "No evidence records yet. Evidence is created when vulnerabilities are discovered during recon."
- **Evidence cards:**
  - Phase badge
  - Tool badge (nuclei, security_check, gvm)
  - Severity badge (if available)
  - Summary text
  - Timestamp (createdAt)
  - "Show raw output" toggle (collapsed by default) → `<pre>` with raw_output
  - Optional: "Copy" button to copy raw_output to clipboard

---

## 8. Acceptance Criteria Checklist

- [ ] When recon completes and produces vulnerabilities, at least one Vulnerability node has at least one associated Evidence node with phase, tool, summary, and **sanitized** raw_output.
- [ ] Evidence nodes are persisted with unique id and tenant fields (user_id, project_id); constraints are enforced without errors.
- [ ] `/api/evidence` returns 200 and a non-empty evidence list when called by an **authorized** user for a vulnerability that has evidence.
- [ ] `/api/evidence` returns 404 or 403 when called for a project/vulnerability the user does not own.
- [ ] EvidenceDrawer renders for a vulnerability with evidence, shows the list, and can expand an item to view raw_output without UI crashes.
- [ ] raw_output is always truncated to a safe max length (2000 chars) and does not cause large payload issues in the UI.
- [ ] `/vulnerabilities` UI shows "View Evidence" for vulnerabilities that have evidence.
- [ ] At least one graph node type (Vulnerability in NodeDrawer) has access to evidence (View Evidence button).

### 8.1 Suggested Automated Tests

- **Graph/Neo4j integration test:** Use a small fixture for `update_graph_from_vuln_scan`; assert that a Vulnerability node exists and a related Evidence node exists.
- **API test:** Simulate authenticated request with valid user/project/vulnerability → assert 200 and shape of `evidence` array. Assert proper handling of unauthorized/invalid projectId/vulnerabilityId (404/403).
- **UI test (optional for v1):** Render EvidenceDrawer with mocked API response; ensure list items and expand/collapse behavior work.

---

## 9. Future Extensions (Out of Scope for v1)

- Link Evidence to ActionLog entries (use `action_log_id`).
- Recon orchestrator emitting structured events with eventId; correlate to Evidence.
- Evidence from log lines (correlate by phase/timestamp).
- Evidence from exploit output (agent writes Evidence when exploitation succeeds; `kind="exploit"`).
- Report generation reusing Evidence structure.
- Attack path assistant using Evidence for citations.

---

## 10. Implementation Order (Summary)

1. Neo4j changes (constraints, sanitize helper, Evidence creation in vuln_scan + GVM)
2. API route (`/api/evidence` with access validation)
3. EvidenceDrawer UI (loading, error, empty, list, expand raw)
4. Integrate into Vulnerabilities page and NodeDrawer
5. Tests (graph, API, optional UI)

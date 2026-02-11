# Evidence Chain and Traceability — Implementation Plan

**Enhancement 1 (v1):** Thin, end-to-end vertical slice for Evidence Chain.

---

## 1. Overview

**Goal:** When a recon run completes and produces vulnerabilities, at least one vulnerability has associated Evidence records that reference recon phase, tool name, and key output. The UI shows "View Evidence" and displays evidence in a readable format.

**Design principle:** Evidence model is generic to support future enhancements (reports, attack paths, annotations). No new containers; use existing webapp, recon, recon_orchestrator, neo4j, postgres.

---

## 2. Data Model

### 2.1 Evidence Node (Neo4j)

```cypher
(:Evidence {
    id: string,                    // Unique ID, e.g. "evidence-{vuln_id}-{index}-{timestamp}"
    project_id: string,
    user_id: string,
    event_id: string,              // Optional; for future correlation with log eventId
    phase: string,                 // e.g. "Vulnerability Scanning", "Resource Enumeration"
    tool: string,                  // e.g. "nuclei", "security_check", "gvm"
    source_type: string,          // "vulnerability_finding" | "log_artifact" | "exploit_output" (future)
    summary: string,              // Short human-readable summary (e.g. "Nuclei found SQLi at /artists.php")
    raw_output: string,           // Optional; key data (matched_at, curl_command, or truncated raw_request/response)
    metadata: string,             // JSON string for extensibility (e.g. template_id, severity, fuzzing_param)
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

---

## 3. Files to Touch

### 3.1 Graph DB (Python)

| File | Changes |
|------|---------|
| [graph_db/neo4j_client.py](graph_db/neo4j_client.py) | Add Evidence constraint/index. In `update_graph_from_vuln_scan`, after creating each Vulnerability, create 1+ Evidence nodes linked via HAS_EVIDENCE. Populate from `finding` dict (template_id, matched_at, curl_command, raw_request, raw_response, fuzzing_parameter). Set phase="Vulnerability Scanning", tool="nuclei" or "security_check". |
| [graph_db/readmes/GRAPH.SCHEMA.md](graph_db/readmes/GRAPH.SCHEMA.md) | Document Evidence node and HAS_EVIDENCE relationship. |

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
| **New:** [webapp/src/app/api/evidence/route.ts](webapp/src/app/api/evidence/route.ts) | `GET /api/evidence?projectId=&vulnerabilityId=` — fetch Evidence nodes for a vulnerability. Returns `{ evidence: [...] }`. |
| [webapp/src/app/api/vulnerabilities/route.ts](webapp/src/app/api/vulnerabilities/route.ts) | Optionally include `evidenceCount` per vuln in response (or leave to separate evidence fetch). **V1: keep separate**—evidence fetched on demand when user clicks "View Evidence". |

### 3.5 Webapp UI (React)

| File | Changes |
|------|---------|
| [webapp/src/app/vulnerabilities/page.tsx](webapp/src/app/vulnerabilities/page.tsx) | Add "View Evidence" button to each vuln card. On click, open EvidenceDrawer/EvidenceModal. |
| **New:** [webapp/src/app/vulnerabilities/components/EvidenceDrawer.tsx](webapp/src/app/vulnerabilities/components/EvidenceDrawer.tsx) | Drawer/panel that fetches `/api/evidence?vulnerabilityId=...` and displays list of evidence items (phase, tool, summary, expandable raw_output). |
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
   - Add `_ensure_evidence_constraints()` and call from `Neo4jClient` init.
   - In `update_graph_from_vuln_scan`, after creating each Vulnerability, create 1 Evidence node:
     - `phase="Vulnerability Scanning"`
     - `tool="nuclei"` or `"security_check"` based on finding source
     - `summary` = f"{template_id} at {matched_at}" or similar
     - `raw_output` = truncated curl_command or first 2KB of raw_request/response
     - `metadata` = JSON of template_id, severity, fuzzing_parameter
   - Create `(Vulnerability)-[:HAS_EVIDENCE]->(Evidence)`.
   - Same for security_check findings and GVM findings in their respective update functions.

2. **evidenceTypes.ts**
   - Define `Evidence` interface.

3. **api/evidence/route.ts**
   - `GET /api/evidence?projectId=&vulnerabilityId=`
   - Cypher: `MATCH (v:Vulnerability {id: $vulnId, project_id: $projectId})-[:HAS_EVIDENCE]->(e:Evidence) RETURN e ORDER BY e.created_at`
   - Return `{ evidence: [...] }`.

### Phase B: UI

4. **EvidenceDrawer.tsx**
   - Props: `vulnerabilityId`, `projectId`, `isOpen`, `onClose`.
   - On mount/open, fetch `/api/evidence?vulnerabilityId=&projectId=`.
   - Render list: phase, tool, summary, expandable raw_output (collapsible).
   - Handle empty state ("No evidence yet").

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
evidence_id = f"evidence-{vuln_id}-0-{int(datetime.utcnow().timestamp())}"
summary = f"{template_id} at {matched_at}"[:200]  # cap length
raw_req = finding.get("request") or ""
raw_resp = finding.get("response") or ""
raw_output = (finding.get("curl_command") or
              (raw_req[:1500] + "..." if len(raw_req) > 1500 else raw_req))
metadata = json.dumps({
    "template_id": template_id,
    "severity": severity,
    "fuzzing_parameter": raw.get("fuzzing_parameter"),
})
session.run("""
    MATCH (v:Vulnerability {id: $vuln_id})
    CREATE (e:Evidence {
        id: $evidence_id,
        project_id: $project_id,
        user_id: $user_id,
        phase: "Vulnerability Scanning",
        tool: "nuclei",
        source_type: "vulnerability_finding",
        summary: $summary,
        raw_output: $raw_output,
        metadata: $metadata,
        created_at: datetime()
    })
    CREATE (v)-[:HAS_EVIDENCE]->(e)
    """, ...)
```

### For security_check findings

Same pattern; `tool="security_check"`, `phase="Vulnerability Scanning"`.

### For GVM findings (update_graph_from_gvm_scan)

Same pattern; `tool="gvm"`, `phase="GVM Scan"` (or similar).

---

## 6. API Contract

### GET /api/evidence

**Query params:** `projectId` (required), `vulnerabilityId` (required).

**Response:**
```json
{
  "evidence": [
    {
      "id": "evidence-xxx-0-1234567890",
      "phase": "Vulnerability Scanning",
      "tool": "nuclei",
      "sourceType": "vulnerability_finding",
      "summary": "sqli-error-based at http://testphp.vulnweb.com/artists.php?artist=3'",
      "rawOutput": "curl -X 'GET' ...",
      "metadata": { "template_id": "...", "severity": "critical" },
      "createdAt": "2025-02-10T12:00:00Z"
    }
  ]
}
```

---

## 7. UI Mock (Evidence Drawer)

- Header: "Evidence for [Vulnerability Name]"
- List of evidence cards:
  - Phase badge
  - Tool badge (nuclei, security_check, gvm)
  - Summary text
  - "Show raw output" toggle → `<pre>` with raw_output
- Empty state: "No evidence records yet. Evidence is created when vulnerabilities are discovered during recon."

---

## 8. Acceptance Criteria Checklist

- [ ] When recon completes and produces vulnerabilities, at least one Vulnerability has Evidence records in Neo4j (phase, tool, summary, raw_output).
- [ ] `/vulnerabilities` UI shows "View Evidence" for vulnerabilities that have evidence.
- [ ] Clicking "View Evidence" opens a panel/list with timeline or list of evidence items (phase, tool, summary, expandable raw data).
- [ ] At least one graph node type (Vulnerability in NodeDrawer) has access to evidence (View Evidence button).
- [ ] Basic verification: recon run → check Neo4j for Evidence nodes; API returns evidence for a known vuln; UI renders without errors.

---

## 9. Future Extensions (Out of Scope for v1)

- Link Evidence to ActionLog entries.
- Recon orchestrator emitting structured events with eventId.
- Evidence from log lines (correlate by phase/timestamp).
- Evidence from exploit output (agent writes Evidence when exploitation succeeds).
- Report generation reusing Evidence structure.
- Attack path assistant using Evidence for citations.

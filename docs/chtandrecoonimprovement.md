# Integrating Chat and Recon Logs — A Unified AI Recon Co‑Pilot (Design Prompt)

> **Objective:** Transform the **Chat** tab and the **Recon Logs** tab into a **single, intelligent workflow** where the AI agent understands, explains, orchestrates, and learns from live recon activity—without sacrificing decoupling, reliability, or security. Treat this as an **innovative flagship experience**: real-time co-pilot for recon that is explainable, actionable, and auditable.

***

## Goals & Non‑Goals

### Goals

1.  **Bidirectional awareness**
    *   Chat can **observe** live recon phases/logs and **reference** them precisely.
    *   Recon Logs can **surface AI insights** (summaries, anomalies, next steps) in-line.
2.  **Actionability**
    *   From Chat: start/stop/pause/resume recon, re-run a phase, or drill into artifacts.
    *   From Recon Logs: “Explain this,” “Summarize last 2 minutes,” “Create a ticket,” “Prioritize assets at risk.”
3.  **Explainability**
    *   Every AI answer includes **citations** to specific log lines, phases, and artifacts.
    *   Recon annotations by the AI are **timestamped**, **attributed**, and **auditable**.
4.  **Scalability & reliability**
    *   Preserve current decoupling while adding a **unified event bus** and **normalized schema**.
    *   Handle very large streams (backpressure, virtualization, sampling, resumability).
5.  **Security & governance**
    *   Enforce **RBAC** for actions, **tenant isolation**, and **tamper‑proof audit logs**.
    *   Explicit consent boundaries for AI reads/writes.

### Non‑Goals

*   Changing the underlying recon pipeline itself.
*   Replacing SSE/WS transports—**reuse existing transports**, augment with a cohesive orchestration layer.
*   Persisting raw logs forever (UI controls and summaries are in-scope; long-term storage policy is out-of-scope here).

***

## UX: What “Integrated” Feels Like

### Primary Flows

1.  **Live Co‑Pilot**
    *   User starts recon from Chat (“Start recon against Project X, scope = prod domains”).
    *   Chat responds with a **Run card** (status, ETA, phases).
    *   As logs stream, Chat intermittently posts **Live Insight cards**:
        *   “Subdomain spike suggests wildcard DNS; consider filtering.”
        *   “Open ports 445/3389 on 3 assets—high exposure; propose next checks.”
    *   Inline buttons: **Explain**, **Open asset**, **Re-run phase**, **Create JIRA**.

2.  **Explain This**
    *   In Recon Logs, users highlight a block → **Ask AI**:
        *   “Explain these errors,” “What changed versus last run?” “Is this critical?”
    *   The AI answers **in-place** and also **drops a reference** in Chat with a rich permalink.

3.  **Guided Guardrails**
    *   Mid-run, user types in Chat: “**Focus on SQLi** and **skip long wordlists**.”
    *   The agent translates guidance into **runtime controls** (phase configs/flags), logs the change, and continues.

4.  **Summaries on Tap**
    *   At any time: “**Summarize the last 5 minutes**,” “**Top risky assets**,” “**What’s blocking completion?**”
    *   Chat answer includes citations and **navigation deep links** to logs/artifacts.

***

## Architecture: Minimal Coupling, Maximum Cohesion

### 1) Shared Project Runtime Bus

Introduce a **Project Event Bus** (in-process or lightweight message layer) that **normalizes all recon and agent events**.

*   **Publishers**
    *   Recon Orchestrator → `recon.*` events (status, phase, logs, artifacts, metrics).
    *   Agent → `agent.*` events (guidance applied, summaries, actions, citations).
*   **Subscribers**
    *   Chat service (to observe recon context).
    *   Recon Logs service (to display AI annotations/insights).
    *   Audit service (immutable event store).

> Keep **SSE** (Recon) and **WS** (Agent). The bus is a backend abstraction for correlation and replay—not a new client transport.

### 2) Normalized Event Schema

```ts
// Minimal, extensible, and cross-service
type UUID = string;

interface BaseEvent {
  eventId: UUID;
  projectId: UUID;
  runId?: UUID;                        // recon run identifier
  actor: { type: 'system' | 'agent' | 'user'; id?: UUID };
  ts: string;                          // ISO-8601
  kind: string;                        // e.g., 'recon.log', 'agent.summary'
  correlationId?: UUID;                // tie request→response or insight→source
  visibility: 'project' | 'org' | 'private';
  rbacScopes: string[];                // e.g., ['recon:read', 'recon:write']
  payload: unknown;
}

// Recon-focused
interface ReconLogEvent extends BaseEvent {
  kind: 'recon.log';
  runId: UUID;
  phase: { name: string; index: number; total?: number };
  payload: {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    source?: 'subdomains'|'ports'|'http'|'enum'|'vuln'|'custom';
    assetId?: UUID;
    raw?: Record<string, any>;
  };
}

interface ReconStatusEvent extends BaseEvent {
  kind: 'recon.status';
  runId: UUID;
  payload: { status: 'idle'|'starting'|'running'|'completed'|'error'; reason?: string };
}

// AI artifacts referencing logs
interface AgentInsightEvent extends BaseEvent {
  kind: 'agent.insight';
  runId?: UUID;
  payload: {
    title: string;
    summary: string;                // short
    detail?: string;                // long markdown
    severity?: 'low'|'medium'|'high'|'critical';
    citations: Array<{
      eventId: UUID;                // points to ReconLogEvent etc.
      lineRange?: [number, number]; // if chunked
    }>;
    actions?: Array<{
      type: 'link'|'rerun'|'ticket'|'explain';
      label: string;
      params?: Record<string, any>;
    }>;
  };
}
```

### 3) Correlation Model

*   **`runId`** identifies a recon execution.
*   **`correlationId`** ties a **user prompt** → **agent action** → **recon config change** → **follow-up insights**.
*   AI answers **must include citations** that point to **eventIds** of the logs or status they reference.

### 4) Client Integration

**Chat (`AIAssistantDrawer`):**

*   Subscribes to `agent.*` and `recon.status` events for the **current `projectId`** (via its WS channel or a multiplexed endpoint).
*   Adds a “**Live Recon**” panel inside Chat:
    *   Current phase, ETA, run controls (respect RBAC).
    *   Inline AI insights (AgentInsightEvent).
*   When user prompts reference logs (“Explain last errors”), Chat emits `agent.request` with desired context slice (time-window, phase, filters).

**Recon Logs (`ReconLogsDrawer`):**

*   Continues to render logs from SSE.
*   Renders **AI overlays** (insights) in a sticky side gutter and/or inline row annotations.
*   Right-click/hover on a log chunk → “Ask AI” → posts to agent; upon completion, the resulting AgentInsightEvent gets threaded under that chunk.

***

## Backend Contracts

### New/Enhanced Endpoints

*   **Agent Command & Context**
    *   `POST /api/agent/projects/:projectId/commands`
        *   `{ type: 'start_recon'|'stop_recon'|'guidance'|'summarize'|'explain', runId?, params }`
    *   `GET  /api/agent/projects/:projectId/stream` (WS)
        *   Streams `agent.*` and selected `recon.*` summaries/cursors.

*   **Recon Control (existing + idempotent)**
    *   `POST /api/recon/:projectId/start` → `{ runId }`
    *   `POST /api/recon/:projectId/stop`  → `{ runId, status }`
    *   `GET  /api/recon/:projectId/status`
    *   `GET  /api/recon/:projectId/logs` (SSE)

*   **Audit/Insights**
    *   `GET /api/projects/:projectId/insights?runId=&since=`
    *   `GET /api/projects/:projectId/events?cursor=&limit=`

> **Rule:** Chat never scrapes raw SSE. It subscribes to **curated** recon signals via the agent WS stream (e.g., phase changes, top-k anomalies) and fetches details on demand.

***

## AI Prompting & Behaviors

### System Prompt (Agent)

> You are the Recon Co‑Pilot. Your responsibilities:
>
> 1.  Interpret user intents (ask, explain, act).
> 2.  Maintain safety and RBAC: never perform restricted actions; explain refusals.
> 3.  Observe recon status/logs via curated events; **never assume**—cite sources by `eventId`.
> 4.  When asked for explanations or summaries, produce **concise, actionable** output with:
>     *   Severity assessment, affected assets, confidence.
>     *   **Citations** (link to `recon.log` or `recon.status` events).
>     *   Suggested next steps (each as an action with parameters).
> 5.  When guidance is given mid-run, translate to **supported orchestrator flags** and emit a `agent.insight` noting the change.
> 6.  Be transparent: if context is stale or missing, ask for clarification or request a narrower time/phase window.

### Few‑Shot Behaviors

**Explain logs (error burst)**

*   Input: last 100 error logs (`recon.log` subset), phase metadata.
*   Output: Root-cause hypothesis, **3 concise bullets**, risk, next action, **citations to eventIds**.

**Start recon with constraints**

*   Input: user intent + scope (`in-scope domains`, `max depth`, `wordlist=small`).
*   Output: Confirmed plan, estimated duration, command constructed, `correlationId`, run started, subscribe to updates.

**Artifact linking**

*   Input: Open ports on assets with HTTP 200.
*   Output: Insight with **filtered list of assets** (limit 10 with “Show more”), “Open in asset view,” “Export to CSV,” “Trigger basic vuln scan” buttons.

***

## UI Additions

### Chat

*   **Run Capsule**: `Status • Phase 3/7 • 00:12:03 elapsed` + controls (start/stop/pause; disabled if lacking scope).
*   **Insight Cards**: Inline, collapsible details with citations and actions.
*   **Citations Viewer**: Hover to preview the exact log lines; click to jump the Recon tab (deep link with highlighting).

### Recon Logs

*   **AI Gutter**: Left/Right side channel with pinned AI annotations; sync scroll.
*   **Ask AI**: Context menu on selection, includes slider for time window & toggle “include artifacts”.
*   **Run Timeline**: Phase chips with AI markers (e.g., ⚠ anomalies, 🧠 summaries).

***

## Performance & Resilience

*   **Stream handling**
    *   Virtualized log list; in-memory cap with circular buffer (persist cursor for replay).
    *   SSE reconnect with backoff; resume from last `eventId`.
    *   Agent throttles “insight synthesis” (e.g., min 15s between auto-summaries) and supports **user-forced** summarization anytime.

*   **Sampling & Windows**
    *   AI operates on **windowed subsets** (e.g., last N seconds / last M events / phase chunk).
    *   Background **indexing** for top‑k retrieval (e.g., error bursts, unique findings).

*   **Backpressure**
    *   Drop debug-level logs client-side when CPU-bound (configurable).
    *   Insights reference **citations list**, not entire payloads.

***

## Security, Privacy, Compliance

*   **RBAC checks** on all commands (server-side).
*   **Tenant isolation** on WS/SSE; sign tokens with `projectId`, `runId`, and scopes.
*   **Immutable audit**: Every agent action & insight with `actor`, `ts`, `correlationId`, and **pre/post state** diffs for runtime flags.
*   **PII hygiene**: Redact sensitive values before they reach LLM; store redactors centrally.
*   **Explain refusals**: If an action isn’t permitted, respond with the policy reason and an alternative read-only path.

***

## Analytics & Success Metrics

*   **Engagement**: % sessions with AI insight interactions; time-to-first-insight.
*   **Operational**: Insight synthesis latency, WS/SSE reconnect rate, drops.
*   **Outcome**: Mean time to detect (MTTD) high‑severity findings; reduction in manual triage steps.
*   **Quality**: Insight acceptance rate, false-positive rate (via user feedback buttons).

***

## Rollout Plan

1.  **Phase 1 – Read-only awareness**
    *   Chat shows live status and phase changes; “Explain this” from Recon pushes to Chat.
2.  **Phase 2 – Insights & citations**
    *   AI summaries with citations rendered inline in both tabs; deep-link navigation.
3.  **Phase 3 – Action controls**
    *   Start/stop/guidance from Chat with RBAC; full audit.
4.  **Phase 4 – Advanced**
    *   Anomaly detection, run-to-run diffs, automatic ticket drafts, policy-based guardrails.

Feature flags: `agent_recon_awareness`, `agent_insights_inline`, `agent_run_controls`, `agent_anomaly_detection`.

***

## Testing Matrix

**Functional**

*   Start/stop/pause/resume recon via Chat (authorized vs. unauthorized).
*   “Explain selection” in Recon Logs generates insight with correct citations.
*   Switching projects tears down old WS/SSE and cleanly resubscribes.

**Resilience**

*   SSE drop/reconnect resumes at last `eventId`.
*   Agent WS reconnect preserves `correlationId` and outstanding requests.

**Security**

*   RBAC denies actions appropriately; audit entries created for all attempts.
*   Cross-tenant isolation validated with adversarial tests.

**Quality**

*   Summaries stay within token budget; degradation strategy triggers on overflow.
*   Citations always resolve to visible logs (handle redaction and rotation).

***

## Implementation Pointers (Client)

```tsx
// Chat subscribes to curated recon signals and agent output
useEffect(() => {
  const ws = connectAgentWS({ projectId, sessionId, scopes: ['recon:read','agent:write'] });
  ws.on('recon.status', handleReconStatus);
  ws.on('agent.insight', handleInsight);
  return () => ws.close();
}, [projectId, sessionId]);

function askAIAboutSelection(selection: LogSelection) {
  sendAgentCommand({
    type: 'explain',
    params: {
      runId: selection.runId,
      window: selection.window,              // { since, until } or { lastN: 200 }
      filters: selection.filters,            // e.g., level:'error'
      cite: 'eventId'
    }
  });
}
```

```tsx
// Recon logs shows AI annotations inline
<LogRow key={e.eventId}>
  <LogContent ... />
  {insightsByEventId[e.eventId]?.map((ins) => (
    <InsightPill
      severity={ins.severity}
      title={ins.title}
      onClick={() => openInsightPanel(ins)}
    />
  ))}
</LogRow>
```

***

## Open Questions

1.  **Where to store long-lived insights?** Same DB as events, or separate “insights” table with inverted index for retrieval?
2.  **How to handle log rotation/redaction** so citations remain resolvable? (Propose: stable `eventId` + archival store with RBAC gates.)
3.  **Guidance scope**: Which orchestrator flags are user-settable vs. agent-suggested only?
4.  **Conflict resolution** when multiple users guide the same run—last write wins, or queue proposals with approvals?

***

## Executive One‑Liner

> **Turn recon into a conversation.** The AI Co‑Pilot observes the run in real time, explains what’s happening with precise citations, and lets experts steer the pipeline—safely, transparently, and fast.

***

If you want, I can also deliver this as a **README.md** with embedded Mermaid diagrams and a minimal **TypeScript interfaces** file. Would you like me to package that as a downloadable `.zip` or push-ready Markdown?

# Review: Chat + Recon Integration Plan — Feasibility & Impact

Review of `chtandrecoonimprovement.md`: feasibility, risk of breaking current behavior, and whether the direction is better or worse.

---

## Short verdict

| Aspect | Assessment |
|--------|------------|
| **Feasibility** | **Achievable** if done in phases and with backward compatibility. Some parts are heavy (event bus, RBAC, audit). |
| **Breaks current behavior?** | **No**, if the plan is implemented **additively** (new events, new UI, new APIs) and existing WS/SSE contracts stay supported. |
| **Better or worse?** | **Better** for UX and product (unified co-pilot, citations, actions). **Risky** if scope isn’t controlled or RBAC/audit are overbuilt early. |

---

## 1. Feasibility

### What aligns well with the current system

- **Reuse SSE + WS**  
  Plan explicitly keeps existing transports. Recon stays on SSE, Chat on WebSocket. No need to replace them — only extend.

- **Existing concepts**  
  `projectId`, recon status (idle/running/completed), phases, and log streaming already exist. Adding `runId`, `eventId`, and `correlationId` is additive.

- **Recon control**  
  Start/stop today: toolbar → `useReconStatus.startRecon()` → `POST /api/recon/:projectId/start`. Plan adds “start recon from Chat” by having the agent (or a new API) call the **same** recon start API. So you add a second entry point, not a second implementation.

- **“Explain this” from Recon**  
  Flow is clear: user selects log lines → send selection to agent (e.g. via existing WS or new command) → agent returns answer; show in Chat and/or inline. No fundamental new transport.

- **UI is additive**  
  Chat: add a “Live Recon” capsule + insight cards. Recon Logs: add AI gutter + “Ask AI” on selection. Current Chat and Recon UIs can stay; new elements are extra.

### What needs real work (medium/high effort)

- **Project Event Bus**  
  Plan says “in-process or lightweight message layer” that normalizes recon + agent events. Today:
  - Recon: orchestrator → SSE → webapp proxy → browser (`useReconSSE`).
  - Agent: agent → WebSocket → browser (`useAgentWebSocket`).  
  So the “bus” is likely:
  - Either in the **webapp backend**: it subscribes to recon SSE (or recon-orchestrator API) and receives agent events (e.g. from agent or from its own API), then pushes curated events over the **existing** WS (or a second channel).  
  - Or in the **agent**: agent subscribes to recon (e.g. HTTP/SSE from orchestrator), merges with its own events, and sends one WS stream.  
  Both are feasible but need a concrete design (where the bus runs, how recon events get into it, how Chat gets them).

- **Normalized schema and citations**  
  Today recon logs don’t have `eventId`. So either:
  - Orchestrator adds `eventId` to each log line, or  
  - Webapp (or bus) assigns `eventId` when proxying/consuming SSE.  
  Resolving “citation → log line” then needs a store (e.g. in-memory circular buffer or DB) keyed by `eventId`. Doable; requires backend + optional orchestrator change.

- **Agent behavior**  
  Agent must: observe recon status/log summaries, emit insights with citations, handle “explain this” and “start/stop recon” commands. That’s new prompt + tooling + possibly new agent endpoints. Medium effort.

- **RBAC and audit**  
  Plan wants RBAC on commands and immutable audit. Current code doesn’t show fine-grained `recon:read` / `recon:write` / `agent:write`. Adding RBAC and audit is a separate subsystem; feasible but non-trivial and should be scoped (e.g. Phase 3).

### What is hardest / most ambiguous

- **Resume from `eventId`**  
  “SSE reconnect with backoff; resume from last eventId” — SSE has no standard resume. You’d need a custom protocol (e.g. `Last-Event-ID` header or a cursor in the URL) and orchestrator support. Possible but non-trivial.

- **Auto insight synthesis**  
  “Min 15s between auto-summaries” implies the agent (or a service) consumes a live recon stream and periodically produces insights. That’s new pipeline + cost/latency control; better as a later phase.

**Feasibility summary:** The plan is **implementable** in phases. Phase 1 (read-only awareness, “Explain this” from Recon) is the most feasible and lowest risk. Phases 2–4 add citations, controls, RBAC, and advanced features; each is feasible but increases scope and complexity.

---

## 2. Will it conflict or break current functionality?

### Unlikely to break (if done additively)

- **Chat**  
  Current: WebSocket for init/query/guidance/approvals; local state for messages.  
  Plan: **Add** handlers for `recon.status` and `agent.insight`; **add** Run capsule and Insight cards.  
  If existing message types and payloads are unchanged, current Chat behavior stays. **No conflict** if WS remains backward compatible.

- **Recon Logs**  
  Current: logs from `useReconSSE`, status from `useReconStatus`, passed as props.  
  Plan: “Recon Logs continues to render logs from SSE” and **add** AI gutter and “Ask AI.”  
  So existing SSE consumption and rendering stay; new behavior is additive. **No conflict.**

- **Recon start/stop**  
  Current: only from toolbar (modal → `startRecon()`).  
  Plan: also from Chat via agent command (or API) that calls the same `POST /api/recon/:projectId/start` (and stop).  
  Same backend, second entry point. **No conflict**; toolbar can stay as-is.

- **Graph page**  
  It owns `useReconStatus` and `useReconSSE` and passes data into `AIPanel`. Plan doesn’t require removing that; Chat can **additionally** get recon status from WS if desired. You only need to avoid **two sources of truth** that disagree (see below).

### Where to be careful (to avoid breakage)

- **WebSocket contract**  
  If you add new message types (e.g. `recon.status`, `agent.insight`), the existing client should ignore unknown types or handle them optionally. Don’t remove or change existing types (e.g. `thinking`, `tool_start`, `response`). Then old clients keep working.

- **SSE contract**  
  If the orchestrator or proxy starts sending an enriched format (e.g. with `eventId`), the current `useReconSSE` parser should remain valid. Prefer **additive** fields and backward-compatible parsing (e.g. `eventId` optional).

- **Single source of truth for recon state**  
  Today: page → `useReconStatus` / `useReconSSE` → props → Recon Logs (and could pass to Chat).  
  Plan: Chat also “subscribes to recon.status” (e.g. via WS).  
  To avoid conflicts, either:
  - Keep page as the only owner: WS only carries “recon status” as a mirror of what the page already has (e.g. for Chat’s Run capsule), and page still uses its hooks; or  
  - Move recon state to a single place (e.g. context + WS) and have both Chat and Recon Logs read from there.  
  Don’t have two independent sources (e.g. page polling and WS) that can get out of sync without a clear reconciliation strategy.

**Conflict summary:** The plan **does not require** breaking current behavior. Keep existing APIs, WS message types, and SSE format; add new endpoints, new message types, and new UI in an additive way and avoid duplicate, unsynced state.

---

## 3. Better or worse?

### Why it’s better

- **UX**  
  One place to start recon, see status, and get AI explanations; “Explain this” in Recon and citations/deep links make the product feel like a single recon co-pilot.

- **Explainability and audit**  
  Citations and eventIds improve traceability; audit and RBAC support compliance and safety. Good long-term direction.

- **Scalability**  
  Virtualization, backpressure, windowing, and sampling are the right ideas for large log streams and cost control.

- **Product story**  
  “Turn recon into a conversation” is a strong differentiator and matches the doc’s goals.

### Where it could be worse (if mishandled)

- **Complexity**  
  Event bus, normalized schema, RBAC, audit, correlationIds — more components and failure modes. Mitigation: strict phasing and feature flags so you can ship and iterate in small steps.

- **Scope creep**  
  The doc is large. Delivering “a bit of everything” without citations or without controls can feel half-done. Better: deliver Phase 1 (awareness + “Explain this”) end-to-end, then add citations and controls in later phases.

- **Performance and cost**  
  Auto-summaries and “insight synthesis” can add latency and cost. Throttling (e.g. 15s) and “user-forced only” options are good; keep tuning and be ready to simplify (e.g. no auto-summaries in v1).

**Better/worse summary:** The **direction is better** for users and product. The **execution** can be worse if scope isn’t controlled, RBAC/audit are overbuilt too early, or existing contracts are changed instead of extended.

---

## 4. Recommendations

1. **Treat Phase 1 as the MVP**  
   Read-only recon awareness in Chat + “Explain this” from Recon → answer in Chat (or inline). No event bus required for v1: Chat can receive recon status from the **existing** page-level hooks (e.g. pass `reconStatus` into Chat) and “Explain this” can send the selected log text to the agent over the **existing** WS. That validates the UX with minimal backend change.

2. **Introduce the bus and schema in Phase 2**  
   When you add citations and deep links, introduce the normalized event schema and a small event bus (or agent-side aggregation) so that `eventId` and citations are consistent. Keep SSE/WS as the client-facing transports.

3. **Keep existing flows working**  
   Don’t remove toolbar start recon; don’t change current WS/SSE message shapes; add new types and new APIs only. That keeps the plan non-breaking.

4. **Defer heavy pieces**  
   Full RBAC and immutable audit can follow after the core “recon-aware Chat + Explain this” works. Use feature flags (`agent_recon_awareness`, etc.) so you can ship incrementally and roll back if needed.

5. **Clarify the bus location**  
   Decide where the “Project Event Bus” lives (webapp backend vs agent) and how recon events get into it (orchestrator → webapp vs orchestrator → agent). That unblocks backend design without changing the high-level plan.

---

## 5. One-paragraph summary

The plan is **feasible** and **does not require breaking** current behavior if you add new events, new UI, and new APIs while keeping existing WebSocket and SSE contracts and a single source of truth for recon state. It is **better** as a product direction (unified co-pilot, citations, actions). The main risks are **scope** (do it in phases, ship Phase 1 first) and **backend complexity** (event bus, RBAC, audit); mitigate by implementing read-only awareness and “Explain this” first with minimal backend changes, then layering in the event model, citations, and controls in later phases.

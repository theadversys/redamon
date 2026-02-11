# All Potential Improvements

A single list of potential improvements, grouped by area. Sources: Chat+Recon integration plan, review, and current system.

---

## Chat + Recon integration (unified co-pilot)

1. **Bidirectional awareness** — Chat observes live recon (phase, status, run) and can reference specific phases/logs; Recon Logs can show AI insights inline (summaries, anomalies, next steps).
2. **Start/stop recon from Chat** — User says “Start recon” or “Stop recon” in Chat; agent (or API) triggers existing recon start/stop; no need to switch to toolbar.
3. **“Explain this” in Recon Logs** — User selects log lines → “Ask AI” → agent explains in-place and/or posts answer in Chat with a permalink to the selection.
4. **Live Run capsule in Chat** — Compact card: “Status • Phase 3/7 • 00:12:03 elapsed” with start/stop/pause (where supported) and deep link to Recon tab.
5. **Insight cards in Chat** — As recon runs, agent posts Live Insight cards (e.g. “Subdomain spike suggests wildcard DNS”; “Ports 445/3389 on 3 assets—high exposure”) with citations and actions (Explain, Open asset, Re-run phase, Create ticket).
6. **Citations in every AI answer** — Every agent answer that references recon includes citations to specific log lines/phases (eventId) and deep links to Recon tab.
7. **AI gutter in Recon Logs** — Side channel (left or right) with pinned AI annotations; sync scroll with log content.
8. **Inline “Ask AI” in Recon** — Context menu on log selection: “Explain these errors,” “What changed vs last run?,” “Is this critical?” with optional time window and “include artifacts” toggle.
9. **Run timeline in Recon** — Phase chips with AI markers (e.g. anomalies, summaries) so users see where insights attach to the run.
10. **Guided guardrails** — Mid-run guidance in Chat (e.g. “Focus on SQLi, skip long wordlists”) translated by agent into runtime controls and logged.
11. **Summaries on tap** — Queries like “Summarize last 5 minutes,” “Top risky assets,” “What’s blocking completion?” with citations and deep links.
12. **Project Event Bus** — Backend abstraction (in-process or lightweight) that normalizes recon + agent events; publishers: orchestrator (recon.*), agent (agent.*); subscribers: Chat, Recon Logs, audit.
13. **Normalized event schema** — BaseEvent with eventId, projectId, runId, correlationId, kind, actor, ts, rbacScopes; ReconLogEvent, ReconStatusEvent, AgentInsightEvent with citations and actions.
14. **Correlation model** — runId per recon run; correlationId tying user prompt → agent action → recon config change → insights; citations point to eventIds.
15. **Chat subscribes to curated recon** — Chat receives recon.status and selected recon.* summaries via existing WS (or multiplexed endpoint), not raw SSE scraping.
16. **Resume SSE from eventId** — SSE reconnect with backoff; resume from last eventId (requires cursor/lastEventId protocol and orchestrator support).
17. **Virtualized log list** — Recon Logs uses a virtualized list for very long streams; in-memory cap with circular buffer and persist cursor for replay.
18. **Backpressure** — Drop or sample debug-level logs client-side when CPU-bound (configurable); insights reference citation list, not full payloads.
19. **Throttled auto-summaries** — Agent (or service) emits insights at most every N seconds (e.g. 15s) unless user forces; keeps cost and noise under control.
20. **New agent commands API** — e.g. `POST /api/agent/projects/:projectId/commands` with type: start_recon | stop_recon | guidance | summarize | explain (runId, params).
21. **Insights/events API** — e.g. `GET /api/projects/:projectId/insights?runId=&since=`, `GET /api/projects/:projectId/events?cursor=&limit=` for audit and retrieval.
22. **Recon system prompt update** — Agent system prompt: Recon Co-Pilot; interpret intents; maintain safety/RBAC; observe recon via curated events; cite eventIds; produce concise actionable output with severity, assets, confidence, citations, suggested actions; translate guidance to orchestrator flags; transparent when context is stale.

---

## Security & governance

23. **RBAC on commands** — Server-side checks for recon:read, recon:write, agent:write (or similar); deny restricted actions and explain refusals.
24. **Tenant isolation** — WS/SSE scoped by projectId (and org if applicable); tokens signed with projectId, runId, scopes.
25. **Tamper-proof audit logs** — Immutable store for every agent action and insight: actor, ts, correlationId, pre/post state diffs for runtime flags.
26. **Explicit consent boundaries** — Clear policy for what AI can read/write; document and enforce.
27. **PII hygiene** — Redact sensitive values before they reach the LLM; centralize redactors.
28. **Explain refusals** — When an action isn’t permitted, respond with policy reason and a read-only alternative.

---

## UX & UI (general)

29. **Chat persistence across tab switch** — Already done: both tabs mounted, hide inactive with CSS so chat state persists when switching Chat ↔ Recon.
30. **Deep links from Chat to Recon** — Clicking a citation in Chat jumps to Recon tab and highlights the referenced log range (and optionally scrolls to it).
31. **Citations viewer in Chat** — Hover on citation to preview exact log lines; click to open Recon with highlight.
32. **Keyboard shortcuts** — e.g. Send message, focus input, switch Chat/Recon tab, clear logs.
33. **Recon log search/filter** — Filter by phase, level (error/warn/info), time window, or text search.
34. **Export recon logs** — Export visible or full log stream as text/JSON with optional redaction.
35. **Dark/light theme consistency** — Ensure Chat, Recon, and Graph share the same theme tokens and contrast.
36. **Loading and error states** — Clear skeletons and error messages for Chat (WS disconnect, agent error) and Recon (SSE disconnect, orchestrator error).
37. **Session recovery** — After refresh or reconnect, optionally restore “last N messages” or session summary so the user doesn’t lose context.

---

## Performance & reliability

38. **WebSocket reconnect** — Already present; ensure correlationId and outstanding requests are preserved or replayed where possible.
39. **SSE reconnect with backoff** — useReconSSE already has reconnect; consider lastEventId/cursor for resume.
40. **Graph data refresh** — Already auto-refreshes when recon completes; consider debouncing or incremental updates for very large graphs.
41. **Virtualization for graph** — If graph has many nodes/edges, virtualize or level-of-detail rendering to keep frame rate up.
42. **Panel resize debounce** — When resizing split panel, debounce heavy graph recalc (e.g. layout/camera fit) to avoid jank.
43. **Lazy load Recon tab** — Optionally lazy-load Recon Logs content when tab is first selected to speed initial load (if logs are heavy).
44. **Sampling for AI context** — When sending log context to the agent, use windowed subsets (last N seconds / M events / phase chunk) and optional indexing for top-k (e.g. error bursts).

---

## Deployment & ops

45. **Clear deployment workflow** — Document and script: build with --no-cache when needed, recreate webapp container, verify new code (e.g. marker or version endpoint).
46. **Health and version endpoint** — e.g. `GET /api/health` returns app version or build id so you can confirm what’s deployed.
47. **Feature flags** — e.g. agent_recon_awareness, agent_insights_inline, agent_run_controls, agent_anomaly_detection to roll out integration in phases.
48. **Stable DB credentials** — Already fixed (redamon/redamon_secret); document default vs .env and avoid mixing (e.g. docker-compose defaults aligned with postgres).

---

## Testing & quality

49. **Functional tests** — Start/stop recon via Chat (authorized/unauthorized); “Explain selection” in Recon produces insight with correct citations; switching projects tears down WS/SSE and resubscribes cleanly.
50. **Resilience tests** — SSE drop/reconnect resumes at last eventId; WS reconnect preserves correlationId and outstanding requests.
51. **Security tests** — RBAC denies actions; audit entries for all attempts; cross-tenant isolation.
52. **Quality checks** — Summaries within token budget; citations always resolve to visible logs; handle redaction and log rotation in tests.
53. **E2E for critical paths** — e.g. Start recon from toolbar → see logs in Recon → ask in Chat “What did we find?” → see answer with citations.

---

## Analytics & product

54. **Engagement metrics** — % sessions with AI insight interactions; time-to-first-insight.
55. **Operational metrics** — Insight synthesis latency; WS/SSE reconnect rate; drops and errors.
56. **Outcome metrics** — Mean time to detect (MTTD) high-severity findings; reduction in manual triage steps.
57. **Quality metrics** — Insight acceptance rate; false-positive rate (e.g. via feedback buttons).

---

## Documentation & maintainability

58. **Architecture diagram** — Mermaid or similar: Graph Page → AIPanel → Chat (WS) / Recon (SSE); agent, orchestrator, postgres, neo4j.
59. **Event schema as code** — TypeScript (and optionally Python) interfaces for BaseEvent, ReconLogEvent, AgentInsightEvent in a shared or documented location.
60. **API contract docs** — OpenAPI or markdown for /api/recon/*, /api/agent/*, WS message types so frontend and backend stay in sync.
61. **Runbook** — How to debug “Chat not connecting,” “Recon logs empty,” “500 on /api/projects”; common fixes (credentials, cache, rebuild).

---

## Open design questions (from plan)

62. **Where to store long-lived insights** — Same DB as events vs separate “insights” table with inverted index for retrieval.
63. **Log rotation/redaction vs citations** — How to keep citations resolvable when logs are rotated or redacted; e.g. stable eventId + archival store with RBAC.
64. **Guidance scope** — Which orchestrator flags are user-settable vs agent-suggested only.
65. **Multi-user conflict** — When multiple users guide the same run: last-write-wins vs queue proposals with approvals.

---

## Summary count

| Category                    | Count |
|----------------------------|-------|
| Chat + Recon integration   | 22    |
| Security & governance      | 6     |
| UX & UI                    | 9     |
| Performance & reliability  | 7     |
| Deployment & ops           | 4     |
| Testing & quality          | 5     |
| Analytics & product        | 4     |
| Documentation              | 4     |
| Open design questions      | 4     |
| **Total**                  | **65**|

# Phase 5 Security & Design Questions – Answers

Answers based on current implementation and recommendations for production hardening.

---

## Auth & Access

1. **What authentication will the agent use to call the webapp API (Bearer token via `AGENT_SERVICE_TOKEN`)?**  
   **Current:** No authentication. The agent calls the webapp API with only `projectId` in the query string.  
   **Recommendation:** Introduce `AGENT_SERVICE_TOKEN` and use it as `Authorization: Bearer <token>` when set. Keep unauthenticated behavior for local/dev.

2. **How will the API verify project membership/ownership for every request (server‑side authz check)?**  
   **Current:** No server-side authz. The API queries Neo4j by `projectId` only.  
   **Recommendation:** Add middleware that resolves the request identity (session or Bearer token), loads the project, and checks that the user owns the project before running the query.

3. **Will all agent calls be audited (who/when/what filters/projectId/source)?**  
   **Current:** No audit logging.  
   **Recommendation:** Log every call with: timestamp, identity, projectId, filters, IP/source, and request ID. Persist in a structured log (e.g. JSON) for later analysis.

4. **Should API responses mask `secretValue` by default, with a separate “reveal” endpoint (RBAC + MFA + JIT approval)?**  
   **Current:** Full `secret_value` is returned in API responses and stored in Neo4j.  
   **Recommendation:** Yes. Mask by default (e.g. `sk-proj-***...***`) and add a separate reveal endpoint with stricter RBAC and optional MFA/JIT approval for full value access.

5. **How do we handle session vs. service token—do both paths work consistently?**  
   **Current:** Neither path is implemented for agent→API.  
   **Recommendation:** Support both: session auth for browser users, Bearer `AGENT_SERVICE_TOKEN` for agent calls. Same authz logic (project ownership) for both. Session path: extract user from session. Service path: treat tokens as scoped to a service account with project-level access.

---

## Phase & Guardrails

6. **Are `get_github_findings` and `get_github_stats` available in all phases (informational, exploitation, post_exploitation) as read‑only tools?**  
   **Current:** Only in the **informational** phase.  
   **Rationale:** They are recon/summary tools; exploitation/post-exploitation focus on different actions.

7. **Do we need a feature flag (e.g., `GITHUB_TOOLS_INFO_ONLY`) to restrict to informational only?**  
   **Current:** No flag; they are hard-coded to informational only in `TOOL_PHASE_MAP`.  
   **Recommendation:** Optional feature flag `GITHUB_TOOLS_INFO_ONLY` (default true) to allow configuration; if false, could expose them in other phases if needed.

8. **Are there any actions the agent must never perform (e.g., live key validation) without explicit ROE flags?**  
   **Current:** Tools are read-only (no write or validation).  
   **Recommendation:** Never perform live key validation, credential checks, or any outbound requests using secrets without explicit ROE. Document this in the system prompt and tool descriptions.

---

## HTTP Client & Error Handling

9. **Will we use a centralized HTTP client with timeouts (default 10s) and retries (3x, backoff)?**  
   **Current:** Per-call `httpx.AsyncClient(timeout=30.0)`; no retries or backoff.  
   **Recommendation:** Introduce a shared client with 10s timeout, 3 retries with exponential backoff for transient errors (5xx, 429).

10. **How should we map HTTP errors to tool outputs (401→`unauthorized`, 403→`forbidden`, 429→`rate_limited`, 5xx→retry then `server_error`)?**  
    **Current:** Generic `str(e)` from `httpx.HTTPError`.  
    **Recommendation:** Map status codes to stable tokens: 401→`unauthorized`, 403→`forbidden`, 429→`rate_limited`, 5xx (after retries)→`server_error`. Return structured strings the agent can interpret.

11. **Will every request include a correlation id (`X‑Request‑ID`), and will the API echo/log it?**  
    **Current:** No correlation ID.  
    **Recommendation:** Yes. Agent generates UUID per request, sends `X-Request-ID`. API logs and echoes it in response headers for traceability.

---

## Filters & Query Parameters

12. **Can the API and tool accept the full filter set: `findingType`, `secretType`, `provider`, `severity`, `repo`, `path`, `id`, `since`, `limit`, `offset`?**  
    **Current:** API supports: `findingType`, `secretType`, `severity`, `repo`. Not supported: `provider`, `path`, `id`, `since`, `limit`, `offset`.  
    **Recommendation:** Add the missing filters and pagination (`limit`, `offset`) for completeness.

13. **What are the default and maximum limits (`limit=200` default, `max=2000`)?**  
    **Current:** No limits; returns all findings.  
    **Recommendation:** Default `limit=200`, max `limit=2000`. Enforce in API and tool.

14. **Should `repo`/`path` be substring matches or exact matches?**  
    **Current:** `repo` uses regex `(?i).*${repo}.*` (substring). `path` is not supported.  
    **Recommendation:** Keep substring for `repo`; if adding `path`, use substring for consistency.

15. **Should `since` filter apply to `scan_timestamp` (not commit time)?**  
    **Current:** No `since` filter.  
    **Recommendation:** Yes. `since` applies to `scan_timestamp` (when the finding was scanned), not commit time.

16. **What is the canonical provider list (openai, anthropic, huggingface, etc.) we'll standardize on?**  
    **Current:** Providers are inferred from findings; no centralized list.  
    **Recommendation:** Standardize: `openai`, `anthropic`, `huggingface`, `cohere`, `groq`, `replicate`, `together`, `vertex_ai`, `langchain`, `llama_index`, `unknown`. Use for filters and validation.

---

## Responses & Pagination

17. **Will `/api/github-findings` return `pageInfo { limit, offset, hasMore, totalApprox }`?**  
    **Current:** Returns `{ findings: [...] }` only; no pagination metadata.  
    **Recommendation:** Yes. Add `pageInfo: { limit, offset, hasMore, totalApprox }` when pagination is enabled.

18. **Will `/api/github-stats` include `lastScan` and optionally `scanErrors`?**  
    **Current:** Returns `lastScanTimestamp` (as `lastScanTimestamp`). No `scanErrors`.  
    **Recommendation:** Rename to `lastScan` for consistency; add optional `scanErrors` if we track scan failures.

19. **What is the default sort (by `scanTimestamp DESC`, then severity)?**  
    **Current:** Order by severity (critical→high→medium→low→info), then `scan_timestamp DESC`.  
    **Recommendation:** Keep this, or make it explicit: severity first, then `scanTimestamp DESC`.

---

## Prompts & Safety

20. **Will tool descriptions explicitly instruct the LLM not to print raw secret values and to use summaries/links instead?**  
    **Current:** No explicit instruction.  
    **Recommendation:** Yes. Add: “Do not print raw secret values in responses. Use summaries, counts, and links (e.g. to /secrets) instead.”

21. **Are example tool calls for common queries included in the prompts?**  
    **Current:** High-level examples (e.g. “What GitHub secrets were found?”).  
    **Recommendation:** Add concrete examples: `get_github_stats` with `{}`, `get_github_findings` with `{"severity": "critical"}`, `{"finding_type": "AI_LLM_USAGE"}`.

22. **What is the agent's response when `projectId` is missing in context (clear error asking user to select a project)?**  
    **Current:** Returns `"Error: Missing project_id context (no project selected)"`.  
    **Recommendation:** Keep this; optionally make it slightly more user-oriented: “No project is selected. Please select a project to view GitHub findings.”

---

## Configuration & Deployment

23. **Will the agent always use `WEBAPP_API_URL` as the base URL?**  
    **Current:** Yes.  
    **Recommendation:** Continue using `WEBAPP_API_URL`; no separate GitHub API base.

24. **In production, do we use internal service DNS and/or mTLS instead of public ingress?**  
    **Current:** Uses `host.docker.internal:3000` (dev).  
    **Recommendation:** In production, use internal DNS (e.g. `webapp-internal:3000`) and/or mTLS for agent→API traffic; avoid exposing the API via public ingress for agent calls.

25. **How will `AGENT_SERVICE_TOKEN` be issued, rotated, and scoped (read‑only, project:read)?**  
    **Current:** No service token.  
    **Recommendation:** Tokens issued by an internal auth service; rotation via TTL or manual rotation. Scope: read-only access to project-scoped GitHub data (`project:read`). Store in secrets manager; inject into agent at runtime.

---

## Security Hardening

26. **Are we enforcing rate limiting on the API and backoff in the client?**  
    **Current:** No rate limiting on API; no backoff in agent client.  
    **Recommendation:** Apply rate limiting on `/api/github-findings` and `/api/github-stats` (e.g. per project/user). Agent client: retry with backoff on 429.

27. **Are logs scrubbed to ensure no `secretValue` or sensitive content appears?**  
    **Current:** No scrubbing.  
    **Recommendation:** Yes. Add a log scrubber that redacts `secret_value`, `secretValue`, and similar fields before writing logs.

28. **Any CORS or network policies we need to configure for agent→API calls?**  
    **Current:** Agent runs server-side; no browser CORS.  
    **Recommendation:** CORS is for browser requests. For agent→API, use network policies (e.g. Kubernetes) so only the agent service can reach the API internally.

---

## Testing

29. **Do we have unit tests for authn/authz, filters, and pagination on both API and agent tools?**  
    **Current:** No unit tests for these.  
    **Recommendation:** Add tests for: authn/authz when implemented, filter combinations, pagination, and tool output shapes.

30. **Do we have E2E tests covering happy path, 401/403 handling, pagination, and empty states?**  
    **Current:** No E2E tests.  
    **Recommendation:** Yes. Cover: happy path, 401/403, pagination, empty project, and missing project.

31. **Are there load/perf tests or limits for large projects?**  
    **Current:** No.  
    **Recommendation:** Set limits (e.g. `limit=2000`); run load tests for projects with thousands of findings to ensure acceptable latency and memory use.

---

## Edge Cases & UX

32. **How should the agent behave when there are no findings (empty state messaging)?**  
    **Current:** `get_github_stats` returns zeros; `get_github_findings` returns “No GitHub findings found for this project.”  
    **Recommendation:** Keep this; optionally suggest running a scan if `lastScanTimestamp` is null or old.

33. **How do we handle oversized responses—require filters or paginate automatically?**  
    **Current:** Tool caps at 50 findings in the formatted string; API returns all.  
    **Recommendation:** Add API pagination; agent tool uses `limit` and `offset` and reports when more results exist.

34. **What happens if the provided `projectId` is stale/invalid—should the agent prompt to switch projects?**  
    **Current:** API returns empty findings; no explicit handling.  
    **Recommendation:** If API returns 404 or “project not found”, agent should say: “Project not found or you don’t have access. Please select a different project.”

35. **Will deep‑links like `/secrets?projectId=...&id=...` be supported for specific findings?**  
    **Current:** `/secrets?project=...` exists; no `id` for individual findings.  
    **Recommendation:** Add support for `/secrets?project=...&id=...` (or `findingId=...`) to open a specific finding in the UI.

---

## Conventions & Versioning

36. **Are all query params and JSON fields camelCase and consistent across API and tools?**  
    **Current:** API uses camelCase in responses (`secretType`, `findingType`, etc.); tool uses snake_case in params (`finding_type`).  
    **Recommendation:** Standardize: API stays camelCase; tool accepts both and maps snake_case to camelCase when calling the API.

37. **Do we need an API versioning plan (e.g., `/api/v1/...`) for future changes?**  
    **Current:** No versioning (`/api/github-findings`).  
    **Recommendation:** When breaking changes are expected, introduce `/api/v1/github-findings`. For now, versioning can be deferred.

---

## Telemetry & Observability

38. **What metrics will we emit (success rate, latency, 4xx/5xx by route/tool)?**  
    **Current:** No metrics.  
    **Recommendation:** Emit: request count, latency (p50, p95, p99), 4xx/5xx by route/tool, and optionally by project.

39. **Will correlation ids be present in both agent and API logs for traceability?**  
    **Current:** No correlation IDs.  
    **Recommendation:** Yes. Agent sends `X-Request-ID`; API logs it and echoes it. Ensures full traceability across agent and API logs.

---

## Summary

| Category | Status | Notes |
|----------|--------|-------|
| Auth | **Implemented** | Bearer + X-User-Id for agent; same-origin for browser; anonymous in dev |
| Audit | **Implemented** | JSON audit log: timestamp, identity, projectId, filters, source, requestId |
| Secret masking | **Implemented** | `maskSecretValue()` - first 4 + last 4 chars; reveal endpoint deferred |
| Phase | **Implemented** | Informational only; `GITHUB_TOOLS_INFO_ONLY` flag added |
| HTTP client | **Implemented** | `github_api_client.py`: 10s timeout, 3 retries, exponential backoff |
| Error mapping | **Implemented** | 401→unauthorized, 403→forbidden, 429→rate_limited, 5xx→server_error |
| Filters | **Implemented** | findingType, secretType, provider, severity, repo, path, id, since, limit, offset |
| Pagination | **Implemented** | pageInfo: limit, offset, hasMore, totalApprox |
| lastScan | **Implemented** | Renamed from lastScanTimestamp |
| Prompt safety | **Implemented** | Explicit "NEVER print raw secret values", link to /secrets |
| Rate limiting | **Implemented** | 60 req/min per project/user |
| Deep links | **Implemented** | /secrets?project=...&id=... |
| X-Request-ID | **Implemented** | Agent sends; API logs and echoes |
| Testing | **Pending** | Unit/E2E tests to be added |
| Telemetry | **Pending** | Metrics to be added |

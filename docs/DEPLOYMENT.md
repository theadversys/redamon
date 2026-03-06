# Deployment and Production Readiness

This guide covers production deployment and the checklist for the Vulnerabilities page and related features.

**Vulnerabilities not displaying?** See [FIX_VULNERABILITIES_DISPLAY.md](./FIX_VULNERABILITIES_DISPLAY.md) for step-by-step fixes.

---

## Production Readiness Checklist

Before deploying, ensure:

1. **Neo4j running and reachable**
   - Vulnerabilities page and Graph Map require Neo4j.
   - Verify: `curl http://localhost:3000/api/health` returns `{ "status": "ok", "neo4j": "ok" }`.
   - If `neo4j: "unavailable"`, check connection and credentials.

2. **Neo4j configuration**
   - `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` set and matching the Neo4j instance.
   - Docker Compose: set `NEO4J_PASSWORD=changeme123` in project root `.env` (must match `NEO4J_AUTH` in the Neo4j container).
   - Local dev: add to `webapp/.env.local` (Next.js loads from webapp directory when run from `webapp/`).

3. **Recon pipeline has run at least once**
   - Vulnerability data is stored in Neo4j by the recon orchestrator ingest step.
   - Without at least one successful recon + ingest for a project, Neo4j will have no `Vulnerability` nodes.
   - Run recon for a project via the Graph Map or recon orchestrator.

4. **RECON_OUTPUT_PATH correct**
   - Used for scan metadata (modules executed, whether scans were skipped).
   - Docker: `/app/recon/output` (set by compose).
   - Local dev: `./recon/output` (relative to project root) or match where recon writes.

5. **Kill chain / Launch Test**
   - "Launch Test" requires the kill chain orchestrator on port 8015.
   - Docker: `docker compose up -d kill-chain-orchestrator` (starts recon-orchestrator, agent, webapp as dependencies).
   - Local dev: run `./scripts/run-kill-chain-orchestrator.sh` in a separate terminal. Set `KILL_CHAIN_ORCHESTRATOR_URL=http://localhost:8015` in `webapp/.env.local`.
   - Verify: `curl http://localhost:8015/health` returns `{"status":"healthy",...}`.
   - **503 when launching a test:** The orchestrator is not running or unreachable. Start it (see above) and ensure the webapp can reach it at the configured URL.

---

## Troubleshooting: Launch Test returns 503

If "Launch Test" fails with **503 Service Unavailable**:

1. **Kill chain orchestrator not running** – Start it:
   - Docker: `docker compose up -d kill-chain-orchestrator`
   - Local dev: `./scripts/run-kill-chain-orchestrator.sh` (in a separate terminal)
2. **Webapp cannot reach orchestrator** – Set `KILL_CHAIN_ORCHESTRATOR_URL`:
   - Local dev: `KILL_CHAIN_ORCHESTRATOR_URL=http://localhost:8015` in `webapp/.env.local`
   - Docker: Set automatically by compose
3. **Verify:** `curl http://localhost:8015/health` should return `{"status":"healthy",...}`

---

## Environment Loading (Local Dev)

When running `npm run dev` from `webapp/`, Next.js loads env from the **webapp directory** only:

- `webapp/.env`
- `webapp/.env.local`
- `webapp/.env.development`

The project root `.env` is **not** automatically loaded. For local dev:

- Create `webapp/.env.local` with `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `DATABASE_URL`, etc.
- Or run from project root with env passed through: `cd webapp && env $(grep -v '^#' ../.env | xargs) npm run dev`

---

## Health Check

`GET /api/health` returns:

```json
{ "status": "ok", "neo4j": "ok" }
```

or when Neo4j is unavailable:

```json
{ "status": "ok", "neo4j": "unavailable" }
```

Use this in Docker healthchecks or deployment scripts to detect Neo4j issues early.

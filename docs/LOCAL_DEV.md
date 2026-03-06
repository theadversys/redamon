# Running Without Docker (Local Development)

This guide covers running the PandaExploit webapp and related services outside Docker for faster iteration.

For production deployment and a full checklist, see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Quick Start: Vulnerabilities Page on localhost:3000

### Option A: Full Docker (recommended)

```bash
# From project root
cp .env.example .env
# Ensure WEBAPP_PORT=3000 (default) and NEO4J_PASSWORD=changeme123 in .env

docker compose up -d postgres neo4j webapp-init webapp
```

Open **http://localhost:3000/vulnerabilities** and select a project. The webapp connects to Neo4j via the Docker network. If the page shows "Neo4j connection unavailable," verify `NEO4J_PASSWORD` in `.env` matches the Neo4j container (default `changeme123`).

### Option B: Webapp locally, Neo4j in Docker

```bash
# 1. Start databases
docker compose up -d postgres neo4j

# 2. Create .env in project root (or webapp/.env.local)
cp .env.example .env
# Add for local dev:
# NEO4J_URI=bolt://localhost:7687
# NEO4J_USER=neo4j
# NEO4J_PASSWORD=changeme123

# 3. Run webapp
cd webapp && npm install && npx prisma db push && npm run dev
```

Open **http://localhost:3000/vulnerabilities**. If port 3000 is busy, Next.js may use 3001; run `PORT=3000 npm run dev` to force port 3000.

---

## Recon output path (Vulnerabilities scan status)

The Vulnerabilities page reads `recon_{projectId}.json` for scan metadata (modules executed, whether active scans were skipped). Set `RECON_OUTPUT_PATH` so the webapp can find these files.

| Mode | RECON_OUTPUT_PATH |
|------|-------------------|
| Local dev | `./recon/output` (relative to project root) |
| Docker Compose | `/app/recon/output` (set by compose) |

Ensure the path matches where the recon pipeline writes. If the file is missing (e.g. no volume mount), the page still works but scan status will be unknown.

---

## Neo4j (Vulnerabilities & Graph Map)

The Vulnerabilities page and Graph Map require Neo4j. Without it, you'll see "Neo4j connection unavailable."

| Mode | NEO4J_URI | NEO4J_PASSWORD |
|------|-----------|-----------------|
| Docker Compose | Set by compose (`bolt://neo4j:7687`) | From .env; default `changeme123` |
| Local dev | `bolt://localhost:7687` | Must match Neo4j; default `changeme123` |

**Local dev:** Add to `.env` or `webapp/.env.local`:

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme123
```

Ensure Neo4j is running: `docker compose up -d neo4j`

---

## Agent Zero URL

When running the webapp locally (e.g. `npm run dev` in `webapp/`), the server-side proxy at `/api/a0` needs to reach Agent Zero.

**Required configuration:**

- **Leave `AGENT_ZERO_URL` unset** — the proxy defaults to `http://localhost:50001`
- **Or set** `AGENT_ZERO_URL=http://localhost:50001`

**Do not** set `AGENT_ZERO_URL=http://agent-zero:80` when running outside Docker. The hostname `agent-zero` only resolves inside Docker Compose; you will get `getaddrinfo ENOTFOUND agent-zero` errors.

## Kill Chain / Launch Test

"Launch Test" on the Graph Map requires the kill chain orchestrator. If you see 500/503 when clicking Launch Test, the orchestrator is not reachable.

| Mode | How to run |
|------|------------|
| Docker Compose | `docker compose up -d kill-chain-orchestrator` (starts recon-orchestrator, agent, webapp as deps) |
| Local dev | Run `kill_chain_orchestrator` separately; ensure `KILL_CHAIN_ORCHESTRATOR_URL=http://localhost:8015` in webapp env |

Verify: `curl http://localhost:8015/health` should return `{"status":"healthy",...}`.

---

## Summary

| Environment              | AGENT_ZERO_URL              |
|-------------------------|-----------------------------|
| Local dev (no Docker)    | Unset or `http://localhost:50001` |
| Docker Compose           | `http://agent-zero:80`      |

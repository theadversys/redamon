# Fix: Vulnerabilities Not Displaying

If the Vulnerabilities page shows "Neo4j connection unavailable" or "Failed to fetch vulnerabilities", follow these steps.

---

## Root Cause

Vulnerability data is stored in **Neo4j**. The webapp must connect with the correct password. Two common issues:

1. **Neo4j password mismatch** – Webapp uses wrong `NEO4J_PASSWORD` (Neo4j was initialized with a different password)
2. **Missing .env** – No `.env` file, or Neo4j vars not set correctly

---

## Fix (Choose Your Setup)

### Option A: Docker (webapp in container)

```bash
# 1. Ensure .env exists with Neo4j password
cp .env.example .env   # if .env doesn't exist
# Edit .env and set: NEO4J_PASSWORD=changeme123

# 2. If Neo4j was previously started with wrong password, reset it:
docker compose down
docker volume rm redamon_neo4j_data 2>/dev/null || true   # exact name may vary: docker volume ls | grep neo4j

# 3. Start services (Neo4j will initialize with changeme123)
docker compose up -d postgres neo4j webapp-init webapp

# 4. Verify
curl -s http://localhost:3000/api/health
# Should return: {"status":"ok","neo4j":"ok"}
```

### Option B: Local dev (npm run dev from webapp/)

```bash
# 1. Start Neo4j
docker compose up -d neo4j

# 2. Create webapp/.env.local (one-liner):
./scripts/setup-neo4j-local.sh
# Or manually: cp webapp/.env.local.example webapp/.env.local

# 3. Run webapp
cd webapp && npm run dev

# 4. Verify
curl -s http://localhost:3000/api/health
# Should return: {"status":"ok","neo4j":"ok"}
```

**Important:** Next.js loads env from `webapp/.env.local` when you run from `webapp/`. Project root `.env` is not loaded by the webapp process.

---

## Data: Why Empty List?

Even with correct Neo4j connection, the list can be empty if:

- **No recon has been run** for the selected project – Run "Launch Test" / recon from the Graph Map for that project first
- **Wrong project selected** – Ensure the project dropdown shows the project that has recon data (e.g. ginandjuice)

---

## Quick Verification

| Check | Command |
|-------|---------|
| Neo4j running | `docker ps \| grep neo4j` |
| Health (Neo4j ok) | `curl -s http://localhost:3000/api/health` |
| Neo4j password | Must be `changeme123` (Docker default) |

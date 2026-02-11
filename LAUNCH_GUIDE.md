# PandaExploit Launch Guide

## Quick Start Steps

### Step 1: Configure API Keys

Edit `.env` file and add at least ONE AI provider key:

```bash
# Option 1: Anthropic (Recommended)
ANTHROPIC_API_KEY=sk-ant-...

# Option 2: OpenAI
OPENAI_API_KEY=sk-proj-...
```

**Get your keys:**
- Anthropic: https://console.anthropic.com/
- OpenAI: https://platform.openai.com/api-keys

### Step 2: Build Docker Images

```bash
# Build all images (including recon scanner)
docker compose --profile tools build
```

**Note:** First build takes 10-30 minutes depending on your system.

### Step 3: Start All Services

```bash
# Start all services in detached mode
docker compose up -d
```

### Step 4: Check Service Status

```bash
# Check if all services are running
docker compose ps

# View logs
docker compose logs -f

# View logs for specific service
docker compose logs -f webapp
docker compose logs -f agent
docker compose logs -f neo4j
```

### Step 5: Access the Webapp

Open your browser and go to: **http://localhost:3000**

## Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Webapp** | http://localhost:3000 | Main dashboard |
| Neo4j Browser | http://localhost:7474 | Graph database UI |
| Recon Orchestrator | http://localhost:8010 | Recon API |
| Agent API | http://localhost:8090 | AI agent API |
| MCP Naabu | http://localhost:8000 | Port scanner |
| MCP Curl | http://localhost:8001 | HTTP client |
| MCP Nuclei | http://localhost:8002 | Vuln scanner |
| MCP Metasploit | http://localhost:8003 | Exploitation |

## Troubleshooting

### Services Not Starting

```bash
# Check Docker Desktop is running
docker ps

# Check logs for errors
docker compose logs

# Restart services
docker compose restart
```

### Port Conflicts

If ports are already in use, edit `.env` and change:
```env
WEBAPP_PORT=3001
POSTGRES_PORT=5433
# etc.
```

### Out of Memory

Increase Docker Desktop memory:
- Docker Desktop → Settings → Resources → Memory → Increase to 8GB+

### Rebuild After Code Changes

```bash
# Rebuild specific service
docker compose build webapp
docker compose up -d webapp

# Rebuild all
docker compose --profile tools build
docker compose up -d
```

## Common Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down --volumes

# View logs
docker compose logs -f

# Restart a service
docker compose restart webapp

# Execute command in container
docker compose exec webapp sh
docker compose exec agent python -c "print('test')"
```

## First Time Setup Checklist

- [ ] Docker Desktop installed and running
- [ ] `.env` file created from `.env.example`
- [ ] At least one AI API key added to `.env`
- [ ] Docker images built (`docker compose --profile tools build`)
- [ ] Services started (`docker compose up -d`)
- [ ] Webapp accessible at http://localhost:3000

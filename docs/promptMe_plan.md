# PromptMe Deployment Plan for PandaExploit Masterclass

**Purpose:** Clone, deploy, and launch OWASP PromptMe in Docker so it can be scanned by PandaExploit. Use this plan in a separate Cursor window to set up the target application.

**Target repo:** Either [theadversys/promptme](https://github.com/theadversys/promptme) or [OWASP/www-project-promptme](https://github.com/OWASP/www-project-promptme). Both have identical structure. Use theadversys if you want GitHub scan results from your own org; use OWASP for the canonical upstream.

---

## FAQ (Plan Decisions)

**1. Repo choice:** The plan supports either repo. `theadversys/promptme` is a fork—use it if PandaExploit will scan the `theadversys` GitHub org (Integrations → Target Org). Use `OWASP/www-project-promptme` for the official upstream. No Adversys-specific integration is required.

**2. PandaExploit runtime:** PandaExploit runs in Docker. The recon container uses `network_mode: host`, so it shares the host network and can reach `localhost:5000` when PromptMe is running (whether PromptMe runs natively or in Docker with port mapping). No `host.docker.internal` or shared networking is needed for the recon scan.

**3. Deployment location:** Deploy in a new directory (e.g. `~/projects/promptme`). Do not deploy inside the PandaExploit workspace (`/Users/ow49488/Downloads/redamon`). A sibling folder like `~/Downloads/promptme` or `~/projects/promptme` is recommended.

**4. Model subset:** Not all challenges work with only mistral and llama3. LLM01 uses `mistral` (chat) and `granite3-guardian` (guardian check). LLM03 uses `MODEL_REGISTRY` (likely sqlcoder). For a minimal demo, pull at least `mistral` and `granite3-guardian`; LLM01 will work. For all 10 challenges, pull all five models.

---

## Prerequisites

Before starting, ensure you have:

- [ ] **Docker** and **Docker Compose** installed ([Get Docker](https://docs.docker.com/get-docker/))
- [ ] **Git** installed
- [ ] **8GB+ RAM** available (PromptMe uses ML models; Ollama needs memory)
- [ ] **~10GB disk space** for images and models

---

## Step 1: Clone the Repository

Open a terminal (or new Cursor window) and run:

```bash
# Deploy in a NEW directory (not inside PandaExploit workspace)
cd ~/projects   # or ~/Downloads, etc.—avoid /Users/ow49488/Downloads/redamon

# Clone (choose one):
git clone https://github.com/theadversys/promptme.git    # Fork—use if scanning theadversys org
# OR
git clone https://github.com/OWASP/www-project-promptme.git promptme   # Official upstream

# Enter the project directory
cd promptme
```

**Verify:** You should see files like `main.py`, `requirements.txt`, `challenges/`, `templates/`, etc.

### Optional: Create `.dockerignore`

To speed up builds, create `.dockerignore` in the `promptme` root:

```
.git
__pycache__
*.pyc
.env
logs/
*.log
.gitignore
README.md
CONTRIBUTING.md
SECURITY.md
```

---

## Step 2: Create Docker Configuration Files

PromptMe does not ship with Docker by default. Create these files in the `promptme` directory.

### 2.1 Create `Dockerfile`

Create a file named `Dockerfile` in the `promptme` root:

```dockerfile
# PromptMe - OWASP Vulnerable LLM Application
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for some Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies (use --no-cache-dir to reduce image size)
# Note: torch and transformers are large; first build may take 5-15 minutes
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose main app (5000) and challenge ports (5001-5010)
EXPOSE 5000 5001 5002 5003 5004 5005 5006 5007 5008 5009 5010

# Ollama host - points to the ollama service in docker-compose
ENV OLLAMA_HOST=http://ollama:11434

# Run the Flask app
CMD ["python", "main.py"]
```

### 2.2 Create `docker-compose.yml`

Create a file named `docker-compose.yml` in the `promptme` root:

```yaml
version: "3.8"

services:
  ollama:
    image: ollama/ollama:latest
    container_name: promptme-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    # Keep running (Ollama serves models)
    tty: true
    stdin_open: true

  promptme:
    build: .
    container_name: promptme-app
    ports:
      - "5000:5000"
      - "5001:5001"
      - "5002:5002"
      - "5003:5003"
      - "5004:5004"
      - "5005:5005"
      - "5006:5006"
      - "5007:5007"
      - "5008:5008"
      - "5009:5009"
      - "5010:5010"
    environment:
      - OLLAMA_HOST=http://ollama:11434
    depends_on:
      - ollama
    restart: unless-stopped

volumes:
  ollama_data:
```

---

## Step 3: Build

From the `promptme` directory:

```bash
docker compose build
```

**Expected:** First build may take 5–15 minutes. The image includes `torch`, `transformers`, and other ML dependencies.

**If build fails:** Check for `requirements.txt` changes or missing packages. You may need to adjust the Dockerfile (e.g. use a different Python version).

---

## Step 4: Start the Services

```bash
docker compose up -d
```

This starts:

- **Ollama** on port 11434 (model server)
- **PromptMe** on port 5000 (main app)

---

## Step 5: Pull Required Ollama Models

PromptMe needs models for the challenges. Run:

```bash
# Minimal demo (LLM01 works): mistral + granite3-guardian
docker exec -it promptme-ollama ollama pull mistral
docker exec -it promptme-ollama ollama pull granite3-guardian

# Full demo (all 10 challenges): pull all five
docker exec -it promptme-ollama ollama pull llama3
docker exec -it promptme-ollama ollama pull sqlcoder
docker exec -it promptme-ollama ollama pull granite3.1-moe:1b
```

**Note:** LLM01 uses `mistral` (chat) and `granite3-guardian` (guardian check). Other challenges use llama3, sqlcoder, or granite3.1-moe. First pull may take several minutes.

---

## Step 6: Launch in Browser

1. Open browser: **http://localhost:5000**
2. You should see the PromptMe dashboard with 10 OWASP LLM challenges (LLM01–LLM10).
3. Click **Start** on any challenge (e.g. LLM01) to launch that challenge.

**Verify:**

- Dashboard loads at http://localhost:5000
- At least one challenge starts (e.g. LLM01 at http://localhost:5001)

---

## Step 7: Configure PandaExploit to Scan

In your **PandaExploit** Cursor window:

1. Create a project: **Target Domain** = `localhost`, **Subdomain List** = `["."]`
2. Enable all scan modules: Domain Discovery, Port Scan, HTTP Probe, Resource Enumeration, Vulnerability Scan, GitHub
3. Optional: **Integrations** → GitHub Target Org = `theadversys` (if using fork) or `OWASP` (if using upstream), PAT configured
4. **Start Recon**

PandaExploit will:

- Resolve `localhost` → `127.0.0.1`
- Port scan and find 5000, 5001, etc.
- HTTP probe and discover endpoints
- Run Nuclei on discovered URLs
- Scan GitHub org (theadversys or OWASP, per config) including `promptme` repo for secrets

---

## Step 8: Stop When Done

```bash
cd ~/projects/promptme   # or your path
docker compose down
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Port 5000 already in use** | Stop other services on 5000, or change `5000:5000` to `5050:5000` in docker-compose (then use http://localhost:5050) |
| **Ollama connection refused** | Ensure Ollama container is running: `docker ps` and check `promptme-ollama` |
| **Challenge fails to start** | Check logs: `docker logs promptme-app`; ensure models are pulled |
| **Build fails on torch** | Try `python:3.10-slim` or add `--platform linux/amd64` if on Apple Silicon |
| **PromptMe not reachable from PandaExploit** | PandaExploit recon uses `network_mode: host`, so it shares the host network and can reach `localhost:5000`. Ensure PromptMe is running and port 5000 is mapped. |

---

## Quick Reference

| Service | URL | Port |
|---------|-----|------|
| PromptMe Dashboard | http://localhost:5000 | 5000 |
| LLM01 Challenge | http://localhost:5001 | 5001 |
| LLM02 Challenge | http://localhost:5002 | 5002 |
| ... | ... | ... |
| LLM10 Challenge | http://localhost:5010 | 5010 |
| Ollama API | http://localhost:11434 | 11434 |

---

## Summary Checklist

- [ ] Clone repo (theadversys/promptme or OWASP/www-project-promptme)
- [ ] Create `Dockerfile` and `docker-compose.yml`
- [ ] Run `docker compose build`
- [ ] Run `docker compose up -d`
- [ ] Pull Ollama models: `mistral`, `llama3`, etc.
- [ ] Open http://localhost:5000 in browser
- [ ] Configure PandaExploit with Target Domain = `localhost`
- [ ] Start Recon in PandaExploit

---

## Appendix: PandaExploit Scan Guide (Post-Deployment)

Use this section after PromptMe is deployed and running. It configures PandaExploit to scan both the web app and GitHub.

### Prerequisites

- PromptMe running at http://localhost:5000 (and optionally challenges at 5001–5010)
- PandaExploit services up (`docker compose up -d`)

### Step 1: Create a New Project

1. Open PandaExploit: http://localhost:3000
2. Go to **Projects** → **+ New Project**
3. **Project Name:** e.g. `PromptMe Masterclass`

### Step 2: Target & Modules Tab

| Field | Value |
|-------|-------|
| **Target Domain** | `localhost` |
| **Subdomain List** | Check **Include root domain** (or enter `.`) |
| **Scan Modules** | Enable all: Domain Discovery, Port Scan, HTTP Probe, Resource Enumeration, Vulnerability Scan, **GitHub Secrets & AI Attack Surface** |

### Step 3: Port Scanning Tab (Naabu)

Set **Custom Ports** so PromptMe ports are scanned:

| Field | Value |
|-------|-------|
| **Custom Ports** | `5000-5010` |

This overrides Top Ports and scans 5000 (dashboard) plus 5001–5010 (challenges). Leave other Naabu settings at defaults.

### Step 4: Integrations Tab (GitHub)

| Field | Value |
|-------|-------|
| **GitHub Access Token** | Your PAT (with `repo` scope) |
| **Target Organization** | `theadversys` |
| **Repo Allowlist** | `promptme` (optional—limits scan to that repo) |

### Step 5: Save and Start Recon

1. Click **Create** (or **Save** if editing)
2. Go to **Graph Map** (or the project’s graph page)
3. Click **Start Recon**

### Step 6: What Gets Scanned

| Scan | Target | Result |
|------|--------|--------|
| **Domain Discovery** | localhost | WHOIS may fail; DNS resolves localhost → 127.0.0.1 |
| **Port Scan** | 127.0.0.1 | Ports 5000–5010 (PromptMe) |
| **HTTP Probe** | http://127.0.0.1:5000, etc. | Tech stack, headers, response metadata |
| **Resource Enumeration** | Live URLs | Katana/GAU/Kiterunner discover endpoints |
| **Vulnerability Scan** | Discovered URLs | Nuclei templates (XSS, SQLi, etc.) |
| **GitHub** | theadversys/promptme | Secrets, AI/LLM usage, high-entropy values |

### Step 7: View Results

- **Graph Map:** Domain → IP → Port → BaseURL → Endpoint → Vulnerability
- **Vulnerabilities:** Nuclei findings with severity
- **Secrets:** GitHub findings (filter by AI/LLM, Critical & High)
- **AI Chat:** Ask e.g. “What vulnerabilities exist on localhost?” or “Summarize GitHub secrets for this project”

### Tip: Challenge Ports (5001–5010)

Challenges run on demand. If you want 5001–5010 scanned:

1. Open http://localhost:5000
2. Click **Start** on LLM01, LLM02, etc. to spawn them
3. Then start PandaExploit Recon

Otherwise, only the dashboard (5000) is live during the scan.

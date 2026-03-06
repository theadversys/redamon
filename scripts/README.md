# Scripts

## Kill Chain End-to-End Test

Run the full kill chain (Stages 1–7) and verify SSE logs, pause/resume:

```bash
./scripts/test_kill_chain_e2e.sh <project_id>
./scripts/test_kill_chain_e2e.sh <project_id> --pause-resume   # Test pause/resume
```

Prerequisites: Docker services running (recon-orchestrator, kill-chain-orchestrator, webapp, agent, kali-sandbox). Get project ID from the webapp Projects list.

---

## Recon Logs - Terminal Viewing

Scripts to view Docker container logs in your terminal in real-time.

## Quick Start

### Method 1: Using Docker CLI (Recommended)

```bash
# List all running recon containers
docker ps --filter "name=pandaexploit-recon-"

# Stream logs for a specific container (replace with your container name)
docker logs -f pandaexploit-recon-<project_id>

# Show last 100 lines and follow
docker logs -f --tail 100 pandaexploit-recon-<project_id>
```

### Method 2: Using the Bash Script

```bash
# List all running containers
./scripts/watch_recon_logs.sh --list

# Stream logs for a project
./scripts/watch_recon_logs.sh <project_id>
```

Example:
```bash
./scripts/watch_recon_logs.sh cmleo8x3j0002lk01z9whiwvc
```

### Method 3: Using Python Script

```bash
# Make sure you're in the recon_orchestrator directory or have docker SDK installed
cd recon_orchestrator

# List all running containers
python stream_logs.py --list

# Stream logs for a project
python stream_logs.py <project_id>

# Show last 50 lines without following
python stream_logs.py <project_id> --no-follow --tail 50
```

## Finding Your Container Name

Container names follow the pattern: `pandaexploit-recon-<project_id>`

To find your container:
```bash
# List all recon containers (running and stopped)
docker ps -a --filter "name=pandaexploit-recon-"

# Or search by project ID pattern
docker ps -a | grep <project_id>
```

## Examples

### Example 1: Stream logs for project `cmleo8x3j0002lk01z9whiwvc`

```bash
docker logs -f pandaexploit-recon-cmleo8x3j0002lk01z9whiwvc
```

### Example 2: Show last 200 lines and follow

```bash
docker logs -f --tail 200 pandaexploit-recon-cmleo8x3j0002lk01z9whiwvc
```

### Example 3: View logs without following (one-time output)

```bash
docker logs --tail 100 pandaexploit-recon-cmleo8x3j0002lk01z9whiwvc
```

## Color Coding

The scripts automatically colorize logs:
- **Red**: Errors (`[!]`, `ERROR`, `FAILED`)
- **Green**: Success (`[+]`, `[✓]`, `SUCCESS`)
- **Blue**: Actions (`[*]`, `STARTING`)
- **Cyan**: Phase markers (`[PHASE X]`, `[Phase X]`)
- **Yellow**: Warnings

## Tips

1. **Press Ctrl+C** to stop following logs
2. Use `--tail N` to see the last N lines before following
3. Container names use underscores instead of special characters from project IDs
4. If container is stopped, you can still view logs with `docker logs` (without `-f`)

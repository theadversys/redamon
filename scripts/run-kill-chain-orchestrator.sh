#!/usr/bin/env bash
# Run the Kill Chain Orchestrator for local development.
# Required for "Launch Test" on the Graph Map. Listens on port 8015.
#
# Prerequisites: recon-orchestrator (8010), agent (8080), webapp (3000)
# Set KILL_CHAIN_ORCHESTRATOR_URL=http://localhost:8015 in webapp/.env.local
#
# Usage: ./scripts/run-kill-chain-orchestrator.sh

set -e
cd "$(dirname "$0")/.."

if ! command -v uv &>/dev/null && ! command -v python3 &>/dev/null; then
  echo "Error: Python 3 or uv required. Install: pip install uv"
  exit 1
fi

echo "Starting Kill Chain Orchestrator on http://localhost:8015..."
echo "Verify: curl http://localhost:8015/health"
echo ""

cd kill_chain_orchestrator
if command -v uv &>/dev/null; then
  uv run uvicorn api:app --host 0.0.0.0 --port 8015
elif python3 -c 'import uvicorn' 2>/dev/null; then
  python3 -m uvicorn api:app --host 0.0.0.0 --port 8015
else
  echo "Installing dependencies..."
  pip install -r requirements.txt -q && python3 -m uvicorn api:app --host 0.0.0.0 --port 8015
fi

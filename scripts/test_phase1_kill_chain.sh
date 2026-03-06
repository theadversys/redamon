#!/usr/bin/env bash
# Phase 1 Kill Chain Test - Run locally
#
# Prerequisites:
#   - recon image: docker compose --profile tools build recon
#   - Services: docker compose up -d postgres neo4j recon-orchestrator kill-chain-orchestrator webapp
#   - A project with targetDomain (create via webapp UI)
#
# Usage: ./scripts/test_phase1_kill_chain.sh <project_id>
#   Project ID is required. Find it in the webapp URL when viewing a project graph.

set -e

PROJECT_ID="${1:-}"
RECON_URL="${RECON_ORCHESTRATOR_URL:-http://localhost:8010}"
KC_URL="${KILL_CHAIN_ORCHESTRATOR_URL:-http://localhost:8015}"

echo "=== Phase 1 Kill Chain Test ==="
echo "Recon: $RECON_URL | Kill Chain: $KC_URL"
echo ""

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <project_id>"
  echo "  Get project ID from webapp: Projects list or graph page URL"
  exit 1
fi

# 1. Health checks
echo "1. Health checks..."
curl -sf "$RECON_URL/health" >/dev/null || { echo "FAIL: Recon orchestrator not reachable at $RECON_URL"; exit 1; }
curl -sf "$KC_URL/health" >/dev/null || { echo "FAIL: Kill chain orchestrator not reachable at $KC_URL"; exit 1; }
echo "   OK"
echo ""

# 2. Start kill chain
echo "2. Starting kill chain for project $PROJECT_ID..."
START_RESP=$(curl -sf -X POST "$KC_URL/kill-chain/$PROJECT_ID/start" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user"}') || { echo "FAIL: Start request failed"; exit 1; }
echo "$START_RESP" | jq . 2>/dev/null || echo "$START_RESP"
STATUS=$(echo "$START_RESP" | jq -r '.status' 2>/dev/null)
if [ "$STATUS" != "starting" ] && [ "$STATUS" != "running" ]; then
  echo "   WARN: Expected status starting|running, got: $STATUS"
fi
echo "   OK: Kill chain started"
echo ""

# 3. Stream logs (15s) - capture first few events
echo "3. Streaming logs (15s)..."
curl -sN -H "Accept: text/event-stream" --max-time 15 "$KC_URL/kill-chain/$PROJECT_ID/logs" 2>/dev/null | while IFS= read -r line; do
  if [[ "$line" == data:* ]]; then
    DATA="${line#data:}"
    STAGE=$(echo "$DATA" | jq -r '.stage // empty' 2>/dev/null)
    LOG=$(echo "$DATA" | jq -r '.log // .error // empty' 2>/dev/null)
    [ -n "$LOG" ] && echo "   [Stage $STAGE] $LOG"
  fi
done
echo ""

# 4. Status
echo "4. Status:"
curl -sf "$KC_URL/kill-chain/$PROJECT_ID/status" | jq . 2>/dev/null || true
echo ""

echo "=== Phase 1 Test Complete ==="

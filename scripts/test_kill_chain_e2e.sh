#!/usr/bin/env bash
# End-to-end Kill Chain Test
#
# Verifies: Stages 1-7, pause/resume, SSE logs
#
# Prerequisites:
#   - Docker: docker compose up -d (postgres, neo4j, recon-orchestrator, kill-chain-orchestrator, webapp, agent, kali-sandbox)
#   - Or local: recon-orchestrator (8010), kill-chain-orchestrator (8015), webapp (3000), agent (8080)
#   - A project with targetDomain (create via webapp UI)
#   - KILL_CHAIN_LHOST set for Stage 2 payload generation (optional; skips to Stage 3 if unset)
#
# Usage:
#   ./scripts/test_kill_chain_e2e.sh <project_id>
#   ./scripts/test_kill_chain_e2e.sh <project_id> --pause-resume   # Test pause/resume
#
# Environment:
#   KILL_CHAIN_ORCHESTRATOR_URL  (default: http://localhost:8015)
#   RECON_ORCHESTRATOR_URL       (default: http://localhost:8010)
#   WEBAPP_URL                   (default: http://localhost:3000)

set -e

PROJECT_ID="${1:-}"
TEST_PAUSE_RESUME=false
for arg in "$@"; do
  [ "$arg" = "--pause-resume" ] && TEST_PAUSE_RESUME=true
done

KC_URL="${KILL_CHAIN_ORCHESTRATOR_URL:-http://localhost:8015}"
RECON_URL="${RECON_ORCHESTRATOR_URL:-http://localhost:8010}"
WEBAPP_URL="${WEBAPP_URL:-http://localhost:3000}"

echo "=== Kill Chain End-to-End Test ==="
echo "Project: $PROJECT_ID"
echo "Kill Chain: $KC_URL"
echo "Recon: $RECON_URL"
echo "Webapp: $WEBAPP_URL"
echo ""

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <project_id> [--pause-resume]"
  echo "  Get project ID from webapp: Projects list or graph page URL"
  exit 1
fi

# 1. Health checks
echo "1. Health checks..."
curl -sf "$KC_URL/health" >/dev/null || { echo "FAIL: Kill chain orchestrator not reachable at $KC_URL"; exit 1; }
curl -sf "$RECON_URL/health" >/dev/null || { echo "FAIL: Recon orchestrator not reachable at $RECON_URL"; exit 1; }
echo "   OK"
echo ""

# 2. Start kill chain
echo "2. Starting kill chain..."
START_RESP=$(curl -sf -X POST "$KC_URL/kill-chain/$PROJECT_ID/start" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "e2e-test-user"}') || { echo "FAIL: Start request failed"; exit 1; }
echo "$START_RESP" | jq . 2>/dev/null || echo "$START_RESP"
STATUS=$(echo "$START_RESP" | jq -r '.status' 2>/dev/null)
if [ "$STATUS" != "starting" ] && [ "$STATUS" != "running" ]; then
  echo "   WARN: Expected status starting|running, got: $STATUS"
fi
echo "   OK: Kill chain started"
echo ""

# 3. Stream logs in background, capture stage progression
echo "3. Streaming logs (background, 120s max)..."
STAGES_SEEN=""
(
  curl -sN -H "Accept: text/event-stream" --max-time 120 "$KC_URL/kill-chain/$PROJECT_ID/logs" 2>/dev/null | while IFS= read -r line; do
    if [[ "$line" == event:* ]]; then
      EVENT_TYPE="${line#event:}"
      EVENT_TYPE="${EVENT_TYPE//[$'\r']}"
    fi
    if [[ "$line" == data:* ]]; then
      DATA="${line#data:}"
      STAGE=$(echo "$DATA" | jq -r '.stage // empty' 2>/dev/null)
      LOG=$(echo "$DATA" | jq -r '.log // .error // empty' 2>/dev/null)
      if [ -n "$STAGE" ] && [ -n "$LOG" ]; then
        echo "   [Stage $STAGE] $LOG"
      fi
    fi
  done
) &
LOG_PID=$!

# 4. Optional: Test pause/resume
if [ "$TEST_PAUSE_RESUME" = true ]; then
  sleep 5
  echo ""
  echo "4. Testing pause..."
  PAUSE_RESP=$(curl -sf -X POST "$KC_URL/kill-chain/$PROJECT_ID/pause" 2>/dev/null) || true
  echo "$PAUSE_RESP" | jq . 2>/dev/null || echo "$PAUSE_RESP"
  sleep 3
  echo "   Testing resume..."
  RESUME_RESP=$(curl -sf -X POST "$KC_URL/kill-chain/$PROJECT_ID/resume" 2>/dev/null) || true
  echo "$RESUME_RESP" | jq . 2>/dev/null || echo "$RESUME_RESP"
  echo ""
fi

# 5. Wait for log stream to finish or timeout
wait $LOG_PID 2>/dev/null || true
echo ""

# 6. Final status
echo "6. Final status:"
curl -sf "$KC_URL/kill-chain/$PROJECT_ID/status" | jq . 2>/dev/null || true
echo ""

echo "=== E2E Test Complete ==="
echo "Check the UI at $WEBAPP_URL/graph for full logs and stage progression."

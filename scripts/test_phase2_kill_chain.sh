#!/usr/bin/env bash
# Phase 2 Kill Chain Test - Stage 2 (Weaponization) automation
#
# Prerequisites:
#   - Phase 1 working (recon completes successfully)
#   - Project with recon data (attack paths in graph)
#   - LHOST: Set agentLhost in project settings, or KILL_CHAIN_LHOST env
#   - Weaponizer (kali-sandbox) running for payload generation
#
# Usage: ./scripts/test_phase2_kill_chain.sh <project_id>

set -e

PROJECT_ID="${1:-}"
KC_URL="${KILL_CHAIN_ORCHESTRATOR_URL:-http://localhost:8015}"

echo "=== Phase 2 Kill Chain Test (Stage 2: Weaponization) ==="
echo "Kill Chain: $KC_URL"
echo ""

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: $0 <project_id>"
  echo "  Use a project that has completed recon (has attack paths in graph)"
  exit 1
fi

echo "1. Starting kill chain (Stage 1 runs first, then Stage 2)..."
curl -sf -X POST "$KC_URL/kill-chain/$PROJECT_ID/start" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user"}' | jq .
echo ""

echo "2. Streaming logs (60s - Stage 1 + Stage 2 may take time)..."
curl -sN -H "Accept: text/event-stream" --max-time 60 "$KC_URL/kill-chain/$PROJECT_ID/logs" 2>/dev/null | while IFS= read -r line; do
  if [[ "$line" == data:* ]]; then
    DATA="${line#data:}"
    STAGE=$(echo "$DATA" | jq -r '.stage // empty' 2>/dev/null)
    LOG=$(echo "$DATA" | jq -r '.log // .error // empty' 2>/dev/null)
    SUBSTEP=$(echo "$DATA" | jq -r '.subStep // empty' 2>/dev/null)
    [ -n "$LOG" ] && echo "   [Stage $STAGE] $SUBSTEP: $LOG"
  fi
done
echo ""

echo "3. Final status:"
curl -sf "$KC_URL/kill-chain/$PROJECT_ID/status" | jq .
echo ""

echo "=== Phase 2 Test Complete ==="

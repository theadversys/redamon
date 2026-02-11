#!/bin/bash
# Quick helper to show Docker logs
# Usage: ./scripts/quick_logs.sh <project_id>

if [ -z "$1" ]; then
    echo "Usage: $0 <project_id>"
    echo ""
    echo "Example: $0 cmleo8x3j0002lk01z9whiwvc"
    echo ""
    echo "Or use Docker directly:"
    echo "  docker logs -f pandaexploit-recon-<project_id>"
    exit 1
fi

PROJECT_ID="$1"
CONTAINER_NAME="pandaexploit-recon-$(echo "$PROJECT_ID" | sed 's/[^a-zA-Z0-9_.-]/_/g')"

echo "Streaming logs for: $CONTAINER_NAME"
echo "Press Ctrl+C to stop"
echo ""

docker logs -f --tail 100 "$CONTAINER_NAME"

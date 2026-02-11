#!/bin/bash
# Watch recon container logs in real-time
# Usage: ./scripts/watch_recon_logs.sh <project_id>
#        ./scripts/watch_recon_logs.sh --list

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

if [ "$1" == "--list" ] || [ "$1" == "-l" ]; then
    echo -e "${CYAN}Listing running recon containers...${NC}\n"
    docker ps --filter "name=pandaexploit-recon-" --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"
    echo ""
    echo -e "${YELLOW}To stream logs, use:${NC}"
    echo -e "  ${GREEN}docker logs -f <container_name>${NC}"
    echo -e "  ${GREEN}python recon_orchestrator/stream_logs.py <project_id>${NC}"
    exit 0
fi

if [ -z "$1" ]; then
    echo -e "${RED}Error: Project ID required${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 <project_id>           # Stream logs for a project"
    echo "  $0 --list                 # List all running containers"
    echo ""
    echo "Examples:"
    echo "  $0 cmleo8x3j0002lk01z9whiwvc"
    echo "  docker logs -f pandaexploit-recon-cmleo8x3j0002lk01z9whiwvc"
    exit 1
fi

PROJECT_ID="$1"
CONTAINER_NAME="pandaexploit-recon-$(echo "$PROJECT_ID" | sed 's/[^a-zA-Z0-9_.-]/_/g')"

echo -e "${CYAN}Streaming logs for project: ${PROJECT_ID}${NC}"
echo -e "${CYAN}Container: ${CONTAINER_NAME}${NC}\n"

# Check if container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Container not found. Listing available containers:${NC}\n"
    docker ps --filter "name=pandaexploit-recon-" --format "table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"
    exit 1
fi

# Stream logs
docker logs -f --tail 100 "$CONTAINER_NAME" 2>&1 | while IFS= read -r line; do
    # Colorize output
    if echo "$line" | grep -qE '\[!\]|ERROR|FAILED'; then
        echo -e "${RED}${line}${NC}"
    elif echo "$line" | grep -qE '\[\+\]|\[✓\]|SUCCESS'; then
        echo -e "${GREEN}${line}${NC}"
    elif echo "$line" | grep -qE '\[\*\]|STARTING'; then
        echo -e "${BLUE}${line}${NC}"
    elif echo "$line" | grep -qE '\[PHASE|\[Phase'; then
        echo -e "${CYAN}${line}${NC}"
    else
        echo "$line"
    fi
done

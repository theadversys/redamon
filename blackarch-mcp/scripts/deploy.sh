#!/bin/bash
# Deploy BlackArch MCP to Linode
# Usage: ./deploy.sh [linode_ip]
# Uses password from blackarch-mcp/.root_pass if sshpass available

set -e
LINODE_IP="${1:-66.228.39.20}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT_PASS_FILE="$REPO_ROOT/blackarch-mcp/.root_pass"
SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15"
SCP_CMD="scp -o StrictHostKeyChecking=no"
if [ -f "$ROOT_PASS_FILE" ] && command -v sshpass &>/dev/null; then
  export SSHPASS="$(cat "$ROOT_PASS_FILE")"
  SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15"
  SCP_CMD="sshpass -e scp -o StrictHostKeyChecking=no"
fi

echo "Deploying BlackArch MCP to $LINODE_IP..."

# 1. Bootstrap (Docker, Python)
echo "1. Bootstrapping..."
$SSH_CMD root@$LINODE_IP "
  apt-get update -qq && apt-get install -y -qq docker.io python3-full python3-pip curl
  systemctl enable docker && systemctl start docker
  mkdir -p /opt/blackarch-mcp
" || { echo "SSH failed. Ensure you can: ssh root@$LINODE_IP"; exit 1; }

# 2. Copy files
echo "2. Copying files..."
$SCP_CMD "$REPO_ROOT/blackarch-mcp/main.py" \
    "$REPO_ROOT/blackarch-mcp/requirements.txt" \
    root@$LINODE_IP:/opt/blackarch-mcp/

# 3. Install deps (venv) and start via systemd
echo "3. Installing and starting MCP..."
$SSH_CMD root@$LINODE_IP "
  cd /opt/blackarch-mcp
  python3 -m venv .venv 2>/dev/null || true
  .venv/bin/pip install -q -r requirements.txt
  systemctl stop blackarch-mcp 2>/dev/null || true
  systemctl disable blackarch-mcp 2>/dev/null || true
"
$SCP_CMD "$REPO_ROOT/blackarch-mcp/conf/blackarch-mcp.service" root@$LINODE_IP:/etc/systemd/system/
$SSH_CMD root@$LINODE_IP "
  systemctl daemon-reload
  systemctl enable blackarch-mcp
  systemctl start blackarch-mcp
  sleep 3
  curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/sse || echo 'MCP starting...'
"

echo ""
echo "Deploy complete. MCP at http://$LINODE_IP:8080/sse"

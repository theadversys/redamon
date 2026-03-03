#!/bin/bash
# Run BlackArch MCP Linode provisioning
# Usage: ./run_provision.sh [--ssh-key "ssh-rsa AAAA..."]
# Requires: LINODE_API_KEY in environment or .env

set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "$LINODE_API_KEY" ]; then
  echo "ERROR: Set LINODE_API_KEY"
  echo "  export LINODE_API_KEY=your_key"
  echo "  Or add to .env in blackarch-mcp/"
  exit 1
fi

python3 provision.py "$@"

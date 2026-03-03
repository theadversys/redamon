#!/bin/bash
# Run on Linode to start Cloudflare quick tunnel for BlackArch MCP.
# Use when direct connection to 66.228.39.20:8080 times out (network path issue).
#
# The tunnel URL changes each run. After starting, update:
#   conf/agent-zero-mcp-servers.json
#   conf/agent-zero-mcp-servers-a0-conf.json
# with the new URL (https://xxx.trycloudflare.com/sse)

set -e
which cloudflared >/dev/null || {
  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
  chmod +x /usr/local/bin/cloudflared
}

echo "Starting Cloudflare tunnel. URL will appear below. Use https://<url>/sse for MCP."
exec cloudflared tunnel --url http://127.0.0.1:8080

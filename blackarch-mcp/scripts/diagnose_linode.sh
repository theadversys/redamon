#!/bin/bash
# Run this ON the Linode via SSH: ssh root@66.228.39.20 'bash -s' < scripts/diagnose_linode.sh
# Or: scp scripts/diagnose_linode.sh root@66.228.39.20:/tmp/ && ssh root@66.228.39.20 "bash /tmp/diagnose_linode.sh"

set -e
echo "=== BlackArch MCP Linode Diagnostics ==="
echo

echo "1. Service status:"
systemctl status blackarch-mcp --no-pager 2>/dev/null || echo "  (systemctl failed)"
echo

echo "2. Process listening on 8080:"
ss -tlnp | grep 8080 || netstat -tlnp 2>/dev/null | grep 8080 || echo "  (no listener found)"
echo

echo "3. Last 30 lines of journal log:"
journalctl -u blackarch-mcp -n 30 --no-pager 2>/dev/null || echo "  (journalctl failed)"
echo

echo "4. Curl from localhost (5s timeout):"
curl -s -m 5 http://127.0.0.1:8080/sse 2>&1 | head -5 || echo "  (curl failed or no output)"
echo

echo "5. Docker available:"
docker info 2>&1 | head -3 || echo "  Docker not working"
echo

echo "6. Memory:"
free -h
echo

echo "=== Done ==="

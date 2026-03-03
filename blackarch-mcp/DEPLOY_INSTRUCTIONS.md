# BlackArch MCP - Deploy to Linode

**Linode provisioned:** `66.228.39.20` (blackarch-mcp-production)

## 1. SSH and bootstrap

```bash
# Use password from blackarch-mcp/.root_pass (or add your SSH key to Linode)
ssh root@66.228.39.20
# When prompted, paste the password from .root_pass
```

## 2. Run StackScript on the Linode

Once logged in:

```bash
# Install Docker, Python, uv
apt-get update && apt-get install -y docker.io python3-full python3-pip python3-venv curl git
systemctl enable docker && systemctl start docker
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 3. Deploy MCP gateway

From your **local machine**:

```bash
cd /Users/ow49488/Downloads/redamon/blackarch-mcp
scp main.py requirements.txt blackarch-mcp.service root@66.228.39.20:/opt/blackarch-mcp/
ssh root@66.228.39.20 "cp /opt/blackarch-mcp/blackarch-mcp.service /etc/systemd/system/ && systemctl daemon-reload && systemctl restart blackarch-mcp"
```

**If using systemd** (recommended):
```bash
scp main.py blackarch-mcp.service root@66.228.39.20:/opt/blackarch-mcp/
ssh root@66.228.39.20 "cp /opt/blackarch-mcp/blackarch-mcp.service /etc/systemd/system/ && systemctl daemon-reload && systemctl restart blackarch-mcp"
```

**Timeout (30 min):** The `blackarch-mcp.service` includes `BLACKARCH_TOOL_TIMEOUT=1800` (30 minutes). Redeploy after updating main.py or the service file.

## 4. Verify MCP

```bash
curl -s http://66.228.39.20:8080/sse
# Should return SSE stream or 200
```

## 5. Add to PandaExploit

In `conf/agent-zero-mcp-servers.json`:

```json
"blackarch": {
  "url": "http://66.228.39.20:8080/sse",
  "transport": "sse"
}
```

---

**Note:** VPC and Firewall were skipped (region/API limits). The Linode has a public IP. Consider adding a firewall via Linode Cloud Manager for production.

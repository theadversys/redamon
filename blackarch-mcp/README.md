# BlackArch MCP on Linode Cloud

Production-grade MCP server exposing 2,800+ BlackArch security tools to LLMs. Deployed on Linode in an **isolated VPC** (does not touch existing VMs/VPCs).

## Quick Start (Local)

```bash
cd blackarch-mcp
pip install -r requirements.txt
# Requires Docker for tool execution
python main.py
# MCP SSE at http://0.0.0.0:8080/sse
```

## Provisioning (Linode)

All resources are created in a **new VPC** (`blackarch-vpc`, 10.0.99.0/24):

```bash
cd blackarch-mcp/scripts
pip install httpx
LINODE_API_KEY=your_key python provision.py --ssh-key "ssh-rsa AAAA..."
```

Resources: `blackarch-vpc`, `blackarch-subnet`, `blackarch-firewall`, `blackarch-mcp-production` Linode.

## File Structure

```
blackarch-mcp/
├── main.py              # FastMCP + run_security_tool + blackarch_catalog
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── stackscript.sh       # First-boot bootstrap for Linode
├── blackarch-mcp.service
├── connection_config.json
├── scripts/
│   └── provision.py     # Linode provisioning (isolated VPC)
└── tests/
    └── test_mcp.py
```

## Bearer Auth (Commercial)

Set `SUBSCRIBER_KEYS=key1,key2` to enable. Clients send `Authorization: Bearer <key>`.

## PandaExploit Integration

Add to `conf/agent-zero-mcp-servers.json`:

```json
"blackarch": {
  "url": "https://<linode-ip>:8080/sse",
  "transport": "sse",
  "headers": { "Authorization": "Bearer <key>" }
}
```

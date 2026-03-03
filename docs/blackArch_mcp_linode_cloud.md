# Linode API Key: Set LINODE_API_KEY environment variable (never commit keys)

# ACT AS: Principal DevOps & AI Security Engineer (MCP Specialist)
# OBJECTIVE: Build a Production-Grade, Commercial BlackArch MCP Platform on Linode (Akamai)

## 1. PROJECT OVERVIEW
We are building a scalable "Cybersecurity Oracle" MCP. It exposes the BlackArch toolset (2,800+ tools) to LLMs. Key requirements: Multi-tenant isolation, remote accessibility via SSE, and an automated deployment pipeline using the Linode API.

## 2. PHASE 1: INFRASTRUCTURE-AS-CODE (LINODE API)
Using the connected Linode MCP/API, perform the following:
- **Provision Compute:** Deploy a 'g6-standard-2' (4GB RAM) Linode in your preferred region. OS: Debian 12. Label: `blackarch-mcp-production`.
- **Network Security:** - Create a `Cloud Firewall` allowing 22 (SSH) and 443 (HTTPS).
    - Attach a **VPC** to the instance to ensure tool execution is isolated from the public management plane.
- **Service Identity:** Generate a StackScript that triggers on first boot to install `docker.io`, `python3-full`, `uv`, and the BlackArch keyring/mirrorlist.

## 3. PHASE 2: TOOL ORCHESTRATION LAYER (DOCKER & FASTAPI)
Develop the backend logic on the new instance:
- **Containerized Workers:** Design a "Disposable Container" architecture. Every tool call must spawn a fresh `blackarchlinux/blackarch` container with a 60-second TTL and CPU/RAM limits (Cgroups).
- **The API Gateway:** Use `FastAPI` to create a RESTful wrapper around these containers. 
- **Asynchronous Execution:** Implement a task queue (using `FastAPI BackgroundTasks` or `Celery`) so the MCP can handle long-running scans (Nmap/Nuclei) without timing out the LLM session.

## 4. PHASE 3: MCP PROTOCOL IMPLEMENTATION (FASTMCP)
Construct the MCP Server using the `FastMCP` framework (Python):
- **Dynamic Discovery:** Create a resource called `blackarch_catalog` that pulls the tool list from `https://blackarch.org/tools.html` and exposes it as a searchable index for the LLM.
- **Smart Tool Wrapping:** - Implement a `run_security_tool` function that takes `tool_name` and `arguments` as input.
    - **Sanitization Engine:** Use regex to strip dangerous characters (`;`, `&`, `|`, `>`) from arguments to prevent command injection into the host.
- **Context Management:** Implement "Output Distillation." If a tool output is >1024 tokens, use a small local model or heuristic to summarize the results before returning them to the MCP Client.

## 5. PHASE 4: COMMERCIAL FEATURES (SSE & AUTH)
- **Remote Transport:** Configure the server for **SSE (Server-Sent Events)**. This allows you to host the MCP on Linode and connect to it from *any* Cursor/Claude client globally via URL.
- **Multi-Tenant Auth:** Add a middleware layer that validates a `Bearer` token. Only users with a valid "Subscriber Key" can invoke tools.
- **Audit Logging:** Every tool invocation, its parameters, and the user's ID must be logged to a `SQLite` database on the attached Block Storage for compliance.

## 6. PHASE 5: THE "ENGINEER'S TEST SUITE"
The AI must verify the build with three specific tests:
1.  **Handshake Test:** Verify `mcp-list-tools` returns the dynamic BlackArch catalog.
2.  **Jailbreak Test:** Attempt to run `cat /etc/shadow` via the `run_security_tool` and confirm the Docker sandbox blocks it.
3.  **End-to-End Recon:** Execute `nmap -sP 127.0.0.1` and confirm the structured JSON-RPC response reaches the client.

**Test script:** `blackarch-mcp/scripts/test_tools.py` — Run before Agent Zero integration:
```bash
cd blackarch-mcp && pip install -r requirements-test.txt && python scripts/test_tools.py --url http://66.228.39.20:8080/sse
```

## FINAL DELIVERABLES:
- Complete `main.py` (FastMCP + FastAPI).
- `docker-compose.yml` for the gateway and workers.
- A `connection_config.json` for Claude/Cursor to connect to the remote Linode SSE endpoint.
- A systemd unit file to ensure 99.9% uptime of the MCP server.

**PROCEED WITH PHASE 1: PROVISIONING THE LINODE INFRASTRUCTURE.**
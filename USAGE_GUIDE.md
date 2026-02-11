# PandaExploit Usage Guide

A comprehensive guide to using the PandaExploit AI-powered penetration testing platform.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Workflow](#core-workflow)
3. [User Management](#user-management)
4. [Project Management](#project-management)
5. [Reconnaissance](#reconnaissance)
6. [Graph Visualization](#graph-visualization)
7. [AI Agent Interaction](#ai-agent-interaction)
8. [Project Settings](#project-settings)
9. [Tips & Best Practices](#tips--best-practices)

---

## Getting Started

### Prerequisites

- PandaExploit is running (all services healthy)
- Access to http://localhost:3000
- API keys configured in `.env` (Anthropic/OpenAI, optional: Tavily, NVD)

### First Steps

1. **Open the Webapp**: Navigate to http://localhost:3000
2. **Create a User**: You'll see a prompt to create your first user
3. **Create a Project**: Set up your first penetration testing project
4. **Start Reconnaissance**: Map your target's attack surface
5. **Interact with AI Agent**: Query the graph and guide exploitation

---

## Core Workflow

The typical PandaExploit workflow follows these steps:

```
1. Create User → 2. Create Project → 3. Configure Target → 4. Run Reconnaissance 
   → 5. Explore Graph → 6. Chat with AI Agent → 7. Approve Exploitation → 8. Review Results
```

---

## User Management

### Creating a User

**From Projects Page:**
1. Navigate to `/projects` (click "Projects" in the navigation bar)
2. Click **"+ Create User"** button (center of screen) or **"+ New User"** (top right)
3. Fill in the form:
   - **Name**: Your display name (e.g., "John Doe")
   - **Email**: Unique email address (required, must be unique)
4. Click **"Create User"**

**What Users Do:**
- Users own projects (multi-tenancy)
- Each project is scoped to a user
- Graph data is automatically filtered by user/project
- You can create multiple users for different engagements

### Selecting a User

- Use the **"User:"** dropdown in the Projects page
- The first user is auto-selected if available
- All projects shown are filtered to the selected user

---

## Project Management

### Creating a Project

**Step 1: Navigate to New Project**
- From Projects page, click **"+ New Project"** button
- Or go directly to `/projects/new`

**Step 2: Fill Project Form**

**Required Fields:**
- **Project Name**: Descriptive name (e.g., "Acme Corp Assessment")
- **Target Domain**: Root domain to assess (e.g., `example.com`)

**Optional Fields:**
- **Description**: Notes about the project
- **Subdomain List**: Specific subdomains to scan (leave empty to discover all)
- **All other settings**: 180+ configurable parameters (can be changed later)

**Step 3: Create**
- Click **"Create Project"**
- You'll be redirected to the Graph page (`/graph?project=<project-id>`)

### Project Settings

**Access Settings:**
- Navigate to `/projects/<project-id>/settings`
- Or click the settings icon on a project card

**Key Configuration Categories:**

1. **Target Configuration**
   - Target domain, subdomain list
   - Domain ownership verification
   - Tor usage for anonymity

2. **Scan Modules**
   - Enable/disable: Domain Discovery, Port Scan, HTTP Probe, Resource Enumeration, Vulnerability Scan

3. **Port Scanner (Naabu)**
   - Top ports (100, 1000, custom)
   - Rate limiting, threads, timeout
   - CDN exclusion

4. **Vulnerability Scanner (Nuclei)**
   - Severity filters (critical, high, medium, low)
   - DAST mode (active fuzzing)
   - Template selection

5. **AI Agent Behavior**
   - LLM model selection (gpt-5.2, claude-opus, etc.)
   - Approval requirements for exploitation
   - Post-exploitation settings
   - Payload configuration (LHOST, LPORT)

**Note**: Settings are stored in PostgreSQL and fetched by recon/agent at runtime.

### Viewing Projects

- **Projects Page** (`/projects`): Grid view of all projects for the selected user
- **Project Cards**: Show name, target domain, description, creation date
- **Actions**: Click card to open Graph view, or use delete button

---

## Reconnaissance

### Starting Reconnaissance

**From Graph Page (Recommended):**

1. Navigate to Graph page (`/graph?project=<project-id>`)
2. Ensure project has a target domain configured
3. Click **"Start Recon"** button in the toolbar
4. Confirm in the modal dialog
5. Watch real-time logs in the drawer

**What Happens:**

The reconnaissance pipeline runs **6 sequential phases**:

1. **Domain Discovery**
   - Certificate Transparency (crt.sh)
   - HackerTarget API lookup
   - Optional: Knockpy bruteforce
   - WHOIS lookup
   - DNS resolution (A, AAAA, MX, NS, TXT, CNAME, SOA)

2. **Port Scanning**
   - Naabu SYN/CONNECT scan
   - Service detection
   - CDN/WAF identification

3. **HTTP Probing**
   - httpx probes all HTTP/HTTPS services
   - Technology fingerprinting (Wappalyzer)
   - TLS certificate extraction
   - Header analysis

4. **Resource Enumeration**
   - Katana web crawler
   - GAU historical URL discovery
   - Kiterunner API brute-forcing
   - Endpoint classification

5. **Vulnerability Scanning**
   - Nuclei template scanning (9000+ templates)
   - CVE detection and enrichment
   - Security checks (headers, DNS, TLS, etc.)

6. **MITRE Enrichment**
   - CWE/CAPEC mapping
   - GitHub secret hunting (if configured)

**Output:**
- JSON file: `recon/output/recon_<PROJECT_ID>.json`
- Neo4j graph database populated automatically
- Graph visualization updates in real-time

### Monitoring Reconnaissance

**Real-Time Logs:**
- Click **"View Logs"** button in Graph toolbar
- Logs drawer shows:
  - Current phase name and number
  - Live log output from each tool
  - Progress indicators
  - Errors (if any)

**Status Indicators:**
- **"Start Recon"** button changes to show status:
  - "Starting..." → "Running..." → "Completed" / "Error"
- Graph auto-refreshes every 5 seconds while recon is running

**Download Results:**
- After completion, download JSON via API: `/api/recon/<projectId>/download`

---

## Graph Visualization

### Accessing the Graph

- Navigate to `/graph?project=<project-id>`
- Graph loads automatically for the selected project
- If no data exists, you'll see an empty graph with "Start Recon" prompt

### Graph Features

**3D/2D Toggle:**
- Click **3D/2D** button in toolbar to switch visualization modes
- 3D mode: Interactive force-directed graph (drag to rotate, zoom)
- 2D mode: Traditional top-down view

**Node Labels:**
- Toggle **"Show Labels"** to display/hide node names
- Useful for dense graphs

**Node Types & Colors:**

The graph contains **17 node types**:

**Infrastructure:**
- **Domain** (root domain with WHOIS data)
- **Subdomain** (discovered hostnames)
- **IP** (resolved IP addresses)
- **Port** (open ports)
- **Service** (running services)

**Web Application:**
- **BaseURL** (live HTTP endpoints)
- **Endpoint** (URL paths)
- **Parameter** (input parameters)

**Technology & Security:**
- **Technology** (detected frameworks/libraries)
- **Header** (HTTP headers)
- **Certificate** (TLS certificates)
- **DNSRecord** (DNS records)

**Vulnerabilities:**
- **Vulnerability** (scanner findings)
- **CVE** (known vulnerabilities)
- **MitreData** (CWE mappings)
- **Capec** (attack patterns)
- **Exploit** (successful exploitations)

### Interacting with Nodes

**Select a Node:**
- Click any node in the graph
- Node drawer opens on the right showing:
  - Node properties
  - Relationships (connected nodes)
  - Metadata (discovery date, source, etc.)

**Node Relationships:**
- View connected nodes in the drawer
- Click connected nodes to navigate
- Relationships show the attack surface topology

**Graph Navigation:**
- **Pan**: Click and drag background
- **Zoom**: Mouse wheel or pinch gesture
- **Rotate** (3D): Click and drag nodes
- **Reset View**: Use toolbar controls

### Graph Statistics

- View node counts by type in the bottom bar
- Total nodes displayed
- Breakdown by category (Infrastructure, Web, Vulnerabilities, etc.)

---

## AI Agent Interaction

### Opening the AI Assistant

**From Graph Page:**
- Click **"AI Assistant"** button in the toolbar (sparkles icon)
- AI drawer slides in from the right
- WebSocket connection establishes automatically

### Chat Interface

**Sending Messages:**
- Type your question in the input box at the bottom
- Press **Enter** or click **Send** button
- Agent processes your query using ReAct (Reasoning + Acting) pattern

**Example Queries:**

**Graph Queries (Natural Language → Cypher):**
- *"What vulnerabilities exist on 192.168.1.100?"*
- *"Which technologies have critical CVEs?"*
- *"Show me all open ports on subdomains of example.com"*
- *"Find all endpoints with injectable parameters"*
- *"What CVEs affect Apache servers?"*

**Action Requests:**
- *"Scan ports on 10.0.0.5"*
- *"Check if port 443 is open on example.com"*
- *"What's the technology stack of api.example.com?"*

**Analysis Requests:**
- *"Analyze the attack surface and identify high-value targets"*
- *"What's the most critical vulnerability we found?"*
- *"Summarize all findings for the target domain"*

### Agent Features

**Real-Time Streaming:**
- Agent thoughts stream in real-time
- See reasoning process before actions
- Tool executions shown inline

**Timeline View:**
- Beautiful timeline showing:
  - **Thinking Cards**: Agent's reasoning, planned actions
  - **Tool Execution Cards**: Tool calls, arguments, outputs
  - **Todo List Widget**: Agent's current task list

**Phase Indicators:**
- Current phase shown: **Informational** / **Exploitation** / **Post-Exploitation**
- Phase transitions require approval (if enabled)

**Connection Status:**
- WebSocket status indicator (connected/disconnected)
- Auto-reconnect on connection loss

### Agent Controls

**Stop/Resume:**
- Click **Stop** button to pause agent execution
- State is checkpointed (via LangGraph MemorySaver)
- Click **Resume** to continue from checkpoint

**Guidance:**
- While agent is working, send messages to guide it
- Messages are injected as guidance (not new queries)
- Example: *"Focus on SSH vulnerabilities, ignore web apps"*

**Reset Session:**
- Click **Reset Session** to start fresh
- Clears conversation history
- New WebSocket session created

### Approval Workflows

**Phase Transitions:**
- When agent wants to enter **Exploitation** or **Post-Exploitation** phase:
  - Approval request modal appears
  - Shows: reason, planned actions, risks
  - Options: **Approve**, **Modify**, **Reject**

**Modifying Requests:**
- Click **"Modify"** to add constraints
- Type modification text (e.g., *"Only test CVE-2021-41773, skip others"*)
- Agent incorporates modifications into plan

**Approval States:**
- **Awaiting Approval**: Agent paused, waiting for your decision
- **Approved**: Agent proceeds with plan
- **Rejected**: Agent returns to informational phase

### Q&A Mode

**When Agent Needs Clarification:**
- Agent may ask questions if task is ambiguous
- Question modal appears with:
  - Multiple choice options (if applicable)
  - Text input field
- Answer to continue agent execution

### Tool Execution

**Available Tools:**

**All Phases:**
- `query_graph`: Neo4j Cypher queries
- `web_search`: Tavily-based CVE/exploit research
- `execute_curl`: HTTP requests, API probing
- `execute_naabu`: Port scanning

**Exploitation & Post-Exploitation Only:**
- `metasploit_console`: Exploit execution, payload delivery

**Tool Output:**
- Tool executions shown in timeline
- Output truncated if too long (configurable limit)
- Long-running operations (e.g., Metasploit brute force) stream progress updates

---

## Project Settings

### Accessing Settings

- Navigate to `/projects/<project-id>/settings`
- Or click settings icon on project card

### Key Settings Explained

**Target Configuration:**
- **Target Domain**: Root domain (required)
- **Subdomain List**: Specific subdomains (empty = discover all)
- **Verify Domain Ownership**: Require DNS TXT record proof
- **Use Tor**: Route recon traffic through Tor network

**Scan Modules:**
- Toggle individual modules on/off
- Dependencies: Disabling parent disables children
- Example: Disabling `port_scan` also disables `http_probe`, `resource_enum`, `vuln_scan`

**Port Scanner (Naabu):**
- **Top Ports**: "100", "1000", or custom range
- **Rate Limit**: Packets per second
- **Threads**: Concurrent scan threads
- **Exclude CDN**: Skip Cloudflare/Akamai IPs

**Vulnerability Scanner (Nuclei):**
- **Severity Filter**: critical, high, medium, low
- **DAST Mode**: Active fuzzing (inject payloads)
- **Template Selection**: Include/exclude by path or tag
- **Rate Limiting**: Requests per second

**AI Agent Behavior:**
- **LLM Model**: gpt-5.2, gpt-5, claude-opus, claude-sonnet, etc.
- **Max Iterations**: Reasoning-action loops per objective
- **Require Approval for Exploitation**: Pause before offensive actions
- **Require Approval for Post-Exploitation**: Pause before post-exploitation
- **Post-Exploitation Type**: statefull (Meterpreter) vs. stateless (one-shot)
- **LHOST/LPORT**: Attacker IP/port for reverse shells
- **Custom System Prompts**: Per-phase instructions

**Security Checks:**
- 25+ individual toggles:
  - Network exposure checks
  - TLS/certificate validation
  - Security headers (CSP, HSTS, etc.)
  - DNS security (SPF, DMARC, DNSSEC)
  - Exposed services detection

---

## Tips & Best Practices

### Reconnaissance

1. **Start Small**: Test with a single subdomain first
2. **Use Subdomain Lists**: For focused assessments, specify exact subdomains
3. **Monitor Logs**: Watch for errors or rate limiting
4. **CDN Exclusion**: Enable if scanning CDN-protected assets
5. **Tor Usage**: Enable for anonymous reconnaissance (slower)

### Graph Exploration

1. **Use 2D Mode**: For detailed analysis of relationships
2. **Filter by Type**: Focus on specific node types (Vulnerabilities, CVEs, etc.)
3. **Follow Relationships**: Click connected nodes to explore attack paths
4. **Check Node Properties**: Detailed metadata in drawer

### AI Agent

1. **Be Specific**: Clear queries get better results
   - ✅ *"What CVEs affect Apache 2.4.49?"*
   - ❌ *"Tell me about vulnerabilities"*

2. **Use Graph Queries**: Leverage natural language → Cypher translation
3. **Review Thinking**: Check agent's reasoning before approving actions
4. **Provide Guidance**: Steer agent with guidance messages
5. **Monitor Todo List**: See agent's planned actions

### Security

1. **Approval Workflows**: Keep enabled for production use
2. **Test Targets**: Use intentionally vulnerable test environments
3. **Legal Compliance**: Only scan systems you own or have permission to test
4. **API Keys**: Store securely in `.env` (never commit)

### Performance

1. **Rate Limiting**: Adjust based on target's capacity
2. **Thread Counts**: Balance speed vs. resource usage
3. **Template Selection**: Narrow Nuclei templates for faster scans
4. **Graph Size**: Large graphs may be slower to render (use 2D mode)

---

## Troubleshooting

### Graph Not Loading

- Check project ID in URL: `/graph?project=<project-id>`
- Verify Neo4j is running: http://localhost:7474
- Check browser console for errors

### Recon Not Starting

- Ensure target domain is configured
- Check recon orchestrator logs: `docker compose logs recon-orchestrator`
- Verify project exists in PostgreSQL

### AI Agent Not Responding

- Check WebSocket connection status
- Verify agent service: http://localhost:8090/health
- Check agent logs: `docker compose logs agent`
- Ensure API keys are configured in `.env`

### Port Conflicts

- Webapp: Check if port 3000 is available
- Neo4j: Ports 7474 (Browser), 7687 (Bolt)
- Agent: Port 8090
- Adjust ports in `.env` if needed

---

## Next Steps

1. **Explore Documentation**:
   - [README.md](README.md) - Full system overview
   - [IMPLEMENTATION_DETAILS.md](IMPLEMENTATION_DETAILS.md) - Technical deep dive
   - Component-specific READMEs in each directory

2. **Test with Safe Targets**:
   - Use intentionally vulnerable test environments
   - Test domains: `testphp.vulnweb.com`, `httpbin.org`

3. **Customize Settings**:
   - Tune project parameters for your use case
   - Experiment with different LLM models

4. **Monitor Logs**:
   - Use `docker compose logs -f <service>` for debugging
   - Check webapp browser console for frontend issues

---

## Quick Reference

### URLs

- **Webapp**: http://localhost:3000
- **Neo4j Browser**: http://localhost:7474
- **Agent API**: http://localhost:8090
- **Recon Orchestrator**: http://localhost:8010

### Key Commands

```bash
# View all service logs
docker compose logs -f

# Restart a service
docker compose restart <service-name>

# Check service status
docker compose ps

# Stop all services
docker compose down
```

### Navigation

- **Projects**: `/projects` - Manage projects and users
- **Graph**: `/graph?project=<id>` - Visualize attack surface
- **Settings**: `/projects/<id>/settings` - Configure project

---

**Remember**: PandaExploit is a powerful security tool. Use responsibly and only on systems you own or have explicit permission to test.

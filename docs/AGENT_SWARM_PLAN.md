---
name: Agent Swarm — Multi-Agent Orchestration Platform
overview: >
  Build a visual, scalable, multi-agent orchestration layer on top of Agent Zero that lets
  PandaExploit clients launch, monitor, configure and run swarms of specialized AI agents
  through a world-class UI. Agents are specialized by profile, equipped with curated skills
  and MCP tools, and orchestrated by a master agent (Agent Zero A0) to execute full
  cyber kill chain engagements at scale.
status: planning
version: "1.0"
---

# Agent Swarm — Multi-Agent Orchestration Platform

## Vision

PandaExploit clients should be able to launch **10, 50, or 100 specialized AI agents** from a
single screen — each expert in one phase of the cyber kill chain — with no command line, no
configuration files, no Agent Zero UI. Everything is managed from a dedicated **Agent Command
Center** page inside PandaExploit.

The platform concept:
- **Agent Zero A0** acts as the **master orchestrator** — receives the high-level objective,
  decomposes it into tasks, and delegates to specialized sub-agents by profile.
- **Sub-agents** are spawned on-demand with the right profile (system prompt), skills (knowledge
  injection), and tools (MCP servers). Each is an independent Agent Zero instance sharing context.
- **PandaExploit UI** provides full CRUD for agent profiles, visual swarm builder, real-time
  live feed per agent, and run history — without ever touching the A0 UI.

---

## How Agent Zero Works — Technical Foundation

Understanding A0 internals is required to implement this correctly.

### 1. Agent Profiles

Each profile is a directory: `/agents/{profile-name}/`

```
agents/
├── hacker/
│   ├── agent.json          ← { title, description, context }
│   └── prompts/
│       └── system.md       ← Custom system prompt additions
├── researcher/
├── developer/
├── default/
└── agent0/                 ← Default top-level profile
```

- **User profiles** (our custom ones) go in `/a0/usr/agents/{profile-name}/`
- **Project-scoped** profiles go in `/a0/usr/projects/{id}/.a0proj/agents/{name}/`
- User profiles fully override built-ins at resolution time
- `agent.json` fields: `title`, `description`, `context` (injected into system prompt)

### 2. Subordinate Agent Spawning (call_subordinate.py)

```python
# A0 calls this tool when it needs to delegate
call_subordinate(message="Run recon on target.com", profile="recon-specialist")
```

Internally:
1. `initialize_agent(config)` creates a fresh AgentConfig
2. `config.profile = "recon-specialist"` — sets which `/agents/` dir to load
3. `Agent(parent.number + 1, config, SAME_context)` — shares the context bus
4. `sub.monologue()` — runs autonomously until task complete
5. Result returned to parent; sub-agent's history sealed for compression

Key facts:
- All agents in a tree share **one AgentContext** — data/findings flow freely
- A0 can spawn agents in sequence OR instruct parallel delegation
- Profile can be changed per call: A0 spawns different specialists per stage
- 100-agent trees are architecturally supported (memory and API rate limits apply)

### 3. Skills System

Skills are **SKILL.md** files with YAML frontmatter + markdown body:

```markdown
---
name: pandaexploit
description: Master PandaExploit for pentest, recon, exploitation...
triggers: [pentest, recon, kill chain, exploit, vulnerability]
---

# PandaExploit — Offensive Autonomous Stealth Agent
You are the best offensive security agent in the world...
```

- Discovery: `/skills/`, `/usr/skills/`, `/agents/{name}/skills/`
- Triggered by keywords in user message
- Injected into agent context (not system prompt — loaded at runtime)
- Per-profile skills: assign specific skills to specific profiles
- **This is how we encode kill chain expertise per agent**

### 4. Per-Agent MCP Tools

```python
# Each agent can have different tool access
config.mcp_servers = json.dumps({
  "spiderfoot": { "url": "http://spiderfoot:8080/sse", "transport": "sse" },
  "nmap":       { "url": "http://kali-sandbox:8006/sse", "transport": "sse" }
})
```

- `mcp_servers` is set per AgentConfig at spawn time
- Recon agent gets: spiderfoot, nmap, curl
- Exploit agent gets: metasploit, sqlmap, hydra
- Report agent gets: only pandaexploit MCP (no offensive tools)
- **Principle of least privilege** — each agent only has what it needs

### 5. Settings API (Used to Configure A0 Defaults)

```
GET  /api/settings_get    → Current settings JSON
POST /api/settings_set    → Update settings
```

Settings include: chat model, util model, default profile, knowledge subdir, MCP servers,
memory recall, auth. Used during profile deployment to ensure A0 picks up the right config.

### 6. Socket.IO Protocol (Real-time Communication)

A0 uses Socket.IO for all real-time events:
- `send_message` — send a task to A0
- `log_message` — A0 emits log events (tool calls, responses)
- `state_sync` — agent state updates
- `task_result` — final output when complete

Our webapp proxies these through SSE to the browser for the live feed.

---

## Specialized Agent Profiles — Full Catalog

### Kill Chain Suite (8 Agents)

| # | Profile ID | Name | Specialization | MCPs Granted | Skills |
|---|---|---|---|---|---|
| 1 | `recon-specialist` | Recon Specialist | OSINT, subdomain enum, Google dorks, certificate transparency | spiderfoot, curl, nmap | PandaExploit, SpiderFoot |
| 2 | `port-scanner` | Port & Service Scanner | TCP/UDP scanning, banner grabbing, service fingerprinting, OS detection | nmap, naabu | PandaExploit |
| 3 | `web-fuzzer` | Web Fuzzer | Directory brute-force, parameter fuzzing, endpoint discovery, API fuzzing | ffuf, gobuster, curl | PandaExploit |
| 4 | `vuln-hunter` | Vulnerability Hunter | CVE matching, nuclei templates, OWASP Top 10, misconfig detection | nuclei, curl | PandaExploit, AISecurityRedTeam |
| 5 | `exploit-specialist` | Exploit Specialist | Manual exploitation, SQLi, XSS, SSRF, authentication bypass, Metasploit | metasploit, sqlmap, curl | PandaExploit |
| 6 | `post-exploit` | Post-Exploit Agent | Privilege escalation, lateral movement, credential harvesting, persistence | metasploit, hydra, curl | PandaExploit |
| 7 | `report-writer` | Report Writer | Executive summaries, technical findings, CVSS scoring, remediation advice | pandaexploit MCP only | PandaExploit, PandaExploit_Report |
| 8 | `kill-chain-orchestrator` | Kill Chain Orchestrator | Decomposes engagement into stages, delegates to specialists, synthesizes results | all MCPs | all Kill Chain skills |

### AI Security Suite (2 Agents)

| # | Profile ID | Name | Specialization | MCPs | Skills |
|---|---|---|---|---|---|
| 9 | `ai-red-teamer` | AI Red Teamer | LLM security, promptfoo red team, OWASP LLM Top 10, jailbreaks, prompt injection | promptfoo MCP, pandaexploit MCP | AISecurityRedTeam |
| 10 | `threat-intel` | Threat Intel Analyst | CVE research, MITRE ATT&CK mapping, IOC analysis, threat actor profiling | curl, pandaexploit MCP | SpiderFoot, PandaExploit |

### Infrastructure (1 Profile)

| # | Profile ID | Name | Role |
|---|---|---|---|
| 11 | `master-orchestrator` | Master Orchestrator | Top-level A0. Receives client objective, builds swarm plan, delegates to all above |

---

## Database Schema

### New Tables (Prisma)

```prisma
model AgentProfile {
  id              String   @id @default(cuid())
  slug            String   @unique   // "recon-specialist"
  name            String             // "Recon Specialist"
  description     String
  icon            String             // emoji or lucide icon name
  color           String             // hex brand color e.g. "#6366f1"
  tags            String[]           // ["recon","osint","passive"]
  systemPrompt    String   @db.Text  // The agents/*/agent.json context field
  promptFiles     Json               // { "system.md": "content..." }
  modelProvider   String             // "anthropic"
  modelName       String             // "claude-opus-4-5"
  utilModelName   String?            // "claude-haiku-4-5"
  mcpTools        String[]           // ["spiderfoot","nmap","curl"]
  skills          String[]           // ["PandaExploit","SpiderFoot"]
  knowledgeSubdir String   @default("custom")
  memoryRecall    Boolean  @default(true)
  isBuiltin       Boolean  @default(false)
  isActive        Boolean  @default(true)
  runCount        Int      @default(0)
  successCount    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  runs            AgentRun[]
}

model AgentRun {
  id          String      @id @default(cuid())
  profileId   String
  profile     AgentProfile @relation(fields: [profileId], references: [id])
  projectId   String?
  swarmJobId  String?
  swarmJob    SwarmJob?   @relation(fields: [swarmJobId], references: [id])
  task        String      @db.Text
  status      AgentRunStatus @default(QUEUED)
  result      String?     @db.Text
  logs        Json?       // Array of { timestamp, level, message, tool }
  a0ContextId String?     // Agent Zero context/session ID
  startedAt   DateTime?
  completedAt DateTime?
  durationMs  Int?
  createdAt   DateTime    @default(now())
}

model SwarmJob {
  id              String     @id @default(cuid())
  name            String
  projectId       String?
  orchestratorId  String     // AgentProfile.id for orchestrator
  stages          Json       // [{ stage, profileId, task, dependsOn }]
  parallelism     Int        @default(2)
  hitlCheckpoints String[]   // stage IDs that require human approval
  status          SwarmStatus @default(PENDING)
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime   @default(now())
  runs            AgentRun[]
}

enum AgentRunStatus {
  QUEUED
  RUNNING
  WAITING_FOR_HITL
  COMPLETED
  FAILED
  CANCELLED
}

enum SwarmStatus {
  PENDING
  RUNNING
  PAUSED
  COMPLETED
  FAILED
}
```

---

## API Layer

### Agent Profile Endpoints

```
GET    /api/agents                      → List all profiles (builtin + custom)
POST   /api/agents                      → Create new profile
GET    /api/agents/[slug]               → Get profile detail
PUT    /api/agents/[slug]               → Update profile
DELETE /api/agents/[slug]               → Soft-delete profile
POST   /api/agents/[slug]/deploy        → Write profile files to A0 volume
POST   /api/agents/[slug]/spawn         → Spawn agent for a task
GET    /api/agents/[slug]/runs          → Run history for profile
```

### Agent Run Endpoints

```
GET    /api/agent-runs                  → All runs (filterable)
GET    /api/agent-runs/[id]             → Run detail + logs
GET    /api/agent-runs/[id]/stream      → SSE live log stream
POST   /api/agent-runs/[id]/cancel      → Cancel running agent
POST   /api/agent-runs/[id]/hitl        → Submit human-in-the-loop decision
```

### Swarm Job Endpoints

```
GET    /api/swarms                      → List swarm jobs
POST   /api/swarms                      → Create + launch swarm
GET    /api/swarms/[id]                 → Swarm detail + stage statuses
GET    /api/swarms/[id]/stream          → SSE unified live feed
POST   /api/swarms/[id]/pause           → Pause swarm
POST   /api/swarms/[id]/resume          → Resume swarm
POST   /api/swarms/[id]/stop            → Abort swarm
```

### Skills Endpoints

```
GET    /api/skills                      → List all skills (filesystem scan)
GET    /api/skills/[name]               → Skill detail + content
POST   /api/skills                      → Create new skill
PUT    /api/skills/[name]               → Update skill content
DELETE /api/skills/[name]               → Delete custom skill
```

---

## A0 Integration Layer

### Profile Deployment Service

When a profile is saved in PandaExploit, it must be physically written to the A0 container
volume so Agent Zero can load it.

```typescript
// webapp/src/lib/a0-profile-manager.ts

const A0_USR_AGENTS = '/a0/usr/agents'  // Volume-mounted path

export async function deployProfileToA0(profile: AgentProfile) {
  const dir = `${A0_USR_AGENTS}/${profile.slug}`

  // Write agent.json
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(`${dir}/agent.json`, JSON.stringify({
    title: profile.name,
    description: profile.description,
    context: profile.systemPrompt
  }, null, 2))

  // Write custom system prompt if provided
  if (profile.promptFiles) {
    await fs.mkdir(`${dir}/prompts`, { recursive: true })
    for (const [filename, content] of Object.entries(profile.promptFiles)) {
      await fs.writeFile(`${dir}/prompts/${filename}`, content as string)
    }
  }

  // Write MCP servers config override for this profile
  const mcpConfig = buildMcpConfigForProfile(profile.mcpTools)
  await fs.writeFile(`${dir}/mcp_servers.json`, JSON.stringify(mcpConfig, null, 2))
}

function buildMcpConfigForProfile(tools: string[]): Record<string, MCPServerConfig> {
  const ALL_MCP_SERVERS = {
    spiderfoot:  { url: 'http://pandaexploit-spiderfoot:5009/sse', transport: 'sse' },
    nmap:        { url: 'http://kali-sandbox:8006/sse', transport: 'sse' },
    naabu:       { url: 'http://kali-sandbox:8000/sse', transport: 'sse' },
    curl:        { url: 'http://kali-sandbox:8001/sse', transport: 'sse' },
    nuclei:      { url: 'http://kali-sandbox:8002/sse', transport: 'sse' },
    metasploit:  { url: 'http://kali-sandbox:8003/sse', transport: 'sse' },
    nikto:       { url: 'http://kali-sandbox:8004/sse', transport: 'sse' },
    sqlmap:      { url: 'http://kali-sandbox:8005/sse', transport: 'sse' },
    ffuf:        { url: 'http://kali-sandbox:8007/sse', transport: 'sse' },
    gobuster:    { url: 'http://kali-sandbox:8008/sse', transport: 'sse' },
    hydra:       { url: 'http://kali-sandbox:8009/sse', transport: 'sse' },
    pandaexploit:{ url: 'http://pandaexploit-mcp:8011/mcp', transport: 'http' },
    promptfoo:   { url: 'http://promptfoo-mcp:3100/mcp', transport: 'http' },
  }
  return Object.fromEntries(tools.map(t => [t, ALL_MCP_SERVERS[t]]).filter(([,v]) => v))
}
```

### Agent Spawn Service

```typescript
// webapp/src/lib/a0-spawn.ts

export async function spawnAgent(opts: {
  profileSlug: string
  task: string
  projectId?: string
  swarmJobId?: string
  a0Url?: string
}): Promise<AgentRun> {

  const run = await db.agentRun.create({
    data: {
      profileId: profile.id,
      projectId: opts.projectId,
      swarmJobId: opts.swarmJobId,
      task: opts.task,
      status: 'QUEUED',
    }
  })

  // Build the delegation instruction for A0
  // A0 will call call_subordinate with this profile
  const message = [
    `[SWARM TASK - Run ID: ${run.id}]`,
    `Spawn a subordinate agent with profile="${opts.profileSlug}" and assign it this task:`,
    opts.task,
    opts.projectId ? `\nProject context: ${opts.projectId}` : '',
    `\nReport all findings back when complete. Run ID for logging: ${run.id}`
  ].join('\n')

  // Connect to A0 via Socket.IO and send the task
  const a0Url = opts.a0Url || process.env.AGENT_ZERO_URL
  const socketStream = await a0SocketIO.sendTask(a0Url, message, run.id)

  // Pipe A0 socket events → our DB logs + SSE stream
  socketStream.on('log', (event) => appendRunLog(run.id, event))
  socketStream.on('complete', (result) => finalizeRun(run.id, result))
  socketStream.on('error', (err) => failRun(run.id, err))

  return run
}
```

### A0 Socket.IO Client

```typescript
// webapp/src/lib/a0-socket-client.ts

import { io, Socket } from 'socket.io-client'

class A0SocketClient {
  private socket: Socket | null = null
  private url: string

  async connect(url: string) {
    this.socket = io(url, { transports: ['websocket'] })
    await new Promise((res, rej) => {
      this.socket!.on('connect', res)
      this.socket!.on('connect_error', rej)
    })
  }

  async sendTask(message: string, runId: string): AsyncIterable<A0LogEvent> {
    const eventQueue: A0LogEvent[] = []
    // emit to A0
    this.socket!.emit('send_message', { message, run_id: runId })
    // yield log events as they arrive
    this.socket!.on('log_message', (data) => eventQueue.push(data))
    // ... AsyncGenerator yield from queue
  }
}
```

---

## UI Implementation — Agent Command Center

### Route: `/agents`

This is a new top-level page in PandaExploit, accessible from the main navigation.
Navigation item: `🤖 Agents` between `Operations` and `Graph`.

### Page Layout

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  NAV: Dashboard | Projects | Operations | 🤖 Agents | Graph | Engagements | ... │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  🤖 AGENT COMMAND CENTER                     [+ New Agent]  [⚡ Launch Swarm]   │
│  12 profiles  •  8 active runs  •  247 total runs                               │
│                                                                                  │
│  ┌─── Left Sidebar ──────┐  ┌─── Main Content ──────────────────────────────┐  │
│  │                        │  │                                                │  │
│  │  Filter by Category    │  │  ┌─ View Toggle ────────────────────────────┐ │  │
│  │  ● All Agents (12)     │  │  │  [⊞ Cards]  [☰ List]  [🌐 Topology]    │ │  │
│  │  ○ Kill Chain (8)      │  │  └──────────────────────────────────────────┘ │  │
│  │  ○ AI Red Team (2)     │  │                                                │  │
│  │  ○ Intelligence (1)    │  │  ┌── Agent Cards Grid ───────────────────────┐ │  │
│  │  ○ Custom (1)          │  │  │                                            │ │  │
│  │                        │  │  │  [Card] [Card] [Card] [Card]               │ │  │
│  │  ─ Active Runs ──────  │  │  │  [Card] [Card] [Card] [Card]               │ │  │
│  │                        │  │  │  [Card] [Card] [Card] [Card]               │ │  │
│  │  🟢 recon-specialist   │  │  │                                            │ │  │
│  │     ginandjuice •2m    │  │  └────────────────────────────────────────────┘ │  │
│  │                        │  │                                                │  │
│  │  🟡 web-fuzzer         │  └────────────────────────────────────────────────┘  │
│  │     ginandjuice •queue │                                                      │
│  │                        │                                                      │
│  │  ✅ report-writer      │                                                      │
│  │     done 5m ago        │                                                      │
│  │                        │                                                      │
│  └────────────────────────┘                                                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Agent Card Component

Each card is a **glassmorphism panel** (dark glass with subtle border glow):

```
┌─────────────────────────────────────────────────────┐
│  ┌─ gradient header (profile color) ───────────────┐ │
│  │  🎯  Recon Specialist              🟢 Running   │ │
│  │  OSINT · Subdomain Enum · OSINT               │ │
│  └──────────────────────────────────────────────────┘ │
│                                                       │
│  Model  ┌──────────────────────┐                     │
│         │ 🔵 claude-opus-4-5   │                     │
│         └──────────────────────┘                     │
│                                                       │
│  Skills  [PandaExploit] [SpiderFoot]                 │
│                                                       │
│  Tools   [🌐 spiderfoot] [📡 nmap] [🔌 curl]        │
│                                                       │
│  ─────────────────────────────────────────────────   │
│  Runs: 23  ✓ 21 passed  ✗ 2 failed  ████████░░ 91%  │
│  Last: 5 minutes ago                                  │
│                                                       │
│  [ ▶ Spawn ]  [ ✏ Edit ]  [ ⧉ Clone ]               │
└─────────────────────────────────────────────────────┘
```

Visual design details:
- Background: `rgba(15, 20, 30, 0.8)` with `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(255,255,255,0.08)`
- Header gradient: unique per profile (color field → CSS gradient)
- Status dot: animated pulse when running (green glow)
- Model pill: provider-colored badge (blue=Anthropic, green=OpenAI, purple=Google)
- Success rate bar: color-coded (>90% green, >70% yellow, <70% red)
- Hover: card lifts with `transform: translateY(-4px)` + border glow brightens
- Spawn button: glowing effect on hover, disabled + spinner when running

### Profile Editor (Slide-out Drawer)

Full-width right drawer, 640px wide, slides in from right:

```
┌─────────────── Edit Profile: Recon Specialist ──────────────── [✕] ──┐
│                                                                         │
│  ┌─ IDENTITY ────────────────────────────────────────────────────────┐ │
│  │  Name    [Recon Specialist__________________________]              │ │
│  │  Slug    [recon-specialist] (auto-generated, readonly after save)  │ │
│  │  Icon    [🎯] Color [████████] Tags [recon] [osint] [+]           │ │
│  │  Desc    [OSINT specialist: subdomain enum, certificate...______]  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ MODEL CONFIGURATION ─────────────────────────────────────────────┐ │
│  │  Chat Model     [Anthropic ▼] [claude-opus-4-5 ▼]                 │ │
│  │  Utility Model  [Anthropic ▼] [claude-haiku-4-5 ▼]                │ │
│  │  Context Window [100,000 ▼]   Vision [✓]                          │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ SYSTEM PROMPT ──────────────────────────── [✨ AI Improve] ──────┐ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ You are a world-class recon specialist...                    │  │ │
│  │  │ [Monaco editor, dark theme, markdown syntax highlight]       │  │ │
│  │  │                                                              │  │ │
│  │  │                                                              │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ SKILLS ──────────────────────────────────────── [+ Add Skill] ───┐ │
│  │  ┌─────────────────┐  ┌─────────────────┐                         │ │
│  │  │ ✓ PandaExploit  │  │ ✓ SpiderFoot    │  ┌──────────────────┐  │ │
│  │  │   Cyber ops     │  │   OSINT recon   │  │ ○ AISecurityRedTm│  │ │
│  │  │ [View] [Remove] │  │ [View] [Remove] │  │ [Add]            │  │ │
│  │  └─────────────────┘  └─────────────────┘  └──────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ MCP TOOLS ───────────────────────────────────────────────────────┐ │
│  │  Toggle tools this agent is allowed to use:                        │ │
│  │                                                                     │ │
│  │  [✓] 🕷  spiderfoot    OSINT scanning                              │ │
│  │  [✓] 📡 nmap           Port & service scanning                     │ │
│  │  [✓] 🌐 curl           HTTP requests                               │ │
│  │  [ ] 💣 metasploit     Exploitation framework                      │ │
│  │  [ ] 💉 sqlmap         SQL injection testing                       │ │
│  │  [ ] 🔨 nuclei         Vulnerability scanning                      │ │
│  │  [ ] 🌀 ffuf           Web fuzzing                                 │ │
│  │  [ ] 🔍 gobuster       Directory enumeration                       │ │
│  │  [ ] 🔐 hydra          Password brute-force                        │ │
│  │  [ ] 🔬 pandaexploit   Platform API                                │ │
│  │  [ ] 🤖 promptfoo      AI red teaming                              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌─ KNOWLEDGE ───────────────────────────────────────────────────────┐ │
│  │  Subdir  [custom ▼]   Memory Recall [✓]   Max Memory [50 docs]    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  [ 💾 Save & Deploy to A0 ]     [ ▶ Test Run ]     [ 🗑 Delete ]      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Swarm Launch Modal

Full-screen modal with step-by-step builder:

**Step 1: Target**
```
Select project: [ginandjuice.shop ▼]
Objective: [Full penetration test: recon → exploit → report___________]
```

**Step 2: Stage Builder** (drag-and-drop)
```
┌──────────────────────────────────────────────────────────────────┐
│  Stage 1  [🎯 Recon Specialist ▼]                               │
│           Task: [Run full OSINT and subdomain enumeration_______] │
│                                              [+ Parallel Agent]   │
│           ↓                                                       │
│  Stage 2  [📡 Port Scanner ▼]  +  [🔨 Web Fuzzer ▼]  (parallel) │
│           Task: [Scan all discovered hosts for open ports________] │
│                                                                    │
│           ↓                                                       │
│  Stage 3  [🐛 Vuln Hunter ▼]                                     │
│           Task: [Map vulnerabilities against discovered services__] │
│           ⏸ HITL checkpoint here                                  │
│                                              [+ Add Stage]        │
└──────────────────────────────────────────────────────────────────┘
```

**Step 3: Settings**
```
Orchestrator:    [Master Orchestrator ▼]
Max parallelism: [  2  ] agents at once   ◄────────────► 20
HITL stops at:   [✓ Before Exploit]  [✓ Before Post-Exploit]  [○ Every Stage]
Timeout per agent: [30 min ▼]
```

**Step 4: Review + Launch**
```
Summary card showing full pipeline, estimated duration, models used
[⚡ Launch Swarm]  [Save as Template]  [Cancel]
```

### Live Swarm Monitor

Full-page view when a swarm is running (`/agents/swarms/[id]`):

```
┌──────────── ACTIVE SWARM: ginandjuice.shop ── [⏸ Pause] [■ Stop] ────────────┐
│                                                                                  │
│  ┌─ Agent Topology (real-time tree) ────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │          ┌──────────────────────────┐                                     │  │
│  │          │  🤖 Master Orchestrator  │ ● Running 4m                        │  │
│  │          └────────────┬─────────────┘                                     │  │
│  │               ┌───────┴────────┐                                           │  │
│  │    ┌──────────▼──┐         ┌───▼──────────┐                               │  │
│  │    │ 🎯 Recon    │         │ 📡 Port Scan │                               │  │
│  │    │ ✅ Done 2m  │         │ 🟢 Running   │                               │  │
│  │    └──────────────┘         └──────────────┘                               │  │
│  │                                                                            │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌─ Live Feed ───────────────────────────── [🎯 Recon ▼] [All Agents ▼] ────┐  │
│  │  08:31:02  [Recon]  🔍 Found 47 subdomains for ginandjuice.shop            │  │
│  │  08:31:15  [Recon]  🕷  SpiderFoot scan initiated — scan_id: sf_abc123     │  │
│  │  08:31:40  [Recon]  ✅ Recon complete. 47 subdomains, 12 live hosts        │  │
│  │  08:31:41  [Orch]   📡 Delegating to Port Scanner with 12 hosts...         │  │
│  │  08:31:43  [Port]   🔧 Running nmap -sV -p- on 47.128.82.14               │  │
│  │  08:31:55  [Port]   📊 Port 80/tcp open (nginx 1.18.0)                    │  │
│  │  08:31:55  [Port]   📊 Port 443/tcp open (nginx 1.18.0 / TLS 1.2)        │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Findings: [12 hosts] [89 ports] [3 vulns] [1 credential]  ── updated 5s ago   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Topology View (Network Graph)

A third view mode for the agents page — shows agents as nodes:
- Each profile = a node, colored by category
- Edges = "can be delegated by" relationships
- Live runs pulse/glow
- Click a node = agent detail drawer opens
- Uses the existing Neo4j graph component (or D3/force-graph)

---

## Skill Builder Page

Route: `/agents/skills`

```
┌──────────────── SKILL LIBRARY ─────────────── [+ New Skill] ──────────────────┐
│                                                                                  │
│  Search: [_______________]  Filter: [Kill Chain ▼]                              │
│                                                                                  │
│  ┌─ PandaExploit ──────┐  ┌─ SpiderFoot ─────────┐  ┌─ AISecurityRedTeam ──┐  │
│  │ 🟢 Active           │  │ 🟢 Active             │  │ 🟢 Active            │  │
│  │ Used by 8 profiles  │  │ Used by 3 profiles    │  │ Used by 2 profiles   │  │
│  │ 1,247 lines         │  │ 892 lines             │  │ 634 lines            │  │
│  │ [Edit] [Preview]    │  │ [Edit] [Preview]      │  │ [Edit] [Preview]     │  │
│  └─────────────────────┘  └──────────────────────┘  └──────────────────────┘  │
│                                                                                  │
│  ┌─ Kill Chain Stage 1 ─┐  ┌─ Kill Chain Stage 2 ┐  ┌─ OWASP Top 10 ───────┐  │
│  │ 📝 Draft             │  │ 📝 Draft             │  │ 📝 Draft             │  │
│  │ [Create]             │  │ [Create]             │  │ [Create]             │  │
│  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Skill editor: full-page Monaco editor with:
- YAML frontmatter form (name, description, triggers, tags) on the left
- Markdown content editor on the right
- Live preview panel showing how the skill renders

---

## File Structure Changes

```
webapp/
└── src/
    ├── app/
    │   ├── agents/
    │   │   ├── page.tsx                 ← Agent Command Center (cards grid)
    │   │   ├── skills/
    │   │   │   └── page.tsx             ← Skill Library
    │   │   └── swarms/
    │   │       └── [id]/
    │   │           └── page.tsx         ← Live Swarm Monitor
    │   └── api/
    │       ├── agents/
    │       │   ├── route.ts             ← GET list, POST create
    │       │   └── [slug]/
    │       │       ├── route.ts         ← GET, PUT, DELETE
    │       │       ├── deploy/
    │       │       │   └── route.ts     ← Write files to A0 volume
    │       │       ├── spawn/
    │       │       │   └── route.ts     ← Launch agent task
    │       │       └── runs/
    │       │           └── route.ts     ← Run history
    │       ├── agent-runs/
    │       │   ├── route.ts
    │       │   └── [id]/
    │       │       ├── route.ts
    │       │       └── stream/
    │       │           └── route.ts     ← SSE live log stream
    │       ├── swarms/
    │       │   ├── route.ts
    │       │   └── [id]/
    │       │       ├── route.ts
    │       │       └── stream/
    │       │           └── route.ts     ← SSE unified feed
    │       └── skills/
    │           ├── route.ts
    │           └── [name]/
    │               └── route.ts
    ├── components/
    │   └── agents/
    │       ├── AgentCard.tsx            ← Profile card component
    │       ├── AgentProfileDrawer.tsx   ← Edit/create drawer
    │       ├── SwarmLaunchModal.tsx     ← Multi-step swarm builder
    │       ├── SwarmMonitor.tsx         ← Live topology + feed
    │       ├── AgentTopologyGraph.tsx   ← D3 agent tree visualization
    │       └── SkillCard.tsx            ← Skill library card
    ├── hooks/
    │   ├── useAgentRunStream.ts         ← SSE hook for agent live logs
    │   └── useSwarmStream.ts            ← SSE hook for swarm feed
    └── lib/
        ├── a0-profile-manager.ts        ← Profile file writer
        ├── a0-spawn.ts                  ← Agent spawn service
        └── a0-socket-client.ts          ← A0 Socket.IO client

docs/agents/                             ← Profile definitions (source of truth)
├── recon-specialist/
│   ├── agent.json
│   └── prompts/system.md
├── port-scanner/
├── web-fuzzer/
├── vuln-hunter/
├── exploit-specialist/
├── post-exploit/
├── report-writer/
├── ai-red-teamer/
├── threat-intel/
└── kill-chain-orchestrator/

docs/skills/
├── PandaExploit/SKILL.md               ← Existing
├── AISecurityRedTeam/SKILL.md          ← Existing
├── SpiderFoot/SKILL.md                 ← Existing
├── KillChainStage1/SKILL.md            ← New — Reconnaissance
├── KillChainStage2/SKILL.md            ← New — Weaponization
├── KillChainStage3/SKILL.md            ← New — Delivery
├── KillChainStage4/SKILL.md            ← New — Exploitation
├── KillChainStage5/SKILL.md            ← New — Installation
├── KillChainStage6/SKILL.md            ← New — C2
├── KillChainStage7/SKILL.md            ← New — Actions on Objectives
├── OWASPTop10/SKILL.md                 ← New — Web app testing
├── MITREAttack/SKILL.md                ← New — ATT&CK framework
└── ReportWriter/SKILL.md               ← New — Report generation
```

---

## Navigation Integration

Add `Agents` to the main nav in `layout.tsx` / `Sidebar.tsx`:

```typescript
{ href: '/agents', label: 'Agents', icon: Bot, badge: activeRunCount }
```

---

## Scale-Out Strategy (Multiple A0 Instances)

For running 100+ concurrent agents:

### Docker Compose Addition

```yaml
# docker-compose.yml — add these after existing agent-zero
agent-zero-2:
  <<: *agent-zero-defaults
  container_name: pandaexploit-agent-zero-2
  ports: ["50002:80"]
  environment:
    <<: *agent-zero-env
    A0_INSTANCE_ID: "2"

agent-zero-3:
  <<: *agent-zero-defaults
  container_name: pandaexploit-agent-zero-3
  ports: ["50003:80"]
  environment:
    <<: *agent-zero-env
    A0_INSTANCE_ID: "3"
```

### Load Balancer (API)

```typescript
// /api/agents/[slug]/spawn — picks least-loaded instance
const instances = [
  { url: 'http://agent-zero:80',   id: '1' },
  { url: 'http://agent-zero-2:80', id: '2' },
  { url: 'http://agent-zero-3:80', id: '3' },
]

// Track active runs per instance in Redis/DB
async function pickInstance() {
  const loads = await Promise.all(
    instances.map(async i => ({
      ...i,
      load: await db.agentRun.count({
        where: { a0InstanceId: i.id, status: 'RUNNING' }
      })
    }))
  )
  return loads.sort((a, b) => a.load - b.load)[0]
}
```

Capacity planning:
- 1 A0 instance: ~5-10 concurrent agents (Claude Opus rate limits)
- 3 A0 instances: ~15-30 concurrent agents
- 10 A0 instances: ~50-100 concurrent agents
- API rate limits are the bottleneck, not the infrastructure

---

## Implementation Stages

### Stage 1 — Foundation (Proof of Concept)
**Goal**: One working agent profile end-to-end

1. Create `AgentProfile` + `AgentRun` Prisma schema + migration
2. Seed one profile: `recon-specialist` (hardcoded, no UI yet)
3. Write `a0-profile-manager.ts` — deploy profile files to A0 volume
4. Build `POST /api/agents/[slug]/spawn` endpoint
5. Build minimal UI: single card with Spawn button + terminal output
6. Verify: click Spawn → A0 spawns recon sub-agent → output streams to UI

**Definition of done**: Can spawn Recon Specialist from PandaExploit UI and see live A0 logs

---

### Stage 2 — Full Profile CRUD
**Goal**: Full create/read/update/delete for agent profiles in the UI

1. Build `GET/POST /api/agents` and `GET/PUT/DELETE /api/agents/[slug]`
2. Build the Agent Command Center page (`/agents`) with cards grid
3. Build Profile Editor drawer with all fields (identity, model, prompt, skills, tools)
4. Seed all 11 profiles from `docs/agents/` directory
5. Deploy button writes files to A0 volume + updates DB
6. Add `Agents` nav item with active run badge

**Definition of done**: All 11 profiles visible, editable, and deployable from PandaExploit UI

---

### Stage 3 — Skill Builder
**Goal**: Create and assign skills from PandaExploit UI

1. Build `GET/POST/PUT/DELETE /api/skills` (reads/writes docs/skills/)
2. Build Skill Library page with Monaco editor
3. Create 7 new kill chain stage skills (Stage 1–7)
4. Create OWASP Top 10 and MITRE ATT&CK skills
5. Wire skill assignment in Profile Editor (toggle checkboxes)
6. Skill deploy: writes SKILL.md to A0 volume on save

**Definition of done**: Can create a new skill in UI and assign it to a profile

---

### Stage 4 — Swarm Builder + Monitor
**Goal**: Multi-agent orchestration with visual builder and live monitor

1. Design `SwarmJob` + stage schema
2. Build `POST /api/swarms` — creates and launches swarm
3. Build Swarm Launch Modal (3-step: target → stages → settings)
4. Build Swarm Monitor page with topology graph + unified live feed
5. Build SSE stream that multiplexes logs from all running sub-agents
6. Add HITL checkpoint support (pause swarm, show approval UI, resume)

**Definition of done**: Can launch a 3-stage swarm and watch all agents in real-time

---

### Stage 5 — History + Analytics
**Goal**: Full run history and performance analytics

1. Run history table per profile (filter by project, date, status)
2. Run detail page: full log replay, findings extracted, duration, model cost estimate
3. Swarm history: stage-by-stage timeline view
4. Profile analytics: success rate trend, avg duration, common failures
5. Export: run logs as PDF/JSON

**Definition of done**: Can review any past run with full logs and metrics

---

### Stage 6 — Scale-Out
**Goal**: Support 50-100 concurrent agents

1. Add 2 more A0 instances to docker-compose
2. Build instance registry (health check, capacity tracking)
3. Build load balancer in spawn API
4. Add instance affinity for swarm jobs (all stages of a swarm prefer same instance)
5. Test 10 parallel agents, then 50, then 100

**Definition of done**: 20 concurrent agents running simultaneously with no errors

---

## Prisma Migration

```bash
# Run after adding new models to schema.prisma
cd webapp
npx prisma migrate dev --name add-agent-swarm
npx prisma generate
```

---

## First Action: Proof of Concept

The single fastest path to proving this works:

```
1. Add AgentProfile + AgentRun to schema.prisma
2. Run migration
3. Write a0-profile-manager.ts (deploy profile files)
4. Create /agents/page.tsx with single hardcoded recon-specialist card
5. POST /api/agents/recon-specialist/spawn → calls A0 Socket.IO
6. Stream response via SSE to a <pre> terminal block on the page
7. Verify in browser: card → spawn → see A0 thinking → see recon output
```

Time estimate: 4-6 hours of focused implementation.
Once this works, every other profile is configuration, every other UI feature is iteration.

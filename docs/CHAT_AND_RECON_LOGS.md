# How the Chat and Recon Logs Tabs Work

## High-level: two separate features, one panel

The **Chat** tab and **Recon Logs** tab live in the same **AI Panel** but use different backends and data flows. They are **not** wired to each other; they only share the current **project** and the same **projectId**.

- **Chat** → talks to the **AI agent** (WebSocket).
- **Recon Logs** → shows live output from the **recon scanner** (SSE + status API).

So: same project context, different services and no shared state between the two UIs.

---

## Where things live in the UI

```
Graph Page (page.tsx)
├── useReconStatus(projectId)     → recon state (idle / running / completed / error)
├── useReconSSE(projectId)        → recon logs stream + phase info
├── useSession()                  → sessionId for the agent
├── useProject()                  → projectId, currentProject
│
└── <PanelLayout>
      └── <AIPanel
            projectId={...}
            sessionId={...}
            reconLogs={reconLogs}           ← from useReconSSE
            currentPhase={...}
            currentPhaseNumber={...}
            reconStatus={reconState?.status} ← from useReconStatus
            onClearLogs={clearLogs}
          >
            ├── Tab: Chat   → <AIAssistantDrawer />   (uses useAgentWebSocket)
            └── Tab: Recon  → <ReconLogsDrawer />     (receives logs + status as props)
          </AIPanel>
```

- **Graph page** owns recon state and logs (hooks) and passes them into **AIPanel**.
- **AIPanel** only switches between the two tabs and passes props to each child.
- **Chat** and **Recon** do not call each other; they only receive props (and Chat uses its own WebSocket hook).

---

## Chat tab (AIAssistantDrawer)

### What it does

- Lets you type messages and get answers from the **AI agent** (vulnerabilities, graph, next steps, etc.).
- Shows a single timeline: user messages, assistant replies, “thinking”, and tool runs in one scrollable view.
- Can send **guidance** while the agent is already running (e.g. “focus on SQLi”).

### How it’s built

- **Data / connection**
  - Uses **`useAgentWebSocket`** with `userId`, `projectId`, `sessionId`.
  - Connects to the agent’s WebSocket (e.g. `ws://agent:8080/ws/agent`).
  - All conversation state lives **inside** the component: `chatItems`, `inputValue`, `isLoading`, etc.

- **Flow**
  1. User types and sends → `sendQuery(question)` or `sendGuidance(question)` over the WebSocket.
  2. Agent streams back events (thoughts, tool runs, final answer).
  3. Hook’s `onMessage` updates `chatItems` (and related state) so the timeline updates in real time.

- **Scope**
  - Scoped to **project** (projectId) and **session** (sessionId).
  - Does **not** start recon and does **not** read recon logs. It only talks to the agent; the agent may use graph/API (which can include recon-derived data) on the backend.

---

## Recon Logs tab (ReconLogsDrawer)

### What it does

- Shows **live logs** from the recon pipeline (subdomain discovery, port scan, HTTP probe, resource enum, vuln scan, etc.).
- Shows current **phase** (e.g. “Phase 4/7: Resource Enumeration”) and status (idle / running / completed / error).
- Lets you clear logs (button → `onClearLogs()`).

### How it’s built

- **Data**
  - Does **not** fetch anything itself. It only receives from the **graph page**:
    - `logs` ← from **`useReconSSE`**
    - `currentPhase`, `currentPhaseNumber`, `status` ← from **`useReconStatus`** (and derived from the same recon state).
  - So: **Recon Logs** is a “dumb” view of data owned by the page.

- **Where the data comes from**
  - **`useReconStatus(projectId)`**
    - Polls **`/api/recon/[projectId]/status`** (which talks to the recon orchestrator).
    - Returns status: `idle` | `starting` | `running` | `completed` | `error`.
  - **`useReconSSE(projectId, enabled)`**
    - When recon is running (`enabled = true`), opens an **SSE** connection to **`/api/recon/[projectId]/logs`**.
    - That API **proxies** to the recon orchestrator’s SSE endpoint.
    - Orchestrator streams events: `log`, `complete`, etc. The hook parses them and appends to `logs`, and updates `currentPhase` / `currentPhaseNumber` when a new phase starts.

- **Who starts recon**
  - Recon is **started from the Graph toolbar** (e.g. “Start recon” → confirmation modal → `startRecon()` from `useReconStatus`).
  - The **Chat** tab does not start or stop recon.

---

## Do they work together?

- **Same project**
  - Both tabs use the same `projectId` (and user/session where relevant). So Chat and Recon Logs are for the **same project**.

- **No direct coupling**
  - Chat does not start/stop recon.
  - Chat does not read recon logs or recon status.
  - Recon Logs does not send messages to the agent or read chat state.
  - So they don’t “work together” in the sense of shared UI state or direct calls between the two tabs.

- **Indirect link (backend)**
  - The **agent** (backend) can query the graph DB, vulnerabilities API, etc. Recon writes into the graph and related data, so the **agent’s answers** can be influenced by recon results. That’s backend logic; the Chat UI just displays what the agent sends.

- **UX**
  - You use **Chat** to talk to the agent (e.g. “What vulnerabilities were found?”).
  - You use **Recon Logs** to watch the recon scan in real time.
  - Switching tabs only changes which of the two views is visible; both keep their state (e.g. chat history and recon logs) because both are always mounted and only hidden with CSS.

---

## Data flow summary

| Tab    | Data source              | Transport        | Who owns the data      |
|--------|---------------------------|------------------|-------------------------|
| Chat   | AI agent                  | WebSocket        | AIAssistantDrawer       |
| Recon  | Recon orchestrator        | SSE + REST poll  | Graph page (hooks)      |

- **Chat**: WebSocket → agent; agent may use graph/DB (which recon feeds).  
- **Recon**: SSE for logs, REST for status; data is owned by the page and passed into ReconLogsDrawer as props.

So: **they work next to each other (same project, same panel), but they are built separately and do not share state or directly drive each other.**

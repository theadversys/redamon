/**
 * A0 API Client
 * Server-side client for interacting with Agent Zero's HTTP API.
 *
 * Key endpoint: POST /api_message
 *   - Requires X-API-KEY header (mcp_server_token from A0 settings)
 *   - No CSRF needed (designed for external API integrations)
 *   - Supports agent_profile to set which profile handles the request
 *   - Returns { context_id, response } synchronously after agent completes
 */

const A0_BASE = process.env.AGENT_ZERO_URL || 'http://agent-zero:80'
const A0_API_KEY = process.env.A0_API_KEY || ''

export interface A0SendTaskOpts {
  message: string
  agentProfile?: string
  contextId?: string
  projectName?: string
}

export interface A0TaskResult {
  contextId: string
  response: string
}

/**
 * Send a task to Agent Zero and wait for completion.
 * Uses the /api_message endpoint which is designed for external API integrations.
 * Note: This is synchronous — it blocks until A0 finishes the task.
 * For long tasks use sendTaskAsync() which returns immediately.
 */
export async function sendTask(opts: A0SendTaskOpts): Promise<A0TaskResult> {
  const body: Record<string, string> = {
    message: opts.message,
  }
  if (opts.agentProfile) body.agent_profile = opts.agentProfile
  if (opts.contextId) body.context_id = opts.contextId
  if (opts.projectName) body.project_name = opts.projectName

  const res = await fetch(`${A0_BASE}/api_message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': A0_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`A0 api_message failed ${res.status}: ${text}`)
  }

  const data = await res.json()
  if (data.error) throw new Error(`A0 error: ${data.error}`)

  return {
    contextId: data.context_id,
    response: data.response,
  }
}

/**
 * Send a task to Agent Zero without waiting for completion.
 * Returns context_id immediately; use pollContext() to follow progress.
 * Uses /message_async which dispatches to A0's async processing queue.
 */
export async function sendTaskAsync(opts: A0SendTaskOpts): Promise<string> {
  // First get a CSRF token (needed for the /message endpoint)
  const csrfRes = await fetch(`${A0_BASE}/csrf_token`, {
    headers: { Origin: A0_BASE },
  })
  if (!csrfRes.ok) throw new Error('Failed to get A0 CSRF token')
  const csrfData = await csrfRes.json()
  const csrfToken = csrfData.token
  const cookies = csrfRes.headers.get('set-cookie') || ''

  const body: Record<string, string> = {
    text: opts.message,
    context: opts.contextId || '',
  }

  const res = await fetch(`${A0_BASE}/message_async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'Origin': A0_BASE,
      'Cookie': cookies,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`A0 message_async failed ${res.status}: ${text}`)
  }

  const data = await res.json()
  return data.context
}

/**
 * Get the current state of a context (chat history, status).
 * Used to check if an agent has finished or to read its output.
 */
export async function getContextState(contextId: string): Promise<A0ContextState | null> {
  try {
    const csrfRes = await fetch(`${A0_BASE}/csrf_token`, {
      headers: { Origin: A0_BASE },
    })
    if (!csrfRes.ok) return null
    const csrfData = await csrfRes.json()
    const cookies = csrfRes.headers.get('set-cookie') || ''

    const res = await fetch(`${A0_BASE}/poll_agent_state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfData.token,
        'Origin': A0_BASE,
        'Cookie': cookies,
      },
      body: JSON.stringify({ context: contextId }),
    })

    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface A0ContextState {
  context: string
  agent: string
  logs: A0LogEntry[]
  is_running: boolean
}

export interface A0LogEntry {
  type: string
  heading: string
  content: string
  timestamp?: string
  kvps?: Record<string, unknown>
}

/**
 * Check if A0 is reachable.
 */
export async function isA0Healthy(): Promise<boolean> {
  try {
    const res = await fetch(`${A0_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

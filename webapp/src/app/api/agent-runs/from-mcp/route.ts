/**
 * /api/agent-runs/from-mcp
 *
 * Inbound bridge: called by the PandaExploit MCP server when Agent Zero
 * internally spawns a subordinate agent.  Allows A0-triggered runs to
 * appear in the Agent Swarm UI alongside UI-triggered runs.
 *
 * POST  — create a new AgentRun (agent starting)
 * PATCH — append a log line or update status (agent running / finished)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Simple bearer-token auth so only the MCP server (same docker network) can call this.
// Falls through if no token is configured (dev / trusted-network deployments).
function isAuthorized(req: NextRequest): boolean {
  const serviceToken = process.env.AGENT_SERVICE_TOKEN
  if (!serviceToken) return true // no token configured → open on internal network
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${serviceToken}`
}

/* ─── POST — create run ──────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      profileSlug,          // e.g. "recon-specialist"
      task,                 // what A0 asked the subordinate to do
      projectId,            // PandaExploit project ID (optional)
      a0ContextId,          // A0 context_id for the subordinate conversation
      triggeredBy = 'a0',   // 'a0' | 'ui'
    } = body

    if (!profileSlug || !task) {
      return NextResponse.json({ error: 'profileSlug and task are required' }, { status: 400 })
    }

    // Find the profile — create a placeholder if it doesn't exist yet
    let profile = await prisma.agentProfile.findUnique({ where: { slug: profileSlug } })

    if (!profile) {
      // Auto-create a minimal profile so the run can be recorded
      profile = await prisma.agentProfile.create({
        data: {
          slug: profileSlug,
          name: profileSlug
            .split('-')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          description: `Auto-registered profile for ${profileSlug}`,
          systemPrompt: '',
          tags: [],
          mcpTools: [],
          skills: [],
        },
      })
    }

    const run = await prisma.agentRun.create({
      data: {
        profileId: profile.id,
        task,
        projectId: projectId || null,
        a0ContextId: a0ContextId || null,
        status: 'RUNNING',
        startedAt: new Date(),
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `🤖 Agent spawned by ${triggeredBy === 'a0' ? 'Agent Zero orchestrator' : 'PandaExploit UI'}`,
          },
          {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `📋 Task: ${task}`,
          },
        ],
      },
    })

    // Bump run counter on the profile
    await prisma.agentProfile.update({
      where: { id: profile.id },
      data: { runCount: { increment: 1 } },
    })

    return NextResponse.json({ runId: run.id, profileId: profile.id }, { status: 201 })
  } catch (err) {
    console.error('[from-mcp POST]', err)
    return NextResponse.json({ error: 'Failed to create run' }, { status: 500 })
  }
}

/* ─── PATCH — append log / update status ────────────────────────────────── */

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      runId,
      status,       // 'RUNNING' | 'COMPLETED' | 'FAILED'
      message,      // log line to append (optional)
      level = 'info',
      result,       // final result text (optional, for COMPLETED)
    } = body

    if (!runId) {
      return NextResponse.json({ error: 'runId required' }, { status: 400 })
    }

    const existing = await prisma.agentRun.findUnique({ where: { id: runId } })
    if (!existing) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    // Append log entry if message provided
    const currentLogs: object[] = Array.isArray(existing.logs) ? (existing.logs as object[]) : []
    const newLogs = message
      ? [
          ...currentLogs,
          { timestamp: new Date().toISOString(), level, message },
        ]
      : currentLogs

    // Build update payload
    const updateData: Record<string, unknown> = { logs: newLogs }

    if (status) {
      updateData.status = status
      if (status === 'COMPLETED' || status === 'FAILED') {
        updateData.completedAt = new Date()
        if (existing.startedAt) {
          updateData.durationMs = Date.now() - existing.startedAt.getTime()
        }
        // Update success count on profile
        if (status === 'COMPLETED') {
          await prisma.agentProfile.update({
            where: { id: existing.profileId },
            data: { successCount: { increment: 1 } },
          })
        }
      }
    }

    if (result) {
      updateData.result = result
    }

    await prisma.agentRun.update({ where: { id: runId }, data: updateData })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[from-mcp PATCH]', err)
    return NextResponse.json({ error: 'Failed to update run' }, { status: 500 })
  }
}

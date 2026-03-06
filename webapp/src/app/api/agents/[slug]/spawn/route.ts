/**
 * POST /api/agents/[slug]/spawn
 * Spawn an agent run for a given profile with a specific task.
 * Creates an AgentRun record, dispatches to Agent Zero, returns run ID for SSE streaming.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from "@/lib/prisma"
import { sendTask } from '@/lib/a0-client'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  try {
    const body = await req.json()
    const { task, projectId } = body

    if (!task) {
      return NextResponse.json({ error: 'task is required' }, { status: 400 })
    }

    // Load profile
    const profile = await prisma.agentProfile.findUnique({ where: { slug } })
    if (!profile) {
      return NextResponse.json({ error: `Profile '${slug}' not found` }, { status: 404 })
    }

    // Create run record
    const run = await prisma.agentRun.create({
      data: {
        profileId: profile.id,
        projectId: projectId || null,
        task,
        status: 'RUNNING',
        startedAt: new Date(),
        logs: [],
      },
    })

    // Dispatch to A0 asynchronously so the HTTP response returns immediately
    // A0 is called in background; SSE endpoint polls for updates
    void runAgentTask(run.id, profile.slug, task, projectId)

    return NextResponse.json({ runId: run.id, status: 'RUNNING' })
  } catch (error) {
    console.error(`[spawn ${slug}]`, error)
    return NextResponse.json({ error: 'Failed to spawn agent' }, { status: 500 })
  }
}

async function runAgentTask(
  runId: string,
  profileSlug: string,
  task: string,
  projectId?: string
) {
  const startedAt = Date.now()

  try {
    await appendLog(runId, 'info', `🚀 Spawning ${profileSlug} agent...`)
    await appendLog(runId, 'info', `📋 Task: ${task}`)

    const result = await sendTask({
      message: task,
      agentProfile: profileSlug,
      projectName: projectId,
    })

    await appendLog(runId, 'success', `✅ Agent completed`)
    await appendLog(runId, 'info', result.response.slice(0, 2000))

    const durationMs = Date.now() - startedAt

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        result: result.response,
        a0ContextId: result.contextId,
        completedAt: new Date(),
        durationMs,
      },
    })

    await prisma.agentProfile.update({
      where: { slug: profileSlug },
      data: {
        runCount: { increment: 1 },
        successCount: { increment: 1 },
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    await appendLog(runId, 'error', `❌ Agent failed: ${msg}`)

    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        result: msg,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    })

    await prisma.agentProfile.update({
      where: { slug: profileSlug },
      data: { runCount: { increment: 1 } },
    })
  }
}

async function appendLog(runId: string, level: string, message: string) {
  const run = await prisma.agentRun.findUnique({ where: { id: runId }, select: { logs: true } })
  const logs = (run?.logs as Array<{ timestamp: string; level: string; message: string }>) || []
  logs.push({ timestamp: new Date().toISOString(), level, message })
  await prisma.agentRun.update({ where: { id: runId }, data: { logs } })
}

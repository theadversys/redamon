/**
 * Kill Chain Run Restart API
 *
 * POST /api/kill-chain/[projectId]/runs/[runId]/restart
 * Body: { fromStage?: number }  (default 1)
 *
 * Creates a new KillChainRun and triggers the orchestrator to start it.
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const KILL_CHAIN_ORCHESTRATOR_URL =
  process.env.KILL_CHAIN_ORCHESTRATOR_URL || 'http://localhost:8015'

interface RouteParams {
  params: Promise<{ projectId: string; runId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, runId } = await params

    // Fetch the source run to get user info
    const sourceRun = await prisma.killChainRun.findUnique({
      where: { id: runId },
      select: { projectId: true, userId: true },
    })

    if (!sourceRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (sourceRun.projectId !== projectId) {
      return NextResponse.json({ error: 'Run does not belong to this project' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const fromStage: number = typeof body.fromStage === 'number' ? body.fromStage : 1

    // Create new run record
    const newRun = await prisma.killChainRun.create({
      data: {
        projectId,
        userId:    sourceRun.userId,
        status:    'idle',
        startStage: fromStage,
        currentStage: fromStage,
        sessionObtained: false,
      },
    })

    // Forward to the orchestrator
    let orchestratorOk = true
    let orchestratorError: string | null = null

    try {
      const resp = await fetch(
        `${KILL_CHAIN_ORCHESTRATOR_URL}/kill-chain/${projectId}/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id:     sourceRun.userId,
            start_stage: fromStage,
            run_id:      newRun.id,
          }),
        }
      )

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}))
        orchestratorOk = false
        orchestratorError = errData.detail || `Orchestrator returned ${resp.status}`
      }
    } catch (fetchErr) {
      orchestratorOk = false
      orchestratorError =
        fetchErr instanceof Error ? fetchErr.message : 'Failed to reach orchestrator'
    }

    if (!orchestratorOk) {
      // Run was created; caller can still use newRunId even if orchestrator is down
      return NextResponse.json(
        {
          newRunId: newRun.id,
          message: `Run created but orchestrator unreachable: ${orchestratorError}`,
          orchestratorError,
        },
        { status: 202 }
      )
    }

    return NextResponse.json({
      newRunId: newRun.id,
      message: `Restart initiated from stage ${fromStage}`,
    })
  } catch (err) {
    console.error('[kill-chain/runs/[runId]/restart POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Kill Chain Run Persistence API
 *
 * GET  /api/kill-chain/[projectId]/runs        — get latest run state for a project
 * POST /api/kill-chain/[projectId]/runs        — upsert (create or update) run state
 *
 * Used by the kill chain orchestrator to persist stage transitions so runs
 * can survive container restarts and be resumed from the last stage.
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

/** GET — return the most recent KillChainRun for this project */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    const run = await prisma.killChainRun.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })

    if (!run) {
      return NextResponse.json({ status: 'idle', currentStage: 1 }, { status: 200 })
    }

    return NextResponse.json(run)
  } catch (err) {
    console.error('[kill-chain/runs GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** POST — create a new run or update the active one */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params
    const body = await request.json()

    const {
      userId,
      status,
      currentStage,
      currentSubStep,
      startStage,
      selectedAttackPath,
      payloadRef,
      sessionObtained,
      error,
      startedAt,
      completedAt,
      runId,        // optional: update an existing run by ID
    } = body
    const { waitingForOperator, operatorBriefing } = body as {
      waitingForOperator?: boolean; operatorBriefing?: unknown
    }

    // If runId provided, update that specific run
    if (runId) {
      const updated = await prisma.killChainRun.update({
        where: { id: runId },
        data: {
          ...(status !== undefined && { status }),
          ...(currentStage !== undefined && { currentStage }),
          ...(currentSubStep !== undefined && { currentSubStep }),
          ...(selectedAttackPath !== undefined && { selectedAttackPath }),
          ...(payloadRef !== undefined && { payloadRef }),
          ...(sessionObtained !== undefined && { sessionObtained }),
          ...(error !== undefined && { error }),
          ...(startedAt !== undefined && { startedAt: new Date(startedAt) }),
          ...(completedAt !== undefined && { completedAt: new Date(completedAt) }),
          ...(waitingForOperator !== undefined && { waitingForOperator }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(operatorBriefing !== undefined && { operatorBriefing: operatorBriefing as any }),
        },
      })
      return NextResponse.json(updated)
    }

    // Otherwise create a new run record
    const created = await prisma.killChainRun.create({
      data: {
        projectId,
        userId: userId || '',
        status: status || 'starting',
        currentStage: currentStage || 1,
        currentSubStep: currentSubStep || null,
        startStage: startStage || 1,
        selectedAttackPath: selectedAttackPath || undefined,
        payloadRef: payloadRef || undefined,
        sessionObtained: sessionObtained || false,
        error: error || null,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        completedAt: completedAt ? new Date(completedAt) : null,
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    console.error('[kill-chain/runs POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

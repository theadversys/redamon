/**
 * Single Kill Chain Run API
 *
 * GET    /api/kill-chain/[projectId]/runs/[runId]  — full run detail with logs + project
 * PATCH  /api/kill-chain/[projectId]/runs/[runId]  — edit name, notes, tags
 * DELETE /api/kill-chain/[projectId]/runs/[runId]  — delete run (logs cascade)
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ projectId: string; runId: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, runId } = await params

    const run = await prisma.killChainRun.findUnique({
      where: { id: runId },
      include: {
        logs: { orderBy: { timestamp: 'asc' } },
        project: {
          select: {
            name: true,
            targetDomain: true,
            githubTargetOrg: true,
          },
        },
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (run.projectId !== projectId) {
      return NextResponse.json({ error: 'Run does not belong to this project' }, { status: 403 })
    }

    return NextResponse.json(run)
  } catch (err) {
    console.error('[kill-chain/runs/[runId] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, runId } = await params

    // Verify ownership
    const existing = await prisma.killChainRun.findUnique({
      where: { id: runId },
      select: { projectId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (existing.projectId !== projectId) {
      return NextResponse.json({ error: 'Run does not belong to this project' }, { status: 403 })
    }

    const body = await request.json()
    const { name, notes, tags, stagesCompleted, duration, waitingForOperator, operatorBriefing } = body as {
      name?: string; notes?: string; tags?: string[];
      stagesCompleted?: number[]; duration?: number;
      waitingForOperator?: boolean; operatorBriefing?: unknown;
    }

    const updated = await prisma.killChainRun.update({
      where: { id: runId },
      data: {
        ...(name                !== undefined && { name }),
        ...(notes               !== undefined && { notes }),
        ...(tags                !== undefined && { tags }),
        ...(stagesCompleted     !== undefined && { stagesCompleted }),
        ...(duration            !== undefined && { duration }),
        ...(waitingForOperator  !== undefined && { waitingForOperator }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(operatorBriefing    !== undefined && { operatorBriefing: operatorBriefing as any }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[kill-chain/runs/[runId] PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, runId } = await params

    // Verify ownership
    const existing = await prisma.killChainRun.findUnique({
      where: { id: runId },
      select: { projectId: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (existing.projectId !== projectId) {
      return NextResponse.json({ error: 'Run does not belong to this project' }, { status: 403 })
    }

    // Logs are deleted automatically via onDelete: Cascade
    await prisma.killChainRun.delete({ where: { id: runId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[kill-chain/runs/[runId] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

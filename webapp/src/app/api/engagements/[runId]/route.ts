/**
 * Single Engagement (by runId only, no projectId in URL)
 *
 * GET    /api/engagements/[runId]  — fetch run with logs + project
 * PATCH  /api/engagements/[runId]  — update name, notes, tags
 * DELETE /api/engagements/[runId]  — delete run (logs cascade)
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

interface RouteParams {
  params: Promise<{ runId: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { runId } = await params

    const run = await prisma.killChainRun.findUnique({
      where: { id: runId },
      include: {
        logs: { orderBy: { timestamp: 'asc' } },
        project: {
          select: {
            id: true,
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

    return NextResponse.json(run)
  } catch (err) {
    console.error('[engagements/[runId] GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { runId } = await params

    const existing = await prisma.killChainRun.findUnique({
      where: { id: runId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    const body = await request.json()
    const { name, notes, tags } = body as { name?: string; notes?: string; tags?: string[] }

    const updated = await prisma.killChainRun.update({
      where: { id: runId },
      data: {
        ...(name  !== undefined && { name }),
        ...(notes !== undefined && { notes }),
        ...(tags  !== undefined && { tags }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[engagements/[runId] PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { runId } = await params

    const existing = await prisma.killChainRun.findUnique({
      where: { id: runId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    // Logs cascade-deleted automatically
    await prisma.killChainRun.delete({ where: { id: runId } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[engagements/[runId] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

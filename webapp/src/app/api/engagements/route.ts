/**
 * Engagements List API
 *
 * GET /api/engagements?status=&projectId=&limit=50&cursor=&search=
 *
 * Query KillChainRun table with optional filters and cursor pagination.
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const statusParam  = searchParams.get('status')   // comma-separated
    const projectId    = searchParams.get('projectId')
    const search       = searchParams.get('search')
    const cursor       = searchParams.get('cursor')
    const limitParam   = searchParams.get('limit')
    const limit        = Math.min(parseInt(limitParam || '50', 10), 200)

    const statusFilter = statusParam
      ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
      : []

    // Build the where clause
    const where: Record<string, unknown> = {}

    if (statusFilter.length > 0) {
      where.status = { in: statusFilter }
    }

    if (projectId) {
      where.projectId = projectId
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        {
          project: {
            targetDomain: { contains: search, mode: 'insensitive' },
          },
        },
      ]
    }

    // Get total count (without cursor)
    const total = await prisma.killChainRun.count({ where })

    // Build the findMany options
    const findOptions: Parameters<typeof prisma.killChainRun.findMany>[0] = {
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            targetDomain: true,
            githubTargetOrg: true,
          },
        },
        _count: {
          select: { logs: true },
        },
      },
    }

    if (cursor) {
      findOptions.cursor = { id: cursor }
      findOptions.skip = 1 // skip the cursor record itself
    }

    const rawRuns = await prisma.killChainRun.findMany(findOptions)

    let nextCursor: string | null = null
    if (rawRuns.length > limit) {
      const nextItem = rawRuns.pop()!
      nextCursor = nextItem.id
    }

    // Reshape: pull logCount out of _count
    const runs = rawRuns.map((run) => {
      const { _count, ...rest } = run as typeof run & { _count: { logs: number } }
      return {
        ...rest,
        logCount: _count.logs,
      }
    })

    return NextResponse.json({ runs, nextCursor, total })
  } catch (err) {
    console.error('[engagements GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

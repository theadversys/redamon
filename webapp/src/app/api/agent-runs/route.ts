/**
 * GET /api/agent-runs
 * Lists recent agent runs for the Agent Swarm live feed.
 * Query params: limit (default 20), profileSlug, status, projectId
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
    const profileSlug = searchParams.get('profileSlug') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const projectId = searchParams.get('projectId') ?? undefined

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (projectId) where.projectId = projectId
    if (profileSlug) {
      where.profile = { slug: profileSlug }
    }

    const runs = await prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        profile: {
          select: {
            slug: true,
            name: true,
            icon: true,
            color: true,
            tags: true,
          },
        },
      },
    })

    return NextResponse.json({ runs })
  } catch (err) {
    console.error('[agent-runs GET]', err)
    return NextResponse.json({ error: 'Failed to list runs' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/vulnerabilities/trends?projectId=
 * Returns trend data: new vs fixed over time, open by severity.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  const weeks = parseInt(request.nextUrl.searchParams.get('weeks') || '4', 10)
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const states = await prisma.findingState.findMany({
    where: { projectId },
    select: {
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const now = new Date()
  const buckets: Array<{ weekStart: string; newCount: number; fixedCount: number }> = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(now)
    start.setDate(start.getDate() - i * 7)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const weekKey = start.toISOString().slice(0, 10)
    let newCount = 0
    let fixedCount = 0
    for (const s of states) {
      const created = new Date(s.createdAt)
      if (created >= start && created < end) newCount++
      if (['fixed', 'verified', 'false_positive'].includes(s.status)) {
        const updated = new Date(s.updatedAt)
        if (updated >= start && updated < end && s.status !== 'open') fixedCount++
      }
    }
    buckets.push({ weekStart: weekKey, newCount, fixedCount })
  }

  const openStates = states.filter((s) =>
    ['open', 'in_progress', 'risk_accepted'].includes(s.status)
  )

  return NextResponse.json({
    weekly: buckets,
    openCount: openStates.length,
  })
}

/**
 * Recon schedules API - list and create
 */
import { NextRequest, NextResponse } from 'next/server'
import cronParser from 'cron-parser'
import prisma from '@/lib/prisma'

function nextCronRun(cron: string): Date {
  try {
    const expr = cronParser.parse(cron)
    const next = expr.next()
    return next instanceof Date ? next : new Date(next.getTime())
  } catch {
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')

  const where = projectId ? { projectId } : {}

  const schedules = await prisma.reconSchedule.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { project: { select: { name: true, targetDomain: true } } },
  })

  return NextResponse.json({ schedules })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, name, cron } = body

    if (!projectId || !name || !cron) {
      return NextResponse.json(
        { error: 'projectId, name, and cron are required' },
        { status: 400 }
      )
    }

    // Validate cron
    try {
      cronParser.parse(cron)
    } catch {
      return NextResponse.json(
        { error: 'Invalid cron expression' },
        { status: 400 }
      )
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const schedule = await prisma.reconSchedule.create({
      data: {
        projectId,
        name,
        cron,
        enabled: body.enabled !== false,
        nextRunAt: nextCronRun(cron),
      },
      include: { project: { select: { name: true, targetDomain: true } } },
    })

    return NextResponse.json({ success: true, schedule })
  } catch (error) {
    console.error('Error creating recon schedule:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

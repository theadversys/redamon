import { NextResponse } from 'next/server'
import cronParser from 'cron-parser'
import { prisma } from '@/lib/prisma'

function nextCronRun(cron: string): Date {
  try {
    const expr = cronParser.parse(cron)
    const next = expr.next()
    return next instanceof Date ? next : new Date(next.getTime())
  } catch {
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      name,
      projectId,
      cron,
      targetUrl,
      targetType = 'http',
      profile = 'owasp',
      plugins = [],
      strategies = [],
      numTests = 5,
      purpose,
      policyIds = [],
    } = body

    if (!name || !cron || !targetUrl) {
      return NextResponse.json(
        { error: 'name, cron, and targetUrl are required' },
        { status: 400 },
      )
    }

    const schedule = await prisma.aIScanSchedule.create({
      data: {
        name,
        projectId: projectId || null,
        cron,
        targetUrl,
        targetType,
        profile,
        plugins,
        strategies,
        numTests,
        purpose: purpose || null,
        policyIds,
        enabled: true,
        nextRunAt: nextCronRun(cron),
      },
    })

    return NextResponse.json({ success: true, schedule })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId

    const schedules = await prisma.aIScanSchedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { scans: true } },
      },
    })

    return NextResponse.json({ schedules })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (updates.cron) {
      updates.nextRunAt = nextCronRun(updates.cron)
    }

    const schedule = await prisma.aIScanSchedule.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json({ success: true, schedule })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await prisma.aIScanSchedule.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

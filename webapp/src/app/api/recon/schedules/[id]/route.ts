/**
 * Single recon schedule - get, update, delete
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

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const schedule = await prisma.reconSchedule.findUnique({
    where: { id },
    include: { project: { select: { name: true, targetDomain: true } } },
  })
  if (!schedule) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
  }
  return NextResponse.json(schedule)
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.cron !== undefined) {
    try {
      cronParser.parse(body.cron)
      updates.cron = body.cron
      updates.nextRunAt = nextCronRun(body.cron)
    } catch {
      return NextResponse.json(
        { error: 'Invalid cron expression' },
        { status: 400 }
      )
    }
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled

  const schedule = await prisma.reconSchedule.update({
    where: { id },
    data: updates,
    include: { project: { select: { name: true, targetDomain: true } } },
  })
  return NextResponse.json({ success: true, schedule })
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  await prisma.reconSchedule.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

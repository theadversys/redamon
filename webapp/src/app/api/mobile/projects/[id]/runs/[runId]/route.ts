import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params
  const run = await prisma.mobileRun.findUnique({
    where: { id: runId },
    include: { logs: { orderBy: { timestamp: 'asc' } } },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ run })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params
  await prisma.mobileRun.delete({ where: { id: runId } })
  return NextResponse.json({ success: true })
}

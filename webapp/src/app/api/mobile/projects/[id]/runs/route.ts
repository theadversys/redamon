import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const runs = await prisma.mobileRun.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    include: { logs: { orderBy: { timestamp: 'asc' } } },
  })
  return NextResponse.json({ runs })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await prisma.mobileProject.findUnique({
    where: { id },
    include: {
      scans: { orderBy: { createdAt: 'desc' }, take: 5 },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { logs: { orderBy: { timestamp: 'asc' } } },
      },
    },
  })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ project })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const project = await prisma.mobileProject.update({ where: { id }, data: body })
  return NextResponse.json({ project })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.mobileProject.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

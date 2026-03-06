import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')

  const projects = await prisma.mobileProject.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      scans: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true, score: true, grade: true, completedAt: true, platform: true },
      },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, status: true, currentStage: true, startedAt: true, completedAt: true },
      },
      _count: { select: { scans: true, runs: true } },
    },
  })

  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const project = await prisma.mobileProject.create({
    data: {
      name: body.name,
      description: body.description || null,
      platform: body.platform,
      targetUrl: body.targetUrl || null,
      appStoreUrl: body.appStoreUrl || null,
      bundleId: body.bundleId || null,
      testingTypes: body.testingTypes || ['static_analysis', 'compliance'],
      agentEnabled: body.agentEnabled ?? true,
      userId: body.userId || null,
    },
  })
  return NextResponse.json({ project }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/findings/[projectId]/[vulnId]/audit
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; vulnId: string }> }
) {
  const { projectId, vulnId } = await params
  if (!projectId || !vulnId) {
    return NextResponse.json({ error: 'projectId and vulnId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const state = await prisma.findingState.findUnique({
    where: { projectId_vulnId: { projectId, vulnId } },
  })
  if (!state) {
    return NextResponse.json({ logs: [] })
  }

  const logs = await prisma.findingAuditLog.findMany({
    where: { findingStateId: state.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      actorId: l.actorId,
      action: l.action,
      fromValue: l.fromValue,
      toValue: l.toValue,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
    })),
  })
}

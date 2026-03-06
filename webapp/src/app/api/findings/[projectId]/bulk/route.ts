/**
 * POST /api/findings/[projectId]/bulk
 * Bulk update findings: status, owner, etc.
 */
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  let body: {
    vulnIds: string[]
    status?: string
    ownerId?: string | null
    riskReason?: string
    riskApproverId?: string
    riskExpiresAt?: string
    fpReason?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { vulnIds, status, ownerId } = body
  if (!Array.isArray(vulnIds) || vulnIds.length === 0) {
    return NextResponse.json({ error: 'vulnIds array required' }, { status: 400 })
  }

  const userId = request.headers.get('X-User-Id') || 'system'

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {
    updatedById: userId,
  }
  if (status !== undefined) updates.status = status
  if (ownerId !== undefined) updates.ownerId = ownerId || null
  if (body.riskReason !== undefined) updates.riskReason = body.riskReason
  if (body.riskApproverId !== undefined) updates.riskApproverId = body.riskApproverId
  if (body.riskExpiresAt !== undefined) updates.riskExpiresAt = body.riskExpiresAt ? new Date(body.riskExpiresAt) : null
  if (body.fpReason !== undefined) updates.fpReason = body.fpReason

  const states = await prisma.findingState.findMany({
    where: {
      projectId,
      OR: [{ vulnId: { in: vulnIds } }, { findingKey: { in: vulnIds } }],
    },
  })

  const stateIds = states.map((s) => s.id)

  await prisma.findingState.updateMany({
    where: { id: { in: stateIds } },
    data: updates as Parameters<typeof prisma.findingState.updateMany>[0]['data'],
  })

  // Audit log for bulk status change
  if (status) {
    await prisma.findingAuditLog.createMany({
      data: stateIds.map((id) => ({
        findingStateId: id,
        actorId: userId,
        action: 'status_change',
        toValue: status,
        metadata: { bulk: true, vulnCount: vulnIds.length },
      })),
    })
  }

  return NextResponse.json({
    updated: stateIds.length,
    vulnIds,
  })
}

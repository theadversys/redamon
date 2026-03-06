import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  canTransition,
  requiresRiskFields,
  requiresFalsePositiveFields,
  requiresVerification,
} from '@/lib/finding-state'

/**
 * POST /api/finding-state/[projectId]/[findingKey]/status
 * Update finding status. Creates audit log. Enforces governance rules.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; findingKey: string }> }
) {
  const { projectId, findingKey } = await params
  if (!projectId || !findingKey) {
    return NextResponse.json({ error: 'projectId and findingKey required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const actorId = request.headers.get('x-user-id') || project.userId || 'system'

  let body: {
    status: string
    riskReason?: string
    riskApproverId?: string
    riskExpiresAt?: string
    fpReason?: string
    fpEvidenceRef?: string
    verificationRunId?: string
    verificationProofRef?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const newStatus = String(body.status)
  if (!newStatus) {
    return NextResponse.json({ error: 'status required' }, { status: 400 })
  }

  let state = await prisma.findingState.findFirst({
    where: {
      projectId,
      OR: [{ findingKey }, { vulnId: findingKey }],
    },
  })

  if (!state) {
    const now = new Date()
    state = await prisma.findingState.create({
      data: {
        projectId,
        vulnId: findingKey,
        findingKey,
        status: newStatus,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedById: actorId,
        ...(requiresRiskFields(newStatus) && {
          riskReason: body.riskReason ?? '',
          riskApproverId: body.riskApproverId ?? '',
          riskExpiresAt: body.riskExpiresAt ? new Date(body.riskExpiresAt) : null,
        }),
        ...(requiresFalsePositiveFields(newStatus) && {
          fpReason: body.fpReason ?? '',
          fpEvidenceRef: body.fpEvidenceRef ?? null,
        }),
        ...(requiresVerification(newStatus) && {
          verificationRunId: body.verificationRunId ?? '',
          verificationProofRef: body.verificationProofRef ?? '',
        }),
      },
    })
    await prisma.findingAuditLog.create({
      data: {
        findingStateId: state.id,
        actorId,
        action: 'status_change',
        fromValue: null,
        toValue: newStatus,
      },
    })
    return NextResponse.json({
      status: state.status,
      ownerId: state.ownerId,
      updatedAt: state.updatedAt.toISOString(),
    })
  }

  if (!canTransition(state.status, newStatus)) {
    return NextResponse.json(
      { error: `Invalid transition: ${state.status} -> ${newStatus}` },
      { status: 400 }
    )
  }

  if (requiresRiskFields(newStatus)) {
    if (!body.riskReason || !body.riskApproverId || !body.riskExpiresAt) {
      return NextResponse.json(
        { error: 'risk_accepted requires riskReason, riskApproverId, riskExpiresAt' },
        { status: 400 }
      )
    }
  }
  if (requiresFalsePositiveFields(newStatus) && !body.fpReason) {
    return NextResponse.json(
      { error: 'false_positive requires fpReason' },
      { status: 400 }
    )
  }
  if (requiresVerification(newStatus)) {
    if (!body.verificationRunId || !body.verificationProofRef) {
      return NextResponse.json(
        { error: 'verified requires verificationRunId and verificationProofRef' },
        { status: 400 }
      )
    }
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    updatedById: actorId,
    updatedAt: new Date(),
  }
  if (requiresRiskFields(newStatus)) {
    updates.riskReason = body.riskReason
    updates.riskApproverId = body.riskApproverId
    updates.riskExpiresAt = new Date(body.riskExpiresAt!)
  }
  if (requiresFalsePositiveFields(newStatus)) {
    updates.fpReason = body.fpReason
    updates.fpEvidenceRef = body.fpEvidenceRef ?? null
  }
  if (requiresVerification(newStatus)) {
    updates.verificationRunId = body.verificationRunId
    updates.verificationProofRef = body.verificationProofRef
  }

  const updated = await prisma.findingState.update({
    where: { id: state.id },
    data: updates as never,
  })

  await prisma.findingAuditLog.create({
    data: {
      findingStateId: state.id,
      actorId,
      action: 'status_change',
      fromValue: state.status,
      toValue: newStatus,
    },
  })

  return NextResponse.json({
    status: updated.status,
    ownerId: updated.ownerId,
    updatedAt: updated.updatedAt.toISOString(),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  computeTargetDueAt,
  isOverdue,
  canTransition,
  requiresRiskFields,
  requiresFalsePositiveFields,
  requiresVerification,
} from '@/lib/finding-state'

const stateInclude = { ticket: true, _count: { select: { comments: true } } } as const

/** Look up FindingState by findingKey or vulnId. No creation on read (no seeding). */
async function findState(projectId: string, key: string) {
  return prisma.findingState.findFirst({
    where: {
      projectId,
      OR: [{ findingKey: key }, { vulnId: key }],
    },
    include: stateInclude,
  })
}

/** Create state on first write only (never on read). Uses key for both vulnId and findingKey. */
async function createStateIfMissing(projectId: string, key: string, severity?: string) {
  const existing = await findState(projectId, key)
  if (existing) return existing
  const now = new Date()
  const targetDueAt = severity ? computeTargetDueAt(severity) : null
  return prisma.findingState.create({
    data: {
      projectId,
      vulnId: key,
      findingKey: key,
      status: 'open',
      firstSeenAt: now,
      lastSeenAt: now,
      targetDueAt,
      overdue: targetDueAt ? isOverdue(targetDueAt) : false,
    },
    include: stateInclude,
  })
}

/**
 * GET /api/findings/[projectId]/[vulnId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; vulnId: string }> }
) {
  const { projectId, vulnId } = await params
  if (!projectId || !vulnId) {
    return NextResponse.json({ error: 'projectId and vulnId required' }, { status: 400 })
  }

  const severity = request.nextUrl.searchParams.get('severity') ?? undefined

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const state = await findState(projectId, vulnId)
  if (!state) {
    return NextResponse.json(
      { error: 'Finding state not found. State is created during ingestion or on first update.' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    status: state.status,
    ownerId: state.ownerId,
    watcherIds: state.watcherIds,
    firstSeenAt: state.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: state.lastSeenAt?.toISOString() ?? null,
    targetDueAt: state.targetDueAt?.toISOString() ?? null,
    overdue: state.overdue,
    riskReason: state.riskReason,
    riskApproverId: state.riskApproverId,
    riskExpiresAt: state.riskExpiresAt?.toISOString() ?? null,
    riskReviewRequired: state.riskReviewRequired,
    fpReason: state.fpReason,
    fpEvidenceRef: state.fpEvidenceRef,
    verificationRunId: state.verificationRunId,
    verificationProofRef: state.verificationProofRef,
    updatedAt: state.updatedAt.toISOString(),
    updatedById: state.updatedById,
    commentCount: state._count.comments,
    ticket: state.ticket
      ? {
          provider: state.ticket.provider,
          ticketId: state.ticket.ticketId,
          ticketUrl: state.ticket.ticketUrl,
          status: state.ticket.status,
          lastSyncAt: state.ticket.lastSyncAt?.toISOString() ?? null,
        }
      : null,
  })
}

/**
 * PATCH /api/findings/[projectId]/[vulnId]
 * Update finding state. Creates audit log entry.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; vulnId: string }> }
) {
  const { projectId, vulnId } = await params
  if (!projectId || !vulnId) {
    return NextResponse.json({ error: 'projectId and vulnId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const actorId = request.headers.get('x-user-id') || project.userId || 'system'

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const state = await createStateIfMissing(projectId, vulnId)
  const updates: Record<string, unknown> = {}
  let auditAction = 'update'
  let auditFrom: string | null = null
  let auditTo: string | null = null

  if (body.status !== undefined) {
    const newStatus = String(body.status)
    if (!canTransition(state.status, newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${state.status} -> ${newStatus}` },
        { status: 400 }
      )
    }
    if (requiresRiskFields(newStatus)) {
      const reason = body.riskReason as string | undefined
      const approverId = body.riskApproverId as string | undefined
      const expiresAt = body.riskExpiresAt as string | undefined
      if (!reason || !approverId || !expiresAt) {
        return NextResponse.json(
          { error: 'risk_accepted requires riskReason, riskApproverId, riskExpiresAt' },
          { status: 400 }
        )
      }
      updates.riskReason = reason
      updates.riskApproverId = approverId
      updates.riskExpiresAt = new Date(expiresAt)
    }
    if (requiresFalsePositiveFields(newStatus)) {
      const reason = body.fpReason as string | undefined
      if (!reason) {
        return NextResponse.json(
          { error: 'false_positive requires fpReason' },
          { status: 400 }
        )
      }
      updates.fpReason = reason
      updates.fpEvidenceRef = (body.fpEvidenceRef as string) ?? null
    }
    if (requiresVerification(newStatus)) {
      const runId = body.verificationRunId as string | undefined
      const proofRef = body.verificationProofRef as string | undefined
      if (!runId || !proofRef) {
        return NextResponse.json(
          { error: 'verified requires verificationRunId and verificationProofRef (retest artifact)' },
          { status: 400 }
        )
      }
      updates.verificationRunId = runId
      updates.verificationProofRef = proofRef
    }
    auditAction = 'status_change'
    auditFrom = state.status
    auditTo = newStatus
    updates.status = newStatus
  }

  if (body.ownerId !== undefined) {
    updates.ownerId = body.ownerId === null || body.ownerId === '' ? null : String(body.ownerId)
    if (auditAction === 'update') {
      auditAction = 'owner_change'
      auditFrom = state.ownerId ?? ''
      auditTo = String(updates.ownerId ?? '')
    }
  }
  if (body.watcherIds !== undefined) {
    updates.watcherIds = Array.isArray(body.watcherIds) ? body.watcherIds : []
  }

  updates.updatedById = actorId
  updates.updatedAt = new Date()

  const updated = await prisma.findingState.update({
    where: { id: state.id },
    data: updates as never,
    include: { ticket: true, _count: { select: { comments: true } } },
  })

  await prisma.findingAuditLog.create({
    data: {
      findingStateId: state.id,
      actorId,
      action: auditAction,
      fromValue: auditFrom,
      toValue: auditTo,
    },
  })

  return NextResponse.json({
    status: updated.status,
    ownerId: updated.ownerId,
    watcherIds: updated.watcherIds,
    firstSeenAt: updated.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
    targetDueAt: updated.targetDueAt?.toISOString() ?? null,
    overdue: updated.overdue,
    riskReason: updated.riskReason,
    riskApproverId: updated.riskApproverId,
    riskExpiresAt: updated.riskExpiresAt?.toISOString() ?? null,
    fpReason: updated.fpReason,
    fpEvidenceRef: updated.fpEvidenceRef,
    verificationRunId: updated.verificationRunId,
    verificationProofRef: updated.verificationProofRef,
    updatedAt: updated.updatedAt.toISOString(),
    updatedById: updated.updatedById,
    commentCount: updated._count.comments,
    ticket: updated.ticket
      ? {
          provider: updated.ticket.provider,
          ticketId: updated.ticket.ticketId,
          ticketUrl: updated.ticket.ticketUrl,
          status: updated.ticket.status,
          lastSyncAt: updated.ticket.lastSyncAt?.toISOString() ?? null,
        }
      : null,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * GET /api/findings/[projectId]
 * Returns all finding states for a project (batch).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const states = await prisma.findingState.findMany({
    where: { projectId },
    include: {
      ticket: true,
      _count: { select: { comments: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const map: Record<string, {
    status: string
    ownerId: string | null
    watcherIds: string[]
    firstSeenAt: string | null
    lastSeenAt: string | null
    targetDueAt: string | null
    overdue: boolean
    riskReason: string | null
    riskApproverId: string | null
    riskExpiresAt: string | null
    fpReason: string | null
    fpEvidenceRef: string | null
    verificationRunId: string | null
    verificationProofRef: string | null
    updatedAt: string
    updatedById: string | null
    commentCount: number
    ticket: { provider: string; ticketId: string; ticketUrl: string; status: string | null; lastSyncAt: string | null } | null
  }> = {}

  for (const s of states) {
    map[s.vulnId] = {
      status: s.status,
      ownerId: s.ownerId,
      watcherIds: s.watcherIds,
      firstSeenAt: s.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      targetDueAt: s.targetDueAt?.toISOString() ?? null,
      overdue: s.overdue,
      riskReason: s.riskReason,
      riskApproverId: s.riskApproverId,
      riskExpiresAt: s.riskExpiresAt?.toISOString() ?? null,
      fpReason: s.fpReason,
      fpEvidenceRef: s.fpEvidenceRef,
      verificationRunId: s.verificationRunId,
      verificationProofRef: s.verificationProofRef,
      updatedAt: s.updatedAt.toISOString(),
      updatedById: s.updatedById,
      commentCount: s._count.comments,
      ticket: s.ticket
        ? {
            provider: s.ticket.provider,
            ticketId: s.ticket.ticketId,
            ticketUrl: s.ticket.ticketUrl,
            status: s.ticket.status,
            lastSyncAt: s.ticket.lastSyncAt?.toISOString() ?? null,
          }
        : null,
    }
  }

  return NextResponse.json({ states: map })
}

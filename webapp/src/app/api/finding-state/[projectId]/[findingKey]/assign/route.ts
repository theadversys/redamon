import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

/**
 * POST /api/finding-state/[projectId]/[findingKey]/assign
 * Assign owner to a finding. Creates audit log.
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

  let body: { ownerId?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const state = await prisma.findingState.findFirst({
    where: {
      projectId,
      OR: [{ findingKey }, { vulnId: findingKey }],
    },
  })
  if (!state) {
    const now = new Date()
    const created = await prisma.findingState.create({
      data: {
        projectId,
        vulnId: findingKey,
        findingKey,
        status: 'open',
        ownerId: body.ownerId ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedById: actorId,
      },
    })
    await prisma.findingAuditLog.create({
      data: {
        findingStateId: created.id,
        actorId,
        action: 'owner_change',
        fromValue: null,
        toValue: body.ownerId ?? '',
      },
    })
    return NextResponse.json({
      status: created.status,
      ownerId: created.ownerId,
      updatedAt: created.updatedAt.toISOString(),
    })
  }

  const fromValue = state.ownerId ?? ''
  const toValue = body.ownerId === undefined ? fromValue : (body.ownerId ?? '')

  const updated = await prisma.findingState.update({
    where: { id: state.id },
    data: {
      ownerId: body.ownerId === undefined ? state.ownerId : body.ownerId,
      updatedById: actorId,
      updatedAt: new Date(),
    },
  })

  await prisma.findingAuditLog.create({
    data: {
      findingStateId: state.id,
      actorId,
      action: 'owner_change',
      fromValue,
      toValue,
    },
  })

  return NextResponse.json({
    status: updated.status,
    ownerId: updated.ownerId,
    updatedAt: updated.updatedAt.toISOString(),
  })
}

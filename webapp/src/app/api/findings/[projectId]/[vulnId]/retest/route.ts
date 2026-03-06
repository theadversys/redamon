import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

async function getOrCreateFindingState(projectId: string, vulnId: string) {
  let state = await prisma.findingState.findUnique({
    where: { projectId_vulnId: { projectId, vulnId } },
  })
  if (!state) {
    state = await prisma.findingState.create({
      data: { projectId, vulnId, status: 'open' },
    })
  }
  return state
}

/**
 * POST /api/findings/[projectId]/[vulnId]/retest
 * Trigger retest. Creates RetestRun record.
 * In a full implementation this would trigger the actual scan.
 * For now we simulate: still_vulnerable or no_longer_detected based on a simple check.
 */
export async function POST(
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

  const state = await getOrCreateFindingState(projectId, vulnId)

  let body: { simulateResult?: 'still_vulnerable' | 'no_longer_detected' } = {}
  try {
    body = (await request.json().catch(() => ({}))) as typeof body
  } catch {
    // ignore
  }

  const result = body?.simulateResult || 'still_vulnerable'
  const proofRef = `retest-${vulnId}-${Date.now()}.json`

  const run = await prisma.retestRun.create({
    data: {
      findingStateId: state.id,
      status: result,
      proofRef,
      metadata: { simulated: true },
    },
  })

  if (result === 'no_longer_detected') {
    await prisma.findingState.update({
      where: { id: state.id },
      data: {
        status: 'verified',
        verificationRunId: run.id,
        verificationProofRef: proofRef,
      },
    })
  }

  return NextResponse.json({
    id: run.id,
    status: run.status,
    proofRef: run.proofRef,
    runAt: run.runAt.toISOString(),
    canTransitionToVerified: result === 'no_longer_detected',
  })
}

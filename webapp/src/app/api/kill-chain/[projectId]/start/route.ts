import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createActionLog } from '@/lib/actionLog'

const KILL_CHAIN_ORCHESTRATOR_URL = process.env.KILL_CHAIN_ORCHESTRATOR_URL || 'http://localhost:8015'
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:3000'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        name: true,
        targetDomain: true,
        githubTargetOrg: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const hasTargetDomain = (project.targetDomain ?? '').trim().length > 0
    const hasGithubTarget = (project.githubTargetOrg ?? '').trim().length > 0
    if (!hasTargetDomain && !hasGithubTarget) {
      return NextResponse.json(
        { error: 'Project needs a target domain or GitHub organization configured' },
        { status: 400 }
      )
    }

    const description = hasTargetDomain
      ? `Started kill chain test for ${project.targetDomain}`
      : `Started kill chain test for ${project.githubTargetOrg}`
    const metadata: Record<string, unknown> = { projectName: project.name }
    if (hasTargetDomain) metadata.targetDomain = project.targetDomain
    if (hasGithubTarget) metadata.githubTargetOrg = project.githubTargetOrg

    try {
      await createActionLog({
        projectId,
        userId: project.userId,
        type: 'recon',
        action: 'Launch Kill Chain Test',
        description,
        status: 'running',
        metadata,
      })
    } catch (error) {
      console.error('Failed to create ActionLog:', error)
    }

    const body = await request.json().catch(() => ({}))
    const userId = body.user_id ?? project.userId ?? ''
    const startStage = body.start_stage === 2 ? 2 : 1

    console.log(`[kill-chain/start] projectId=${projectId} body.start_stage=${body.start_stage} resolved startStage=${startStage}`)

    let response: Response
    try {
      response = await fetch(`${KILL_CHAIN_ORCHESTRATOR_URL}/kill-chain/${projectId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, start_stage: startStage }),
      })
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : 'Unknown error'
      const hint = msg.includes('ECONNREFUSED') || msg.includes('fetch failed')
        ? ` Kill chain orchestrator unreachable at ${KILL_CHAIN_ORCHESTRATOR_URL}. Is it running? (Docker: docker compose up -d kill-chain-orchestrator)`
        : ''
      return NextResponse.json(
        { error: `Failed to connect to kill chain orchestrator: ${msg}.${hint}` },
        { status: 503 }
      )
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      try {
        await createActionLog({
          projectId,
          userId: project.userId,
          type: 'recon',
          action: 'Launch Kill Chain Test',
          description: `Failed: ${errorData.detail || 'Unknown error'}`,
          status: 'error',
          metadata: { ...metadata, error: errorData.detail || 'Unknown error' },
        })
      } catch (logError) {
        console.error('Failed to create error ActionLog:', logError)
      }
      return NextResponse.json(
        { error: errorData.detail || 'Failed to start kill chain' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error starting kill chain:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

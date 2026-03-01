import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createActionLog } from '@/lib/actionLog'

const RECON_ORCHESTRATOR_URL = process.env.RECON_ORCHESTRATOR_URL || 'http://localhost:8010'
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:3000'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    // Verify project exists
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
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const hasTargetDomain = (project.targetDomain ?? '').trim().length > 0
    const hasGithubTarget = (project.githubTargetOrg ?? '').trim().length > 0
    if (!hasTargetDomain && !hasGithubTarget) {
      return NextResponse.json(
        {
          error:
            'Project needs a target domain or GitHub organization configured',
        },
        { status: 400 }
      )
    }

    const description = hasTargetDomain
      ? `Started reconnaissance scan for ${project.targetDomain}`
      : `Started GitHub secret scan for ${project.githubTargetOrg}`
    const metadata: Record<string, unknown> = {
      projectName: project.name,
    }
    if (hasTargetDomain) metadata.targetDomain = project.targetDomain
    if (hasGithubTarget) metadata.githubTargetOrg = project.githubTargetOrg

    // Create ActionLog entry for recon start
    try {
      await createActionLog({
        projectId,
        userId: project.userId,
        type: 'recon',
        action: 'Start Reconnaissance',
        description,
        status: 'running',
        metadata,
      })
    } catch (error) {
      console.error('Failed to create ActionLog:', error)
      // Continue even if ActionLog creation fails
    }

    // Call recon orchestrator to start the recon
    const response = await fetch(`${RECON_ORCHESTRATOR_URL}/recon/${projectId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: projectId,
        user_id: project.userId,
        webapp_api_url: WEBAPP_URL,
        target_domain: project.targetDomain,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // Update ActionLog to error status
      try {
        await createActionLog({
          projectId,
          userId: project.userId,
          type: 'recon',
          action: 'Start Reconnaissance',
          description: `Failed to start reconnaissance: ${errorData.detail || 'Unknown error'}`,
          status: 'error',
          metadata: {
            ...metadata,
            error: errorData.detail || 'Unknown error',
          },
        })
      } catch (logError) {
        console.error('Failed to create error ActionLog:', logError)
      }

      return NextResponse.json(
        { error: errorData.detail || 'Failed to start recon' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('Error starting recon:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

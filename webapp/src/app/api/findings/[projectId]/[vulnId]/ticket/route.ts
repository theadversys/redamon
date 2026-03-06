import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createGitHubIssue, createJiraIssue } from '@/lib/ticket-providers'

async function getOrCreateFindingState(projectId: string, vulnId: string) {
  let state = await prisma.findingState.findUnique({
    where: { projectId_vulnId: { projectId, vulnId } },
    include: { ticket: true },
  })
  if (!state) {
    state = await prisma.findingState.create({
      data: { projectId, vulnId, status: 'open' },
      include: { ticket: true },
    })
  }
  return state
}

/**
 * POST /api/findings/[projectId]/[vulnId]/ticket
 * Create or link a ticket.
 * Body: { action: 'create' | 'link', provider?, ticketId?, ticketUrl?, ... }
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
    select: { id: true, githubAccessToken: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  let body: {
    action: 'create' | 'link'
    provider?: string
    ticketId?: string
    ticketUrl?: string
    title?: string
    severity?: string
    asset?: string
    entrypoints?: string[]
    summary?: string
    remediation?: string
    proofLink?: string
    repo?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const state = await getOrCreateFindingState(projectId, vulnId)

  if (body.action === 'link') {
    if (!body.ticketId || !body.ticketUrl || !body.provider) {
      return NextResponse.json(
        { error: 'link requires provider, ticketId, ticketUrl' },
        { status: 400 }
      )
    }
    const ticket = await prisma.findingTicket.upsert({
      where: { findingStateId: state.id },
      create: {
        findingStateId: state.id,
        provider: body.provider,
        ticketId: body.ticketId,
        ticketUrl: body.ticketUrl,
        lastSyncAt: new Date(),
      },
      update: {
        provider: body.provider,
        ticketId: body.ticketId,
        ticketUrl: body.ticketUrl,
        lastSyncAt: new Date(),
      },
    })
    return NextResponse.json({
      provider: ticket.provider,
      ticketId: ticket.ticketId,
      ticketUrl: ticket.ticketUrl,
      status: ticket.status,
      lastSyncAt: ticket.lastSyncAt?.toISOString() ?? null,
    })
  }

  if (body.action === 'create') {
    const provider = body.provider || 'github'
    const title = body.title || `[Vuln] ${vulnId}`
    const summary = body.summary || ''
    const remediation = body.remediation || ''
    const asset = body.asset || ''
    const entrypoints = (body.entrypoints || []).join('\n')
    const bodyText = [
      summary && `## Summary\n${summary}`,
      asset && `## Asset\n${asset}`,
      entrypoints && `## Entrypoints\n${entrypoints}`,
      remediation && `## Remediation\n${remediation}`,
      `\n---\nFinding ID: ${vulnId}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    let result: { provider: string; ticketId: string; ticketUrl: string } | null = null

    if (provider === 'github') {
      const repo = body.repo || process.env.GITHUB_ISSUES_REPO
      const token = (project as { githubAccessToken?: string }).githubAccessToken || process.env.GITHUB_ACCESS_TOKEN
      if (token && repo) {
        result = await createGitHubIssue(token, repo, {
          title,
          body: bodyText || title,
          labels: ['vulnerability', body.severity || 'unknown'],
        })
      }
    } else if (provider === 'jira') {
      result = await createJiraIssue({ title, body: bodyText || title })
    }

    if (result) {
      const ticket = await prisma.findingTicket.upsert({
        where: { findingStateId: state.id },
        create: {
          findingStateId: state.id,
          provider: result.provider,
          ticketId: result.ticketId,
          ticketUrl: result.ticketUrl,
          lastSyncAt: new Date(),
        },
        update: {
          provider: result.provider,
          ticketId: result.ticketId,
          ticketUrl: result.ticketUrl,
          lastSyncAt: new Date(),
        },
      })
      return NextResponse.json({
        provider: ticket.provider,
        ticketId: ticket.ticketId,
        ticketUrl: ticket.ticketUrl,
        status: ticket.status,
        lastSyncAt: ticket.lastSyncAt?.toISOString() ?? null,
        created: true,
      })
    }

    return NextResponse.json(
      {
        error:
          provider === 'github'
            ? 'GitHub: Set GITHUB_ISSUES_REPO env and project githubAccessToken, or provide repo in body'
            : 'Jira: Set JIRA_BASE_URL, JIRA_PROJECT_KEY, JIRA_EMAIL, JIRA_API_TOKEN env vars',
      },
      { status: 400 }
    )
  }

  return NextResponse.json({ error: 'action must be create or link' }, { status: 400 })
}

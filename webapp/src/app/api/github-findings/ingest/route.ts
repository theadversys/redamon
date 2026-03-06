import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  getAuthContext,
  getRequestId,
  verifyProjectAccess,
} from '@/lib/github-api-auth'

const RECON_ORCHESTRATOR_URL =
  process.env.RECON_ORCHESTRATOR_URL || 'http://localhost:8010'

/**
 * POST /api/github-findings/ingest
 * Ingest GitHub secret scan findings from github_secrets_{projectId}.json into Neo4j.
 * Used when the file exists (e.g. after recon ran GitHub phase) but findings
 * were not yet written to the graph, or for manual re-import.
 */
export async function POST(request: NextRequest) {
  const requestId = getRequestId(request)
  const auth = getAuthContext(request)

  if (!auth) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required' },
      { status: 401, headers: { 'X-Request-ID': requestId } }
    )
  }

  let body: { projectId?: string }
  try {
    body = (await request.json()) as { projectId?: string }
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: { 'X-Request-ID': requestId } }
    )
  }

  const projectId = body.projectId?.trim()
  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400, headers: { 'X-Request-ID': requestId } }
    )
  }

  const access = await verifyProjectAccess(projectId, auth.userId)
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.status === 404 ? 'not_found' : 'forbidden', message: access.error },
      { status: access.status || 403, headers: { 'X-Request-ID': requestId } }
    )
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404, headers: { 'X-Request-ID': requestId } }
    )
  }

  try {
    const response = await fetch(`${RECON_ORCHESTRATOR_URL}/ingest/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        user_id: project.userId,
      }),
    })

    const result = (await response.json().catch(() => ({}))) as {
      success?: boolean
      stats?: { secrets_created?: number; secrets_updated?: number }
      errors?: string[]
    }

    if (!response.ok) {
      const detail =
        (result as { error?: string; detail?: string }).error ||
        (result as { error?: string; detail?: string }).detail ||
        result.errors?.join('; ') ||
        'Ingest failed'
      return NextResponse.json(
        { error: String(detail) },
        { status: response.status, headers: { 'X-Request-ID': requestId } }
      )
    }

    return NextResponse.json(result, {
      headers: { 'X-Request-ID': requestId },
    })
  } catch (error) {
    console.error('GitHub ingest error:', error)
    return NextResponse.json(
      {
        error: 'server_error',
        message:
          error instanceof Error ? error.message : 'Failed to call ingest service',
      },
      { status: 500, headers: { 'X-Request-ID': requestId } }
    )
  }
}

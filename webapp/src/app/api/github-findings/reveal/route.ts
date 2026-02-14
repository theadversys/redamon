import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../../graph/neo4j'
import {
  getAuthContext,
  getRequestId,
  verifyProjectAccess,
} from '@/lib/github-api-auth'
import { auditFindingsRequest } from '@/lib/github-api-audit'

/**
 * Reveal the actual secret value for a GitHub finding.
 * Requires projectId and finding id. Returns unmasked secret_value.
 * Audited for security.
 */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request)
  const auth = getAuthContext(request)

  if (!auth) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required' },
      { status: 401, headers: { 'X-Request-ID': requestId } }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')?.trim()
  const id = searchParams.get('id')?.trim()

  if (!projectId || !id) {
    return NextResponse.json(
      { error: 'projectId and id are required' },
      { status: 400, headers: { 'X-Request-ID': requestId } }
    )
  }

  const access = await verifyProjectAccess(projectId, auth.userId)
  if (!access.allowed) {
    auditFindingsRequest(auth, request, { projectId, id }, access.status || 403)
    return NextResponse.json(
      { error: access.status === 404 ? 'not_found' : 'forbidden', message: access.error },
      { status: access.status || 403, headers: { 'X-Request-ID': requestId } }
    )
  }

  try {
    const session = getSession()

    const result = await session.run(
      `
      MATCH (g:GitHubSecret)
      WHERE g.project_id = $projectId AND g.id = $id
      RETURN g.secret_value AS secretValue
      `,
      { projectId, id }
    )

    await session.close()

    if (result.records.length === 0) {
      auditFindingsRequest(auth, request, { projectId, id }, 404)
      return NextResponse.json(
        { error: 'not_found', message: 'Finding not found' },
        { status: 404, headers: { 'X-Request-ID': requestId } }
      )
    }

    const rawSecret = result.records[0].get('secretValue')
    const secretValue = rawSecret != null ? String(rawSecret) : ''

    auditFindingsRequest(auth, request, { projectId, id }, 200)

    return NextResponse.json(
      { secretValue },
      { headers: { 'X-Request-ID': requestId } }
    )
  } catch (error) {
    console.error('Error revealing secret:', error)
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to reveal secret' },
      { status: 500, headers: { 'X-Request-ID': requestId } }
    )
  }
}

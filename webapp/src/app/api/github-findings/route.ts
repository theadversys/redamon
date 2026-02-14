import { NextRequest, NextResponse } from 'next/server'
import { getSession, neo4j } from '../graph/neo4j'
import {
  getAuthContext,
  getRequestId,
  verifyProjectAccess,
  maskSecretValue,
} from '@/lib/github-api-auth'
import { auditFindingsRequest } from '@/lib/github-api-audit'
import { checkRateLimit } from '@/lib/github-api-ratelimit'

const CANONICAL_PROVIDERS = [
  'openai',
  'anthropic',
  'huggingface',
  'cohere',
  'groq',
  'replicate',
  'together',
  'vertex_ai',
  'langchain',
  'llama_index',
  'unknown',
]

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 2000

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
  const projectId = searchParams.get('projectId')
  const findingType = searchParams.get('findingType')?.trim()
  const secretType = searchParams.get('secretType')?.trim()
  const provider = searchParams.get('provider')?.trim()
  const severity = searchParams.get('severity')?.trim().toLowerCase()
  const repo = searchParams.get('repo')?.trim()
  const path = searchParams.get('path')?.trim()
  const id = searchParams.get('id')?.trim()
  const since = searchParams.get('since')?.trim()
  const limitRaw = parseInt(searchParams.get('limit') || '200', 10)
  const offsetRaw = parseInt(searchParams.get('offset') || '0', 10)

  const limit = Math.min(Math.max(1, limitRaw), MAX_LIMIT)
  const offset = Math.max(0, offsetRaw)

  if (!projectId) {
    auditFindingsRequest(
      auth,
      request,
      { projectId: '', findingType, secretType, provider, severity, repo, path, id, since, limit, offset },
      400
    )
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400, headers: { 'X-Request-ID': requestId } }
    )
  }

  // Rate limit
  const rl = checkRateLimit(projectId, auth.userId)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      {
        status: 429,
        headers: {
          'X-Request-ID': requestId,
          ...(rl.retryAfter && { 'Retry-After': String(rl.retryAfter) }),
        },
      }
    )
  }

  // Verify project access
  const access = await verifyProjectAccess(projectId, auth.userId)
  if (!access.allowed) {
    auditFindingsRequest(
      auth,
      request,
      { projectId, findingType, secretType, provider, severity, repo, path, id, since, limit, offset },
      access.status || 403
    )
    return NextResponse.json(
      { error: access.status === 404 ? 'not_found' : 'forbidden', message: access.error },
      { status: access.status || 403, headers: { 'X-Request-ID': requestId } }
    )
  }

  try {
    const session = getSession()

    // Build where clauses
    const conditions: string[] = ['g.project_id = $projectId']
    const params: Record<string, unknown> = { projectId }

    if (findingType) {
      conditions.push('g.finding_type = $findingType')
      params.findingType = findingType
    }
    if (secretType) {
      conditions.push('toLower(g.secret_type) CONTAINS toLower($secretType)')
      params.secretType = secretType
    }
    if (provider) {
      const provLower = provider.toLowerCase()
      conditions.push('toLower(g.provider) = $provider')
      params.provider = provLower
    }
    if (severity) {
      conditions.push('g.severity = $severity')
      params.severity = severity
    }
    if (repo) {
      conditions.push('toLower(g.repository) CONTAINS toLower($repo)')
      params.repo = repo
    }
    if (path) {
      conditions.push('toLower(g.path) CONTAINS toLower($path)')
      params.path = path
    }
    if (id) {
      conditions.push('g.id = $id')
      params.id = id
    }
    if (since) {
      conditions.push('g.scan_timestamp >= $since')
      params.since = since
    }

    const whereClause = conditions.join(' AND ')

    // Count total (approximate for pagination)
    const countResult = await session.run(
      `
      MATCH (g:GitHubSecret)
      WHERE ${whereClause}
      WITH count(g) AS total
      RETURN total
      `,
      params
    )
    const totalApprox =
      countResult.records.length > 0 ? (countResult.records[0].get('total') as number) : 0

    // Fetch with pagination (Neo4j requires integer for LIMIT/SKIP)
    const resultParams = { ...params, limit: neo4j.int(limit), offset: neo4j.int(offset) }

    const result = await session.run(
      `
      MATCH (g:GitHubSecret)
      WHERE ${whereClause}
      RETURN g
      ORDER BY
        CASE g.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        g.scan_timestamp DESC
      SKIP $offset
      LIMIT $limit
      `,
      resultParams
    )

    const findings = result.records.map((record) => {
      const g = record.get('g')
      const p = g.properties as Record<string, unknown>
      const rawSecret = p.secret_value
      return {
        id: p.id,
        repository: p.repository,
        path: p.path,
        line: p.line,
        secretType: p.secret_type,
        findingType: p.finding_type,
        provider: p.provider,
        severity: p.severity,
        secretValue: maskSecretValue(rawSecret as string),
        pattern: p.pattern,
        commitSha: p.commit_sha,
        scanTimestamp: p.scan_timestamp,
      }
    })

    await session.close()

    const hasMore = offset + findings.length < totalApprox

    auditFindingsRequest(
      auth,
      request,
      { projectId, findingType, secretType, provider, severity, repo, path, id, since, limit, offset },
      200
    )

    return NextResponse.json(
      {
        findings,
        pageInfo: {
          limit,
          offset,
          hasMore,
          totalApprox,
        },
      },
      {
        headers: { 'X-Request-ID': requestId },
      }
    )
  } catch (error) {
    console.error('Error fetching GitHub findings:', error)
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to fetch GitHub findings' },
      { status: 500, headers: { 'X-Request-ID': requestId } }
    )
  }
}

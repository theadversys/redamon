import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../graph/neo4j'
import {
  getAuthContext,
  getRequestId,
  verifyProjectAccess,
} from '@/lib/github-api-auth'
import { auditStatsRequest } from '@/lib/github-api-audit'
import { checkRateLimit } from '@/lib/github-api-ratelimit'

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

  if (!projectId) {
    auditStatsRequest(auth, request, { projectId: '' }, 400)
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
    auditStatsRequest(auth, request, { projectId }, access.status || 403)
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
      WHERE g.project_id = $projectId
      RETURN g.severity AS severity,
             g.finding_type AS findingType,
             g.secret_type AS secretType,
             g.provider AS provider,
             g.repository AS repository,
             g.scan_timestamp AS scanTimestamp
      `,
      { projectId }
    )

    const findings = result.records.map((r) => ({
      severity: r.get('severity') as string,
      findingType: r.get('findingType') as string,
      secretType: r.get('secretType') as string,
      provider: r.get('provider') as string,
      repository: r.get('repository') as string,
      scanTimestamp: r.get('scanTimestamp') as string | null,
    }))

    await session.close()

    const scanTimestamps = findings
      .map((f) => f.scanTimestamp)
      .filter((t): t is string => !!t)
    const lastScan =
      scanTimestamps.length > 0 ? scanTimestamps.sort().reverse()[0] : null

    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    }

    const bySecretType: Record<string, number> = {}
    const byFindingType: Record<string, number> = {}
    const byProvider: Record<string, number> = {}

    const aiProviders = [
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
    ]

    for (const f of findings) {
      const sev = (f.severity || 'info').toLowerCase()
      if (sev in bySeverity) bySeverity[sev]++
      else bySeverity.info++

      const st = f.secretType || 'Unknown'
      bySecretType[st] = (bySecretType[st] || 0) + 1

      const ft = f.findingType || 'SECRET'
      byFindingType[ft] = (byFindingType[ft] || 0) + 1

      const prov = f.provider || 'unknown'
      byProvider[prov] = (byProvider[prov] || 0) + 1
    }

    const aiLlmSecretsCount = findings.filter((f) =>
      aiProviders.includes(String(f.provider || '').toLowerCase())
    ).length

    const aiLlmUsageCount = findings.filter(
      (f) => f.findingType === 'AI_LLM_USAGE'
    ).length

    const reposWithAiUsage = new Set(
      findings
        .filter((f) => f.findingType === 'AI_LLM_USAGE' && f.repository)
        .map((f) => f.repository)
    ).size

    auditStatsRequest(auth, request, { projectId }, 200)

    return NextResponse.json(
      {
        totalFindings: findings.length,
        lastScan,
        bySeverity,
        bySecretType,
        byFindingType,
        byProvider,
        aiLlmSecretsCount,
        aiLlmUsageCount,
        reposWithAiUsage,
      },
      { headers: { 'X-Request-ID': requestId } }
    )
  } catch (error) {
    console.error('Error fetching GitHub stats:', error)
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to fetch GitHub stats' },
      { status: 500, headers: { 'X-Request-ID': requestId } }
    )
  }
}

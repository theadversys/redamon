/**
 * Audit logging for GitHub API calls.
 * Logs: timestamp, identity, projectId, filters, source, requestId.
 * Sensitive fields (secretValue) are never logged.
 */

import { NextRequest } from 'next/server'
import type { AuthContext } from './github-api-auth'

export interface GitHubFindingsAuditParams {
  projectId: string
  findingType?: string
  secretType?: string
  provider?: string
  severity?: string
  repo?: string
  path?: string
  id?: string
  since?: string
  limit?: number
  offset?: number
}

export interface GitHubStatsAuditParams {
  projectId: string
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export function auditFindingsRequest(
  auth: AuthContext,
  request: NextRequest,
  params: GitHubFindingsAuditParams,
  statusCode: number
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'github_findings',
    requestId: auth.requestId,
    identityType: auth.identityType,
    userId: auth.userId || 'anonymous',
    projectId: params.projectId,
    filters: {
      findingType: params.findingType,
      secretType: params.secretType,
      provider: params.provider,
      severity: params.severity,
      repo: params.repo,
      path: params.path,
      id: params.id,
      since: params.since,
      limit: params.limit,
      offset: params.offset,
    },
    source: getClientIp(request),
    statusCode,
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ audit: entry }))
}

export function auditStatsRequest(
  auth: AuthContext,
  request: NextRequest,
  params: GitHubStatsAuditParams,
  statusCode: number
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    type: 'github_stats',
    requestId: auth.requestId,
    identityType: auth.identityType,
    userId: auth.userId || 'anonymous',
    projectId: params.projectId,
    source: getClientIp(request),
    statusCode,
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ audit: entry }))
}

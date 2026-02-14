/**
 * Auth and authorization for GitHub findings API.
 * Supports Bearer token (agent) and anonymous (dev only).
 */

import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { randomUUID } from 'crypto'

const AGENT_SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''

export interface AuthContext {
  userId: string | null
  identityType: 'bearer' | 'anonymous'
  requestId: string
}

/**
 * Extract or generate X-Request-ID.
 */
export function getRequestId(request: NextRequest): string {
  return request.headers.get('x-request-id') || randomUUID()
}

/**
 * Check if request appears to be from localhost (dev / production build locally).
 */
function isLocalhost(request: NextRequest): boolean {
  const host = request.headers.get('host') || ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

/**
 * Check if request appears to be from our app (same-origin or trusted origin).
 */
function isSameOrigin(request: NextRequest): boolean {
  if (!APP_URL) return false
  const origin = request.headers.get('origin') || request.headers.get('referer') || ''
  if (!origin) return true // same-origin requests often omit Origin
  try {
    const originHost = new URL(origin).origin
    const appOrigin = new URL(APP_URL).origin
    return originHost === appOrigin
  } catch {
    return false
  }
}

/**
 * Resolve auth context from request.
 * - Bearer token: verify AGENT_SERVICE_TOKEN, require X-User-Id
 * - No token: allow in dev (anonymous), or in prod when same-origin (browser)
 */
export function getAuthContext(request: NextRequest): AuthContext | null {
  const requestId = getRequestId(request)
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (bearerToken) {
    if (!AGENT_SERVICE_TOKEN || bearerToken !== AGENT_SERVICE_TOKEN) {
      return null // 401
    }
    const userId = request.headers.get('x-user-id')?.trim()
    if (!userId) {
      return null // 401 - agent must send X-User-Id
    }
    return { userId, identityType: 'bearer', requestId }
  }

  // No Bearer: allow anonymous in dev, or same-origin/localhost browser in prod
  if (!IS_PRODUCTION) {
    return { userId: null, identityType: 'anonymous', requestId }
  }
  if (isLocalhost(request)) {
    return { userId: null, identityType: 'anonymous', requestId }
  }
  if (APP_URL && isSameOrigin(request)) {
    return { userId: null, identityType: 'anonymous', requestId }
  }
  return null // 401 in production for non-same-origin
}

/**
 * Verify the caller has access to the project.
 * Returns 404 if project not found, 403 if no access.
 * Anonymous (browser/same-origin): allow if project exists.
 * Bearer (agent): require project.userId === X-User-Id.
 */
export async function verifyProjectAccess(
  projectId: string,
  userId: string | null
): Promise<{ allowed: boolean; status?: number; error?: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })

  if (!project) {
    return { allowed: false, status: 404, error: 'Project not found or you don\'t have access' }
  }

  // Anonymous (browser/same-origin or dev): allow if project exists
  if (userId === null) {
    return { allowed: true }
  }

  // Bearer (agent): must match project owner
  if (project.userId !== userId) {
    return { allowed: false, status: 403, error: 'Project not found or you don\'t have access' }
  }

  return { allowed: true }
}

/**
 * Mask secretValue for API responses.
 */
export function maskSecretValue(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return ''
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}***...***${value.slice(-4)}`
}

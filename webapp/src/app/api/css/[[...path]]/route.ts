/**
 * Proxy Agent Zero CSS assets.
 * Agent Zero iframe at /api/a0 requests /api/css/* which must be proxied.
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  // Agent Zero serves at root: /css/..., not /api/css/...
  const upstreamPath = `/css${path.length > 0 ? '/' + path.join('/') : ''}`
  return proxyToAgentZero(request, upstreamPath)
}

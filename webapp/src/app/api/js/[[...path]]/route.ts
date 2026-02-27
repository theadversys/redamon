/**
 * Proxy Agent Zero JS assets.
 * Agent Zero iframe at /api/a0 requests /api/js/* which must be proxied.
 * Note: Does not conflict with /api/ws (WebSocket) - different path.
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  // Agent Zero serves at root: /js/..., not /api/js/...
  const upstreamPath = `/js${path.length > 0 ? '/' + path.join('/') : ''}`
  return proxyToAgentZero(request, upstreamPath)
}

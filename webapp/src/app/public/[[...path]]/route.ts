/**
 * Proxy Agent Zero public assets at root path (for absolute /public/* when using proxy).
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  const upstreamPath = `/public${path.length > 0 ? '/' + path.join('/') : ''}`
  return proxyToAgentZero(request, upstreamPath)
}

/**
 * Proxy Agent Zero component assets at root path.
 * Agent Zero uses absolute paths like /components/chat/... when loaded in iframe.
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  const upstreamPath = `/components${path.length > 0 ? '/' + path.join('/') : ''}`
  return proxyToAgentZero(request, upstreamPath)
}

/**
 * Proxy Agent Zero index.css.
 * Agent Zero iframe at /api/a0 requests /api/index.css which must be proxied.
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(request: NextRequest) {
  return proxyToAgentZero(request, '/index.css')
}

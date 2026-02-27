/**
 * Proxy Agent Zero index.js.
 * Agent Zero iframe requests /api/index.js which must be proxied.
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(request: NextRequest) {
  // Agent Zero serves at root: /index.js, not /api/index.js
  return proxyToAgentZero(request, '/index.js')
}

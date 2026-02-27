/**
 * Proxy Agent Zero index.js at root (for absolute /index.js when using proxy).
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(request: NextRequest) {
  return proxyToAgentZero(request, '/index.js')
}

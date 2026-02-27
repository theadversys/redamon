/**
 * Proxy Agent Zero index.css at root (for absolute /index.css when using proxy).
 */

import { NextRequest } from 'next/server'
import { proxyToAgentZero } from '@/lib/a0-proxy'

export async function GET(request: NextRequest) {
  return proxyToAgentZero(request, '/index.css')
}

import { NextRequest, NextResponse } from 'next/server'

const AGENT_SERVICE_TOKEN = process.env.AGENT_SERVICE_TOKEN?.trim()
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || ''
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function isLocalOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host') || ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

function isSameOrigin(request: NextRequest): boolean {
  if (!APP_URL) return false
  const origin = request.headers.get('origin') || request.headers.get('referer') || ''
  if (!origin) return true // same-origin requests often omit Origin header
  try {
    return new URL(origin).origin === new URL(APP_URL).origin
  } catch {
    return false
  }
}

function isBrowserRequest(request: NextRequest): boolean {
  const accept = request.headers.get('accept') || ''
  // Browsers send text/html or */* — MCP/API clients send application/json
  return accept.includes('text/html') || accept.includes('*/*')
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect /api/* routes
  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // Always allow health and public endpoints
  if (pathname.startsWith('/api/health') || pathname.startsWith('/api/public')) {
    return NextResponse.next()
  }

  // If no token configured, allow all (dev/open mode)
  if (!AGENT_SERVICE_TOKEN) return NextResponse.next()

  // Allow same-origin browser requests (the webapp UI)
  if (isLocalOrigin(request) || isSameOrigin(request)) return NextResponse.next()

  // Allow browser requests in development
  if (!IS_PRODUCTION && isBrowserRequest(request)) return NextResponse.next()

  // For everything else, require Bearer token
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token || token !== AGENT_SERVICE_TOKEN) {
    return NextResponse.json(
      { error: 'Unauthorized: missing or invalid AGENT_SERVICE_TOKEN' },
      { status: 401 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

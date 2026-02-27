/**
 * Agent Zero API Proxy
 *
 * Proxies requests to the Agent Zero container for same-origin iframe embedding.
 * Use NEXT_PUBLIC_AGENT_ZERO_URL=/api/a0 to embed via proxy.
 *
 * Note: Agent Zero uses Socket.IO for real-time updates. When proxied, Socket.IO
 * may connect to the wrong path. For full functionality, use direct URL
 * (e.g. http://localhost:50001) via NEXT_PUBLIC_AGENT_ZERO_URL.
 */

import { NextRequest, NextResponse } from 'next/server'

const A0_BASE = process.env.AGENT_ZERO_URL || 'http://agent-zero:80'

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const path = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/'
  const url = new URL(path, A0_BASE)
  url.search = request.nextUrl.search

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('host', new URL(A0_BASE).host)

  try {
    const res = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    })

    const newHeaders = new Headers()
    const skipHeaders = ['content-encoding', 'x-frame-options', 'content-security-policy']
    res.headers.forEach((value, key) => {
      if (skipHeaders.includes(key.toLowerCase())) return
      newHeaders.set(key, value)
    })
    // Allow iframe embedding from same origin (proxy makes it same-origin)
    newHeaders.delete('x-frame-options')
    newHeaders.delete('content-security-policy')

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    })
  } catch (err) {
    console.error('[a0 proxy]', err)
    return NextResponse.json(
      { error: 'Agent Zero proxy failed', detail: String(err) },
      { status: 502 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  return proxyRequest(request, path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  return proxyRequest(request, path)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  return proxyRequest(request, path)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  return proxyRequest(request, path)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params
  return proxyRequest(request, path)
}

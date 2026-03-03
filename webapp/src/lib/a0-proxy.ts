/**
 * Shared Agent Zero proxy logic for static assets and API.
 * Agent Zero serves assets at /api/css/, /api/vendor/, /api/js/ etc.
 * When embedded via iframe at /api/a0, the browser requests these from our origin.
 */

import { NextRequest, NextResponse } from 'next/server'

const A0_BASE = process.env.AGENT_ZERO_URL || 'http://localhost:50001'

export async function proxyToAgentZero(
  request: NextRequest,
  upstreamPath: string
): Promise<NextResponse> {
  const url = new URL(upstreamPath, A0_BASE)
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

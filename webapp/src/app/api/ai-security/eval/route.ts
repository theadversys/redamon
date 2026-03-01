import { NextResponse } from 'next/server'

/**
 * @deprecated Use /api/ai-security/scans instead.
 * This legacy endpoint is kept for backward compatibility.
 */
export async function POST(req: Request) {
  const body = await req.json()

  const res = await fetch(new URL('/api/ai-security/scans', req.url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: body.configName,
      targetUrl: body.targetEndpoint,
      plugins: body.plugins,
      numTests: 5,
      profile: 'custom',
    }),
  })

  return NextResponse.json(await res.json(), { status: res.status })
}

/**
 * POST /api/payloads/hta - Generate HTA payload
 */
import { NextRequest, NextResponse } from 'next/server'

const WEAPONIZER_URL = process.env.WEAPONIZER_URL || process.env.WEAPONIZER_HTTP_URL || 'http://localhost:8014'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lhost, lport = '4444', payloadType = 'windows_meterpreter_reverse_tcp' } = body

    if (!lhost) {
      return NextResponse.json({ error: 'lhost is required' }, { status: 400 })
    }

    const res = await fetch(`${WEAPONIZER_URL}/hta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lhost, lport, payload_type: payloadType }),
    }).catch(() => null)

    if (res?.ok) {
      return NextResponse.json(await res.json())
    }

    return NextResponse.json(
      { error: 'Weaponizer service unavailable' },
      { status: 503 }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

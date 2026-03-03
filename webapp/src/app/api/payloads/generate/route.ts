/**
 * POST /api/payloads/generate - Generate Metasploit payload (weaponization)
 *
 * Proxies to weaponizer service (Kali container) which runs msfvenom.
 */
import { NextRequest, NextResponse } from 'next/server'

const WEAPONIZER_URL = process.env.WEAPONIZER_URL || process.env.WEAPONIZER_HTTP_URL || 'http://localhost:8014'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { payloadType, lhost, lport = '4444', format = 'exe', encoder, outputFormat = 'base64' } = body

    if (!payloadType || !lhost) {
      return NextResponse.json(
        { error: 'payloadType and lhost are required' },
        { status: 400 }
      )
    }

    // Call weaponizer via MCP/SSE - weaponizer is an MCP server, we need HTTP
    // The weaponizer runs as MCP SSE - we need a direct HTTP endpoint
    // For now, call the Kali container's weaponizer - it exposes SSE, not REST
    // We need to add an HTTP REST endpoint to the weaponizer for direct calls
    // Fallback: use pandaexploit MCP which has access to weaponizer tools
    const res = await fetch(`${WEAPONIZER_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload_type: payloadType,
        lhost,
        lport,
        format,
        encoder: encoder || undefined,
        output_format: outputFormat,
      }),
    }).catch(() => null)

    if (res?.ok) {
      const data = await res.json()
      return NextResponse.json(data)
    }

    return NextResponse.json(
      {
        error: 'Payload service unavailable. Ensure weaponizer (Kali) is running and WEAPONIZER_URL or AGENT_API_URL is set.',
        hint: 'Weaponizer runs in kali-sandbox container. Set WEAPONIZER_URL to http://kali-sandbox:8014 (or localhost:8014 for local dev).',
      },
      { status: 503 }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

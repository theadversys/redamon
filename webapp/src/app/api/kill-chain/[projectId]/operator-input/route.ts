/**
 * HITL (Human-in-the-Loop) Operator Input API
 *
 * POST /api/kill-chain/[projectId]/operator-input
 *
 * Submits operator decision during a kill chain HITL pause.
 * Proxies to the kill chain orchestrator.
 */
import { NextRequest, NextResponse } from 'next/server'

const KILL_CHAIN_ORCHESTRATOR_URL = process.env.KILL_CHAIN_ORCHESTRATOR_URL || 'http://localhost:8015'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params
    const body = await request.json()

    const response = await fetch(
      `${KILL_CHAIN_ORCHESTRATOR_URL}/kill-chain/${projectId}/operator-input`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.detail || 'Failed to submit operator input' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[operator-input] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

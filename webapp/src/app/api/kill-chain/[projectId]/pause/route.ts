import { NextRequest, NextResponse } from 'next/server'

const KILL_CHAIN_ORCHESTRATOR_URL = process.env.KILL_CHAIN_ORCHESTRATOR_URL || 'http://localhost:8015'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    const response = await fetch(`${KILL_CHAIN_ORCHESTRATOR_URL}/kill-chain/${projectId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.detail || 'Failed to pause kill chain' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error pausing kill chain:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

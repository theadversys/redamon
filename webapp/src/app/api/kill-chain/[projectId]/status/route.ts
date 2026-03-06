import { NextRequest, NextResponse } from 'next/server'

const KILL_CHAIN_ORCHESTRATOR_URL = process.env.KILL_CHAIN_ORCHESTRATOR_URL || 'http://localhost:8015'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    const response = await fetch(`${KILL_CHAIN_ORCHESTRATOR_URL}/kill-chain/${projectId}/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.detail || 'Failed to get kill chain status' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error getting kill chain status:', error)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const { projectId } = await params
      return NextResponse.json({
        project_id: projectId,
        status: 'idle',
        current_stage: 1,
        current_stage_name: 'Reconnaissance',
        current_sub_step: null,
        started_at: null,
        completed_at: null,
        error: null,
      })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

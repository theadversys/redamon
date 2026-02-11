import { NextRequest, NextResponse } from 'next/server'
import { createActionLog } from '@/lib/actionLog'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, userId, type, action, description, status, metadata } = body

    if (!projectId || !userId || !type || !action || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, userId, type, action, status' },
        { status: 400 }
      )
    }

    await createActionLog({
      projectId,
      userId,
      type,
      action,
      description,
      status,
      metadata,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error creating ActionLog:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create ActionLog' },
      { status: 500 }
    )
  }
}

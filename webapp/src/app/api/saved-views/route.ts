import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

const PRESET_VIEWS = [
  { name: 'Exec view', filterJson: { viewType: 'exec' } },
  { name: 'Dev triage', filterJson: { status: 'open', viewType: 'dev_triage' } },
  { name: 'Overdue', filterJson: { overdue: true } },
  { name: 'Newly discovered', filterJson: { viewType: 'newly_discovered' } },
  { name: 'Risk accepted expiring soon', filterJson: { viewType: 'risk_expiring' } },
]

/**
 * GET /api/saved-views?projectId=&userId=
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  const userId = request.nextUrl.searchParams.get('userId')
  if (!projectId || !userId) {
    return NextResponse.json(
      { error: 'projectId and userId required' },
      { status: 400 }
    )
  }

  const views = await prisma.savedView.findMany({
    where: { projectId, userId },
    orderBy: { name: 'asc' },
  })

  const presets = PRESET_VIEWS.map((p) => ({
    name: p.name,
    filterJson: p.filterJson,
    isPreset: true,
  }))

  return NextResponse.json({
    saved: views.map((v) => ({
      id: v.id,
      name: v.name,
      filterJson: v.filterJson,
      isPreset: false,
    })),
    presets,
  })
}

/**
 * POST /api/saved-views
 * Create a saved view.
 */
export async function POST(request: NextRequest) {
  let body: { userId: string; projectId: string; name: string; filterJson: object }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, projectId, name, filterJson } = body
  if (!userId || !projectId || !name) {
    return NextResponse.json(
      { error: 'userId, projectId, name required' },
      { status: 400 }
    )
  }

  const view = await prisma.savedView.upsert({
    where: {
      userId_projectId_name: { userId, projectId, name },
    },
    create: {
      userId,
      projectId,
      name,
      filterJson: filterJson || {},
    },
    update: {
      filterJson: filterJson || {},
    },
  })

  return NextResponse.json({
    id: view.id,
    name: view.name,
    filterJson: view.filterJson,
  })
}

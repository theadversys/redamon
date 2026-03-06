import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

async function getOrCreateFindingState(projectId: string, vulnId: string) {
  let state = await prisma.findingState.findUnique({
    where: { projectId_vulnId: { projectId, vulnId } },
  })
  if (!state) {
    state = await prisma.findingState.create({
      data: { projectId, vulnId, status: 'open' },
    })
  }
  return state
}

/**
 * GET /api/findings/[projectId]/[vulnId]/comments
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; vulnId: string }> }
) {
  const { projectId, vulnId } = await params
  if (!projectId || !vulnId) {
    return NextResponse.json({ error: 'projectId and vulnId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const state = await getOrCreateFindingState(projectId, vulnId)
  const comments = await prisma.findingComment.findMany({
    where: { findingStateId: state.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    comments: comments.map((c) => ({
      id: c.id,
      authorId: c.authorId,
      body: c.body,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}

/**
 * POST /api/findings/[projectId]/[vulnId]/comments
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; vulnId: string }> }
) {
  const { projectId, vulnId } = await params
  if (!projectId || !vulnId) {
    return NextResponse.json({ error: 'projectId and vulnId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const authorId = request.headers.get('x-user-id') || project.userId || 'anonymous'

  let body: { body: string; parentId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.body || typeof body.body !== 'string') {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const state = await getOrCreateFindingState(projectId, vulnId)
  const comment = await prisma.findingComment.create({
    data: {
      findingStateId: state.id,
      authorId,
      body: body.body.trim(),
      parentId: body.parentId || null,
    },
  })

  return NextResponse.json({
    id: comment.id,
    authorId: comment.authorId,
    body: comment.body,
    parentId: comment.parentId,
    createdAt: comment.createdAt.toISOString(),
  })
}

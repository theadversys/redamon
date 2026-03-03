import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, description, policyText, projectId, isTemplate } = body

    if (!name || !policyText) {
      return NextResponse.json(
        { error: 'name and policyText are required' },
        { status: 400 },
      )
    }

    const policy = await prisma.aIPolicy.create({
      data: {
        name,
        description: description || null,
        policyText,
        projectId: projectId || null,
        isTemplate: isTemplate || false,
      },
    })

    return NextResponse.json({ success: true, policy })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const templatesOnly = searchParams.get('templates') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (templatesOnly) where.isTemplate = true

    const [policies, total] = await Promise.all([
      prisma.aIPolicy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.aIPolicy.count({ where }),
    ])

    return NextResponse.json({ policies, total, limit, offset })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, name, description, policyText } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (description !== undefined) data.description = description
    if (policyText !== undefined) data.policyText = policyText

    const policy = await prisma.aIPolicy.update({ where: { id }, data })
    return NextResponse.json({ success: true, policy })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await prisma.aIPolicy.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

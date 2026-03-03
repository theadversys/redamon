import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      name,
      projectId,
      maxRiskScore = 7.0,
      maxCriticalFindings = 0,
      maxHighFindings = 5,
      requiredFrameworks = [],
      action = 'warn',
      webhookUrl,
    } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const gate = await prisma.aIQualityGate.create({
      data: {
        name,
        projectId: projectId || null,
        maxRiskScore,
        maxCriticalFindings,
        maxHighFindings,
        requiredFrameworks,
        action,
        webhookUrl: webhookUrl || null,
      },
    })

    return NextResponse.json({ success: true, gate })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')

    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId

    const gates = await prisma.aIQualityGate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ gates })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const gate = await prisma.aIQualityGate.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json({ success: true, gate })
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

    await prisma.aIQualityGate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

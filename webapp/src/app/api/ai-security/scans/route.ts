import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildRedteamConfig } from '@/lib/ai-security/config-gen'
import { startScan } from '@/lib/ai-security/runner'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      name,
      targetUrl,
      targetType = 'http',
      purpose,
      systemPrompt,
      plugins = ['prompt-injection'],
      strategies = ['jailbreak:meta'],
      profile = 'custom',
      numTests = 5,
      projectId,
      responseParser,
    } = body

    if (!targetUrl) {
      return NextResponse.json({ error: 'targetUrl is required' }, { status: 400 })
    }
    if (!plugins.length) {
      return NextResponse.json({ error: 'At least one plugin is required' }, { status: 400 })
    }

    const configYaml = buildRedteamConfig({
      targetUrl,
      targetType,
      purpose,
      systemPrompt,
      plugins,
      strategies,
      numTests,
      responseParser,
    })

    const scan = await prisma.aIScan.create({
      data: {
        name: name || `Scan-${new Date().toISOString().slice(0, 16)}`,
        projectId: projectId || null,
        status: 'queued',
        targetUrl,
        targetType,
        purpose: purpose || null,
        systemPrompt: systemPrompt || null,
        plugins,
        strategies,
        profile,
        numTests,
        configYaml,
      },
    })

    let pid: number
    try {
      const result = await startScan(scan.id, configYaml)
      pid = result.pid

      await prisma.aIScan.update({
        where: { id: scan.id },
        data: { status: 'running', pid, startedAt: new Date() },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.aIScan.update({
        where: { id: scan.id },
        data: { status: 'failed', errorMessage: msg },
      })
      return NextResponse.json({ success: false, scanId: scan.id, error: msg }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      scanId: scan.id,
      status: 'running',
      pid,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const projectId = searchParams.get('projectId')

    const where = projectId ? { projectId } : {}

    const [scans, total] = await Promise.all([
      prisma.aIScan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { findings: true } },
        },
      }),
      prisma.aIScan.count({ where }),
    ])

    return NextResponse.json({ scans, total, limit, offset })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

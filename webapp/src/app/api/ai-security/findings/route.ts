import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const severity = searchParams.get('severity')
    const plugin = searchParams.get('plugin')
    const scanId = searchParams.get('scanId')

    const where: Record<string, unknown> = {}
    if (severity && severity !== 'all') where.severity = severity
    if (plugin) where.plugin = plugin
    if (scanId) where.scanId = scanId

    const [findings, total] = await Promise.all([
      prisma.aIFinding.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          scan: { select: { id: true, name: true, targetUrl: true } },
        },
      }),
      prisma.aIFinding.count({ where }),
    ])

    return NextResponse.json({ findings, total, limit, offset })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

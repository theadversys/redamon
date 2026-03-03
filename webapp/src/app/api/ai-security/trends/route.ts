import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const projectId = searchParams.get('projectId')
    const period = searchParams.get('period') || '30d'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

    const daysBack = parseInt(period.replace('d', ''), 10) || 30
    const since = new Date()
    since.setDate(since.getDate() - daysBack)

    const where: Record<string, unknown> = {
      status: 'completed',
      completedAt: { gte: since },
    }
    if (projectId) where.projectId = projectId

    const scans = await prisma.aIScan.findMany({
      where,
      orderBy: { completedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        name: true,
        profile: true,
        targetUrl: true,
        systemRiskScore: true,
        totalTests: true,
        passedTests: true,
        failedTests: true,
        completedAt: true,
        _count: { select: { findings: true } },
      },
    })

    const dataPoints = scans.map(s => {
      const total = s.totalTests ?? 0
      const passed = s.passedTests ?? 0
      const failed = s.failedTests ?? 0
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
      const asr = total > 0 ? Math.round((failed / total) * 100) : 0

      return {
        scanId: s.id,
        scanName: s.name,
        profile: s.profile,
        targetUrl: s.targetUrl,
        date: s.completedAt,
        systemRiskScore: s.systemRiskScore ?? 0,
        totalTests: total,
        passRate,
        attackSuccessRate: asr,
        findingsCount: s._count.findings,
      }
    })

    // Compute trend direction
    let trend: 'improving' | 'degrading' | 'stable' | 'insufficient-data' = 'insufficient-data'
    if (dataPoints.length >= 2) {
      const first = dataPoints[0].systemRiskScore
      const last = dataPoints[dataPoints.length - 1].systemRiskScore
      const delta = last - first
      if (delta < -0.5) trend = 'improving'
      else if (delta > 0.5) trend = 'degrading'
      else trend = 'stable'
    }

    // Severity trend across all scans in period
    const findingSeverities = await prisma.aIFinding.groupBy({
      by: ['severity'],
      where: {
        scan: {
          status: 'completed',
          completedAt: { gte: since },
          ...(projectId ? { projectId } : {}),
        },
      },
      _count: true,
    })

    const severityTotals: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const row of findingSeverities) {
      if (row.severity in severityTotals) {
        severityTotals[row.severity] = row._count
      }
    }

    return NextResponse.json({
      period,
      since: since.toISOString(),
      trend,
      scanCount: dataPoints.length,
      dataPoints,
      severityTotals,
      latestRiskScore: dataPoints.length > 0
        ? dataPoints[dataPoints.length - 1].systemRiskScore
        : null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

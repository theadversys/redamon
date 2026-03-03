import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  generateScorecard,
  getAvailableFrameworks,
  type ComplianceFramework,
} from '@/lib/ai-security/compliance-mapper'

interface RouteParams {
  params: Promise<{ scanId: string }>
}

const VALID_FRAMEWORKS = new Set<ComplianceFramework>(['owasp', 'nist', 'eu-ai-act'])

export async function GET(req: Request, { params }: RouteParams) {
  const { scanId } = await params
  const { searchParams } = new URL(req.url)
  const framework = searchParams.get('framework') as ComplianceFramework | null

  try {
    const scan = await prisma.aIScan.findUnique({
      where: { id: scanId },
      include: { findings: true },
    })

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    if (scan.status !== 'completed') {
      return NextResponse.json({ error: 'Scan not yet completed' }, { status: 400 })
    }

    const stats = {
      totalTests: scan.totalTests ?? 0,
      passedTests: scan.passedTests ?? 0,
      failedTests: scan.failedTests ?? 0,
    }

    const findings = scan.findings.map(f => ({
      plugin: f.plugin,
      severity: f.severity,
      strategy: f.strategy,
    }))

    const pluginsUsed = Array.isArray(scan.plugins) ? (scan.plugins as string[]) : []

    if (framework && VALID_FRAMEWORKS.has(framework)) {
      const scorecard = generateScorecard(framework, findings, stats, pluginsUsed)
      return NextResponse.json(scorecard)
    }

    // Return all frameworks
    const scorecards = Array.from(VALID_FRAMEWORKS).map(fw =>
      generateScorecard(fw, findings, stats, pluginsUsed)
    )

    return NextResponse.json({
      scanId,
      scanName: scan.name,
      systemRiskScore: scan.systemRiskScore,
      frameworks: getAvailableFrameworks(),
      scorecards,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

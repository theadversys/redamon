import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateScorecard, type ComplianceFramework } from '@/lib/ai-security/compliance-mapper'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const scanId = searchParams.get('scanId')

  if (!scanId) {
    return NextResponse.json({ error: 'scanId query parameter is required' }, { status: 400 })
  }

  try {
    const [gate, scan] = await Promise.all([
      prisma.aIQualityGate.findUnique({ where: { id } }),
      prisma.aIScan.findUnique({
        where: { id: scanId },
        include: { findings: true },
      }),
    ])

    if (!gate) {
      return NextResponse.json({ error: 'Quality gate not found' }, { status: 404 })
    }
    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }
    if (scan.status !== 'completed') {
      return NextResponse.json({ error: 'Scan not yet completed' }, { status: 400 })
    }

    const violations: string[] = []

    // Check risk score threshold
    const systemScore = scan.systemRiskScore ?? 0
    if (systemScore > gate.maxRiskScore) {
      violations.push(
        `System risk score ${systemScore.toFixed(1)} exceeds maximum ${gate.maxRiskScore.toFixed(1)}`
      )
    }

    // Check critical findings count
    const criticalCount = scan.findings.filter(f => f.severity === 'critical').length
    if (criticalCount > gate.maxCriticalFindings) {
      violations.push(
        `${criticalCount} critical findings exceed maximum ${gate.maxCriticalFindings}`
      )
    }

    // Check high findings count
    const highCount = scan.findings.filter(f => f.severity === 'high').length
    if (highCount > gate.maxHighFindings) {
      violations.push(
        `${highCount} high findings exceed maximum ${gate.maxHighFindings}`
      )
    }

    // Check required compliance frameworks
    const requiredFrameworks = (gate.requiredFrameworks as string[]) || []
    if (requiredFrameworks.length > 0) {
      const pluginsUsed = Array.isArray(scan.plugins) ? (scan.plugins as string[]) : []
      const stats = {
        totalTests: scan.totalTests ?? 0,
        passedTests: scan.passedTests ?? 0,
        failedTests: scan.failedTests ?? 0,
      }
      const findingInputs = scan.findings.map(f => ({
        plugin: f.plugin, severity: f.severity, strategy: f.strategy,
      }))

      for (const fw of requiredFrameworks) {
        const scorecard = generateScorecard(
          fw as ComplianceFramework,
          findingInputs,
          stats,
          pluginsUsed,
        )
        if (scorecard.failedControls > 0) {
          violations.push(
            `${scorecard.frameworkLabel}: ${scorecard.failedControls} control(s) failed`
          )
        }
      }
    }

    const passed = violations.length === 0
    const result = {
      gateId: gate.id,
      gateName: gate.name,
      scanId: scan.id,
      action: gate.action,
      passed,
      violations,
      summary: {
        systemRiskScore: systemScore,
        maxRiskScore: gate.maxRiskScore,
        criticalFindings: criticalCount,
        highFindings: highCount,
      },
    }

    // Fire webhook if configured and gate failed
    if (!passed && gate.webhookUrl) {
      fetch(gate.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      }).catch(() => {/* best-effort webhook */})
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

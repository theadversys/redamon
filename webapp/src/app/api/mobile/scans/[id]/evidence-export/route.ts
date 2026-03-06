import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseMobSFReport } from '@/lib/mobile/report-parser'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const scan = await prisma.mobileScan.findUnique({ where: { id } })
    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })

    const raw = scan.findings
      ? (typeof scan.findings === 'string' ? JSON.parse(scan.findings as string) : scan.findings)
      : {}

    const platform = (scan.platform as 'ANDROID' | 'IOS') || 'ANDROID'
    const parsed = parseMobSFReport(raw as any, platform)

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      app: {
        name: scan.appName,
        packageName: scan.packageName,
        version: scan.version,
        platform: scan.platform,
        fileName: scan.fileName,
        scanDate: scan.completedAt ?? scan.createdAt,
      },
      securityScore: scan.score,
      grade: scan.grade,
      summary: parsed.summary,
      networkSecurity: parsed.networkSecurity,
      binaryProtections: parsed.binaryProtections,
      findings: parsed.findings.map(f => ({
        id: f.id,
        owaspCategory: f.owaspCategory,
        title: f.title,
        severity: f.severity,
        description: f.description,
        evidence: f.evidence ?? null,
        cveIds: f.cveIds ?? [],
        recommendation: f.recommendation,
        references: f.references ?? [],
      })),
      findingsByCategory: Object.fromEntries(
        Object.entries(parsed.findingsByCategory).map(([cat, findings]) => [
          cat,
          findings.map(f => ({
            title: f.title,
            severity: f.severity,
            evidence: f.evidence ?? null,
            cveIds: f.cveIds ?? [],
          }))
        ])
      ),
      hardcodedSecrets: parsed.hardcodedSecrets,
      vulnerableLibraries: parsed.vulnerableLibraries,
    }

    const json = JSON.stringify(exportPayload, null, 2)
    const safeName = scan.appName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const filename = `${safeName}_evidence_${new Date().toISOString().slice(0,10)}.json`

    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildReport, buildHtmlReport } from '@/lib/ai-security/report-gen'
import { buildPdfReport } from '@/lib/ai-security/pdf-gen'
import type { ComplianceFramework } from '@/lib/ai-security/compliance-mapper'

interface RouteParams {
  params: Promise<{ scanId: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  const { scanId } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') || 'json'

  try {
    const scan = await prisma.aIScan.findUnique({
      where: { id: scanId },
      include: { findings: { orderBy: { createdAt: 'asc' } } },
    })

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    if (scan.status !== 'completed') {
      return NextResponse.json({ error: 'Scan not yet completed' }, { status: 400 })
    }

    const frameworks: ComplianceFramework[] = ['owasp', 'nist', 'eu-ai-act']
    const report = buildReport(scan, scan.findings, frameworks)

    if (format === 'html') {
      const html = buildHtmlReport(report)
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="ai-security-report-${scanId}.html"`,
        },
      })
    }

    if (format === 'pdf') {
      try {
        const html = buildHtmlReport(report)
        const pdfBuffer = await buildPdfReport(html)
        return new Response(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="ai-security-report-${scanId}.pdf"`,
          },
        })
      } catch (pdfErr) {
        console.error('[report] PDF generation failed:', pdfErr)
        return NextResponse.json(
          {
            error: 'PDF generation unavailable. Use HTML report and Print > Save as PDF.',
          },
          { status: 503 }
        )
      }
    }

    return NextResponse.json(report)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

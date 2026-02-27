import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { marked } from 'marked'

/**
 * GET /api/reports/[projectId]?format=md|html
 *
 * Generates a penetration test report for the project.
 * Fetches project, vulnerabilities, graph, evidence and composes Markdown.
 * format=md returns Markdown; format=html returns rendered HTML.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const projectId = (await params).projectId
  const format = request.nextUrl.searchParams.get('format') || 'md'

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  if (!['md', 'markdown', 'html'].includes(format)) {
    return NextResponse.json(
      { error: 'format must be md, markdown, or html' },
      { status: 400 }
    )
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, targetDomain: true, userId: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const baseUrl = process.env.WEBAPP_URL || request.nextUrl.origin || 'http://localhost:3000'
    const [vulnRes, graphRes] = await Promise.all([
      fetch(`${baseUrl.replace(/\/$/, '')}/api/vulnerabilities?projectId=${projectId}`),
      fetch(`${baseUrl.replace(/\/$/, '')}/api/graph?projectId=${projectId}`),
    ])

    if (!vulnRes.ok || !graphRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch report data' },
        { status: 500 }
      )
    }

    const vulnData = await vulnRes.json()
    const graph = await graphRes.json()
    const vulnerabilities = vulnData.vulnerabilities || []

    const sevOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    }
    const sortedVulns = [...vulnerabilities].sort(
      (a, b) =>
        sevOrder[(a.severity || 'info').toLowerCase()] ?? 5 -
        (sevOrder[(b.severity || 'info').toLowerCase()] ?? 5)
    )

    const bySev: Record<string, number> = {}
    for (const v of vulnerabilities) {
      const s = (v.severity || 'info').toLowerCase()
      bySev[s] = (bySev[s] || 0) + 1
    }

    let overallRisk = 'Low'
    if (bySev.critical) overallRisk = 'Critical'
    else if (bySev.high) overallRisk = 'High'
    else if (bySev.medium) overallRisk = 'Medium'

    const reportDate = new Date().toISOString().slice(0, 10)
    const name = project.name || 'Unknown Project'
    const targetDomain = project.targetDomain || ''

    const sections: string[] = []
    sections.push(`# Penetration Test Report — ${name}\n`)
    sections.push(`**Date:** ${reportDate}  \n**Target:** ${targetDomain}\n`)
    sections.push('## 1. Executive Summary\n')
    const keyFindings = ['critical', 'high', 'medium', 'low', 'info']
      .map((s) => `${bySev[s] || 0} ${s}`)
      .join(', ')
    sections.push(`- **Scope:** ${targetDomain}, ${name}\n`)
    sections.push(`- **Key findings:** ${keyFindings}\n`)
    sections.push(`- **Risk level:** ${overallRisk}\n`)
    sections.push('- **Recommendations:** Prioritize remediation of critical and high findings.\n')
    sections.push('## 2. Scope & Methodology\n')
    sections.push(`- **Targets:** ${targetDomain}\n`)
    sections.push('- **Methodology:** Reconnaissance → enumeration → vulnerability scanning\n')
    sections.push('## 3. Infrastructure Overview\n')
    const nodes = graph.nodes || []
    const domains = nodes
      .filter((n: { type?: string }) => ['Domain', 'Subdomain'].includes(n.type || ''))
      .map((n: { name?: string; id?: string }) => n.name || n.id || '')
    sections.push(`- **Domains/subdomains:** ${domains.slice(0, 20).join(', ') || 'N/A'}\n`)
    sections.push('## 4. Findings\n')
    if (sortedVulns.length === 0) {
      sections.push('No vulnerabilities identified during this assessment.\n')
    } else {
      for (let i = 0; i < sortedVulns.length; i++) {
        const v = sortedVulns[i]
        const title = v.name || 'Unknown'
        const severity = (v.severity || 'info').toString().charAt(0).toUpperCase() + (v.severity || 'info').toString().slice(1)
        const baseUrls = v.baseUrls || []
        const location = v.url || baseUrls[0] || 'N/A'
        const desc = v.description || 'See evidence'
        const solution = v.solution || 'Apply security best practices; patch if applicable.'
        sections.push(`### [${i + 1}] ${title}\n`)
        sections.push(`- **Severity:** ${severity}\n`)
        sections.push(`- **Location:** ${location}\n`)
        sections.push(`- **Description:** ${desc}\n`)
        sections.push(`- **Recommendation:** ${solution}\n\n`)
      }
    }
    sections.push('## 5. Summary\n')
    sections.push('| Severity | Count |\n|----------|-------|\n')
    for (const s of ['critical', 'high', 'medium', 'low', 'info']) {
      sections.push(`| ${s.charAt(0).toUpperCase() + s.slice(1)} | ${bySev[s] || 0} |\n`)
    }

    const markdown = sections.join('')

    if (format === 'html') {
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Report — ${name}</title></head>
<body style="font-family: system-ui; max-width: 800px; margin: 2rem auto; padding: 0 1rem;">
${marked.parse(markdown) as string}
</body>
</html>`
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="report-${projectId}.html"`,
        },
      })
    }

    return new NextResponse(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `inline; filename="report-${projectId}.md"`,
      },
    })
  } catch (error) {
    console.error('Report generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 }
    )
  }
}

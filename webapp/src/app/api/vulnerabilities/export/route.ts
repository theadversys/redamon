import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/app/api/graph/neo4j'
import prisma from '@/lib/prisma'

/**
 * GET /api/vulnerabilities/export?projectId=&format=csv|markdown&severity=&status=&...
 * Export filtered vulnerabilities. Redacts secrets in output.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const format = searchParams.get('format') || 'markdown'
  const severity = searchParams.get('severity')
  const source = searchParams.get('source')
  const vulnIdsParam = searchParams.get('vulnIds')
  const vulnIds = vulnIdsParam ? vulnIdsParam.split(',').map((id) => id.trim()).filter(Boolean) : null

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const session = getSession()
  try {
    let query = `
      MATCH (v:Vulnerability {project_id: $projectId})
    `
    const params: Record<string, string | string[]> = { projectId }
    const conditions: string[] = []
    if (severity) {
      conditions.push('v.severity = $severity')
      params.severity = severity
    }
    if (source) {
      conditions.push('v.source = $source')
      params.source = source
    }
    if (vulnIds && vulnIds.length > 0) {
      conditions.push('(v.id IN $vulnIds OR v.finding_key IN $vulnIds)')
      params.vulnIds = vulnIds
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }
    query += `
      OPTIONAL MATCH (v)-[:FOUND_AT]->(e:Endpoint)
      RETURN v, collect(DISTINCT e) as endpoints
      ORDER BY CASE v.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END
    `

    const result = await session.run(query, params as Record<string, unknown>)
    const vulns = result.records.map((r) => {
      const v = r.get('v').properties
      const endpoints = r.get('endpoints').filter((e: unknown) => e !== null)
      return {
        id: v.id,
        finding_key: v.finding_key,
        name: v.name || v.template_id || 'Unknown',
        severity: v.severity || 'info',
        source: v.source || 'unknown',
        description: (v.description || '').replace(/Bearer\s+[\w.-]+/gi, '[REDACTED]').replace(/api[_-]?key['"]?\s*[:=]\s*['"]?[\w-]+/gi, '[REDACTED]'),
        solution: (v.solution || '').replace(/Bearer\s+[\w.-]+/gi, '[REDACTED]'),
        endpoints: endpoints.map((e: { properties: { method: string; path: string; url: string } }) => ({
          method: e.properties.method,
          path: e.properties.path || e.properties.url,
        })),
      }
    })

    const states = await prisma.findingState.findMany({
      where: {
        projectId,
        OR: [
          { vulnId: { in: vulns.map((v) => v.id) } },
          { findingKey: { in: vulns.map((v) => v.finding_key).filter(Boolean) } },
        ],
      },
    })
    const stateMap = new Map<string, (typeof states)[0]>()
    for (const s of states) {
      if (s.vulnId) stateMap.set(s.vulnId, s)
      if (s.findingKey) stateMap.set(s.findingKey, s)
    }
    const getState = (v: { id: string; finding_key?: string }) =>
      stateMap.get(v.id) ?? (v.finding_key ? stateMap.get(v.finding_key) : undefined)

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const v of vulns) {
      bySeverity[v.severity as keyof typeof bySeverity] = (bySeverity[v.severity as keyof typeof bySeverity] || 0) + 1
    }
    const overdueCount = states.filter((s) => s.overdue).length

    if (format === 'csv') {
      const rows = [
        ['Issue', 'Severity', 'Source', 'Status', 'Owner', 'Overdue', 'Description', 'Entrypoints'].join(','),
        ...vulns.map((v) => {
          const s = getState(v)
          const desc = (v.description || '').replace(/"/g, '""')
          const eps = (v.endpoints || []).map((e: { method: string; path: string }) => `${e.method} ${e.path}`).join('; ')
          return [
            `"${(v.name || '').replace(/"/g, '""')}"`,
            v.severity,
            v.source,
            s?.status || 'open',
            s?.ownerId || '',
            s?.overdue ? 'yes' : 'no',
            `"${desc}"`,
            `"${eps}"`,
          ].join(',')
        }),
      ]
      return new NextResponse(rows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="vulnerabilities-${projectId}.csv"`,
        },
      })
    }

    const now = new Date().toISOString().slice(0, 10)
    let md = `# Vulnerability Report\n\n**Project:** ${projectId}  \n**Generated:** ${now}\n\n`
    md += `## Summary\n\n| Severity | Count |\n|----------|-------|\n`
    md += `| Critical | ${bySeverity.critical} |\n| High | ${bySeverity.high} |\n| Medium | ${bySeverity.medium} |\n| Low | ${bySeverity.low} |\n`
    md += `\n**Overdue:** ${overdueCount}\n\n---\n\n## Findings\n\n`
    for (const v of vulns) {
      const s = getState(v)
      md += `### ${v.name}\n\n`
      md += `- **Severity:** ${v.severity}\n`
      md += `- **Source:** ${v.source}\n`
      md += `- **Status:** ${s?.status || 'open'}\n`
      if (s?.ownerId) md += `- **Owner:** ${s.ownerId}\n`
      if (s?.overdue) md += `- **Overdue:** Yes\n`
      md += `\n**Description:** ${v.description || '—'}\n\n`
      if (v.solution) md += `**Remediation:** ${v.solution}\n\n`
      if (v.endpoints?.length) {
        md += `**Entrypoints:**\n`
        for (const ep of v.endpoints) md += `- ${ep.method} ${ep.path}\n`
        md += `\n`
      }
      md += `---\n\n`
    }

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="vulnerabilities-${projectId}.md"`,
      },
    })
  } finally {
    await session.close()
  }
}

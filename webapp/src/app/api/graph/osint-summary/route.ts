import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../neo4j'

/**
 * GET /api/graph/osint-summary?projectId=xxx
 *
 * Returns a summary of SpiderFoot OSINT findings stored in Neo4j for a project.
 * Used by kill chain Stage 2 to surface OSINT intel (leaked creds, vulns, emails,
 * cloud assets) discovered during Stage 1 reconnaissance.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const session = getSession()
  try {
    const result = await session.run(
      `
      MATCH (n)
      WHERE n.projectId = $projectId AND n.source = 'spiderfoot'
      WITH labels(n)[0] AS nodeType, count(n) AS cnt
      RETURN nodeType, cnt
      ORDER BY cnt DESC
      `,
      { projectId }
    )

    const byType: Record<string, number> = {}
    for (const record of result.records) {
      const type = record.get('nodeType') as string
      const rawCnt = record.get('cnt')
      const cnt =
        typeof rawCnt === 'number'
          ? rawCnt
          : (rawCnt as { low?: number })?.low ?? 0
      if (type) byType[type] = cnt
    }

    // Fetch top leaked credentials for context
    const credResult = await session.run(
      `
      MATCH (lc:LeakedCredential {projectId: $projectId, source: 'spiderfoot'})
      RETURN lc.data AS data, lc.eventType AS eventType
      LIMIT 10
      `,
      { projectId }
    )
    const leakedSamples = credResult.records.map(r => ({
      data: r.get('data') as string,
      eventType: r.get('eventType') as string,
    }))

    // Fetch top SpiderFoot vulnerabilities
    const vulnResult = await session.run(
      `
      MATCH (v:Vulnerability {projectId: $projectId, source: 'spiderfoot'})
      RETURN v.data AS data, v.severity AS severity
      ORDER BY
        CASE v.severity
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END
      LIMIT 10
      `,
      { projectId }
    )
    const topVulns = vulnResult.records.map(r => ({
      data: r.get('data') as string,
      severity: r.get('severity') as string,
    }))

    await session.close()

    return NextResponse.json({
      projectId,
      leakedCredentials: byType['LeakedCredential'] ?? 0,
      vulnerabilities: byType['Vulnerability'] ?? 0,
      emails: byType['Email'] ?? 0,
      subdomains: byType['Subdomain'] ?? 0,
      ips: byType['IP'] ?? 0,
      openPorts: byType['OpenPort'] ?? 0,
      cloudAssets: byType['CloudAsset'] ?? 0,
      socialProfiles: byType['SocialProfile'] ?? 0,
      certificates: byType['Certificate'] ?? 0,
      leakedSamples,
      topVulns,
      byType,
    })
  } catch (error) {
    console.error('OSINT summary error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  }
}

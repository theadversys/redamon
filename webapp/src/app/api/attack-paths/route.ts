/**
 * Attack Path Assistant API
 *
 * Suggests ranked exploit paths from graph vulnerabilities.
 * Returns CVE + endpoint + target IP/port + Metasploit hint for agent exploitation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession, neo4j } from '../graph/neo4j'

export interface AttackPath {
  rank: number
  vulnerabilityId: string
  name: string
  severity: string
  category?: string
  cveIds: string[]
  targetIp: string | null
  targetPort: number | null
  targetHost: string | null
  matchedAt: string | null
  baseUrls: string[]
  exploitType: 'cve_exploit' | 'web_app_exploit' | 'brute_force' | 'technology_cve'
  metasploitHint: string
  curlCommand?: string
}

function inferExploitType(category: string | undefined, cveIds: string[]): AttackPath['exploitType'] {
  if (cveIds.length > 0) return 'cve_exploit'
  const cat = (category || '').toLowerCase()
  if (cat.includes('sqli') || cat.includes('xss') || cat.includes('lfi') || cat.includes('rce') || cat.includes('ssrf')) {
    return 'web_app_exploit'
  }
  if (cat.includes('credential') || cat.includes('auth') || cat.includes('brute')) {
    return 'brute_force'
  }
  return 'cve_exploit'
}

function buildMetasploitHint(exploitType: string, cveIds: string[], name: string): string {
  if (exploitType === 'cve_exploit' && cveIds.length > 0) {
    return `search ${cveIds[0]}`
  }
  if (exploitType === 'web_app_exploit') {
    const cat = (name || '').toLowerCase()
    if (cat.includes('sql')) return 'use auxiliary/scanner/http/sqlmap or execute_sqlmap'
    if (cat.includes('xss')) return 'Manual XSS exploitation via execute_curl'
    return 'Consider nuclei/sqlmap/curl for web app testing'
  }
  if (exploitType === 'brute_force') {
    return 'use auxiliary/scanner/ssh/ssh_login or auxiliary/scanner/http/http_login'
  }
  return 'search type:exploit'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? Math.min(20, Math.max(1, parseInt(limitParam, 10) || 5)) : 5

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  const session = getSession()

  try {
    // 1. Get Vulnerability-based attack paths (scanner findings with CVE or high severity)
    const vulnQuery = `
      MATCH (v:Vulnerability {project_id: $projectId})
      OPTIONAL MATCH (v)-[:FOUND_AT]->(e:Endpoint)
      OPTIONAL MATCH (v)-[:HAS_CVE]->(c:CVE)
      OPTIONAL MATCH (i:IP)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (s:Subdomain)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (b:BaseURL)-[:HAS_VULNERABILITY]->(v)
      WITH v, e, c, i, s, b
      WHERE v.severity IN ['critical', 'high', 'medium']
         OR (c IS NOT NULL AND c.id IS NOT NULL)
      WITH v,
           collect(DISTINCT c.id) as cveIds,
           collect(DISTINCT i.address) as ips,
           collect(DISTINCT s.name) as hosts,
           collect(DISTINCT b.url) as baseUrls
      RETURN v,
             [x IN cveIds WHERE x IS NOT NULL] as cveIds,
             [x IN ips WHERE x IS NOT NULL] as ips,
             [x IN hosts WHERE x IS NOT NULL] as hosts,
             [x IN baseUrls WHERE x IS NOT NULL] as baseUrls
      ORDER BY
        CASE v.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        v.cvss_score DESC
      LIMIT $limit
    `

    const vulnResult = await session.run(vulnQuery, {
      projectId,
      limit: neo4j.int(limit),
    })

    const attackPaths: AttackPath[] = []
    let rank = 1

    for (const record of vulnResult.records) {
      const v = record.get('v')
      const props = v.properties
      const relCveIds = (record.get('cveIds') || []).filter(Boolean)
      const cveIds = relCveIds.length > 0 ? relCveIds : (props.cve_ids || []).filter(Boolean)
      const ips = (record.get('ips') || []).filter(Boolean)
      const hosts = (record.get('hosts') || []).filter(Boolean)
      const baseUrls = (record.get('baseUrls') || []).filter(Boolean)

      const targetIp = props.matched_ip || ips[0] || null
      const targetHost = props.host || hosts[0] || null
      let targetPort: number | null = null
      if (props.port) {
        const p = parseInt(String(props.port), 10)
        if (!isNaN(p)) targetPort = p
      }
      if (!targetPort && baseUrls.length > 0) {
        try {
          const u = new URL(baseUrls[0])
          if (u.port) targetPort = parseInt(u.port, 10)
          else targetPort = u.protocol === 'https:' ? 443 : 80
        } catch {
          targetPort = 80
        }
      }

      const exploitType = inferExploitType(props.category, cveIds)
      const name = props.name || props.template_id || 'Unknown'

      attackPaths.push({
        rank: rank++,
        vulnerabilityId: props.id,
        name,
        severity: props.severity || 'info',
        category: props.category,
        cveIds,
        targetIp,
        targetPort,
        targetHost,
        matchedAt: props.matched_at || null,
        baseUrls,
        exploitType,
        metasploitHint: buildMetasploitHint(exploitType, cveIds, name),
        curlCommand: props.curl_command,
      })
    }

    // 2. If we have fewer than limit, add Technology->CVE attack paths (no direct vuln finding)
    if (attackPaths.length < limit) {
      const techCveQuery = `
        MATCH (t:Technology {project_id: $projectId})-[:HAS_KNOWN_CVE]->(c:CVE)
        WHERE (c.severity = 'CRITICAL' OR c.severity = 'HIGH' OR c.cvss >= 7.0)
        MATCH (bu:BaseURL {project_id: $projectId})-[:USES_TECHNOLOGY]->(t)
        OPTIONAL MATCH (bu)<-[:SERVES_URL]-(svc:Service)<-[:RUNS_SERVICE]-(p:Port)<-[:HAS_PORT]-(ip:IP)
        WITH t, c, bu, ip
        RETURN t.name as techName, t.version as techVersion, c.id as cveId, c.cvss as cvss,
               ip.address as targetIp, bu.url as baseUrl
        ORDER BY c.cvss DESC
        LIMIT $remaining
      `
      const remaining = limit - attackPaths.length
      const techResult = await session.run(techCveQuery, {
        projectId,
        remaining: neo4j.int(remaining),
      })

      for (const record of techResult.records) {
        const cveId = record.get('cveId')
        const targetIp = record.get('targetIp')
        const baseUrl = record.get('baseUrl')
        const techName = record.get('techName')
        const techVersion = record.get('techVersion')

        let targetPort: number | null = 80
        if (baseUrl) {
          try {
            const u = new URL(baseUrl)
            targetPort = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80)
          } catch {
            targetPort = 80
          }
        }

        attackPaths.push({
          rank: rank++,
          vulnerabilityId: `tech-cve-${cveId}`,
          name: `${techName} ${techVersion || ''} - ${cveId}`.trim(),
          severity: 'high',
          category: 'technology_cve',
          cveIds: [cveId],
          targetIp,
          targetPort,
          targetHost: null,
          matchedAt: baseUrl,
          baseUrls: baseUrl ? [baseUrl] : [],
          exploitType: 'technology_cve',
          metasploitHint: `search ${cveId}`,
        })
      }
    }

    return NextResponse.json({
      attackPaths,
      total: attackPaths.length,
      projectId,
    })
  } catch (error) {
    console.error('Attack paths query error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Query failed' },
      { status: 500 }
    )
  } finally {
    await session.close()
  }
}

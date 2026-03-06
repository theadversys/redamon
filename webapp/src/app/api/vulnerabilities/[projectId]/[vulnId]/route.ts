import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../../../graph/neo4j'
import prisma from '@/lib/prisma'

function getNeo4jSkipReason(error: unknown): string {
  const err = error as Error & { code?: string }
  const msg = (err?.message ?? '').toLowerCase()
  const code = err?.code ?? ''
  if (
    msg.includes('unauthorized') ||
    msg.includes('authentication') ||
    code.startsWith('Neo.ClientError.Security')
  ) {
    return 'Neo4j connection failed (authentication). Check NEO4J_USER and NEO4J_PASSWORD match Neo4j NEO4J_AUTH.'
  }
  if (
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('timeout') ||
    msg.includes('connection refused')
  ) {
    return 'Neo4j connection failed (cannot reach server). Check NEO4J_URI and ensure Neo4j is running (e.g. docker compose up -d neo4j).'
  }
  return 'Neo4j connection failed (auth or network). Check NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in .env or .env.local.'
}

function mapRecordToVulnerability(record: any) {
  const v = record.get('v')
  const props = v.properties

  return {
    id: props.id,
    name: props.name || props.template_id || 'Unknown',
    severity: props.severity || 'info',
    source: props.source || 'unknown',
    toolName: props.tool_name || undefined,
    category: props.category,
    cvssScore: props.cvss_score,
    description: props.description,
    solution: props.solution,
    templateId: props.template_id,
    oid: props.oid,
    cveIds: props.cve_ids || [],
    url: props.url,
    confidence: props.confidence || undefined,
    discoveredAt: props.discovered_at?.toString?.() || props.timestamp?.toString?.() || undefined,
    endpoints: record.get('endpoints').filter((e: any) => e !== null).map((e: any) => ({
      url: e.properties.url,
      path: e.properties.path,
      method: e.properties.method,
    })),
    parameters: record.get('parameters').filter((p: any) => p !== null).map((p: any) => ({
      name: p.properties.name,
      type: p.properties.type,
    })),
    cves: record.get('cves').filter((c: any) => c !== null).map((c: any) => ({
      id: c.properties.id,
      severity: c.properties.severity,
      cvss: c.properties.cvss,
    })),
    ips: record.get('ips').filter((i: any) => i !== null).map((i: any) => i.properties.address),
    subdomains: record.get('subdomains').filter((s: any) => s !== null).map((s: any) => s.properties.name),
    domains: record.get('domains').filter((d: any) => d !== null).map((d: any) => d.properties.name),
    baseUrls: record.get('baseUrls').filter((b: any) => b !== null).map((b: any) => b.properties.url),
    attackTechniques: (() => {
      const techniques = record.get('attackTechniques').filter((at: any) => at !== null)
      if (techniques.length === 0) {
        const vulnCategory = props.category || ''
        const vulnName = (props.name || '').toLowerCase()
        const inferredTechniques: any[] = []
        if (vulnCategory.includes('sqli') || vulnName.includes('sql injection')) {
          inferredTechniques.push({ id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' })
        }
        if (vulnCategory.includes('xss') || vulnName.includes('cross-site')) {
          inferredTechniques.push({ id: 'T1059.007', name: 'JavaScript', tactic: 'Execution' })
        }
        if (vulnCategory.includes('rce') || vulnName.includes('remote code execution')) {
          inferredTechniques.push({ id: 'T1059', name: 'Command and Scripting Interpreter', tactic: 'Execution' })
        }
        if (vulnCategory.includes('lfi') || vulnName.includes('local file inclusion')) {
          inferredTechniques.push({ id: 'T1083', name: 'File and Directory Discovery', tactic: 'Discovery' })
        }
        if (vulnCategory.includes('ssrf') || vulnName.includes('server-side request forgery')) {
          inferredTechniques.push({ id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' })
        }
        if (vulnCategory.includes('exposure') || vulnCategory.includes('exposed_panel') || vulnName.includes('exposed') || vulnName.includes('directory listing')) {
          inferredTechniques.push({ id: 'T1083', name: 'File and Directory Discovery', tactic: 'Discovery' })
        }
        return inferredTechniques.length > 0 ? inferredTechniques : undefined
      }
      return techniques.map((at: any) => ({
        id: at.properties.id || at.properties.technique_id,
        name: at.properties.name || at.properties.technique_name,
        tactic: at.properties.tactic || at.properties.tactic_name,
      }))
    })(),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; vulnId: string }> }
) {
  const { projectId, vulnId } = await params

  if (!projectId || !vulnId) {
    return NextResponse.json(
      { error: 'projectId and vulnId are required' },
      { status: 400 }
    )
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const userId = project.userId

  const neo4jUri = process.env.NEO4J_URI
  const neo4jPassword = process.env.NEO4J_PASSWORD
  if (neo4jUri === '' || neo4jPassword === '') {
    return NextResponse.json(
      { error: 'Neo4j not configured (NEO4J_URI or NEO4J_PASSWORD empty). Set in .env or .env.local.' },
      { status: 503 }
    )
  }

  let session
  try {
    session = getSession()
    const dataQuery = `
      MATCH (v:Vulnerability {id: $vulnId, user_id: $userId, project_id: $projectId})
      OPTIONAL MATCH (v)-[:FOUND_AT]->(e:Endpoint)
      OPTIONAL MATCH (v)-[:AFFECTS_PARAMETER]->(p:Parameter)
      OPTIONAL MATCH (v)-[:HAS_CVE]->(c:CVE)
      OPTIONAL MATCH (i:IP)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (s:Subdomain)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (d:Domain)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (b:BaseURL)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (c)-[:HAS_CWE]->(m:MitreData)-[:HAS_CAPEC]->(cap:Capec)
      OPTIONAL MATCH (cap)-[:MAPS_TO_ATTACK]->(at:AttackTechnique)
      
      RETURN v,
             collect(DISTINCT e) as endpoints,
             collect(DISTINCT p) as parameters,
             collect(DISTINCT c) as cves,
             collect(DISTINCT i) as ips,
             collect(DISTINCT s) as subdomains,
             collect(DISTINCT d) as domains,
             collect(DISTINCT b) as baseUrls,
             collect(DISTINCT at) as attackTechniques
    `

    const result = await session.run(dataQuery, {
      vulnId,
      userId,
      projectId,
    })

    if (result.records.length === 0) {
      return NextResponse.json({ error: 'Vulnerability not found' }, { status: 404 })
    }

    const vulnerability = mapRecordToVulnerability(result.records[0])
    return NextResponse.json(vulnerability)
  } catch (error) {
    const err = error as Error & { code?: string }
    const msg = (err?.message ?? '').toLowerCase()
    const code = err?.code ?? ''
    const isNeo4jError =
      msg.includes('neo4jerror') ||
      msg.includes('unauthorized') ||
      msg.includes('authentication') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      code.startsWith('Neo.ClientError')

    if (isNeo4jError) {
      return NextResponse.json(
        { error: getNeo4jSkipReason(error) },
        { status: 503 }
      )
    }
    console.error('Error fetching vulnerability:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vulnerability' },
      { status: 500 }
    )
  } finally {
    if (session) {
      try {
        await session.close()
      } catch {
        // ignore close errors
      }
    }
  }
}

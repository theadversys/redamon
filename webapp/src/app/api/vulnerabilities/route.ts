import { NextRequest, NextResponse } from 'next/server'
import { getSession, neo4j } from '../graph/neo4j'
import { readFile } from 'fs/promises'
import { join } from 'path'
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const severity = searchParams.get('severity') // optional filter
  const sourceParam = searchParams.get('source') // optional: 'nuclei', 'custom:dirb', etc.
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '500', 10)))

  // Parse source:tool_name format (e.g. custom:dirb)
  let source: string | null = null
  let toolName: string | null = null
  if (sourceParam && sourceParam.includes(':')) {
    const [s, t] = sourceParam.split(':', 2)
    source = s
    toolName = t || null
  } else if (sourceParam) {
    source = sourceParam
  }

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  // Load project to get userId for tenant-indexed Neo4j query
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const userId = project.userId

  // Check if vulnerability scan was skipped
  let scanSkipped = false
  let skipReason: string | null = null
  let modulesExecuted: string[] = []
  
  try {
    // Resolve path: Docker sets RECON_OUTPUT_PATH; local dev (cwd=webapp/) needs project root
    const base = process.env.RECON_OUTPUT_PATH
      ? process.env.RECON_OUTPUT_PATH
      : (process.cwd().endsWith('webapp') ? join(process.cwd(), '..', 'recon', 'output') : join(process.cwd(), 'recon', 'output'))
    const reconFile = join(base, `recon_${projectId}.json`)
    const reconData = JSON.parse(await readFile(reconFile, 'utf-8'))
    const metadata = reconData.metadata || {}
    
    scanSkipped = metadata.active_scans_skipped === true
    skipReason = metadata.active_scans_skip_reason || null
    modulesExecuted = metadata.modules_executed || []
  } catch (error) {
    // Recon file might not exist or be unreadable - that's okay, continue
    console.warn('Could not read recon file to check scan status:', error)
  }

  // Pre-check: Neo4j explicitly disabled via empty env
  const neo4jUri = process.env.NEO4J_URI
  const neo4jPassword = process.env.NEO4J_PASSWORD
  if (neo4jUri === '' || neo4jPassword === '') {
    return NextResponse.json({
      vulnerabilities: [],
      stats: {
        total: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        bySource: {},
      },
      pagination: { page: 1, limit: 500, total: 0, hasMore: false },
      scanStatus: {
        skipped: true,
        skipReason: 'Neo4j not configured (NEO4J_URI or NEO4J_PASSWORD empty). Set in .env or .env.local.',
        modulesExecuted: [],
      },
    })
  }

  let session
  try {
    session = getSession()
    const params: Record<string, unknown> = { userId, projectId }

    // Build shared WHERE clause for filters
    const whereParts: string[] = []
    if (severity) {
      whereParts.push('v.severity = $severity')
      params.severity = severity.toLowerCase()
    }
    if (source) {
      whereParts.push('v.source = $source')
      params.source = source
    }
    if (toolName) {
      whereParts.push('v.tool_name = $toolName')
      params.toolName = toolName
    }
    const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : ''

    // Stats query: total + bySeverity + bySource (lightweight, no OPTIONAL MATCH)
    const statsQuery = `
      MATCH (v:Vulnerability {user_id: $userId, project_id: $projectId})${whereClause}
      WITH collect({severity: v.severity, source: v.source, tool_name: v.tool_name}) as items
      RETURN size(items) as total, items
    `
    const statsResult = await session.run(statsQuery, params)
    const statsRecord = statsResult.records[0]
    const total = statsRecord ? Number(statsRecord.get('total')) : 0
    const statsItems = statsRecord ? (statsRecord.get('items') as Array<{ severity: string; source: string; tool_name?: string }>) : []

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    const bySource: Record<string, number> = {}
    for (const item of statsItems) {
      const sev = (item.severity || 'info').toLowerCase()
      if (sev in bySeverity) (bySeverity as Record<string, number>)[sev] += 1
      const src = item.source || 'unknown'
      const sourceKey = src === 'custom' && item.tool_name ? `custom:${item.tool_name}` : src
      bySource[sourceKey] = (bySource[sourceKey] || 0) + 1
    }

    // Main query: paginated with SKIP/LIMIT (Neo4j requires integer for SKIP/LIMIT)
    const skip = (page - 1) * limit
    params.skip = neo4j.int(skip)
    params.limit = neo4j.int(limit)

    const dataQuery = `
      MATCH (v:Vulnerability {user_id: $userId, project_id: $projectId})${whereClause}
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
      ORDER BY 
        CASE v.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        v.cvss_score DESC
      SKIP $skip
      LIMIT $limit
    `

    const result = await session.run(dataQuery, params)

    // Build list of finding keys and legacy ids for Postgres join
    const findingKeys: string[] = []
    const legacyIds: string[] = []
    const vulnRows = result.records.map((record) => {
      const v = record.get('v')
      const props = v.properties
      const findingKey = props.finding_key ?? null
      const id = props.id
      if (findingKey) findingKeys.push(findingKey)
      else legacyIds.push(id)

      return { record, props, findingKey, id }
    })

    // Batch fetch workflow state from Postgres (join by finding_key or vulnId for legacy)
    const stateMap: Record<string, { status: string; ownerId: string | null; targetDueAt: string | null; overdue: boolean; riskExpiresAt: string | null; updatedAt: string }> = {}
    if (findingKeys.length > 0 || legacyIds.length > 0) {
      const states = await prisma.findingState.findMany({
        where: {
          projectId,
          OR: [
            ...(findingKeys.length ? [{ findingKey: { in: findingKeys } }] : []),
            ...(legacyIds.length ? [{ vulnId: { in: legacyIds } }] : []),
          ],
        },
        select: {
          findingKey: true,
          vulnId: true,
          status: true,
          ownerId: true,
          targetDueAt: true,
          overdue: true,
          riskExpiresAt: true,
          updatedAt: true,
        },
      })
      for (const s of states) {
        const key = (s.findingKey ?? s.vulnId)!
        stateMap[key] = {
          status: s.status,
          ownerId: s.ownerId,
          targetDueAt: s.targetDueAt?.toISOString() ?? null,
          overdue: s.overdue,
          riskExpiresAt: s.riskExpiresAt?.toISOString() ?? null,
          updatedAt: s.updatedAt.toISOString(),
        }
      }
    }

    const vulnerabilities = vulnRows.map(({ record, props, findingKey, id }) => {
      const lookupKey = findingKey ?? id
      const state = stateMap[lookupKey]

      return {
        id,
        findingKey: findingKey ?? id,
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
        // Related entities (filter out nulls)
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
        // Extract ATT&CK techniques from CVEs
        attackTechniques: (() => {
          const techniques = record.get('attackTechniques').filter((at: any) => at !== null)
          if (techniques.length === 0) {
            // If no direct ATT&CK techniques found, try to infer from CVE/CAPEC
            // This is a fallback - ideally ATT&CK techniques should be stored in the graph
            const cves = record.get('cves').filter((c: any) => c !== null)
            const inferredTechniques: any[] = []
            
            // Basic mapping based on vulnerability category/type
            const vulnCategory = props.category || ''
            const vulnName = (props.name || '').toLowerCase()
            
            // Map common vulnerability types to ATT&CK techniques (includes nikto, sqlmap, custom sources)
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
          
          // Return actual ATT&CK techniques from graph
          return techniques.map((at: any) => ({
            id: at.properties.id || at.properties.technique_id,
            name: at.properties.name || at.properties.technique_name,
            tactic: at.properties.tactic || at.properties.tactic_name,
          }))
        })(),
        // Workflow state from Postgres (joined by finding_key)
        status: state?.status ?? 'open',
        ownerId: state?.ownerId ?? null,
        targetDueAt: state?.targetDueAt ?? null,
        overdue: state?.overdue ?? false,
        riskExpiresAt: state?.riskExpiresAt ?? null,
        workflowUpdatedAt: state?.updatedAt ?? null,
      }
    })

    const stats = { total: total, bySeverity, bySource }

    return NextResponse.json({
      vulnerabilities,
      stats,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + vulnerabilities.length < total,
      },
      scanStatus: {
        skipped: scanSkipped,
        skipReason: skipReason,
        modulesExecuted: modulesExecuted,
      },
    })
  } catch (error) {
    console.error('Error fetching vulnerabilities:', error)
    // Graceful degradation: return empty list when Neo4j is unavailable (auth, connection, etc.)
    const err = error as Error & { code?: string }
    const msg = (err?.message ?? '').toLowerCase()
    const code = err?.code ?? ''
    const isNeo4jError =
      err instanceof Error &&
      (msg.includes('neo4jerror') ||
        msg.includes('unauthorized') ||
        msg.includes('authentication') ||
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        code.startsWith('Neo.ClientError'))
    if (isNeo4jError) {
      return NextResponse.json({
        vulnerabilities: [],
        stats: {
          total: 0,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          bySource: {},
        },
        pagination: { page: 1, limit: 500, total: 0, hasMore: false },
        scanStatus: {
          skipped: true,
          skipReason: getNeo4jSkipReason(error),
          modulesExecuted: [],
        },
      })
    }
    return NextResponse.json(
      { error: 'Failed to fetch vulnerabilities' },
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

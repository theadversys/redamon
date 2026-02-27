import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../graph/neo4j'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const severity = searchParams.get('severity') // optional filter
  const sourceParam = searchParams.get('source') // optional: 'nuclei', 'custom:dirb', etc.

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

  // Check if vulnerability scan was skipped
  let scanSkipped = false
  let skipReason: string | null = null
  let modulesExecuted: string[] = []
  
  try {
    const reconOutputPath = process.env.RECON_OUTPUT_PATH || './recon/output'
    const reconFile = join(reconOutputPath, `recon_${projectId}.json`)
    const reconData = JSON.parse(await readFile(reconFile, 'utf-8'))
    const metadata = reconData.metadata || {}
    
    scanSkipped = metadata.active_scans_skipped === true
    skipReason = metadata.active_scans_skip_reason || null
    modulesExecuted = metadata.modules_executed || []
  } catch (error) {
    // Recon file might not exist or be unreadable - that's okay, continue
    console.warn('Could not read recon file to check scan status:', error)
  }

  const session = getSession()

  try {
    // Build query with optional filters
    let query = `
      // Get all Vulnerability nodes for the project
      MATCH (v:Vulnerability {project_id: $projectId})
    `

    const params: any = { projectId }

    // Add severity filter if provided
    if (severity) {
      query += ` WHERE v.severity = $severity`
      params.severity = severity.toLowerCase()
    }

    // Add source filter if provided
    if (source) {
      if (severity) {
        query += ` AND v.source = $source`
      } else {
        query += ` WHERE v.source = $source`
      }
      params.source = source
    }

    // Add tool_name filter (for custom:dirb, custom:hydra, etc.)
    if (toolName) {
      if (severity || source) {
        query += ` AND v.tool_name = $toolName`
      } else {
        query += ` WHERE v.tool_name = $toolName`
      }
      params.toolName = toolName
    }

    query += `
      OPTIONAL MATCH (v)-[:FOUND_AT]->(e:Endpoint)
      OPTIONAL MATCH (v)-[:AFFECTS_PARAMETER]->(p:Parameter)
      OPTIONAL MATCH (v)-[:HAS_CVE]->(c:CVE)
      OPTIONAL MATCH (i:IP)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (s:Subdomain)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (d:Domain)-[:HAS_VULNERABILITY]->(v)
      OPTIONAL MATCH (b:BaseURL)-[:HAS_VULNERABILITY]->(v)
      // Get ATT&CK techniques through CVE -> CWE -> CAPEC chain
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
    `

    const result = await session.run(query, params)

    const vulnerabilities = result.records.map(record => {
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
      }
    })

    // Get summary statistics
    const bySource: Record<string, number> = {
      nuclei: vulnerabilities.filter(v => v.source === 'nuclei').length,
      gvm: vulnerabilities.filter(v => v.source === 'gvm').length,
      security_check: vulnerabilities.filter(v => v.source === 'security_check').length,
      nikto: vulnerabilities.filter(v => v.source === 'nikto').length,
      sqlmap: vulnerabilities.filter(v => v.source === 'sqlmap').length,
      custom: vulnerabilities.filter(v => v.source === 'custom').length,
    }
    // Add custom:tool_name for A0 tools (dirb, hydra, etc.)
    const customWithTool = vulnerabilities.filter(v => v.source === 'custom' && v.toolName)
    for (const v of customWithTool) {
      const key = `custom:${v.toolName}`
      bySource[key] = (bySource[key] || 0) + 1
    }

    const stats = {
      total: vulnerabilities.length,
      bySeverity: {
        critical: vulnerabilities.filter(v => v.severity === 'critical').length,
        high: vulnerabilities.filter(v => v.severity === 'high').length,
        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
        low: vulnerabilities.filter(v => v.severity === 'low').length,
        info: vulnerabilities.filter(v => v.severity === 'info').length,
      },
      bySource,
    }

    return NextResponse.json({
      vulnerabilities,
      stats,
      scanStatus: {
        skipped: scanSkipped,
        skipReason: skipReason,
        modulesExecuted: modulesExecuted,
      },
    })
  } catch (error) {
    console.error('Error fetching vulnerabilities:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vulnerabilities' },
      { status: 500 }
    )
  } finally {
    await session.close()
  }
}

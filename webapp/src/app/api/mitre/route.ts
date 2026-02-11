import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../graph/neo4j'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const type = searchParams.get('type') // optional filter: 'cwe' or 'capec'

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  const session = getSession()

  try {
    const results: any = {
      cwes: [],
      capecs: [],
      stats: {
        totalCwes: 0,
        totalCapecs: 0,
        cwesByAbstraction: {},
        capecsBySeverity: {},
      },
    }

    // Query CWE (MitreData) nodes
    if (!type || type === 'cwe') {
      const cweQuery = `
        MATCH (c:CVE {project_id: $projectId})-[:HAS_CWE]->(m:MitreData)
        WHERE m.cwe_id IS NOT NULL
        OPTIONAL MATCH (m)-[:HAS_CAPEC]->(cap:Capec)
        RETURN DISTINCT m,
               collect(DISTINCT c) as linkedCves,
               collect(DISTINCT cap) as linkedCapecs
        ORDER BY m.cwe_id
      `

      const cweResult = await session.run(cweQuery, { projectId })

      results.cwes = cweResult.records.map(record => {
        const m = record.get('m')
        const props = m.properties

        return {
          id: props.id,
          cweId: props.cwe_id,
          name: props.cwe_name || props.name,
          description: props.cwe_description || props.description,
          abstraction: props.abstraction, // Pillar, Class, Base, Variant
          mapping: props.mapping, // ALLOWED, DISCOURAGED, PROHIBITED
          url: props.cwe_url || props.url,
          isLeaf: props.is_leaf,
          consequences: props.consequences ? JSON.parse(props.consequences) : null,
          mitigations: props.mitigations ? JSON.parse(props.mitigations) : null,
          detectionMethods: props.detection_methods ? JSON.parse(props.detection_methods) : null,
          linkedCves: record.get('linkedCves').filter((c: any) => c !== null).map((c: any) => ({
            id: c.properties.id,
            severity: c.properties.severity,
            cvss: c.properties.cvss,
          })),
          linkedCapecs: record.get('linkedCapecs').filter((cap: any) => cap !== null).map((cap: any) => ({
            id: cap.properties.capec_id,
            name: cap.properties.name,
            severity: cap.properties.severity,
          })),
        }
      })

      // Calculate CWE stats
      results.stats.totalCwes = results.cwes.length
      results.stats.cwesByAbstraction = {
        Pillar: results.cwes.filter((c: any) => c.abstraction === 'Pillar').length,
        Class: results.cwes.filter((c: any) => c.abstraction === 'Class').length,
        Base: results.cwes.filter((c: any) => c.abstraction === 'Base').length,
        Variant: results.cwes.filter((c: any) => c.abstraction === 'Variant').length,
      }
    }

    // Query CAPEC nodes
    if (!type || type === 'capec') {
      const capecQuery = `
        MATCH (cap:Capec {project_id: $projectId})
        OPTIONAL MATCH (m:MitreData)-[:HAS_CAPEC]->(cap)
        OPTIONAL MATCH (m)<-[:HAS_CWE]-(c:CVE)
        RETURN DISTINCT cap,
               collect(DISTINCT m) as linkedCwes,
               collect(DISTINCT c) as linkedCves
        ORDER BY cap.capec_id
      `

      const capecResult = await session.run(capecQuery, { projectId })

      results.capecs = capecResult.records.map(record => {
        const cap = record.get('cap')
        const props = cap.properties

        return {
          id: props.capec_id,
          numericId: props.numeric_id,
          name: props.name,
          description: props.description,
          likelihood: props.likelihood, // High, Medium, Low
          severity: props.severity, // Very High, High, Medium, Low, Very Low
          prerequisites: props.prerequisites,
          executionFlow: props.execution_flow ? JSON.parse(props.execution_flow) : null,
          url: props.url,
          relatedCwes: props.related_cwes || [],
          linkedCwes: record.get('linkedCwes').filter((m: any) => m !== null).map((m: any) => ({
            id: m.properties.cwe_id,
            name: m.properties.cwe_name || m.properties.name,
          })),
          linkedCves: record.get('linkedCves').filter((c: any) => c !== null).map((c: any) => ({
            id: c.properties.id,
            severity: c.properties.severity,
            cvss: c.properties.cvss,
          })),
        }
      })

      // Calculate CAPEC stats
      results.stats.totalCapecs = results.capecs.length
      results.stats.capecsBySeverity = {
        'Very High': results.capecs.filter((c: any) => c.severity === 'Very High').length,
        'High': results.capecs.filter((c: any) => c.severity === 'High').length,
        'Medium': results.capecs.filter((c: any) => c.severity === 'Medium').length,
        'Low': results.capecs.filter((c: any) => c.severity === 'Low').length,
        'Very Low': results.capecs.filter((c: any) => c.severity === 'Very Low').length,
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Error fetching MITRE data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch MITRE data' },
      { status: 500 }
    )
  } finally {
    await session.close()
  }
}

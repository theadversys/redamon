import { NextRequest, NextResponse } from 'next/server'
import { getDriver } from '@/app/api/graph/neo4j'
import prisma from '@/lib/prisma'

export interface AssetRow {
  id: string
  type: 'subdomain' | 'ip' | 'domain'
  name: string
  ip?: string
  openPorts: number[]
  services: { port: number; service?: string; version?: string; protocol?: string }[]
  technologies: string[]
  vulnCount: number
  criticalCount: number
  highCount: number
  lastSeen?: string
}

/**
 * GET /api/assets?projectId=<id>
 * Returns aggregated asset inventory for a project from Neo4j.
 * Falls back gracefully if Neo4j is unavailable.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  // Fetch project target domain
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, targetDomain: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const driver = getDriver()
  const neo = driver.session()

  try {
    const userId = project.userId

    // ── Subdomains with ports + vulns ──────────────────────────────────────
    const subResult = await neo.run(
      `
      MATCH (s:Subdomain {user_id: $userId, project_id: $projectId})
      OPTIONAL MATCH (s)-[:HAS_OPEN_PORT]->(p:Port)
      OPTIONAL MATCH (s)-[:HAS_VULNERABILITY]->(v:Vulnerability)
      OPTIONAL MATCH (s)-[:RUNS]->(t:Technology)
      RETURN s,
             collect(DISTINCT p) AS ports,
             collect(DISTINCT v) AS vulns,
             collect(DISTINCT t.name) AS techs
      `,
      { userId, projectId }
    )

    // ── IPs with ports + vulns ──────────────────────────────────────────────
    const ipResult = await neo.run(
      `
      MATCH (ip:IP {user_id: $userId, project_id: $projectId})
      OPTIONAL MATCH (ip)-[:HAS_OPEN_PORT]->(p:Port)
      OPTIONAL MATCH (ip)-[:HAS_VULNERABILITY]->(v:Vulnerability)
      RETURN ip,
             collect(DISTINCT p) AS ports,
             collect(DISTINCT v) AS vulns
      `,
      { userId, projectId }
    )

    const assets: AssetRow[] = []

    // Process subdomains
    for (const record of subResult.records) {
      const s = record.get('s')?.properties ?? {}
      const ports = (record.get('ports') as Array<{ properties: Record<string, unknown> } | null>).filter(Boolean)
      const vulns = (record.get('vulns') as Array<{ properties: Record<string, unknown> } | null>).filter(Boolean)
      const techs = (record.get('techs') as string[]).filter(Boolean)

      assets.push({
        id: `sub-${s.name ?? s.subdomain}`,
        type: 'subdomain',
        name: (s.name ?? s.subdomain ?? '') as string,
        ip: s.ip as string | undefined,
        openPorts: ports.map((p) => Number(p!.properties.port ?? p!.properties.number ?? 0)).filter(Boolean),
        services: ports.map((p) => ({
          port: Number(p!.properties.port ?? p!.properties.number ?? 0),
          service: p!.properties.service as string | undefined,
          version: p!.properties.version as string | undefined,
          protocol: p!.properties.protocol as string | undefined,
        })),
        technologies: techs,
        vulnCount: vulns.length,
        criticalCount: vulns.filter((v) => String(v!.properties.severity).toLowerCase() === 'critical').length,
        highCount: vulns.filter((v) => String(v!.properties.severity).toLowerCase() === 'high').length,
        lastSeen: s.last_seen as string | undefined ?? s.updated_at as string | undefined,
      })
    }

    // Process IPs
    for (const record of ipResult.records) {
      const ip = record.get('ip')?.properties ?? {}
      const ipAddr = ip.address as string ?? ip.ip as string ?? ''
      // Deduplicate if already added via subdomain
      if (assets.find((a) => a.ip === ipAddr)) continue

      const ports = (record.get('ports') as Array<{ properties: Record<string, unknown> } | null>).filter(Boolean)
      const vulns = (record.get('vulns') as Array<{ properties: Record<string, unknown> } | null>).filter(Boolean)

      assets.push({
        id: `ip-${ipAddr}`,
        type: 'ip',
        name: ipAddr,
        ip: ipAddr,
        openPorts: ports.map((p) => Number(p!.properties.port ?? p!.properties.number ?? 0)).filter(Boolean),
        services: ports.map((p) => ({
          port: Number(p!.properties.port ?? p!.properties.number ?? 0),
          service: p!.properties.service as string | undefined,
          version: p!.properties.version as string | undefined,
          protocol: p!.properties.protocol as string | undefined,
        })),
        technologies: [],
        vulnCount: vulns.length,
        criticalCount: vulns.filter((v) => String(v!.properties.severity).toLowerCase() === 'critical').length,
        highCount: vulns.filter((v) => String(v!.properties.severity).toLowerCase() === 'high').length,
        lastSeen: ip.last_seen as string | undefined,
      })
    }

    return NextResponse.json({ assets, projectId, target: project.targetDomain })
  } catch (err) {
    console.error('[assets API] Neo4j error:', err)
    return NextResponse.json({ assets: [], error: 'Graph query failed', detail: String(err) })
  } finally {
    await neo.close()
  }
}

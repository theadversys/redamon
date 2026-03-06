/**
 * Engagement Brief API
 * Returns a live situational-awareness snapshot for the AI assistant context injection.
 * Aggregates: project meta, kill chain stage, vulnerability counts, secrets, MITRE coverage.
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession, neo4j } from '@/app/api/graph/neo4j'

const KILL_CHAIN_ORCHESTRATOR_URL =
  process.env.KILL_CHAIN_ORCHESTRATOR_URL || 'http://localhost:8015'

interface RouteParams {
  params: Promise<{ projectId: string }>
}

// ──────────────────────────────────────────────────────────────────────────────
// Kill chain stage names (mirrors Operations page)
// ──────────────────────────────────────────────────────────────────────────────
const STAGE_NAMES: Record<number, string> = {
  1: 'Reconnaissance',
  2: 'Weaponization',
  3: 'Delivery',
  4: 'Exploitation',
  5: 'Installation',
  6: 'Command & Control',
  7: 'Actions on Objectives',
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetch kill chain status (graceful fallback)
// ──────────────────────────────────────────────────────────────────────────────
async function fetchKillChainStatus(projectId: string) {
  try {
    const res = await fetch(
      `${KILL_CHAIN_ORCHESTRATOR_URL}/kill-chain/${projectId}/status`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Query Neo4j for vuln/host/secret data
// ──────────────────────────────────────────────────────────────────────────────
async function fetchNeo4jData(userId: string, projectId: string) {
  const defaultData = {
    hostCount: 0,
    portCount: 0,
    vulnCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    criticalCVEs: [] as string[],
    secretCount: 0,
    techStack: [] as string[],
    hitTacticCount: 0,
  }

  let session: ReturnType<typeof getSession> | null = null
  try {
    session = getSession()

    // Vulnerability counts + critical CVE IDs
    const vulnResult = await session.run(
      `MATCH (v:Vulnerability {user_id: $userId, project_id: $projectId})
       RETURN
         v.severity AS severity,
         v.cve_id    AS cveId
       LIMIT 2000`,
      { userId, projectId }
    )

    const vulnCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }
    const criticalCVEs: string[] = []

    for (const rec of vulnResult.records) {
      const sev = (rec.get('severity') as string | null)?.toLowerCase() ?? 'info'
      const cveId = rec.get('cveId') as string | null
      vulnCounts.total++
      if (sev === 'critical') {
        vulnCounts.critical++
        if (cveId && !criticalCVEs.includes(cveId) && criticalCVEs.length < 5) {
          criticalCVEs.push(cveId)
        }
      } else if (sev === 'high') {
        vulnCounts.high++
      } else if (sev === 'medium') {
        vulnCounts.medium++
      } else if (sev === 'low') {
        vulnCounts.low++
      } else {
        vulnCounts.info++
      }
    }

    // Host count
    const hostResult = await session.run(
      `MATCH (h:Host {user_id: $userId, project_id: $projectId}) RETURN count(h) AS cnt`,
      { userId, projectId }
    )
    const hostCount = hostResult.records[0]?.get('cnt')?.toNumber?.() ?? 0

    // Port count
    const portResult = await session.run(
      `MATCH (p:Port {user_id: $userId, project_id: $projectId}) RETURN count(p) AS cnt`,
      { userId, projectId }
    )
    const portCount = portResult.records[0]?.get('cnt')?.toNumber?.() ?? 0

    // Secret count
    const secretResult = await session.run(
      `MATCH (s:Secret {user_id: $userId, project_id: $projectId}) RETURN count(s) AS cnt`,
      { userId, projectId }
    )
    const secretCount = secretResult.records[0]?.get('cnt')?.toNumber?.() ?? 0

    // Tech stack (distinct technologies observed)
    const techResult = await session.run(
      `MATCH (t:Technology {user_id: $userId, project_id: $projectId})
       RETURN DISTINCT t.name AS tech LIMIT 10`,
      { userId, projectId }
    )
    const techStack = techResult.records
      .map((r) => r.get('tech') as string)
      .filter(Boolean)

    // MITRE ATT&CK tactic coverage (distinct tactics with associated vulns)
    const mitreResult = await session.run(
      `MATCH (v:Vulnerability {user_id: $userId, project_id: $projectId})
       WHERE v.mitre_tactic IS NOT NULL
       RETURN count(DISTINCT v.mitre_tactic) AS tactics`,
      { userId, projectId }
    )
    const hitTacticCount =
      mitreResult.records[0]?.get('tactics')?.toNumber?.() ?? 0

    return {
      hostCount,
      portCount,
      vulnCounts,
      criticalCVEs,
      secretCount,
      techStack,
      hitTacticCount,
    }
  } catch {
    return defaultData
  } finally {
    await session?.close()
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/engagement/brief/[projectId]
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params

    // 1. Load project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        targetDomain: true,
        userId: true,
        agentOperatingMode: true,
      },
    })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // 2. Fetch in parallel: kill chain status + Neo4j data
    const [kcStatus, neo4jData] = await Promise.all([
      fetchKillChainStatus(projectId),
      fetchNeo4jData(project.userId, projectId),
    ])

    // 3. Kill chain details
    const killChain = {
      status: (kcStatus?.status as string) ?? 'idle',
      stage: (kcStatus?.current_stage as number) ?? 1,
      stageName:
        STAGE_NAMES[(kcStatus?.current_stage as number) ?? 1] ?? 'Reconnaissance',
      startedAt: (kcStatus?.started_at as string) ?? null,
    }

    // 4. Build the brief object
    const brief = {
      project: {
        id: project.id,
        name: project.name,
        target: project.targetDomain || 'Not configured',
        operatingMode: project.agentOperatingMode ?? 'guided',
      },
      killChain,
      attack_surface: {
        hosts: neo4jData.hostCount,
        openPorts: neo4jData.portCount,
        techStack: neo4jData.techStack,
        secretsFound: neo4jData.secretCount,
      },
      vulnerabilities: {
        ...neo4jData.vulnCounts,
        criticalCVEs: neo4jData.criticalCVEs,
      },
      mitre: {
        tacticsCovered: neo4jData.hitTacticCount,
        totalTactics: 14,
      },
      generatedAt: new Date().toISOString(),
    }

    return NextResponse.json(brief)
  } catch (error) {
    console.error('Engagement brief error:', error)
    return NextResponse.json(
      { error: 'Failed to generate engagement brief' },
      { status: 500 }
    )
  }
}

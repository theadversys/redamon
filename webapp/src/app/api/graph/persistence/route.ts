/**
 * POST /api/graph/persistence - Record persistence (Kill Chain Stage 5)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../neo4j'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectId,
      userId,
      sessionId,
      method,
      module,
      path,
      trigger,
      targetIp,
      report,
    } = body

    if (!projectId || !userId || !sessionId || !method || !targetIp) {
      return NextResponse.json(
        { error: 'projectId, userId, sessionId, method, and targetIp are required' },
        { status: 400 }
      )
    }

    const id = `persistence-${sessionId}-${method}-${Date.now()}`
    const session = getSession()

    try {
      await session.run(
        `
        MERGE (p:Persistence {id: $id})
        ON CREATE SET
          p.user_id = $userId,
          p.project_id = $projectId,
          p.session_id = $sessionId,
          p.method = $method,
          p.module = $module,
          p.path = $path,
          p.trigger = $trigger,
          p.target_ip = $targetIp,
          p.report = $report,
          p.kill_chain_stage = 'installation',
          p.created_at = datetime()
        WITH p
        OPTIONAL MATCH (ip:IP {address: $targetIp, project_id: $projectId})
        FOREACH (_ IN CASE WHEN ip IS NOT NULL THEN [1] ELSE [] END |
          MERGE (p)-[:INSTALLED_ON]->(ip)
        )
        RETURN p.id as id
        `,
        {
          id,
          userId,
          projectId,
          sessionId: parseInt(String(sessionId), 10),
          method,
          module: module || null,
          path: path || null,
          trigger: trigger || null,
          targetIp,
          report: report || '',
        }
      )
      return NextResponse.json({ success: true, id })
    } finally {
      await session.close()
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/graph/actions - Record action on objectives (Kill Chain Stage 7)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../neo4j'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      projectId,
      userId,
      actionType,
      sessionId,
      targetIp,
      description,
      evidence,
      exploitId,
    } = body

    if (!projectId || !userId || !actionType || !targetIp) {
      return NextResponse.json(
        { error: 'projectId, userId, actionType, and targetIp are required' },
        { status: 400 }
      )
    }

    const id = `action-${actionType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const session = getSession()

    try {
      await session.run(
        `
        MERGE (a:Action {id: $id})
        ON CREATE SET
          a.user_id = $userId,
          a.project_id = $projectId,
          a.action_type = $actionType,
          a.session_id = $sessionId,
          a.target_ip = $targetIp,
          a.description = $description,
          a.evidence = $evidence,
          a.kill_chain_stage = 'actions_on_objectives',
          a.created_at = datetime()
        WITH a
        OPTIONAL MATCH (ip:IP {address: $targetIp, project_id: $projectId})
        FOREACH (_ IN CASE WHEN ip IS NOT NULL THEN [1] ELSE [] END |
          MERGE (a)-[:TARGETED]->(ip)
        )
        RETURN a.id as id
        `,
        {
          id,
          userId,
          projectId,
          actionType,
          sessionId: sessionId != null ? parseInt(String(sessionId), 10) : null,
          targetIp,
          description: description || '',
          evidence: evidence || null,
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

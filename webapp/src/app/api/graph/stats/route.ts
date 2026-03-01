import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../neo4j'

/**
 * GET /api/graph/stats?projectId=xxx
 * Returns node counts by type for a project (lightweight, no full graph fetch).
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
      WHERE n.project_id = $projectId
      WITH labels(n)[0] AS nodeType, count(n) AS cnt
      RETURN nodeType, cnt
      ORDER BY cnt DESC
      `,
      { projectId }
    )

    const byType: Record<string, number> = {}
    let total = 0
    for (const record of result.records) {
      const type = record.get('nodeType') as string
      const rawCnt = record.get('cnt')
      const cnt =
        typeof rawCnt === 'number'
          ? rawCnt
          : (rawCnt as { low?: number })?.low ?? 0
      byType[type || 'Unknown'] = cnt
      total += cnt
    }

    await session.close()

    return NextResponse.json({
      projectId,
      total,
      byType,
      endpoints: byType['Endpoint'] ?? 0,
    })
  } catch (error) {
    console.error('Graph stats error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stats query failed' },
      { status: 500 }
    )
  }
}

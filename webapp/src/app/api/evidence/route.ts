import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../graph/neo4j'
import prisma from '@/lib/prisma'

/**
 * GET /api/evidence?projectId=&vulnerabilityId=
 *
 * Fetches Evidence nodes for a vulnerability. Enforces access by validating
 * project exists and vulnerability belongs to that project.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const vulnerabilityId = searchParams.get('vulnerabilityId')

  if (!projectId || !vulnerabilityId) {
    return NextResponse.json(
      { error: 'projectId and vulnerabilityId are required' },
      { status: 400 }
    )
  }

  // Validate project exists and get userId for Neo4j query
  let project: { userId: string } | null = null
  try {
    project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { userId: true },
    })
  } catch (error) {
    console.error('Error fetching project for evidence:', error)
    return NextResponse.json(
      { error: 'Failed to validate access' },
      { status: 500 }
    )
  }

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const session = getSession()

  try {
    // Query Evidence nodes - filter by user_id and project_id for tenant isolation
    const result = await session.run(
      `
      MATCH (v:Vulnerability {id: $vulnerabilityId, project_id: $projectId, user_id: $userId})
            -[:HAS_EVIDENCE]->(e:Evidence)
      RETURN e
      ORDER BY e.created_at
      `,
      {
        vulnerabilityId,
        projectId,
        userId: project.userId,
      }
    )

    const evidence = result.records.map((record) => {
      const e = record.get('e')
      const props = e.properties

      return {
        id: props.id,
        projectId: props.project_id,
        userId: props.user_id,
        eventId: props.event_id ?? null,
        phase: props.phase ?? '',
        tool: props.tool ?? '',
        sourceType: props.source_type ?? '',
        kind: props.kind ?? 'scan',
        templateId: props.template_id ?? null,
        severity: props.severity ?? null,
        fuzzingParameter: props.fuzzing_parameter ?? null,
        summary: props.summary ?? '',
        rawOutput: props.raw_output ?? '',
        metadata: props.metadata ?? null,
        createdAt: props.created_at
          ? new Date(props.created_at.toString()).toISOString()
          : new Date().toISOString(),
      }
    })

    return NextResponse.json({ evidence })
  } catch (error) {
    console.error('Error fetching evidence:', error)
    return NextResponse.json(
      { error: 'Failed to fetch evidence' },
      { status: 500 }
    )
  } finally {
    await session.close()
  }
}

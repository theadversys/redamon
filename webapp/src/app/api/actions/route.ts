import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '../graph/neo4j'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const projectId = searchParams.get('projectId')
  const type = searchParams.get('type') // optional filter: 'recon', 'vulnerability', 'agent', 'user', 'other'
  const status = searchParams.get('status') // optional filter: 'success', 'error', 'running', 'pending'

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  const session = getSession()

  try {
    // Build query with optional filters
    let query = `
      // Get all ActionLog nodes for the project
      MATCH (a:ActionLog {project_id: $projectId})
    `

    const params: any = { projectId }

    // Add type filter if provided
    if (type) {
      query += ` WHERE a.type = $type`
      params.type = type.toLowerCase()
    }

    // Add status filter if provided
    if (status) {
      if (type) {
        query += ` AND a.status = $status`
      } else {
        query += ` WHERE a.status = $status`
      }
      params.status = status.toLowerCase()
    }

    query += `
      RETURN a
      ORDER BY a.timestamp DESC
      LIMIT 500
    `

    const result = await session.run(query, params)

    const actions = result.records.map(record => {
      const a = record.get('a')
      const props = a.properties

      return {
        id: props.id,
        type: props.type || 'other',
        action: props.action || 'Unknown Action',
        description: props.description,
        status: props.status || 'pending',
        timestamp: props.timestamp,
        projectId: props.project_id,
        userId: props.user_id,
        metadata: props.metadata ? JSON.parse(props.metadata) : undefined,
      }
    })

    // Get summary statistics
    const stats = {
      total: actions.length,
      byType: {
        recon: actions.filter(a => a.type === 'recon').length,
        vulnerability: actions.filter(a => a.type === 'vulnerability').length,
        agent: actions.filter(a => a.type === 'agent').length,
        user: actions.filter(a => a.type === 'user').length,
        other: actions.filter(a => !['recon', 'vulnerability', 'agent', 'user'].includes(a.type)).length,
      },
      byStatus: {
        success: actions.filter(a => a.status === 'success').length,
        error: actions.filter(a => a.status === 'error').length,
        running: actions.filter(a => a.status === 'running').length,
        pending: actions.filter(a => a.status === 'pending').length,
      },
    }

    return NextResponse.json({
      actions,
      stats,
    })
  } catch (error) {
    console.error('Error fetching actions:', error)
    // If ActionLog nodes don't exist yet, return empty result
    // This allows the page to work even if logging isn't fully implemented
    return NextResponse.json({
      actions: [],
      stats: {
        total: 0,
        byType: {
          recon: 0,
          vulnerability: 0,
          agent: 0,
          user: 0,
          other: 0,
        },
        byStatus: {
          success: 0,
          error: 0,
          running: 0,
          pending: 0,
        },
      },
    })
  } finally {
    await session.close()
  }
}

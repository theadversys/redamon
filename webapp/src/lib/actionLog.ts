/**
 * ActionLog helper functions for creating action log entries in Neo4j
 */

import { getSession } from '@/app/api/graph/neo4j'

export interface CreateActionLogParams {
  projectId: string
  userId: string
  type: 'recon' | 'vulnerability' | 'agent' | 'user' | 'other'
  action: string
  description?: string
  status: 'success' | 'error' | 'running' | 'pending'
  metadata?: Record<string, any>
}

/**
 * Create an ActionLog node in Neo4j
 */
export async function createActionLog(params: CreateActionLogParams): Promise<void> {
  const session = getSession()
  
  try {
    const actionId = `${params.type}-${params.projectId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const query = `
      CREATE (a:ActionLog {
        id: $id,
        project_id: $projectId,
        user_id: $userId,
        type: $type,
        action: $action,
        description: $description,
        status: $status,
        metadata: $metadata,
        timestamp: datetime()
      })
      RETURN a
    `
    
    await session.run(query, {
      id: actionId,
      projectId: params.projectId,
      userId: params.userId,
      type: params.type,
      action: params.action,
      description: params.description || null,
      status: params.status,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    })
  } catch (error) {
    console.error('Error creating ActionLog:', error)
    // Don't throw - action logging should not break the main flow
  } finally {
    await session.close()
  }
}

/**
 * Update an existing ActionLog node status
 */
export async function updateActionLogStatus(
  actionId: string,
  status: 'success' | 'error' | 'running' | 'pending',
  description?: string
): Promise<void> {
  const session = getSession()
  
  try {
    const query = `
      MATCH (a:ActionLog {id: $id})
      SET a.status = $status,
          a.updated_at = datetime()
      ${description ? ', a.description = $description' : ''}
      RETURN a
    `
    
    const params: any = { id: actionId, status }
    if (description) {
      params.description = description
    }
    
    await session.run(query, params)
  } catch (error) {
    console.error('Error updating ActionLog:', error)
  } finally {
    await session.close()
  }
}

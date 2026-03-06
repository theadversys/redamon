/**
 * Types for Kill Chain Process Management
 */

export type KillChainStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'waiting_for_operator'
  | 'completed'
  | 'error'
  | 'stopping'

export interface HITLBriefing {
  stage: number
  stageName: string
  summary: string
  proposedActions: string[]
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  scopeNote: string
  attackPath?: Record<string, unknown>
  sessionObtained?: boolean
  c2Framework?: string
  lhost?: string
}

export interface KillChainState {
  project_id: string
  status: KillChainStatus
  current_stage: number
  current_stage_name: string
  current_sub_step?: string | null
  started_at: string | null
  completed_at: string | null
  error: string | null
}

export interface KillChainLogEvent {
  log: string
  timestamp: string
  stage: number
  stageName: string
  subStep: string
  subStepNumber?: number | null
  toolName?: string | null
  level: 'info' | 'warning' | 'error' | 'success' | 'action'
  durationMs?: number | null
  metadata?: Record<string, unknown> | null
  phase?: string | null
  phaseNumber?: number | null
  isPhaseStart?: boolean | null
  eventId?: string
}

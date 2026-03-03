/**
 * Types for Recon Process Management
 */

export type ReconStatus = 'idle' | 'starting' | 'running' | 'paused' | 'completed' | 'error' | 'stopping'

export interface ReconState {
  project_id: string
  status: ReconStatus
  current_phase: string | null
  phase_number: number | null
  total_phases: number
  started_at: string | null
  completed_at: string | null
  error: string | null
  container_id?: string | null
}

export interface ReconLogEvent {
  log: string
  timestamp: string
  phase?: string | null
  phaseNumber?: number | null
  isPhaseStart?: boolean
  level: 'info' | 'warning' | 'error' | 'success' | 'action'
  /** Phase 2: stable id for citations and deep links (client-assigned when consuming SSE) */
  eventId?: string
}

export interface ReconSSEEvent {
  event: 'log' | 'error' | 'complete'
  data: ReconLogEvent | { error: string } | { status: string; completedAt?: string; error?: string }
}

export const RECON_PHASES = [
  'Domain Discovery',
  'Port Scanning',
  'HTTP Probing',
  'Resource Enumeration',
  'Vulnerability Scanning',
  'MITRE Enrichment',
  'GitHub Secret Hunt',
] as const

export type ReconPhase = typeof RECON_PHASES[number]

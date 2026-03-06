'use client'

import { useMemo } from 'react'
import { Target, Crosshair, Send, Zap, HardDrive, Radio, Flag } from 'lucide-react'
import type { ReconStatus } from '@/lib/recon-types'
import type { GraphData } from '../../types'
import styles from './KillChainPanel.module.css'

const STAGES = [
  { id: 1, label: 'Reconnaissance', icon: Target },
  { id: 2, label: 'Weaponization', icon: Crosshair },
  { id: 3, label: 'Delivery', icon: Send },
  { id: 4, label: 'Exploitation', icon: Zap },
  { id: 5, label: 'Installation', icon: HardDrive },
  { id: 6, label: 'C2', icon: Radio },
  { id: 7, label: 'Actions on Objectives', icon: Flag },
]

interface KillChainPanelProps {
  projectId: string
  reconStatus: ReconStatus
  data: GraphData | undefined
  /** When using kill chain orchestrator, pass explicit current stage */
  killChainStage?: number
}

function deriveCurrentStage(
  reconStatus: ReconStatus,
  nodes: { type: string }[] | undefined
): number {
  const isTestRunning = reconStatus === 'running' || reconStatus === 'starting'
  const isTestPaused = reconStatus === 'paused'
  if (isTestRunning || isTestPaused) return 1
  if (!nodes?.length) return 1
  const hasExploit = nodes.some((n) => n.type === 'Exploit')
  const hasPersistence = nodes.some((n) => n.type === 'Persistence')
  const hasAction = nodes.some((n) => n.type === 'Action')
  if (hasAction) return 7
  if (hasPersistence) return 6
  if (hasExploit) return 5
  if (nodes.length > 0) return 2
  return 1
}

function getNextStepHint(
  stage: number,
  reconStatus: ReconStatus,
  hasNodes: boolean
): string {
  const isTestRunning = reconStatus === 'running' || reconStatus === 'starting'
  const isTestPaused = reconStatus === 'paused'
  if (isTestRunning) return 'Test running…'
  if (isTestPaused) return 'Test paused'
  if (stage === 1 && !hasNodes) return 'Start assessment to discover targets'
  if (stage === 1 && hasNodes) return 'View attack paths or generate payload'
  if (stage === 2) return 'View attack paths or generate payload'
  if (stage === 3) return 'Open Agent Zero to start listener and web delivery'
  if (stage === 4) return 'Open Agent Zero to exploit'
  if (stage === 5) return 'Record persistence after session'
  if (stage === 6) return 'Open Agent Zero to manage listeners'
  if (stage === 7) return 'Record actions on objectives'
  return ''
}

export function KillChainPanel({ projectId, reconStatus, data, killChainStage }: KillChainPanelProps) {
  const currentStage = useMemo(
    () => (killChainStage != null ? killChainStage : deriveCurrentStage(reconStatus, data?.nodes)),
    [killChainStage, reconStatus, data?.nodes]
  )
  const hasNodes = (data?.nodes?.length ?? 0) > 0
  const nextStepHint = getNextStepHint(currentStage, reconStatus, hasNodes)

  if (!projectId) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Kill Chain</span>
      </div>
      <div className={styles.stages}>
        {STAGES.map(({ id, label, icon: Icon }) => {
          const isCompleted = id < currentStage
          const isCurrent = id === currentStage
          return (
            <div
              key={id}
              className={`${styles.stage} ${styles.stageWithTooltip} ${isCompleted ? styles.stageCompleted : ''} ${isCurrent ? styles.stageCurrent : ''}`}
              title={`Stage ${id}: ${label}`}
              aria-label={`Stage ${id} ${label}${isCurrent ? ' (current)' : isCompleted ? ' (completed)' : ''}`}
            >
              <div className={styles.stageIcon}>
                <Icon size={12} />
              </div>
              <span className={styles.stageLabel}>{id}</span>
              <span className={styles.stageTooltip}>Stage {id}: {label}</span>
            </div>
          )
        })}
      </div>
      {nextStepHint && <div className={styles.hint}>{nextStepHint}</div>}
    </div>
  )
}

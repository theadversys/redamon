/**
 * AI Panel Component
 *
 * Panel containing the Panda AI chat assistant.
 * Recon/kill-chain logs pane removed — Operations page handles that.
 */

'use client'

import { AIAssistantDrawer } from '../AIAssistantDrawer/AIAssistantDrawer'
import type { ReconLogEvent, ReconStatus } from '@/lib/recon-types'
import styles from './AIPanel.module.css'
import './panel-overrides.css'

interface AIPanelProps {
  userId: string
  projectId: string
  sessionId: string
  onResetSession?: () => void
  modelName?: string
  /** Still accepted so callers don't break, but not rendered */
  reconLogs?: ReconLogEvent[]
  currentPhase?: string | null
  currentPhaseNumber?: number | null
  reconStatus?: ReconStatus
  onClearLogs?: () => void
  onStartRecon?: () => void
  onStopRecon?: () => void
  isReconLoading?: boolean
  showBothPanes?: boolean
  onCloseChat?: () => void
  onCloseRecon?: () => void
  onBothPanelsClosed?: () => void
  stageTitle?: string
}

export function AIPanel({
  userId,
  projectId,
  sessionId,
  onResetSession,
  modelName,
  onCloseChat,
}: AIPanelProps) {
  return (
    <div className={styles.panel}>
      <AIAssistantDrawer
        isOpen={true}
        onClose={onCloseChat ?? (() => {})}
        userId={userId}
        projectId={projectId}
        sessionId={sessionId}
        onResetSession={onResetSession}
        modelName={modelName}
        panelMode={true}
      />
    </div>
  )
}


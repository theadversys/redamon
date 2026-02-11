/**
 * AI Panel Component
 * 
 * Layout-agnostic panel containing Chat and Recon tabs.
 * Replaces AIAssistantDrawer - no longer a drawer, just a panel.
 */

'use client'

import { useState, useCallback } from 'react'
import { MessageSquare, Terminal } from 'lucide-react'
import { AIAssistantDrawer } from '../AIAssistantDrawer/AIAssistantDrawer'
import { ReconLogsDrawer } from '../ReconLogsDrawer/ReconLogsDrawer'
import type { ReconLogEvent, ReconStatus } from '@/lib/recon-types'
import styles from './AIPanel.module.css'
import './panel-overrides.css'

interface AIPanelProps {
  userId: string
  projectId: string
  sessionId: string
  onResetSession?: () => void
  modelName?: string
  reconLogs: ReconLogEvent[]
  currentPhase: string | null
  currentPhaseNumber: number | null
  reconStatus: ReconStatus
  onClearLogs: () => void
  /** Phase 3: run controls from Chat */
  onStartRecon?: () => void
  onStopRecon?: () => void
  isReconLoading?: boolean
}

/** Payload for "Explain this" from Recon Logs: switch to Chat and send this text to the agent. */
export interface ExplainPayload {
  text: string
}

export function AIPanel({
  userId,
  projectId,
  sessionId,
  onResetSession,
  modelName,
  reconLogs,
  currentPhase,
  currentPhaseNumber,
  reconStatus,
  onClearLogs,
  onStartRecon,
  onStopRecon,
  isReconLoading = false,
}: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'recon'>('chat')
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null)
  /** Phase 2: deep link — highlight this text in Recon tab when user clicks "View in Recon" */
  const [reconHighlight, setReconHighlight] = useState<{ text: string } | null>(null)

  const handleAskAI = useCallback((selectedLogText: string) => {
    setActiveTab('chat')
    setExplainPayload({ text: selectedLogText })
  }, [])

  const handleExplainSent = useCallback(() => {
    setExplainPayload(null)
  }, [])

  const handleViewInRecon = useCallback((logExcerpt: string) => {
    setReconHighlight({ text: logExcerpt })
    setActiveTab('recon')
  }, [])

  const handleClearReconHighlight = useCallback(() => {
    setReconHighlight(null)
  }, [])

  return (
    <div className={styles.panel}>
      {/* Tab Switcher */}
      <div className={styles.tabSwitcher}>
        <button
          className={`${styles.tabButton} ${activeTab === 'chat' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('chat')}
          aria-label="Chat Tab"
        >
          <MessageSquare size={16} />
          <span>Chat</span>
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'recon' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('recon')}
          aria-label="Recon Tab"
        >
          <Terminal size={16} />
          <span>Recon</span>
        </button>
      </div>

      {/* Tab Content: render both so state persists when switching tabs */}
      <div className={styles.tabContent}>
        <div
          className={`${styles.chatContainer} ${activeTab !== 'chat' ? styles.tabPaneHidden : ''}`}
          data-panel-mode="true"
          aria-hidden={activeTab !== 'chat'}
        >
          <AIAssistantDrawer
            isOpen={true}
            onClose={() => {}}
            userId={userId}
            projectId={projectId}
            sessionId={sessionId}
            onResetSession={onResetSession}
            modelName={modelName}
            panelMode={true}
            reconStatus={reconStatus}
            reconPhase={currentPhase}
            reconPhaseNumber={currentPhaseNumber}
            explainPayload={explainPayload}
            onExplainSent={handleExplainSent}
            onViewInRecon={handleViewInRecon}
            onStartRecon={onStartRecon}
            onStopRecon={onStopRecon}
            isReconLoading={isReconLoading}
          />
        </div>
        <div
          className={`${styles.reconContainer} ${activeTab !== 'recon' ? styles.tabPaneHidden : ''}`}
          data-panel-mode="true"
          aria-hidden={activeTab !== 'recon'}
        >
          <ReconLogsDrawer
            isOpen={true}
            onClose={() => {}}
            logs={reconLogs}
            currentPhase={currentPhase}
            currentPhaseNumber={currentPhaseNumber}
            status={reconStatus}
            onClearLogs={onClearLogs}
            panelMode={true}
            onAskAI={handleAskAI}
            highlightRequest={reconHighlight}
            onClearHighlight={handleClearReconHighlight}
          />
        </div>
      </div>
    </div>
  )
}

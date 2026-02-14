/**
 * AI Panel Component
 * 
 * Layout-agnostic panel containing Chat and Recon tabs.
 * Replaces AIAssistantDrawer - no longer a drawer, just a panel.
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
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
  /** When true (three-pane layout), show Chat and Recon stacked instead of tabbed */
  showBothPanes?: boolean
  /** Called when user clicks X on Chat (tab/split: hide AI; three-pane: collapse Chat) */
  onCloseChat?: () => void
  /** Called when user clicks X on Recon (tab/split: hide AI; three-pane: collapse Recon) */
  onCloseRecon?: () => void
  /** Called when both panes are closed in three-pane layout (collapse right column) */
  onBothPanelsClosed?: () => void
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
  showBothPanes = false,
  onCloseChat,
  onCloseRecon,
  onBothPanelsClosed,
}: AIPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'recon'>('chat')
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null)
  /** Phase 2: deep link — highlight this text in Recon tab when user clicks "View in Recon" */
  const [reconHighlight, setReconHighlight] = useState<{ text: string } | null>(null)
  /** Three-pane: track collapsed state when user clicks X on individual panels */
  const [chatVisible, setChatVisible] = useState(true)
  const [reconVisible, setReconVisible] = useState(true)

  const handleCloseChat = useCallback(() => {
    if (showBothPanes) {
      setChatVisible(false)
      if (!reconVisible) {
        onBothPanelsClosed?.()
      }
    } else {
      onCloseChat?.()
    }
  }, [showBothPanes, reconVisible, onCloseChat, onBothPanelsClosed])

  const handleCloseRecon = useCallback(() => {
    if (showBothPanes) {
      setReconVisible(false)
      if (!chatVisible) {
        onBothPanelsClosed?.()
      }
    } else {
      onCloseRecon?.()
    }
  }, [showBothPanes, chatVisible, onCloseRecon, onBothPanelsClosed])

  useEffect(() => {
    if (showBothPanes && !chatVisible && !reconVisible) {
      onBothPanelsClosed?.()
    }
  }, [showBothPanes, chatVisible, reconVisible, onBothPanelsClosed])

  const prevShowBothPanes = useRef(showBothPanes)
  useEffect(() => {
    if (showBothPanes && !prevShowBothPanes.current) {
      setChatVisible(true)
      setReconVisible(true)
    }
    prevShowBothPanes.current = showBothPanes
  }, [showBothPanes])

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
    <div className={`${styles.panel} ${showBothPanes ? styles.panelStacked : ''}`}>
      {/* Tab Switcher - hidden when both panes visible */}
      {!showBothPanes && (
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
      )}

      {/* Content: tabbed (single) or stacked (both panes, resizable) */}
      {showBothPanes ? (
        !chatVisible && !reconVisible ? null : chatVisible && reconVisible ? (
          <PanelGroup direction="vertical" className={styles.stackedPanelGroup}>
            <Panel defaultSize={50} minSize={20} maxSize={80} className={styles.stackedPanel}>
              <div className={styles.chatContainer} data-panel-mode="true">
                <AIAssistantDrawer
                  isOpen={true}
                  onClose={handleCloseChat}
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
            </Panel>
            <PanelResizeHandle className={styles.resizeHandleHorizontal} />
            <Panel defaultSize={50} minSize={20} maxSize={80} className={styles.stackedPanel}>
              <div className={styles.reconContainer} data-panel-mode="true">
                <ReconLogsDrawer
                  isOpen={true}
                  onClose={handleCloseRecon}
                  logs={reconLogs}
                  currentPhase={currentPhase}
                  currentPhaseNumber={currentPhaseNumber}
                  status={reconStatus}
                  onClearLogs={onClearLogs}
                  onStopRecon={onStopRecon}
                  panelMode={true}
                  onAskAI={handleAskAI}
                  highlightRequest={reconHighlight}
                  onClearHighlight={handleClearReconHighlight}
                />
              </div>
            </Panel>
          </PanelGroup>
        ) : (
          <div className={styles.stackedPanelGroup}>
            {chatVisible && (
              <div className={styles.stackedPanel}>
                <div className={styles.chatContainer} data-panel-mode="true">
                  <AIAssistantDrawer
                    isOpen={true}
                    onClose={handleCloseChat}
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
              </div>
            )}
            {reconVisible && (
              <div className={styles.stackedPanel}>
                <div className={styles.reconContainer} data-panel-mode="true">
                  <ReconLogsDrawer
                    isOpen={true}
                    onClose={handleCloseRecon}
                    logs={reconLogs}
                    currentPhase={currentPhase}
                    currentPhaseNumber={currentPhaseNumber}
                    status={reconStatus}
                    onClearLogs={onClearLogs}
                    onStopRecon={onStopRecon}
                    panelMode={true}
                    onAskAI={handleAskAI}
                    highlightRequest={reconHighlight}
                    onClearHighlight={handleClearReconHighlight}
                  />
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className={styles.tabContent}>
          <div
            className={`${styles.chatContainer} ${activeTab !== 'chat' ? styles.tabPaneHidden : ''}`}
            data-panel-mode="true"
            aria-hidden={activeTab !== 'chat'}
          >
            <AIAssistantDrawer
              isOpen={true}
              onClose={handleCloseChat}
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
              onClose={handleCloseRecon}
              logs={reconLogs}
              currentPhase={currentPhase}
              currentPhaseNumber={currentPhaseNumber}
              status={reconStatus}
              onClearLogs={onClearLogs}
              onStopRecon={onStopRecon}
              panelMode={true}
              onAskAI={handleAskAI}
              highlightRequest={reconHighlight}
              onClearHighlight={handleClearReconHighlight}
            />
          </div>
        </div>
      )}
    </div>
  )
}

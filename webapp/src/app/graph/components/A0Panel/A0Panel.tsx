/**
 * Agent Zero Panel Component
 *
 * Separate pane for Agent Zero (a0) - general-purpose AI agent.
 * Contains Agent Zero UI (iframe) + Recon Logs. Isolated from Panda AI.
 */

'use client'

import { useState, useCallback } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { Bot, Terminal, ExternalLink } from 'lucide-react'
import { ReconLogsDrawer } from '../ReconLogsDrawer/ReconLogsDrawer'
import type { ReconLogEvent, ReconStatus } from '@/lib/recon-types'
import styles from './A0Panel.module.css'
import '../AIPanel/panel-overrides.css'

// Prefer direct URL so Socket.IO connects to Agent Zero backend (stores initialize).
// Proxy (/api/a0) breaks Socket.IO → $store.chats undefined → Alpine errors.
// Use proxy only when direct URL not configured (e.g. dev without Docker).
const AGENT_ZERO_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AGENT_ZERO_URL ||
        `${window.location.origin}/api/a0`)
    : ''

interface A0PanelProps {
  projectId: string
  userId: string
  reconLogs: ReconLogEvent[]
  currentPhase: string | null
  currentPhaseNumber: number | null
  reconStatus: ReconStatus
  onClearLogs: () => void
  onStartRecon?: () => void
  onStopRecon?: () => void
  isReconLoading?: boolean
  /** When true (three-pane layout), show A0 and Recon stacked instead of tabbed */
  showBothPanes?: boolean
  onCloseChat?: () => void
  onCloseRecon?: () => void
  onBothPanelsClosed?: () => void
}

export function A0Panel({
  projectId,
  userId,
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
}: A0PanelProps) {
  const [activeTab, setActiveTab] = useState<'a0' | 'recon'>('a0')
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

  const iframeSrc = AGENT_ZERO_BASE_URL
    ? `${AGENT_ZERO_BASE_URL.replace(/\/$/, '')}?project_id=${encodeURIComponent(projectId)}&user_id=${encodeURIComponent(userId)}`
    : ''

  return (
    <div className={`${styles.panel} ${showBothPanes ? styles.panelStacked : ''}`}>
      {!showBothPanes && (
        <div className={styles.tabSwitcher}>
          <button
            className={`${styles.tabButton} ${activeTab === 'a0' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('a0')}
            aria-label="Agent Zero Tab"
          >
            <Bot size={16} />
            <span>Agent Zero</span>
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

      {showBothPanes ? (
        !chatVisible && !reconVisible ? null : chatVisible && reconVisible ? (
          <PanelGroup direction="vertical" className={styles.stackedPanelGroup}>
            <Panel defaultSize={55} minSize={20} maxSize={80} className={styles.stackedPanel}>
              <div className={styles.a0Container} data-panel-mode="true">
                {iframeSrc ? (
                  <>
                    <iframe
                      src={iframeSrc}
                      title="Agent Zero"
                      className={styles.iframe}
                      allow="clipboard-write"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                    />
                    <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className={styles.openInNewTab} title="Open in new tab">
                      <ExternalLink size={12} />
                      Open in new tab
                    </a>
                  </>
                ) : (
                  <div className={styles.unavailable}>
                    <p>Agent Zero could not load in the iframe.</p>
                    <p className={styles.hint}>
                      <a
                        href={AGENT_ZERO_BASE_URL || 'http://localhost:50001'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.externalLink}
                      >
                        <ExternalLink size={14} />
                        Open Agent Zero in new tab
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </Panel>
            <PanelResizeHandle className={styles.resizeHandleHorizontal} />
            <Panel defaultSize={45} minSize={20} maxSize={80} className={styles.stackedPanel}>
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
                />
              </div>
            </Panel>
          </PanelGroup>
        ) : (
          <div className={styles.stackedPanelGroup}>
            {chatVisible && (
              <div className={styles.stackedPanel}>
                <div className={styles.a0Container} data-panel-mode="true">
                  {iframeSrc ? (
                    <>
                      <iframe
                        src={iframeSrc}
                        title="Agent Zero"
                        className={styles.iframe}
                        allow="clipboard-write"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                      />
                      <a href={iframeSrc} target="_blank" rel="noopener noreferrer" className={styles.openInNewTab} title="Open in new tab">
                        <ExternalLink size={12} />
                        Open in new tab
                      </a>
                    </>
                  ) : (
                    <div className={styles.unavailable}>
                      <p>Agent Zero could not load.</p>
                      <a
                        href={AGENT_ZERO_BASE_URL || 'http://localhost:50001'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.externalLink}
                      >
                        Open in new tab
                      </a>
                    </div>
                  )}
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
                  />
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        <div className={styles.tabContent}>
          <div
            className={`${styles.a0Container} ${activeTab !== 'a0' ? styles.tabPaneHidden : ''}`}
            data-panel-mode="true"
            aria-hidden={activeTab !== 'a0'}
          >
            {iframeSrc ? (
              <>
                <iframe
                  src={iframeSrc}
                  title="Agent Zero"
                  className={styles.iframe}
                  allow="clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                />
                <a
                  href={iframeSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.openInNewTab}
                  title="Open Agent Zero in new tab (if iframe is black)"
                >
                  <ExternalLink size={12} />
                  Open in new tab
                </a>
              </>
            ) : (
              <div className={styles.unavailable}>
                <p>Agent Zero could not load in the iframe.</p>
                <p className={styles.hint}>
                  <a
                    href={AGENT_ZERO_BASE_URL || 'http://localhost:50001'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.externalLink}
                  >
                    <ExternalLink size={14} />
                    Open Agent Zero in new tab
                  </a>
                </p>
              </div>
            )}
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
            />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Agent Zero Panel Component
 *
 * Separate pane for Agent Zero (a0) - general-purpose AI agent.
 * Contains Agent Zero UI (iframe) + Recon Logs. Isolated from Panda AI.
 */

/**
 * Agent Zero Panel Component
 *
 * Shows the Agent Zero iframe only.
 * Recon/kill-chain logs pane removed — Operations page handles that.
 */

'use client'

import { ExternalLink } from 'lucide-react'
import type { ReconLogEvent, ReconStatus } from '@/lib/recon-types'
import styles from './A0Panel.module.css'
import '../AIPanel/panel-overrides.css'

const AGENT_ZERO_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AGENT_ZERO_URL ||
        `${window.location.origin}/api/a0`)
    : ''

interface A0PanelProps {
  projectId: string
  userId: string
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

export function A0Panel({ projectId, userId }: A0PanelProps) {
  const iframeSrc = AGENT_ZERO_BASE_URL
    ? `${AGENT_ZERO_BASE_URL.replace(/\/$/, '')}?project_id=${encodeURIComponent(projectId)}&user_id=${encodeURIComponent(userId)}`
    : ''

  return (
    <div className={styles.panel}>
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
            <a
              href={iframeSrc}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.openInNewTab}
              title="Open Agent Zero in new tab"
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
                href="http://localhost:50001"
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
    </div>
  )
}


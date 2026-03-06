'use client'

/**
 * HITLApprovalPanel — Human-in-the-Loop operator approval UI
 *
 * Shown when the kill chain status is 'waiting_for_operator'.
 * Presents the mission brief, proposed actions, and risk level for the
 * upcoming stage, and lets the operator Approve (with optional custom
 * instructions), Skip the stage, or Stop the engagement entirely.
 */

import { useState } from 'react'
import type { HITLBriefing } from '@/lib/kill-chain-types'
import styles from './HITLApprovalPanel.module.css'

interface HITLApprovalPanelProps {
  briefing: HITLBriefing
  isLoading: boolean
  onSubmit: (instructions: string, action: 'approve' | 'skip' | 'stop') => void
}

const RISK_CONFIG = {
  LOW:      { label: 'LOW',      color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  MEDIUM:   { label: 'MEDIUM',   color: '#facc15', bg: 'rgba(250,204,21,0.1)' },
  HIGH:     { label: 'HIGH',     color: '#fb923c', bg: 'rgba(251,146,60,0.1)' },
  CRITICAL: { label: 'CRITICAL', color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
}

const STAGE_ICONS: Record<number, string> = {
  4: '💣',
  5: '🔒',
  6: '📡',
  7: '🎯',
}

export default function HITLApprovalPanel({
  briefing,
  isLoading,
  onSubmit,
}: HITLApprovalPanelProps) {
  const [instructions, setInstructions] = useState('')
  const [confirming, setConfirming] = useState<'stop' | null>(null)

  const risk = RISK_CONFIG[briefing.riskLevel] ?? RISK_CONFIG.HIGH
  const icon = STAGE_ICONS[briefing.stage] ?? '⚡'

  const handleAction = (action: 'approve' | 'skip' | 'stop') => {
    if (action === 'stop' && confirming !== 'stop') {
      setConfirming('stop')
      return
    }
    setConfirming(null)
    onSubmit(instructions, action)
  }

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pauseIcon}>⏸</span>
          <div>
            <div className={styles.title}>
              {icon} Stage {briefing.stage}: {briefing.stageName}
            </div>
            <div className={styles.subtitle}>Human-in-the-Loop — Operator Approval Required</div>
          </div>
        </div>
        <div
          className={styles.riskBadge}
          style={{ color: risk.color, background: risk.bg, borderColor: risk.color }}
        >
          ⚠ {risk.label} RISK
        </div>
      </div>

      {/* Mission Brief */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>📋 Mission Brief</div>
        <p className={styles.summary}>{briefing.summary}</p>
      </div>

      {/* Proposed Actions */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>🎯 Proposed Actions</div>
        <ol className={styles.actionList}>
          {briefing.proposedActions.map((act, i) => (
            <li key={i} className={styles.actionItem}>
              <span className={styles.actionNum}>{i + 1}</span>
              {act}
            </li>
          ))}
        </ol>
      </div>

      {/* Scope Warning */}
      <div className={styles.scopeWarning}>
        <span className={styles.scopeIcon}>🛡</span>
        <span>{briefing.scopeNote}</span>
      </div>

      {/* Operator Instructions */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>
          💬 Operator Instructions{' '}
          <span className={styles.optional}>(optional — injected into AI agent prompt)</span>
        </div>
        <textarea
          className={styles.instructionsInput}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder={`e.g. "Focus on CVE-2021-44228 only, avoid triggering WAF rules, document all findings"`}
          rows={3}
          disabled={isLoading}
        />
      </div>

      {/* Action Buttons */}
      <div className={styles.actions}>
        <button
          className={styles.btnApprove}
          onClick={() => handleAction('approve')}
          disabled={isLoading}
          title="Execute this stage with your optional instructions"
        >
          {isLoading ? '⏳ Processing…' : '✓ Approve & Execute'}
        </button>

        <button
          className={styles.btnSkip}
          onClick={() => handleAction('skip')}
          disabled={isLoading}
          title="Skip this stage and continue to the next"
        >
          ⏭ Skip Stage
        </button>

        {confirming === 'stop' ? (
          <div className={styles.confirmStop}>
            <span>End entire engagement?</span>
            <button className={styles.btnStopConfirm} onClick={() => handleAction('stop')} disabled={isLoading}>
              Yes, Stop
            </button>
            <button className={styles.btnCancelStop} onClick={() => setConfirming(null)} disabled={isLoading}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className={styles.btnStop}
            onClick={() => setConfirming('stop')}
            disabled={isLoading}
            title="End the engagement at this point"
          >
            ■ Stop Engagement
          </button>
        )}
      </div>
    </div>
  )
}

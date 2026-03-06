'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Terminal, CheckCircle, AlertCircle, Pause, Play, Trash2, MessageCircle } from 'lucide-react'
import { RECON_PHASES } from '@/lib/recon-types'
import type { ReconLogEvent, ReconStatus } from '@/lib/recon-types'
import styles from './ReconLogsDrawer.module.css'

interface ReconLogsDrawerProps {
  isOpen: boolean
  onClose: () => void
  logs: ReconLogEvent[]
  currentPhase: string | null
  currentPhaseNumber: number | null
  status: ReconStatus
  onClearLogs: () => void
  /** When recon is running, delete icon also stops recon */
  onStopRecon?: () => void
  panelMode?: boolean // When true, disables drawer positioning
  /** Phase 1: "Explain this" — called with selected log text; parent switches to Chat and sends to agent */
  onAskAI?: (selectedLogText: string) => void
  /** Phase 2: deep link — highlight this text in the log list and scroll into view */
  highlightRequest?: { text: string } | null
  onClearHighlight?: () => void
  /** Kill chain: dynamic title e.g. "Stage 1: Reconnaissance" */
  stageTitle?: string
}

export function ReconLogsDrawer({
  isOpen,
  onClose,
  logs,
  currentPhase,
  currentPhaseNumber,
  status,
  onClearLogs,
  onStopRecon,
  panelMode = false,
  onAskAI,
  highlightRequest,
  onClearHighlight,
  stageTitle,
}: ReconLogsDrawerProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  const handleAskAI = () => {
    if (!onAskAI) return
    const sel = window.getSelection()
    const text = sel?.toString()?.trim()
    if (text) {
      onAskAI(text)
    } else if (logs.length > 0) {
      // No selection: send last 20 log lines as context
      const lastLines = logs.slice(-20).map(l => `[${l.level}] ${l.log}`).join('\n')
      onAskAI(lastLines)
    }
  }

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Phase 2: deep link — when highlightRequest is set, find matching log line and scroll + highlight
  const lastHighlightRequestRef = useRef<string | null>(null)
  useEffect(() => {
    if (!highlightRequest?.text?.trim() || logs.length === 0) return
    if (lastHighlightRequestRef.current === highlightRequest.text) return
    lastHighlightRequestRef.current = highlightRequest.text
    const searchText = highlightRequest.text.trim()
    const firstLine = searchText.split('\n')[0].trim()
    const index = logs.findIndex((log) => log.log.includes(firstLine) || log.log.includes(searchText))
    if (index === -1) {
      lastHighlightRequestRef.current = null
      onClearHighlight?.()
      return
    }
    setHighlightedIndex(index)
    const timer = setTimeout(() => {
      const row = logsContainerRef.current?.querySelector(`[data-log-index="${index}"]`)
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    const clearTimer = setTimeout(() => {
      setHighlightedIndex(null)
      lastHighlightRequestRef.current = null
      onClearHighlight?.()
    }, 4500)
    return () => {
      clearTimeout(timer)
      clearTimeout(clearTimer)
    }
  }, [highlightRequest?.text, logs, onClearHighlight])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!logsContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
      case 'starting':
        return <div className={styles.runningIndicator} />
      case 'completed':
        return <CheckCircle size={14} className={styles.successIcon} />
      case 'error':
        return <AlertCircle size={14} className={styles.errorIcon} />
      default:
        return <Terminal size={14} />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'starting':
        return 'Starting...'
      case 'running':
        return currentPhase
          ? `Phase ${currentPhaseNumber}/7: ${currentPhase}`
          : 'Running...'
      case 'completed':
        return 'Completed'
      case 'error':
        return 'Error'
      case 'stopping':
        return 'Stopping...'
      default:
        return 'Idle'
    }
  }

  const getLogClassName = (level: string) => {
    switch (level) {
      case 'error':
        return styles.logError
      case 'warning':
        return styles.logWarning
      case 'success':
        return styles.logSuccess
      case 'action':
        return styles.logAction
      default:
        return styles.logInfo
    }
  }

  return (
    <div className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''} ${panelMode ? styles.panelMode : ''}`} data-panel-mode={panelMode ? 'true' : undefined}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <Terminal size={16} />
          <span>{stageTitle ?? 'Recon Logs (Stage 1)'}</span>
        </div>
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close drawer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Status bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusLeft}>
          {getStatusIcon()}
          <span className={styles.statusText}>{getStatusText()}</span>
        </div>
        <div className={styles.statusActions}>
          {onAskAI && (
            <button
              className={styles.askAIButton}
              onClick={handleAskAI}
              title="Explain selected logs in Chat (or last 20 lines if nothing selected)"
            >
              <MessageCircle size={14} />
              <span>Ask AI</span>
            </button>
          )}
          <button
            className={styles.iconButton}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            {autoScroll ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            className={styles.iconButton}
            onClick={() => {
              if ((status === 'running' || status === 'starting' || status === 'paused') && onStopRecon) {
                onStopRecon()
              }
              onClearLogs()
            }}
            title={(status === 'running' || status === 'starting' || status === 'paused') && onStopRecon
              ? 'Stop test and clear logs'
              : 'Clear logs'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Phase progress */}
      <div className={styles.phaseProgress}>
        {RECON_PHASES.map((phase, index) => {
          const phaseNum = index + 1
          const isActive = currentPhaseNumber === phaseNum
          const isCompleted = currentPhaseNumber !== null && phaseNum < currentPhaseNumber
          const isPending = currentPhaseNumber === null || phaseNum > currentPhaseNumber

          return (
            <div
              key={phase}
              className={`${styles.phaseItem} ${isActive ? styles.phaseActive : ''} ${isCompleted ? styles.phaseCompleted : ''} ${isPending ? styles.phasePending : ''}`}
              title={phase}
            >
              <span className={styles.phaseNumber}>{phaseNum}</span>
            </div>
          )
        })}
      </div>

      {/* Logs container */}
      <div
        ref={logsContainerRef}
        className={styles.logsContainer}
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className={styles.emptyLogs}>
            <Terminal size={24} />
            <p>Waiting for logs...</p>
          </div>
        ) : (
          <>
            {logs.map((log, index) => (
              <div
                key={log.eventId ?? index}
                data-log-index={index}
                data-event-id={log.eventId}
                className={`${styles.logLine} ${getLogClassName(log.level)} ${highlightedIndex === index ? styles.logLineHighlighted : ''}`}
              >
                <span className={styles.logTimestamp}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={styles.logMessage}>{log.log}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          className={styles.scrollToBottom}
          onClick={() => {
            setAutoScroll(true)
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          Scroll to bottom
        </button>
      )}
    </div>
  )
}

export default ReconLogsDrawer

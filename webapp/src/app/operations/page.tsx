'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Swords,
  Play,
  Square,
  Pause,
  PlayCircle,
  Target,
  Crosshair,
  Send,
  Zap,
  HardDrive,
  Radio,
  Flag,
  ChevronRight,
  AlertTriangle,
  Activity,
  Network,
  Code2,
  Shield,
  Database,
  ExternalLink,
  RefreshCw,
  Terminal,
  SkipForward,
} from 'lucide-react'
import { useProject } from '@/providers/ProjectProvider'
import { useProjectById } from '@/hooks'
import { useKillChainStatus, useKillChainSSE } from '@/hooks'
import { AttackPathsDrawer } from '@/app/graph/components/AttackPathsDrawer/AttackPathsDrawer'
import { PayloadGeneratorModal } from '@/app/graph/components/PayloadGeneratorModal/PayloadGeneratorModal'
import { RecordPersistenceModal } from '@/app/graph/components/RecordPersistenceModal/RecordPersistenceModal'
import { RecordActionModal } from '@/app/graph/components/RecordActionModal/RecordActionModal'
import type { KillChainStatus, HITLBriefing } from '@/lib/kill-chain-types'
import HITLApprovalPanel from '@/components/kill-chain/HITLApprovalPanel'
import styles from './page.module.css'

// ── Kill chain stages ─────────────────────────────────────────────────────────

const STAGES = [
  { id: 1, label: 'Reconnaissance',        icon: Target,    desc: 'Discover targets, enumerate services, passive OSINT' },
  { id: 2, label: 'Weaponization',         icon: Crosshair, desc: 'Generate exploits, build payloads for identified vulns' },
  { id: 3, label: 'Delivery',              icon: Send,      desc: 'Phishing, drive-by, web shell upload, direct exploit' },
  { id: 4, label: 'Exploitation',          icon: Zap,       desc: 'Execute exploit, gain initial foothold on target' },
  { id: 5, label: 'Installation',          icon: HardDrive, desc: 'Deploy implant, run LinPEAS/WinPEAS, escalate privs' },
  { id: 6, label: 'C2',                    icon: Radio,     desc: 'Establish Sliver C2 listener, maintain persistence' },
  { id: 7, label: 'Actions on Objectives', icon: Flag,      desc: 'Lateral movement, data exfiltration, final objectives' },
]

// ── Status helpers ────────────────────────────────────────────────────────────

function statusColor(s: KillChainStatus | undefined | null) {
  switch (s) {
    case 'running':              return '#22c55e'
    case 'starting':             return '#f59e0b'
    case 'paused':               return '#f59e0b'
    case 'waiting_for_operator': return '#f87171'
    case 'completed':            return '#22c55e'
    case 'error':                return '#ef4444'
    case 'stopping':             return '#f59e0b'
    default:                     return '#6b7280'
  }
}

function statusLabel(s: KillChainStatus | undefined | null) {
  switch (s) {
    case 'running':              return 'RUNNING'
    case 'starting':             return 'STARTING…'
    case 'paused':               return 'PAUSED'
    case 'waiting_for_operator': return '⏸ AWAITING OPERATOR'
    case 'completed':            return 'COMPLETED'
    case 'error':                return 'ERROR'
    case 'stopping':             return 'STOPPING…'
    default:                     return 'IDLE'
  }
}

// ── Log level styles ──────────────────────────────────────────────────────────

const LOG_COLORS: Record<string, string> = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  action: '#e53935',
  info: '#6b7280',
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const { projectId, userId } = useProject()
  const { data: project } = useProjectById(projectId)

  const [isAttackPathsOpen, setIsAttackPathsOpen] = useState(false)
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false)
  const [isPersistenceModalOpen, setIsPersistenceModalOpen] = useState(false)
  const [isActionModalOpen, setIsActionModalOpen] = useState(false)
  const [startStage, setStartStage] = useState<number | undefined>(undefined)
  const [advanceTarget, setAdvanceTarget] = useState<number>(2)
  const [historicalLogs, setHistoricalLogs] = useState<import('@/lib/recon-types').ReconLogEvent[]>([])
  const [histLoaded, setHistLoaded] = useState(false)

  const {
    state: kcState,
    isLoading,
    error: kcError,
    startKillChain,
    stopKillChain,
    pauseKillChain,
    resumeKillChain,
    advanceKillChain,
    submitOperatorInput,
    refetch,
  } = useKillChainStatus({
    projectId,
    enabled: !!projectId,
  })

  const {
    logs: liveLogs,
    isConnected: sseConnected,
    error: sseError,
    clearLogs: clearLiveLogs,
    currentStage: sseStage,
  } = useKillChainSSE({
    projectId,
    enabled: !!projectId && (
      kcState?.status === 'running' ||
      kcState?.status === 'starting' ||
      kcState?.status === 'paused' ||
      kcState?.status === 'waiting_for_operator'
    ),
    status: kcState?.status,
  })

  // Load historical logs from DB on mount / project change
  useEffect(() => {
    if (!projectId) { setHistoricalLogs([]); setHistLoaded(false); return }
    setHistLoaded(false)
    fetch(`/api/kill-chain/${projectId}/runs`)
      .then(r => r.ok ? r.json() : null)
      .then(async run => {
        if (!run?.id) { setHistLoaded(true); return }
        const res = await fetch(`/api/kill-chain/${projectId}/runs/${run.id}/logs`)
        if (!res.ok) { setHistLoaded(true); return }
        const data = await res.json()
        const entries: import('@/lib/recon-types').ReconLogEvent[] = (Array.isArray(data) ? data : data.logs ?? []).map((l: {
          stage?: number; stageName?: string; level?: string; log?: string; timestamp?: string
        }, i: number) => ({
          log: l.log ?? '',
          timestamp: l.timestamp ?? new Date().toISOString(),
          level: l.level ?? 'info',
          phase: l.stageName,
          phaseNumber: l.stage,
          eventId: `hist-${run.id}-${i}`,
        }))
        setHistoricalLogs(entries)
        setHistLoaded(true)
      })
      .catch(() => setHistLoaded(true))
  }, [projectId])

  // Merge: historical first, then live (deduplicated by eventId)
  const logs = [
    ...historicalLogs,
    ...liveLogs.filter(l => !historicalLogs.some(h => h.eventId === l.eventId)),
  ]

  const clearLogs = () => { clearLiveLogs(); setHistoricalLogs([]) }

  const logsEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const isActive  = kcState?.status === 'running' || kcState?.status === 'starting'
  const isPaused  = kcState?.status === 'paused'
  const isWaiting = kcState?.status === 'waiting_for_operator'
  const isIdle    = !kcState || kcState.status === 'idle' || kcState.status === 'completed' || kcState.status === 'error'
  const currentStage = kcState?.current_stage ?? (sseStage || 1)

  // Keep advance target ahead of current stage
  useEffect(() => {
    if (advanceTarget <= currentStage) {
      const next = currentStage + 1
      if (next <= 7) setAdvanceTarget(next)
    }
  }, [currentStage, advanceTarget])

  const handleStart = async () => {
    clearLogs()
    await startKillChain(startStage ? { startStage } : undefined)
    setStartStage(undefined)
  }

  if (!projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <Swords size={48} className={styles.emptyIcon} />
          <h2>No Project Selected</h2>
          <p>Select a project to begin an engagement.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} />

      {/* ── Page header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon} style={{ boxShadow: `0 0 16px ${statusColor(kcState?.status)}33` }}>
            <Swords size={20} />
          </div>
          <div>
            <h1 className={styles.title}>Operations</h1>
            <p className={styles.subtitle}>
              Target: <strong>{project?.targetDomain || project?.name || '—'}</strong>
              {' · '}
              <span style={{ color: statusColor(kcState?.status) }}>{statusLabel(kcState?.status)}</span>
              {kcState?.current_stage_name && isActive && (
                <> · Stage {currentStage}: {kcState.current_stage_name}</>
              )}
            </p>
          </div>
        </div>

        <div className={styles.headerRight}>
          {sseConnected && (
            <span className={styles.liveChip}>
              <Activity size={10} className={styles.liveDot} />
              LIVE
            </span>
          )}
          <button className={styles.refreshBtn} onClick={refetch} disabled={isLoading}>
            <RefreshCw size={13} className={isLoading ? styles.spinning : ''} />
          </button>
          <Link href="/graph" className={styles.graphLink}>
            <Network size={13} />
            View Graph
          </Link>
        </div>
      </header>

      {project && !project.agentLhost && (
        <div className={styles.lhostWarning}>
          ⚠️ <strong>LHOST not configured</strong> — Stages 2 (payload) and 3 (delivery) will be skipped.{' '}
          <a href={`/projects/${projectId}/settings?tab=agent`} className={styles.lhostWarningLink}>Configure in project settings →</a>
        </div>
      )}

      <div className={styles.body}>
        {/* ── Left column: kill chain ── */}
        <div className={styles.leftCol}>

          {/* Kill chain stage progress */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Target size={14} />
              <span>Kill Chain Progress</span>
              <span className={styles.cardBadge} style={{ color: statusColor(kcState?.status) }}>
                Stage {currentStage} / {STAGES.length}
              </span>
            </div>

            <div className={styles.stages}>
              {STAGES.map((stage, i) => {
                const isDone    = currentStage > stage.id && (isActive || isPaused || isWaiting || kcState?.status === 'completed')
                const isCurrent = currentStage === stage.id && (isActive || isPaused || isWaiting)
                const isUpcoming = currentStage < stage.id || isIdle
                const Icon = stage.icon
                return (
                  <div
                    key={stage.id}
                    className={`${styles.stage} ${isDone ? styles.stageDone : ''} ${isCurrent ? styles.stageCurrent : ''} ${isUpcoming ? styles.stageUpcoming : ''}`}
                  >
                    <div className={styles.stageConnector}>
                      <div className={`${styles.stageDot} ${isDone ? styles.stageDotDone : ''} ${isCurrent ? styles.stageDotActive : ''}`}>
                        {isDone ? <span className={styles.stageDotCheck}>✓</span> : <Icon size={10} />}
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className={`${styles.stageLine} ${isDone ? styles.stageLineDone : ''}`} />
                      )}
                    </div>
                    <div className={styles.stageInfo}>
                      <div className={styles.stageLabel}>
                        <span className={styles.stageNum}>{stage.id}</span>
                        {stage.label}
                        {isCurrent && (
                          <span className={styles.stageActiveBadge}>
                            <Activity size={8} className={styles.stageActivePulse} /> Active
                          </span>
                        )}
                      </div>
                      {isCurrent && (
                        <div className={styles.stageDesc}>{stage.desc}</div>
                      )}
                      {isCurrent && kcState?.current_sub_step && (
                        <div className={styles.subStep}>
                          <ChevronRight size={10} />
                          {kcState.current_sub_step}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Controls */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Terminal size={14} />
              <span>Engagement Controls</span>
            </div>

            {kcError && (
              <div className={styles.errorBanner}>
                <AlertTriangle size={13} />
                {kcError}
              </div>
            )}

            <div className={styles.controls}>
              {isIdle && (
                <>
                  <div className={styles.startStageRow}>
                    <label className={styles.startStageLabel}>Start from stage:</label>
                    <select
                      className={styles.stageSelect}
                      value={startStage ?? ''}
                      onChange={(e) => setStartStage(e.target.value ? Number(e.target.value) : undefined)}
                    >
                      <option value="">Full chain (Stage 1)</option>
                      {STAGES.slice(1).map((s) => (
                        <option key={s.id} value={s.id}>Stage {s.id}: {s.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className={`${styles.ctrlBtn} ${styles.ctrlBtnStart}`}
                    onClick={handleStart}
                    disabled={isLoading}
                  >
                    <Play size={14} />
                    Launch Engagement
                  </button>
                </>
              )}

              {isActive && (
                <>
                  <button className={`${styles.ctrlBtn} ${styles.ctrlBtnPause}`} onClick={pauseKillChain} disabled={isLoading}>
                    <Pause size={14} />
                    Pause
                  </button>
                  <button className={`${styles.ctrlBtn} ${styles.ctrlBtnStop}`} onClick={stopKillChain} disabled={isLoading}>
                    <Square size={14} />
                    Stop
                  </button>
                  {/* Force Advance — skip current stage and jump to any later stage */}
                  <div className={styles.advanceRow}>
                    <select
                      className={styles.stageSelect}
                      value={advanceTarget}
                      onChange={(e) => setAdvanceTarget(Number(e.target.value))}
                    >
                      {STAGES.filter((s) => s.id > currentStage).map((s) => (
                        <option key={s.id} value={s.id}>Stage {s.id}: {s.label}</option>
                      ))}
                    </select>
                    <button
                      className={`${styles.ctrlBtn} ${styles.ctrlBtnAdvance}`}
                      onClick={() => advanceKillChain(advanceTarget)}
                      disabled={isLoading || advanceTarget <= currentStage}
                      title="Force skip current stage and jump to the selected stage"
                    >
                      <SkipForward size={14} />
                      Force Advance
                    </button>
                  </div>
                </>
              )}

              {isPaused && (
                <>
                  <button className={`${styles.ctrlBtn} ${styles.ctrlBtnStart}`} onClick={resumeKillChain} disabled={isLoading}>
                    <PlayCircle size={14} />
                    Resume
                  </button>
                  <button className={`${styles.ctrlBtn} ${styles.ctrlBtnStop}`} onClick={stopKillChain} disabled={isLoading}>
                    <Square size={14} />
                    Stop
                  </button>
                  {/* Force Advance also available while paused */}
                  <div className={styles.advanceRow}>
                    <select
                      className={styles.stageSelect}
                      value={advanceTarget}
                      onChange={(e) => setAdvanceTarget(Number(e.target.value))}
                    >
                      {STAGES.filter((s) => s.id > currentStage).map((s) => (
                        <option key={s.id} value={s.id}>Stage {s.id}: {s.label}</option>
                      ))}
                    </select>
                    <button
                      className={`${styles.ctrlBtn} ${styles.ctrlBtnAdvance}`}
                      onClick={() => advanceKillChain(advanceTarget)}
                      disabled={isLoading || advanceTarget <= currentStage}
                    >
                      <SkipForward size={14} />
                      Force Advance
                    </button>
                  </div>
                </>
              )}

              {/* ── HITL: waiting_for_operator ─────────────────────────────── */}
              {isWaiting && kcState && (
                <HITLApprovalPanel
                  briefing={
                    // Use operatorBriefing from DB if available (persisted), otherwise generate a minimal brief
                    ((kcState as unknown as { operatorBriefing?: HITLBriefing }).operatorBriefing) ?? {
                      stage: currentStage,
                      stageName: STAGES.find(s => s.id === currentStage)?.label ?? `Stage ${currentStage}`,
                      summary: `Kill chain paused at Stage ${currentStage}. Awaiting operator approval to proceed.`,
                      proposedActions: [`Execute Stage ${currentStage} using AI agent`],
                      riskLevel: 'HIGH',
                      scopeNote: 'Please review the proposed actions and approve to continue.',
                    }
                  }
                  isLoading={isLoading}
                  onSubmit={async (instructions, action) => {
                    await submitOperatorInput(currentStage, instructions, action)
                    refetch()
                  }}
                />
              )}
            </div>
          </section>
        </div>

        {/* ── Right column: tools + logs ── */}
        <div className={styles.rightCol}>

          {/* Quick attack tools */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Zap size={14} />
              <span>Attack Toolkit</span>
            </div>
            <div className={styles.toolGrid}>
              <ToolCard
                icon={<Target size={18} />}
                label="Attack Paths"
                desc="Ranked exploitable paths ranked by severity"
                color="#e53935"
                onClick={() => setIsAttackPathsOpen(true)}
              />
              <ToolCard
                icon={<Code2 size={18} />}
                label="Payload Generator"
                desc="Msfvenom reverse shells & staged payloads"
                color="#f97316"
                onClick={() => setIsPayloadModalOpen(true)}
              />
              <ToolCard
                icon={<Database size={18} />}
                label="Record Persistence"
                desc="Log a persistence mechanism you've deployed"
                color="#f59e0b"
                onClick={() => setIsPersistenceModalOpen(true)}
              />
              <ToolCard
                icon={<Shield size={18} />}
                label="Record Action"
                desc="Document an objective achieved on target"
                color="#3b82f6"
                onClick={() => setIsActionModalOpen(true)}
              />
            </div>
          </section>

          {/* Live log feed */}
          <section className={`${styles.card} ${styles.logCard}`}>
            <div className={styles.cardHeader}>
              <Activity size={14} />
              <span>Live Activity Feed</span>
              {logs.length > 0 && (
                <button className={styles.clearBtn} onClick={clearLogs}>
                  Clear
                </button>
              )}
            </div>
            <div className={styles.logFeed}>
              {logs.length === 0 ? (
                <div className={styles.logEmpty}>
                  {!histLoaded
                    ? 'Loading activity history…'
                    : isActive || isPaused || isWaiting
                    ? sseError
                      ? `⚠ Live feed disconnected — ${sseError.includes('Max reconnection') ? 'orchestrator may have restarted. Stop and relaunch this engagement.' : sseError}`
                      : sseConnected
                        ? 'Kill chain running — waiting for first event…'
                        : 'Connecting to live feed…'
                    : 'Launch an engagement to see live activity here.'}
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={log.eventId || i} className={styles.logLine}>
                    <span className={styles.logTime}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span
                      className={styles.logLevel}
                      style={{ color: LOG_COLORS[log.level || 'info'] || '#6b7280' }}
                    >
                      {(log.level || 'info').toUpperCase()}
                    </span>
                    <span className={styles.logText}>{log.log}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </section>
        </div>
      </div>

      {/* ── Modals ── */}
      {projectId && (
        <>
          <AttackPathsDrawer
            isOpen={isAttackPathsOpen}
            onClose={() => setIsAttackPathsOpen(false)}
            projectId={projectId}
          />
          <PayloadGeneratorModal
            isOpen={isPayloadModalOpen}
            onClose={() => setIsPayloadModalOpen(false)}
          />
          <RecordPersistenceModal
            isOpen={isPersistenceModalOpen}
            onClose={() => setIsPersistenceModalOpen(false)}
            projectId={projectId}
            userId={userId || ''}
          />
          <RecordActionModal
            isOpen={isActionModalOpen}
            onClose={() => setIsActionModalOpen(false)}
            projectId={projectId}
            userId={userId || ''}
          />
        </>
      )}
    </div>
  )
}

// ── Tool card ─────────────────────────────────────────────────────────────────

function ToolCard({
  icon, label, desc, color, onClick,
}: {
  icon: React.ReactNode
  label: string
  desc: string
  color: string
  onClick: () => void
}) {
  return (
    <button className={styles.toolCard} onClick={onClick} style={{ '--tool-color': color } as React.CSSProperties}>
      <span className={styles.toolIcon}>{icon}</span>
      <span className={styles.toolLabel}>{label}</span>
      <span className={styles.toolDesc}>{desc}</span>
    </button>
  )
}

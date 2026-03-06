'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Activity,
  RotateCcw,
  Trash2,
  Edit2,
  Check,
  X,
  Shield,
  Terminal,
  Radio,
  Save,
} from 'lucide-react'
import styles from './page.module.css'
import useKillChainSSE from '@/hooks/useKillChainSSE'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string
  runId: string
  projectId: string
  stage: number
  stageName: string
  subStep: string | null
  level: string
  log: string
  toolName: string | null
  metadata: unknown
  timestamp: string
}

interface RunProject {
  id: string
  name: string
  targetDomain: string
  githubTargetOrg: string | null
}

interface EngagementRun {
  id: string
  projectId: string
  userId: string
  status: string
  currentStage: number
  currentSubStep: string | null
  startStage: number
  selectedAttackPath: Record<string, unknown> | null
  payloadRef: Record<string, unknown> | null
  sessionObtained: boolean
  error: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  name: string | null
  notes: string | null
  tags: string[]
  stagesCompleted: number[]
  duration: number | null
  logs: LogEntry[]
  project: RunProject
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_NAMES = [
  '',
  'Reconnaissance',
  'Weaponization',
  'Delivery',
  'Exploitation',
  'Installation',
  'C2',
  'Actions on Objectives',
]

const STATUS_COLORS: Record<string, string> = {
  running:   '#22c55e',
  completed: '#3b82f6',
  error:     '#ef4444',
  paused:    '#f59e0b',
  idle:      '#6b7280',
  starting:  '#8b5cf6',
  stopped:   '#6b7280',
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  success: '#22c55e',
  error:   '#ef4444',
  action:  '#3b82f6',
  warning: '#f59e0b',
  info:    '#9ca3af',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toTimeString().slice(0, 8) // HH:MM:SS
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngagementDetailPage() {
  const params = useParams()
  const router = useRouter()
  const runId  = params.runId as string

  const [run,         setRun]         = useState<EngagementRun | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<number>(1)
  const [notesSaved,  setNotesSaved]  = useState(false)

  // Editing state
  const [editingName, setEditingName] = useState(false)
  const [nameValue,   setNameValue]   = useState('')
  const [notes,       setNotes]       = useState('')
  const [tagInput,    setTagInput]    = useState('')
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  // ── Fetch ──

  const fetchRun = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const res = await fetch(`/api/engagements/${runId}`)
      if (!res.ok) {
        if (res.status === 404) throw new Error('Engagement not found')
        throw new Error('Failed to load engagement')
      }
      const data: EngagementRun = await res.json()
      setRun(data)
      setNameValue(data.name || '')
      setNotes(data.notes || '')
      if (!silent) setActiveStage(data.currentStage || 1)
      setFetchError(null)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => { fetchRun() }, [fetchRun])

  // ── Auto-refresh when running ──
  useEffect(() => {
    if (!run || run.status !== 'running') return
    const interval = setInterval(() => fetchRun(true), 10_000)
    return () => clearInterval(interval)
  }, [run?.status, fetchRun]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live SSE for running engagements ──
  const isRunning = run?.status === 'running'
  const { logs: liveLogsRaw, isConnected: sseConnected } = useKillChainSSE({
    projectId: run?.projectId ?? null,
    enabled: isRunning,
    status: run?.status,
    onComplete: () => { setTimeout(() => fetchRun(true), 2000) },
  })

  // Convert live log format to match stored LogEntry shape for unified rendering
  const liveLogs: LogEntry[] = liveLogsRaw.map((l, i) => ({
    id: `live-${i}`,
    runId,
    projectId: run?.projectId ?? '',
    stage: 1, // will be overridden by actual stage from SSE
    stageName: l.phase ?? 'Reconnaissance',
    subStep: l.phase ?? null,
    level: l.level ?? 'info',
    log: l.log,
    toolName: null,
    metadata: null,
    timestamp: typeof l.timestamp === 'string' ? l.timestamp : new Date().toISOString(),
  }))

  // Map live log events to proper stage numbers using the liveLogsRaw phase data
  // The useKillChainSSE hook tracks currentStage; apply that to each event
  const liveStageLogs = liveLogsRaw.map((l, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = l as any
    return {
      id: `live-${i}`,
      runId,
      projectId: run?.projectId ?? '',
      stage: raw.stage ?? 1,
      stageName: raw.stageName ?? 'Reconnaissance',
      subStep: raw.subStep ?? null,
      level: raw.level ?? 'info',
      log: raw.log,
      toolName: raw.toolName ?? null,
      metadata: null,
      timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : new Date().toISOString(),
    } as LogEntry
  })

  // Merge stored logs + live logs, deduplicate
  const allLogs = isRunning
    ? [...(run?.logs ?? []), ...liveStageLogs]
    : (run?.logs ?? [])

  const stageLogs = allLogs.filter((l) => l.stage === activeStage)

  // Auto-scroll log container when new live logs arrive
  useEffect(() => {
    if (isRunning && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [liveStageLogs.length, isRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Patch helper ──

  async function patchRun(updates: { name?: string; notes?: string; tags?: string[] }) {
    if (!run) return
    const res = await fetch(`/api/engagements/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (res.ok) {
      const updated = await res.json()
      setRun((prev) => prev ? { ...prev, ...updated } : prev)
    }
  }

  // ── Name editing ──

  async function saveNameEdit() {
    await patchRun({ name: nameValue.trim() || undefined })
    setEditingName(false)
  }

  // ── Notes auto-save ──

  function handleNotesChange(val: string) {
    setNotes(val)
    setNotesSaved(false)
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = setTimeout(async () => {
      await patchRun({ notes: val })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }, 1500)
  }

  async function handleNotesBlur() {
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current)
    if (notes !== (run?.notes ?? '')) {
      await patchRun({ notes })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }
  }

  // ── Tag management ──

  async function addTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const tag = tagInput.trim()
    if (!tag || !run) return
    if (run.tags.includes(tag)) { setTagInput(''); return }
    await patchRun({ tags: [...run.tags, tag] })
    setTagInput('')
  }

  async function removeTag(tag: string) {
    if (!run) return
    await patchRun({ tags: run.tags.filter((t) => t !== tag) })
  }

  // ── Delete ──

  async function handleDelete() {
    if (!window.confirm('Delete this engagement? This cannot be undone.')) return
    const res = await fetch(`/api/engagements/${runId}`, { method: 'DELETE' })
    if (res.ok) router.push('/engagements')
    else alert('Failed to delete engagement.')
  }

  // ── Restart ──

  async function handleRestart(fromStage: number) {
    if (!run) return
    const res = await fetch(
      `/api/kill-chain/${run.projectId}/runs/${runId}/restart`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromStage }) }
    )
    const json = await res.json()
    if (res.ok || res.status === 202) {
      router.push(`/engagements/${json.newRunId}`)
    } else {
      alert(`Failed to restart: ${json.error || 'Unknown error'}`)
    }
  }

  // ── Render states ──

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><Activity size={32} />Loading engagement…</div>
      </div>
    )
  }

  if (fetchError || !run) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <AlertCircle size={32} />
          {fetchError || 'Engagement not found'}
          <Link href="/engagements" className={styles.backBtn}>← Back to Engagements</Link>
        </div>
      </div>
    )
  }

  // ── Derived data ──

  const displayName = run.name || run.project?.targetDomain || run.project?.githubTargetOrg || 'Unnamed Engagement'
  const statusColor = STATUS_COLORS[run.status] || '#6b7280'

  // Log count per stage (stored + live)
  const logCountByStage = STAGE_NAMES.slice(1).map((_, idx) => {
    const stage = idx + 1
    return allLogs.filter((l) => l.stage === stage).length
  })

  return (
    <div className={styles.page}>

      {/* ══ Header ══ */}
      <div className={styles.header}>
        <Link href="/engagements" className={styles.backBtn}>
          <ArrowLeft size={14} />Engagements
        </Link>

        <div className={styles.headerMain}>
          {editingName ? (
            <>
              <input
                className={styles.editInput}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveNameEdit() }}
                autoFocus
              />
              <button className={styles.iconBtn} onClick={saveNameEdit} title="Save"><Check size={16} /></button>
              <button className={styles.iconBtn} onClick={() => setEditingName(false)} title="Cancel"><X size={16} /></button>
            </>
          ) : (
            <>
              <h1 className={styles.headerTitle}>{displayName}</h1>
              <button className={styles.iconBtn} onClick={() => { setEditingName(true); setNameValue(run.name || '') }} title="Rename">
                <Edit2 size={14} />
              </button>
            </>
          )}

          <div className={styles.headerMeta}>
            {isRunning && sseConnected && (
              <span className={styles.liveIndicator}>
                <Radio size={11} />LIVE
              </span>
            )}
            <span
              className={styles.statusBadge}
              style={{ backgroundColor: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}55` }}
            >
              {run.status === 'running' && <Activity size={11} />}
              {run.status === 'completed' && <CheckCircle size={11} />}
              {run.status === 'error' && <AlertCircle size={11} />}
              {run.status.toUpperCase()}
            </span>
            <span className={styles.runIdBadge}>#{runId.slice(0, 8)}</span>
          </div>
        </div>
      </div>

      {/* ══ Info bar ══ */}
      <div className={styles.infoBar}>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Project</span>
          <span className={styles.infoValue}>{run.project?.name || run.projectId}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Target</span>
          <span className={styles.infoValue}>{run.project?.targetDomain || run.project?.githubTargetOrg || '—'}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Started</span>
          <span className={styles.infoValue}>{run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Completed</span>
          <span className={styles.infoValue}>{run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Duration</span>
          <span className={styles.infoValueMono}>{formatDuration(run.duration)}</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.infoLabel}>Stage Reached</span>
          <span className={styles.infoValue}>{run.currentStage} — {STAGE_NAMES[run.currentStage] || '?'}</span>
        </div>
        {run.sessionObtained && (
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Session</span>
            <span className={styles.infoValue} style={{ color: '#22c55e' }}>
              <Shield size={12} style={{ display: 'inline', marginRight: 4 }} />Obtained
            </span>
          </div>
        )}
        <div className={styles.infoItem} style={{ flex: 1 }}>
          <span className={styles.infoLabel}>Tags</span>
          <div className={styles.tagsRow}>
            {run.tags.map((tag) => (
              <span key={tag} className={styles.tagChip}>
                {tag}
                <button onClick={() => removeTag(tag)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
            <input
              type="text"
              className={styles.tagInput}
              placeholder="Add tag…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={addTag}
            />
          </div>
        </div>
      </div>

      {/* ══ Body ══ */}
      <div className={styles.body}>

        {/* ── Operator Notes ── */}
        <div className={styles.notesPanel}>
          <div className={styles.notesPanelHeader}>
            <Terminal size={13} />
            <span>Operator Notes</span>
            {notesSaved && (
              <span className={styles.savedIndicator}><Save size={11} />Saved</span>
            )}
            <span className={styles.notesHintInline}>Markdown · auto-saves</span>
          </div>
          <textarea
            className={styles.notesTextarea}
            placeholder="Click here to add operator notes, markdown is supported…&#10;&#10;## Findings&#10;- &#10;&#10;## Next Steps&#10;- "
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onBlur={handleNotesBlur}
          />
        </div>

        {/* ── Stage Timeline ── */}
        <div className={styles.timelineSection}>
          <div className={styles.timelineHeader}>
            <Activity size={13} />
            <span>Stage Timeline</span>
          </div>
          <div className={styles.stageTimeline}>
            {STAGE_NAMES.slice(1).map((name, idx) => {
              const stage = idx + 1
              const isCompleted = run.stagesCompleted.includes(stage)
              const isCurrent   = run.currentStage === stage
              const isPending   = !isCompleted && !isCurrent
              const hasLogs     = logCountByStage[idx] > 0

              return (
                <div
                  key={stage}
                  className={styles.stageItem}
                  data-completed={isCompleted || undefined}
                  data-current={isCurrent && !isCompleted || undefined}
                  data-pending={isPending || undefined}
                  onClick={() => setActiveStage(stage)}
                  title={`Stage ${stage}: ${name}${hasLogs ? ` (${logCountByStage[idx]} log entries)` : ''}`}
                >
                  {/* connector line — rendered before the dot via CSS */}
                  <div className={styles.stageConnector} />
                  <div className={styles.stageDot}>
                    {isCompleted ? <CheckCircle size={14} /> : stage}
                  </div>
                  <span className={styles.stageLabel}>{name}</span>
                  {hasLogs && <span className={styles.stageLogBadge}>{logCountByStage[idx]}</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Log viewer ── */}
        <div className={styles.logViewer}>
          <div className={styles.logViewerHeader}>
            <div className={styles.logTabs}>
              {STAGE_NAMES.slice(1).map((name, idx) => {
                const stage = idx + 1
                const count = logCountByStage[idx]
                return (
                  <button
                    key={stage}
                    className={activeStage === stage ? styles.logTabActive : styles.logTab}
                    onClick={() => setActiveStage(stage)}
                  >
                    {stage}. {name}
                    {count > 0 && <span className={styles.logTabCount}>{count}</span>}
                  </button>
                )
              })}
            </div>
            {isRunning && (
              <span className={styles.liveLogBadge}>
                <span className={styles.liveDot} />
                {sseConnected ? 'Streaming live' : 'Connecting…'}
              </span>
            )}
          </div>

          <div className={styles.logContainer} ref={logContainerRef}>
            {stageLogs.length === 0 ? (
              <div className={styles.logEmpty}>
                {isRunning
                  ? `Waiting for stage ${activeStage} logs…`
                  : (
                    <>
                      <span>No logs for stage {activeStage}</span>
                      <span className={styles.logEmptyHint}>
                        {run.logs.length === 0
                          ? 'This engagement was run before log persistence was enabled, or the run didn\'t complete.'
                          : 'No activity recorded for this stage.'}
                      </span>
                    </>
                  )
                }
              </div>
            ) : (
              stageLogs.map((entry) => (
                <div key={entry.id} className={styles.logLine}>
                  <span className={styles.logTimestamp}>{formatTimestamp(entry.timestamp)}</span>
                  <span className={styles.logLevel} style={{ color: LOG_LEVEL_COLORS[entry.level] || '#9ca3af' }}>
                    [{entry.level}]
                  </span>
                  <span className={styles.logText}>{entry.log}</span>
                  {entry.toolName && <span className={styles.logTool}>[{entry.toolName}]</span>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Attack Path ── */}
        {run.selectedAttackPath && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Attack Path</h2>
            <div className={styles.sectionBody}>
              <pre className={styles.jsonBlock}>{JSON.stringify(run.selectedAttackPath, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* ── Payload ── */}
        {run.payloadRef && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Payload</h2>
            <div className={styles.sectionBody}>
              <pre className={styles.jsonBlock}>{JSON.stringify(run.payloadRef, null, 2)}</pre>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {run.error && (
          <div className={styles.section} style={{ borderColor: '#ef444455' }}>
            <h2 className={styles.sectionTitle} style={{ color: '#ef4444' }}>
              <AlertCircle size={14} style={{ display: 'inline', marginRight: 8 }} />Error
            </h2>
            <div className={styles.sectionBody}>
              <pre className={styles.jsonBlock} style={{ color: '#ef4444' }}>{run.error}</pre>
            </div>
          </div>
        )}

      </div>

      {/* ══ Actions bar ══ */}
      <div className={styles.actionsBar}>
        <button className={styles.primaryBtn} onClick={() => handleRestart(1)}>
          <RotateCcw size={15} />Restart from Stage 1
        </button>
        <button className={styles.secondaryBtn} onClick={() => handleRestart(run.currentStage)}>
          <RotateCcw size={15} />Resume from Stage {run.currentStage}
        </button>
        <button className={styles.dangerBtn} onClick={handleDelete}>
          <Trash2 size={15} />Delete Engagement
        </button>
      </div>

    </div>
  )
}

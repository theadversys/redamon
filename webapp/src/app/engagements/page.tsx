'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useProject } from '@/providers/ProjectProvider'
import {
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  Trash2,
  Eye,
  Tag,
  Search,
  Layers,
} from 'lucide-react'
import styles from './page.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  selectedAttackPath: unknown
  payloadRef: unknown
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
  project: RunProject
  logCount: number
}

interface EngagementsResponse {
  runs: EngagementRun[]
  nextCursor: string | null
  total: number
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

const STATUS_FILTERS = ['All', 'running', 'completed', 'paused', 'error', 'idle']

const DATE_RANGES: { label: string; days: number | null }[] = [
  { label: 'Last 7 days',  days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time',     days: null },
]

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

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function runDisplayName(run: EngagementRun): string {
  return (
    run.name ||
    run.project?.targetDomain ||
    run.project?.githubTargetOrg ||
    'Unnamed'
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EngagementsPage() {
  const { projectId: ctxProjectId } = useProject()

  const [data,         setData]         = useState<EngagementsResponse | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [dateRange,    setDateRange]    = useState<number | null>(30)
  const [search,       setSearch]       = useState('')
  const [allProjects,  setAllProjects]  = useState(false)

  const projectId = allProjects ? undefined : ctxProjectId ?? undefined

  const fetchRuns = useCallback(async (cursor?: string) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ limit: '50' })
      if (projectId)               params.set('projectId', projectId)
      if (statusFilter !== 'All')  params.set('status',    statusFilter)
      if (search.trim())           params.set('search',    search.trim())
      if (cursor)                  params.set('cursor',    cursor)

      const res = await fetch(`/api/engagements?${params}`)
      if (!res.ok) throw new Error('Failed to fetch engagements')
      const json: EngagementsResponse = await res.json()

      setData((prev) => {
        if (cursor && prev) {
          return { ...json, runs: [...prev.runs, ...json.runs] }
        }
        return json
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [projectId, statusFilter, search])

  // Initial + filter-change load
  useEffect(() => {
    setData(null)
    fetchRuns()
  }, [fetchRuns])

  // ── Actions ──

  async function handleDelete(run: EngagementRun) {
    if (!window.confirm(`Delete engagement "${runDisplayName(run)}"? This cannot be undone.`)) return
    const res = await fetch(`/api/engagements/${run.id}`, { method: 'DELETE' })
    if (res.ok) {
      setData((prev) => prev
        ? { ...prev, runs: prev.runs.filter((r) => r.id !== run.id), total: prev.total - 1 }
        : prev
      )
    } else {
      alert('Failed to delete engagement.')
    }
  }

  async function handleRestart(run: EngagementRun) {
    const res = await fetch(
      `/api/kill-chain/${run.projectId}/runs/${run.id}/restart`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStage: 1 }),
      }
    )
    const json = await res.json()
    if (res.ok || res.status === 202) {
      alert(`Restart initiated! New run ID: ${json.newRunId}`)
      fetchRuns()
    } else {
      alert(`Failed to restart: ${json.error || 'Unknown error'}`)
    }
  }

  // ── Stats ──

  const runs = data?.runs ?? []

  const statsTotal     = data?.total ?? 0
  const statsCompleted = runs.filter((r) => r.status === 'completed').length
  const statsRunning   = runs.filter((r) => r.status === 'running' || r.status === 'starting').length
  const statsErrors    = runs.filter((r) => r.status === 'error').length

  // ── Filter by date client-side ──
  const visibleRuns = dateRange
    ? runs.filter((r) => {
        const ts = r.startedAt || r.createdAt
        return Date.now() - new Date(ts).getTime() <= dateRange * 24 * 60 * 60 * 1000
      })
    : runs

  // ── Render ──

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <Layers size={24} />
          <h1>Engagements</h1>
          {statsTotal > 0 && <span className={styles.badge}>{statsTotal}</span>}
        </div>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.statCard} style={{ borderColor: '#6b7280' }}>
            <Activity size={20} />
            <div>
              <span className={styles.statLabel}>Total Runs</span>
              <span className={styles.statValue}>{statsTotal}</span>
            </div>
          </div>
          <div className={styles.statCard} style={{ borderColor: '#3b82f6' }}>
            <CheckCircle size={20} color="#3b82f6" />
            <div>
              <span className={styles.statLabel}>Completed</span>
              <span className={styles.statValue} style={{ color: '#3b82f6' }}>{statsCompleted}</span>
            </div>
          </div>
          <div className={styles.statCard} style={{ borderColor: '#22c55e' }}>
            <Activity size={20} color="#22c55e" />
            <div>
              <span className={styles.statLabel}>Running</span>
              <span className={styles.statValue} style={{ color: '#22c55e' }}>{statsRunning}</span>
            </div>
          </div>
          <div className={styles.statCard} style={{ borderColor: '#ef4444' }}>
            <AlertCircle size={20} color="#ef4444" />
            <div>
              <span className={styles.statLabel}>Errors</span>
              <span className={styles.statValue} style={{ color: '#ef4444' }}>{statsErrors}</span>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          {/* Status chips */}
          <div className={styles.filterChips}>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                className={statusFilter === s ? styles.filterChipActive : styles.filterChip}
                onClick={() => setStatusFilter(s)}
                style={s !== 'All' && s !== statusFilter ? { borderColor: STATUS_COLORS[s] + '55' } : undefined}
              >
                {s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Date range */}
          <select
            className={styles.filterSelect}
            value={dateRange ?? 'all'}
            onChange={(e) => setDateRange(e.target.value === 'all' ? null : parseInt(e.target.value, 10))}
          >
            {DATE_RANGES.map((d) => (
              <option key={d.label} value={d.days ?? 'all'}>{d.label}</option>
            ))}
          </select>

          {/* All projects toggle */}
          {ctxProjectId && (
            <button
              className={allProjects ? styles.filterChipActive : styles.filterChip}
              onClick={() => setAllProjects((v) => !v)}
            >
              All Projects
            </button>
          )}

          {/* Search */}
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by name or target…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>
        {/* Loading skeleton */}
        {loading && !data && (
          <div className={styles.skeleton}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className={styles.emptyState}>
            <AlertCircle size={40} color="#ef4444" />
            <h2>Error loading engagements</h2>
            <p>{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && visibleRuns.length === 0 && (
          <div className={styles.emptyState}>
            <Layers size={48} />
            <h2>No engagements found</h2>
            <p>Start a kill chain test to see engagement history here.</p>
          </div>
        )}

        {/* Run list */}
        {visibleRuns.length > 0 && (
          <>
            {/* Column headers */}
            <div className={styles.listHeader}>
              <span className={styles.colHeader}>Name / Target</span>
              <span className={styles.colHeader}>Status</span>
              <span className={styles.colHeader}>Stage Reached</span>
              <span className={styles.colHeader}>Duration</span>
              <span className={styles.colHeader}>Started</span>
              <span className={styles.colHeader}>Tags</span>
              <span className={styles.colHeader}>Actions</span>
            </div>

            <div className={styles.list}>
              {visibleRuns.map((run) => (
                <div key={run.id} className={styles.runRow}>
                  {/* Name / Target */}
                  <div className={styles.runNameCell}>
                    <Link href={`/engagements/${run.id}`} className={styles.runName}>
                      {runDisplayName(run)}
                    </Link>
                    <span className={styles.runSubName}>
                      {run.project?.name || run.projectId}
                    </span>
                  </div>

                  {/* Status */}
                  <span
                    className={styles.statusBadge}
                    style={{
                      backgroundColor: (STATUS_COLORS[run.status] || '#6b7280') + '22',
                      color: STATUS_COLORS[run.status] || '#6b7280',
                      border: `1px solid ${(STATUS_COLORS[run.status] || '#6b7280')}55`,
                    }}
                  >
                    {run.status === 'running' && <Activity size={10} />}
                    {run.status}
                  </span>

                  {/* Stage reached */}
                  <span className={styles.stagePill}>
                    <span className={styles.stageNum}>{run.currentStage}</span>
                    {STAGE_NAMES[run.currentStage] || ''}
                  </span>

                  {/* Duration */}
                  <span className={styles.duration}>{formatDuration(run.duration)}</span>

                  {/* Started */}
                  <span className={styles.timestamp}>
                    <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {relativeTime(run.startedAt || run.createdAt)}
                  </span>

                  {/* Tags */}
                  <div className={styles.tags}>
                    {run.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className={styles.tagChip}>
                        <Tag size={9} style={{ marginRight: 3 }} />
                        {tag}
                      </span>
                    ))}
                    {run.tags.length > 3 && (
                      <span className={styles.tagChip}>+{run.tags.length - 3}</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className={styles.actions}>
                    <Link href={`/engagements/${run.id}`}>
                      <button className={styles.actionBtn} title="View">
                        <Eye size={14} />
                      </button>
                    </Link>
                    <button
                      className={styles.actionBtn}
                      title="Restart from stage 1"
                      onClick={() => handleRestart(run)}
                    >
                      <RotateCcw size={14} />
                    </button>
                    <button
                      className={styles.deleteBtn}
                      title="Delete"
                      onClick={() => handleDelete(run)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {data?.nextCursor && (
              <div className={styles.loadMore}>
                <button
                  className={styles.loadMoreBtn}
                  onClick={() => fetchRuns(data.nextCursor!)}
                  disabled={loading}
                >
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/providers/ProjectProvider'
import Link from 'next/link'
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  Search,
  Key,
  Download,
} from 'lucide-react'
import { VulnPreviewDrawer } from './components/VulnPreviewDrawer'
import { Skeleton } from '@/components/ui'
import { useFindingStates } from '@/hooks/useFindingStates'
import { getAssetFromVuln } from '@/lib/asset-utils'
import { computeRootCauseKey, groupByRootCause } from '@/lib/root-cause'
import styles from './page.module.css'

interface Vulnerability {
  id: string
  findingKey?: string
  name: string
  severity: string
  source: string
  toolName?: string
  category?: string
  cvssScore?: number
  description?: string
  solution?: string
  url?: string
  confidence?: string
  discoveredAt?: string
  cveIds: string[]
  endpoints: Array<{ url: string; path: string; method: string }>
  parameters: Array<{ name: string; type: string }>
  ips: string[]
  subdomains: string[]
  domains: string[]
  baseUrls: string[]
  attackTechniques?: Array<{ id: string; name: string; tactic: string }>
  // Workflow state (joined from Postgres)
  status?: string
  ownerId?: string | null
  targetDueAt?: string | null
  overdue?: boolean
  riskExpiresAt?: string | null
  workflowUpdatedAt?: string | null
}

interface VulnerabilitiesResponse {
  vulnerabilities: Vulnerability[]
  stats: {
    total: number
    bySeverity: {
      critical: number
      high: number
      medium: number
      low: number
      info: number
    }
    bySource: Record<string, number>
  }
  scanStatus?: {
    skipped: boolean
    skipReason: string | null
    modulesExecuted: string[]
  }
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
}

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  critical: <AlertTriangle size={14} />,
  high: <AlertCircle size={14} />,
  medium: <AlertCircle size={14} />,
  low: <Info size={14} />,
  info: <Info size={14} />,
}

type GroupByOption = 'none' | 'asset' | 'severity' | 'source' | 'rootCause' | 'owner'

const viewFilterMap = new Map<string, { severity?: string; status?: string; overdue?: boolean }>([
  ['exec', { severity: 'critical', overdue: false }],
  ['dev_triage', { status: 'open', overdue: false }],
  ['overdue', { overdue: true }],
  ['newly_discovered', { overdue: false }],
  ['risk_expiring', { overdue: false }],
])

function getConfidenceDisplay(v: Vulnerability): string {
  if (v.confidence) {
    const c = v.confidence.toLowerCase()
    if (c === 'high') return 'High'
    if (c === 'med' || c === 'medium') return 'Med'
    if (c === 'low') return 'Low'
  }
  if (v.source === 'nuclei' && (v.cvssScore ?? 0) >= 7) return 'High'
  if (v.source === 'gvm' || v.source === 'nuclei') return 'Med'
  if (v.source === 'custom') return 'Low'
  return '—'
}

function getEntrypointDisplay(v: Vulnerability): string {
  const eps = v.endpoints || []
  if (eps.length === 0) return '—'
  if (eps.length === 1) return `${eps[0].method} ${eps[0].path}`
  return `${eps.length} entrypoints`
}

export default function VulnerabilitiesPage() {
  const router = useRouter()
  const { projectId, userId } = useProject()
  const { updateState } = useFindingStates(projectId)

  // Stable key for API lookups (findingKey preferred for workflow)
  const getVulnKey = useCallback((v: Vulnerability) => v.findingKey ?? v.id, [])

  // Workflow from API (joined by finding_key) - no read-side seeding
  const getWorkflow = useCallback((v: Vulnerability) => ({
    status: v.status ?? 'open',
    ownerId: v.ownerId ?? null,
    watcherIds: [] as string[],
    firstSeenAt: v.discoveredAt ?? null,
    lastSeenAt: v.discoveredAt ?? null,
    targetDueAt: v.targetDueAt ?? null,
    overdue: v.overdue ?? false,
    riskReason: null,
    riskApproverId: null,
    riskExpiresAt: v.riskExpiresAt ?? null,
    fpReason: null,
    fpEvidenceRef: null,
    verificationRunId: null,
    verificationProofRef: null,
    updatedAt: v.workflowUpdatedAt ?? new Date().toISOString(),
    updatedById: null,
    commentCount: 0,
    ticket: null,
  }), [])
  const [data, setData] = useState<VulnerabilitiesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [overdueFilter, setOverdueFilter] = useState(false)
  const [assetFilter, setAssetFilter] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupByOption>('none')
  const [previewVuln, setPreviewVuln] = useState<Vulnerability | null>(null)
  const [trends, setTrends] = useState<{ weekly: Array<{ weekStart: string; newCount: number; fixedCount: number }>; openCount: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkModal, setBulkModal] = useState<'assign' | 'status' | null>(null)
  const [bulkStatusValue, setBulkStatusValue] = useState('open')
  const [bulkAssignValue, setBulkAssignValue] = useState('')
  const [savedViews, setSavedViews] = useState<{ id?: string; name: string; filterJson: Record<string, unknown>; isPreset: boolean }[]>([])
  const [activeViewType, setActiveViewType] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetchVulnerabilities = useCallback(() => setRefetchTrigger((n) => n + 1), [])

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }

    const fetchVulnerabilities = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams({ projectId })
        if (severityFilter) params.append('severity', severityFilter)
        if (sourceFilter) params.append('source', sourceFilter)

        const response = await fetch(`/api/vulnerabilities?${params}`)
        if (!response.ok) {
          throw new Error('Failed to fetch vulnerabilities')
        }
        const result = await response.json()
        setData(result)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchVulnerabilities()
    const interval = setInterval(fetchVulnerabilities, 10000)
    return () => clearInterval(interval)
  }, [projectId, severityFilter, sourceFilter, refetchTrigger])

  useEffect(() => {
    if (!projectId) return
    fetch(`/api/vulnerabilities/trends?projectId=${projectId}&weeks=4`)
      .then((r) => r.ok ? r.json() : null)
      .then(setTrends)
      .catch(() => setTrends(null))
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    const uid = userId || 'anonymous'
    fetch(`/api/saved-views?projectId=${projectId}&userId=${uid}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          const presets = data.presets || []
          const saved = (data.saved || []).map((v: { name: string; filterJson: Record<string, unknown> }) => ({
            ...v,
            isPreset: false,
          }))
          setSavedViews([...presets, ...saved])
        }
      })
      .catch(() => setSavedViews([]))
  }, [projectId, userId])

  const vulnerabilities = data?.vulnerabilities || []
  const stats = data?.stats

  const rootCauseCounts = useMemo(() => {
    const groups = groupByRootCause(vulnerabilities)
    const map = new Map<string, number>()
    for (const g of groups) {
      for (const v of g.occurrences) {
        map.set(v.id, g.count)
      }
    }
    return map
  }, [vulnerabilities])

  const filteredAndGrouped = useMemo(() => {
    let list = vulnerabilities

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          getAssetFromVuln(v).label.toLowerCase().includes(q) ||
          v.source.toLowerCase().includes(q) ||
          (v.toolName && v.toolName.toLowerCase().includes(q))
      )
    }
    if (statusFilter) {
      list = list.filter((v) => getWorkflow(v).status === statusFilter)
    }
    if (assetFilter) {
      list = list.filter((v) => getAssetFromVuln(v).label === assetFilter)
    }
    if (overdueFilter) {
      list = list.filter((v) => getWorkflow(v).overdue)
    }
    if (activeViewType === 'newly_discovered') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 7)
      const cutoffIso = cutoff.toISOString()
      list = list.filter((v) => {
        const first = getWorkflow(v).firstSeenAt
        return first && first >= cutoffIso
      })
    }
    if (activeViewType === 'risk_expiring') {
      const now = new Date()
      const in7Days = new Date()
      in7Days.setDate(in7Days.getDate() + 7)
      const nowIso = now.toISOString()
      const in7Iso = in7Days.toISOString()
      list = list.filter((v) => {
        const s = getWorkflow(v)
        return s.status === 'risk_accepted' && s.riskExpiresAt && s.riskExpiresAt >= nowIso && s.riskExpiresAt <= in7Iso
      })
    }

    if (groupBy === 'none') {
      return { groups: [{ key: null, items: list }] }
    }

    const map = new Map<string, Vulnerability[]>()
    for (const v of list) {
      let key: string
      if (groupBy === 'asset') key = getAssetFromVuln(v).label
      else if (groupBy === 'severity') key = v.severity
      else if (groupBy === 'source') key = v.toolName ? `${v.source}:${v.toolName}` : v.source
      else if (groupBy === 'rootCause') key = computeRootCauseKey(v)
      else if (groupBy === 'owner') key = getWorkflow(v).ownerId || 'Unassigned'
      else key = '—'
      const arr = map.get(key) || []
      arr.push(v)
      map.set(key, arr)
    }

    const groups = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, items }))
    return { groups }
  }, [vulnerabilities, searchQuery, statusFilter, overdueFilter, assetFilter, groupBy, activeViewType, getWorkflow])

  const uniqueAssets = useMemo(() => {
    const set = new Set(vulnerabilities.map((v) => getAssetFromVuln(v).label))
    return Array.from(set).filter((a) => a !== '—').sort()
  }, [vulnerabilities])

  if (!projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.noProject}>
          <h2>No Project Selected</h2>
          <p>Select a project from the dropdown in the header to view vulnerabilities.</p>
        </div>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <div className={styles.titleSection}>
              <Skeleton variant="avatar" width={24} height={24} />
              <Skeleton variant="title" width={180} />
            </div>
          </div>
          <div className={styles.stats}>
            <Skeleton variant="card" height={80} />
            <Skeleton variant="card" height={80} />
            <Skeleton variant="card" height={80} />
            <Skeleton variant="card" height={80} />
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.tableWrapper}>
            <Skeleton variant="card" height={400} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>Error: {error}</div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.titleSection}>
            <ShieldCheck size={24} />
            <h1>Vulnerabilities</h1>
            {stats && <span className={styles.badge}>{stats.total}</span>}
          </div>
          <div className={styles.headerActions}>
            <select
              className={styles.savedViewSelect}
              value={activeViewType || ''}
              onChange={(e) => {
                const v = e.target.value
                setActiveViewType(v || null)
                const fj = viewFilterMap.get(v)
                if (fj) {
                  setSeverityFilter(fj.severity ?? null)
                  setStatusFilter(fj.status ?? null)
                  setOverdueFilter(fj.overdue ?? false)
                } else {
                  const view = savedViews.find(
                    (s) => (s.filterJson as { viewType?: string }).viewType === v || ((s.filterJson as { overdue?: boolean }).overdue && v === 'overdue') || s.name === v
                  )
                  if (view) {
                    const fj = view.filterJson as { severity?: string; status?: string; overdue?: boolean }
                    setSeverityFilter(fj.severity ?? null)
                    setStatusFilter(fj.status ?? null)
                    setOverdueFilter(fj.overdue ?? false)
                  } else {
                    setSeverityFilter(null)
                    setStatusFilter(null)
                    setOverdueFilter(false)
                  }
                }
              }}
            >
              <option value="">Saved views</option>
              {savedViews.map((view) => {
                const fj = view.filterJson as { viewType?: string; status?: string; overdue?: boolean }
                const val = fj.viewType || (fj.overdue ? 'overdue' : view.name)
                return (
                  <option key={view.name} value={val}>
                    {view.name}
                  </option>
                )
              })}
            </select>
            <a
              href={`/api/vulnerabilities/export?projectId=${projectId}&format=markdown${severityFilter ? `&severity=${severityFilter}` : ''}${sourceFilter ? `&source=${sourceFilter}` : ''}`}
              className={styles.exportLink}
              download
            >
              <Download size={14} />
              Export
            </a>
            {projectId && (
              <Link href={`/secrets?project=${projectId}`} className={styles.secretsLink}>
                <Key size={14} />
                GitHub Secrets & AI Attack Surface →
              </Link>
            )}
          </div>
        </div>

        {stats && (
          <div className={styles.stats}>
            <div
              className={styles.statCard}
              style={{ borderColor: SEVERITY_COLORS.critical }}
              onClick={() => setSeverityFilter((s) => (s === 'critical' ? null : 'critical'))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSeverityFilter((s) => (s === 'critical' ? null : 'critical'))}
            >
              <span className={styles.statLabel}>Critical</span>
              <span className={styles.statValue}>{stats.bySeverity.critical}</span>
            </div>
            <div
              className={styles.statCard}
              style={{ borderColor: SEVERITY_COLORS.high }}
              onClick={() => setSeverityFilter((s) => (s === 'high' ? null : 'high'))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSeverityFilter((s) => (s === 'high' ? null : 'high'))}
            >
              <span className={styles.statLabel}>High</span>
              <span className={styles.statValue}>{stats.bySeverity.high}</span>
            </div>
            <div
              className={styles.statCard}
              style={{ borderColor: SEVERITY_COLORS.medium }}
              onClick={() => setSeverityFilter((s) => (s === 'medium' ? null : 'medium'))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSeverityFilter((s) => (s === 'medium' ? null : 'medium'))}
            >
              <span className={styles.statLabel}>Medium</span>
              <span className={styles.statValue}>{stats.bySeverity.medium}</span>
            </div>
            <div
              className={styles.statCard}
              style={{ borderColor: SEVERITY_COLORS.low }}
              onClick={() => setSeverityFilter((s) => (s === 'low' ? null : 'low'))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setSeverityFilter((s) => (s === 'low' ? null : 'low'))}
            >
              <span className={styles.statLabel}>Low</span>
              <span className={styles.statValue}>{stats.bySeverity.low}</span>
            </div>
          </div>
        )}

        {trends && trends.weekly.length > 0 && (
          <div className={styles.trendWidget}>
            <span className={styles.trendLabel}>New vs fixed (4w)</span>
            <div className={styles.trendBars}>
              {trends.weekly.map((w) => (
                <div key={w.weekStart} className={styles.trendBarGroup} title={`${w.weekStart}: ${w.newCount} new, ${w.fixedCount} fixed`}>
                  <div
                    className={styles.trendBar}
                    style={{ height: `${Math.min(80, w.newCount * 10 + 4)}px` }}
                  />
                  <div
                    className={styles.trendBarFixed}
                    style={{ height: `${Math.min(80, w.fixedCount * 10 + 4)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className={styles.trendLegend}>
              <span><span className={styles.trendDotNew} /> New</span>
              <span><span className={styles.trendDotFixed} /> Fixed</span>
            </div>
          </div>
        )}

        <div className={styles.controls}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by issue or asset name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filterChips}>
            <span className={styles.chipLabel}>Severity:</span>
            {['critical', 'high', 'medium', 'low'].map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.chip} ${severityFilter === s ? styles.chipActive : ''}`}
                onClick={() => setSeverityFilter((prev) => (prev === s ? null : s))}
              >
                {s}
              </button>
            ))}
            <span className={styles.chipLabel}>Status:</span>
            {['open', 'in_progress', 'fixed'].map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.chip} ${statusFilter === s ? styles.chipActive : ''}`}
                onClick={() => setStatusFilter((prev) => (prev === s ? null : s))}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
            {uniqueAssets.length > 0 && (
              <>
                <span className={styles.chipLabel}>Asset:</span>
                <select
                  value={assetFilter || ''}
                  onChange={(e) => setAssetFilter(e.target.value || null)}
                  className={styles.chipSelect}
                >
                  <option value="">All</option>
                  {uniqueAssets.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </>
            )}
            <span className={styles.chipLabel}>Source:</span>
            <select
              value={sourceFilter || ''}
              onChange={(e) => setSourceFilter(e.target.value || null)}
              className={styles.chipSelect}
            >
              <option value="">All</option>
              {stats?.bySource &&
                Object.entries(stats.bySource)
                  .filter(([, count]) => count > 0)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([sourceKey]) => (
                    <option key={sourceKey} value={sourceKey}>
                      {sourceKey.replace('custom:', 'Custom: ')}
                    </option>
                  ))}
            </select>
          </div>

          <div className={styles.groupByRow}>
            <label htmlFor="group-by" className={styles.groupByLabel}>
              Group by:
            </label>
            <select
              id="group-by"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
              className={styles.groupBySelect}
            >
              <option value="none">None</option>
              <option value="asset">Asset</option>
              <option value="severity">Severity</option>
              <option value="source">Source</option>
              <option value="rootCause">Root cause</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selectedIds.size} selected</span>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => setBulkModal('status')}
          >
            Change status
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => setBulkModal('assign')}
          >
            Assign
          </button>
          <a
            href={`/api/vulnerabilities/export?projectId=${projectId}&format=csv&vulnIds=${encodeURIComponent(Array.from(selectedIds).join(','))}`}
            className={styles.bulkBtn}
            download
          >
            Export selected
          </a>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={async () => {
              if (!projectId || selectedIds.size === 0) return
              try {
                const res = await fetch(`/api/findings/${projectId}/bulk`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-User-Id': userId ?? 'system' },
                  body: JSON.stringify({
                    vulnIds: Array.from(selectedIds), // uses findingKey when available
                    status: 'false_positive',
                    fpReason: 'Bulk marked via UI',
                  }),
                })
                if (res.ok) {
                  refetchVulnerabilities()
                  setSelectedIds(new Set())
                }
              } catch {
                // ignore
              }
            }}
          >
            Mark false positive
          </button>
          <button
            type="button"
            className={styles.bulkBtn}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <div className={styles.content}>
        {filteredAndGrouped.groups.every((g) => g.items.length === 0) ? (
          <div className={styles.empty}>
            <ShieldCheck size={48} />
            <h2>No Vulnerabilities Found</h2>
            {data?.scanStatus?.skipped ? (
              <>
                <p className={styles.warningText}>
                  <strong>Vulnerability scan was skipped:</strong>{' '}
                  {data.scanStatus.skipReason || 'Unknown reason'}
                </p>
                <p className={styles.infoText}>
                  Modules executed: {data.scanStatus.modulesExecuted.join(', ') || 'None'}
                </p>
                {data.scanStatus.skipReason?.toLowerCase().includes('neo4j') ? (
                  <div className={styles.infoText}>
                    <p style={{ marginBottom: '0.5rem' }}>
                      <strong>Quick fix (local dev):</strong>
                    </p>
                    <ol className={styles.fixSteps}>
                      <li>
                        Start Neo4j:{' '}
                        <code>docker compose up -d neo4j</code>
                      </li>
                      <li>
                        Create <code>webapp/.env.local</code> with:
                        <pre className={styles.envBlock}>
{`NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme123`}
                        </pre>
                        Or copy: <code>cp webapp/.env.local.example webapp/.env.local</code>
                      </li>
                      <li>Restart the webapp (<code>npm run dev</code>)</li>
                    </ol>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>
                      Verify: <code>curl -s http://localhost:3000/api/health</code> should return{' '}
                      <code>{'"neo4j":"ok"'}</code>
                    </p>
                  </div>
                ) : (
                  <p className={styles.infoText}>
                    The vulnerability scanner requires live HTTP targets to scan. Ensure your target
                    domain is accessible and has open ports.
                  </p>
                )}
              </>
            ) : (
              <p>
                {vulnerabilities.length === 0
                  ? 'Run a vulnerability scan to discover security issues.'
                  : 'No findings match your filters. Try widening your search.'}
              </p>
            )}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            {filteredAndGrouped.groups.map(({ key, items }) => (
              <div key={key ?? '_'} className={styles.tableGroup}>
                {groupBy !== 'none' && key && (
                  <h3 className={styles.groupHeader}>{key}</h3>
                )}
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkboxCol}>
                        <input
                          type="checkbox"
                          checked={
                            items.length > 0 &&
                            items.every((v) => selectedIds.has(getVulnKey(v)))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => new Set([...prev, ...items.map((v) => getVulnKey(v))]))
                            } else {
                              setSelectedIds((prev) => {
                                const next = new Set(prev)
                                items.forEach((v) => next.delete(getVulnKey(v)))
                                return next
                              })
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select all in group"
                        />
                      </th>
                      <th>Issue</th>
                      <th>Severity</th>
                      <th>Confidence</th>
                      <th>Asset</th>
                      <th>Entrypoint</th>
                      <th>Source</th>
                      <th>Discovered</th>
                      <th>Last seen</th>
                      <th>Status</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((vuln) => {
                      const w = getWorkflow(vuln)
                      const asset = getAssetFromVuln(vuln)
                      const occCount = rootCauseCounts.get(vuln.id) ?? 1
                      const formatDate = (iso: string | null) =>
                        iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
                      return (
                        <tr
                          key={vuln.id}
                          className={`${styles.rowClickable} ${selectedIds.has(getVulnKey(vuln)) ? styles.rowSelected : ''}`}
                          onClick={() => setPreviewVuln(vuln)}
                          onDoubleClick={() =>
                            projectId && router.push(`/vulnerabilities/${projectId}/${getVulnKey(vuln)}`)
                          }
                        >
                          <td
                            className={styles.checkboxCol}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(getVulnKey(vuln))}
                              onChange={(e) => {
                                const key = getVulnKey(vuln)
                                if (e.target.checked) {
                                  setSelectedIds((prev) => new Set([...prev, key]))
                                } else {
                                  setSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    next.delete(key)
                                    return next
                                  })
                                }
                              }}
                              aria-label={`Select ${vuln.name}`}
                            />
                          </td>
                          <td>
                            <div className={styles.issueCell}>
                              <span className={styles.issueName}>{vuln.name}</span>
                              {vuln.category && (
                                <span className={styles.subtypeTag}>{vuln.category}</span>
                              )}
                              {occCount > 1 && (
                                <span className={styles.occurrencesBadge}>{occCount} occurrences</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={styles.severityPill}
                              style={{
                                backgroundColor: SEVERITY_COLORS[vuln.severity] || SEVERITY_COLORS.info,
                              }}
                            >
                              {SEVERITY_ICONS[vuln.severity]}
                              {vuln.severity.toUpperCase()}
                            </span>
                          </td>
                          <td className={styles.mutedCell}>{getConfidenceDisplay(vuln)}</td>
                          <td
                            className={styles.monoCell}
                            title={asset.inferred ? `Derived from: ${asset.source}` : undefined}
                          >
                            {asset.label}
                            {asset.inferred && <span className={styles.assetInferred} />}
                          </td>
                          <td className={styles.monoCell}>{getEntrypointDisplay(vuln)}</td>
                          <td>
                            {vuln.toolName ? `${vuln.source} (${vuln.toolName})` : vuln.source}
                          </td>
                          <td className={styles.mutedCell}>{formatDate(w.firstSeenAt)}</td>
                          <td className={styles.mutedCell}>{formatDate(w.lastSeenAt)}</td>
                          <td>
                            <span className={`${styles.statusPill} ${w.overdue ? styles.overdue : ''}`}>
                              {w.status.replace('_', ' ')}
                              {w.overdue && ' (overdue)'}
                            </span>
                          </td>
                          <td className={styles.mutedCell}>{w.ownerId || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {bulkModal === 'status' && (
        <div className={styles.modalOverlay} onClick={() => setBulkModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h4>Bulk change status</h4>
            <select
              value={bulkStatusValue}
              onChange={(e) => setBulkStatusValue(e.target.value)}
              className={styles.modalSelect}
            >
              {['open', 'in_progress', 'fixed', 'verified', 'risk_accepted', 'false_positive'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalBtnSecondary} onClick={() => setBulkModal(null)}>Cancel</button>
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={async () => {
                  if (!projectId || selectedIds.size === 0) return
                  try {
                    const res = await fetch(`/api/findings/${projectId}/bulk`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId ?? 'system' },
                      body: JSON.stringify({ vulnIds: Array.from(selectedIds), status: bulkStatusValue }),
                    })
                    if (res.ok) {
                      refetchVulnerabilities()
                      setSelectedIds(new Set())
                      setBulkModal(null)
                    }
                  } catch { /* ignore */ }
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal === 'assign' && (
        <div className={styles.modalOverlay} onClick={() => setBulkModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h4>Bulk assign owner</h4>
            <input
              type="text"
              placeholder="Name or email"
              value={bulkAssignValue}
              onChange={(e) => setBulkAssignValue(e.target.value)}
              className={styles.modalInput}
            />
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalBtnSecondary} onClick={() => setBulkModal(null)}>Cancel</button>
              <button
                type="button"
                className={styles.modalBtnPrimary}
                onClick={async () => {
                  if (!projectId || selectedIds.size === 0) return
                  try {
                    const res = await fetch(`/api/findings/${projectId}/bulk`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId ?? 'system' },
                      body: JSON.stringify({ vulnIds: Array.from(selectedIds), ownerId: bulkAssignValue.trim() || null }),
                    })
                    if (res.ok) {
                      refetchVulnerabilities()
                      setSelectedIds(new Set())
                      setBulkAssignValue('')
                      setBulkModal(null)
                    }
                  } catch { /* ignore */ }
                }}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {projectId && (
        <VulnPreviewDrawer
          vulnerability={previewVuln}
          projectId={projectId}
          userId={userId ?? undefined}
          workflow={previewVuln ? getWorkflow(previewVuln) : undefined}
          onUpdate={
            previewVuln
              ? (updates) => updateState(previewVuln.findingKey ?? previewVuln.id, updates, userId ?? undefined)
              : undefined
          }
          isOpen={!!previewVuln}
          onClose={() => setPreviewVuln(null)}
          onStatusChange={refetchVulnerabilities}
        />
      )}
    </div>
  )
}

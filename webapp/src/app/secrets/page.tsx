'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useProject } from '@/providers/ProjectProvider'
import {
  Key,
  AlertTriangle,
  AlertCircle,
  Info,
  Filter,
  Github,
  ExternalLink,
} from 'lucide-react'
import { Drawer } from '@/components/ui'
import styles from './page.module.css'

interface GitHubFinding {
  id: string
  repository: string
  path: string
  line: number
  secretType: string
  findingType: string
  provider: string
  severity: string
  secretValue?: string
  pattern?: string
  commitSha?: string
  scanTimestamp?: string
}

interface GitHubStats {
  totalFindings: number
  lastScanTimestamp?: string | null
  lastScan?: string | null
  bySeverity: Record<string, number>
  bySecretType: Record<string, number>
  byFindingType: Record<string, number>
  byProvider: Record<string, number>
  aiLlmSecretsCount: number
  aiLlmUsageCount: number
  reposWithAiUsage: number
}

interface PageInfo {
  limit: number
  offset: number
  hasMore: boolean
  totalApprox: number
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

function gitHubFileUrl(repo: string, path: string, line?: number): string {
  const encoded = encodeURIComponent(path).replace(/%2F/g, '/')
  const branch = 'main'
  const url = `https://github.com/${repo}/blob/${branch}/${encoded}`
  return line ? `${url}#L${line}` : url
}

function parseFiltersFromUrl(searchParams: URLSearchParams) {
  return {
    severity: searchParams.get('severity') || null,
    findingType: searchParams.get('findingType') || null,
    secretType: searchParams.get('secretType') || null,
    provider: searchParams.get('provider') || null,
    q: searchParams.get('q') || '',
    id: searchParams.get('id') || null,
  }
}

export default function SecretsPage() {
  const { projectId } = useProject()
  const searchParams = useSearchParams()
  const router = useRouter()
  const urlFilters = parseFiltersFromUrl(searchParams)
  const findingIdFromUrl = searchParams.get('id')
  const [findings, setFindings] = useState<GitHubFinding[]>([])
  const [stats, setStats] = useState<GitHubStats | null>(null)
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string | null>(urlFilters.severity)
  const [findingTypeFilter, setFindingTypeFilter] = useState<string | null>(urlFilters.findingType)
  const [secretTypeFilter, setSecretTypeFilter] = useState<string | null>(urlFilters.secretType)
  const [providerFilter, setProviderFilter] = useState<string | null>(urlFilters.provider)
  const [repoSearch, setRepoSearch] = useState(urlFilters.q)
  const [clientSeverityFilter, setClientSeverityFilter] = useState<'critical_high' | null>(null)
  const [selectedFinding, setSelectedFinding] = useState<GitHubFinding | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle')

  // Sync URL -> state when URL changes (e.g. deep link, back navigation)
  useEffect(() => {
    const f = parseFiltersFromUrl(searchParams)
    setSeverityFilter(f.severity)
    setFindingTypeFilter(f.findingType)
    setSecretTypeFilter(f.secretType)
    setProviderFilter(f.provider)
    setRepoSearch(f.q)
  }, [searchParams])

  const clearAllFilters = useCallback(() => {
    setSeverityFilter(null)
    setFindingTypeFilter(null)
    setSecretTypeFilter(null)
    setProviderFilter(null)
    setRepoSearch('')
    setClientSeverityFilter(null)
    const params = new URLSearchParams(searchParams.toString())
    ;['severity', 'findingType', 'secretType', 'provider', 'q'].forEach((k) => params.delete(k))
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
  }, [router, searchParams])

  // Sync state -> URL when filters change (for shareable URLs). Preserve id, project.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (severityFilter) params.set('severity', severityFilter)
    else params.delete('severity')
    if (findingTypeFilter) params.set('findingType', findingTypeFilter)
    else params.delete('findingType')
    if (secretTypeFilter) params.set('secretType', secretTypeFilter)
    else params.delete('secretType')
    if (providerFilter) params.set('provider', providerFilter)
    else params.delete('provider')
    if (repoSearch.trim()) params.set('q', repoSearch.trim())
    else params.delete('q')
    const qs = params.toString()
    const current = searchParams.toString()
    if (qs !== current) {
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
    }
  }, [severityFilter, findingTypeFilter, secretTypeFilter, providerFilter, repoSearch, router, searchParams])

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }

    const fetchFindings = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams({
          projectId,
          limit: '200',
          offset: '0',
        })
        // When clientSeverityFilter is active, don't send severity to API (filter client-side)
        const apiSeverity = clientSeverityFilter ? null : severityFilter
        if (apiSeverity) params.append('severity', apiSeverity)
        if (findingTypeFilter) params.append('findingType', findingTypeFilter)
        if (secretTypeFilter) params.append('secretType', secretTypeFilter)
        if (providerFilter) params.append('provider', providerFilter)
        if (repoSearch.trim()) params.append('repo', repoSearch.trim())

        const [findingsRes, statsRes] = await Promise.all([
          fetch(`/api/github-findings?${params}`),
          fetch(`/api/github-stats?projectId=${projectId}`),
        ])

        if (!findingsRes.ok) {
          const errData = await findingsRes.json().catch(() => ({}))
          if (findingsRes.status === 401) throw new Error('unauthorized')
          if (findingsRes.status === 403) throw new Error('Project not found or you don\'t have access')
          if (findingsRes.status === 429) throw new Error('rate_limited')
          throw new Error(errData.message || 'Failed to fetch findings')
        }
        if (!statsRes.ok) {
          const errData = await statsRes.json().catch(() => ({}))
          if (statsRes.status === 401) throw new Error('unauthorized')
          if (statsRes.status === 403) throw new Error('Project not found or you don\'t have access')
          if (statsRes.status === 429) throw new Error('rate_limited')
          throw new Error(errData.message || 'Failed to fetch stats')
        }

        const findingsData = await findingsRes.json()
        const statsData = await statsRes.json()

        setFindings(findingsData.findings || [])
        setPageInfo(findingsData.pageInfo || null)
        setStats(statsData)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchFindings()
    const interval = setInterval(fetchFindings, 15000)
    return () => clearInterval(interval)
  }, [projectId, severityFilter, findingTypeFilter, secretTypeFilter, providerFilter, repoSearch, clientSeverityFilter])

  // Deep link: select finding when id matches URL
  useEffect(() => {
    if (!findingIdFromUrl || findings.length === 0) return
    const match = findings.find((f) => f.id === findingIdFromUrl)
    if (match) setSelectedFinding(match)
  }, [findingIdFromUrl, findings])

  // Reset copy status when switching to a different finding
  useEffect(() => {
    setCopyStatus('idle')
  }, [selectedFinding?.id])

  const handleCopySecret = async (findingId: string) => {
    if (!projectId) return
    setCopyStatus('copying')
    try {
      const res = await fetch(
        `/api/github-findings/reveal?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(findingId)}`
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to reveal secret')
      }
      const { secretValue } = await res.json()
      await navigator.clipboard.writeText(secretValue || '')
      setCopyStatus('success')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 2000)
    }
  }

  if (!projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.noProject}>
          <Key size={48} />
          <h2>No Project Selected</h2>
          <p>
            Select a project from the dropdown in the header to view GitHub
            secrets and findings.
          </p>
        </div>
      </div>
    )
  }

  if (loading && !stats) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading GitHub findings...</div>
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

  const criticalHigh =
    (stats?.bySeverity.critical || 0) + (stats?.bySeverity.high || 0)

  const displayedFindings =
    clientSeverityFilter === 'critical_high'
      ? findings.filter(
          (f) => f.severity === 'critical' || f.severity === 'high'
        )
      : findings

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <Key size={24} />
          <h1>GitHub Secrets & AI Attack Surface</h1>
          {stats && (
            <span className={styles.badge}>{stats.totalFindings}</span>
          )}
        </div>
        <p className={styles.subtitle}>
          Secrets, AI usage, and high-entropy candidates discovered in your
          GitHub org for this project.
        </p>

        {stats && (
          <div className={styles.stats}>
            <div
              className={`${styles.statCard} ${styles.statCardClickable}`}
              style={{ borderColor: SEVERITY_COLORS.critical }}
              onClick={clearAllFilters}
            >
              <span className={styles.statLabel}>Total Secrets</span>
              <span className={styles.statValue}>
                {stats.totalFindings}
              </span>
            </div>
            <div
              className={`${styles.statCard} ${styles.statCardClickable}`}
              style={{ borderColor: SEVERITY_COLORS.high }}
              onClick={() => {
                setClientSeverityFilter(
                  clientSeverityFilter === 'critical_high' ? null : 'critical_high'
                )
                setSeverityFilter(null)
              }}
            >
              <span className={styles.statLabel}>Critical & High</span>
              <span className={styles.statValue}>{criticalHigh}</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>AI/LLM Secrets</span>
              <span className={styles.statValue}>
                {stats.aiLlmSecretsCount}
              </span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>AI Usage (no keys)</span>
              <span className={styles.statValue}>
                {stats.aiLlmUsageCount} in {stats.reposWithAiUsage} repos
              </span>
            </div>
          </div>
        )}

        <div className={styles.filters}>
          <Filter size={16} />
          <select
            value={severityFilter || ''}
            onChange={(e) => {
              setSeverityFilter(e.target.value || null)
              setClientSeverityFilter(null)
            }}
            className={styles.filterSelect}
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <select
            value={findingTypeFilter || ''}
            onChange={(e) => setFindingTypeFilter(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All Types</option>
            <option value="SECRET">Secret</option>
            <option value="HIGH_ENTROPY">High Entropy</option>
            <option value="SENSITIVE_FILE">Sensitive File</option>
            <option value="AI_LLM_USAGE">AI/LLM Usage</option>
          </select>
          <select
            value={secretTypeFilter || ''}
            onChange={(e) => setSecretTypeFilter(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All Secret Types</option>
            {stats?.bySecretType &&
              Object.keys(stats.bySecretType)
                .sort()
                .map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
          </select>
          <select
            value={providerFilter || ''}
            onChange={(e) => setProviderFilter(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All Providers</option>
            {stats?.byProvider &&
              Object.keys(stats.byProvider)
                .filter((p) => p && p !== 'null' && p !== 'undefined')
                .sort()
                .map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
          </select>
          <input
            type="text"
            placeholder="Filter by repo or path..."
            value={repoSearch}
            onChange={(e) => setRepoSearch(e.target.value)}
            className={styles.filterInput}
          />
          {clientSeverityFilter === 'critical_high' && (
            <span className={styles.filterPill} title="Client-side filter">
              Severity: Critical + High (client)
            </span>
          )}
        </div>
      </div>

      <div className={styles.content}>
        {displayedFindings.length === 0 ? (
          <div className={styles.empty}>
            <Key size={48} />
            <h2>No GitHub Findings</h2>
            <p>
              {stats?.lastScan || stats?.lastScanTimestamp
                ? 'No findings match your filters.' 
                : 'Run a GitHub secret scan to discover exposed secrets and credentials.'}
            </p>
            <p className={styles.subtitle}>
              Configure GitHub target org and token in Project Settings, then add
              &quot;github&quot; to scan modules and run Recon.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Secret Type</th>
                  <th>Provider</th>
                  <th>Repository</th>
                  <th>Path:Line</th>
                  <th>Secret Value</th>
                  <th>Commit</th>
                </tr>
              </thead>
              <tbody>
                {displayedFindings.map((f) => (
                  <tr
                    key={f.id}
                    className={styles.rowClickable}
                    onClick={() => {
                      setSelectedFinding(f)
                      const params = new URLSearchParams(searchParams.toString())
                      params.set('id', f.id)
                      router.replace(`?${params.toString()}`, { scroll: false })
                    }}
                  >
                    <td>
                      <span
                        className={styles.severityBadge}
                        style={{
                          backgroundColor:
                            SEVERITY_COLORS[f.severity] ||
                            SEVERITY_COLORS.info,
                        }}
                      >
                        {SEVERITY_ICONS[f.severity] || SEVERITY_ICONS.info}
                        {(f.severity || 'info').toUpperCase()}
                      </span>
                    </td>
                    <td>{f.findingType}</td>
                    <td>{f.secretType}</td>
                    <td>{f.provider || '-'}</td>
                    <td>
                      <a
                        href={`https://github.com/${f.repository}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.githubLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {f.repository}
                        <ExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                      </a>
                    </td>
                    <td>
                      <a
                        href={gitHubFileUrl(f.repository, f.path, f.line)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.githubLink}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {f.path}
                        {f.line ? `:${f.line}` : ''}
                        <ExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                      </a>
                    </td>
                    <td>
                      <span
                        className={styles.secretValue}
                        title={f.secretValue || ''}
                      >
                        {f.secretValue || '-'}
                      </span>
                    </td>
                    <td>
                      {f.commitSha ? (
                        <a
                          href={`https://github.com/${f.repository}/commit/${f.commitSha}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.githubLink}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {String(f.commitSha).slice(0, 7)}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        isOpen={!!selectedFinding}
        onClose={() => {
          setSelectedFinding(null)
          const params = new URLSearchParams(searchParams.toString())
          params.delete('id')
          const qs = params.toString()
          router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false })
        }}
        position="right"
        mode="overlay"
        width="420px"
        title={
          selectedFinding ? (
            <span>
              <strong>{selectedFinding.secretType}</strong> in{' '}
              {selectedFinding.repository}
            </span>
          ) : undefined
        }
      >
        {selectedFinding && (
          <div className={styles.drawerContent}>
            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>Location</div>
              <div>
                <strong>Repository:</strong>{' '}
                <a
                  href={`https://github.com/${selectedFinding.repository}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.githubLink}
                >
                  {selectedFinding.repository}
                  <Github size={14} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                </a>
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>Path:</strong>{' '}
                <a
                  href={gitHubFileUrl(
                    selectedFinding.repository,
                    selectedFinding.path,
                    selectedFinding.line
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.githubLink}
                >
                  {selectedFinding.path}
                  {selectedFinding.line ? `:${selectedFinding.line}` : ''}
                </a>
              </div>
            </div>

            <div className={styles.drawerSection}>
              <div className={styles.drawerSectionTitle}>Details</div>
              <div>
                <strong>Severity:</strong>{' '}
                <span
                  className={styles.severityBadge}
                  style={{
                    backgroundColor:
                      SEVERITY_COLORS[selectedFinding.severity] ||
                      SEVERITY_COLORS.info,
                  }}
                >
                  {selectedFinding.severity}
                </span>
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Type:</strong> {selectedFinding.findingType}
              </div>
              <div style={{ marginTop: 4 }}>
                <strong>Provider:</strong> {selectedFinding.provider || '-'}
              </div>
            </div>

            {selectedFinding.secretValue && (
              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>Secret Value</div>
                <p className={styles.drawerSubtitle}>
                  Displayed masked. Copy fetches the actual value for clipboard.
                </p>
                <div className={styles.drawerValue}>
                  {selectedFinding.secretValue}
                </div>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => handleCopySecret(selectedFinding.id)}
                  disabled={copyStatus === 'copying'}
                >
                  {copyStatus === 'copying'
                    ? 'Copying...'
                    : copyStatus === 'success'
                      ? 'Copied!'
                      : copyStatus === 'error'
                        ? 'Copy failed'
                        : 'Copy to clipboard'}
                </button>
              </div>
            )}

            {selectedFinding.scanTimestamp && (
              <div className={styles.drawerSection}>
                <div className={styles.drawerSectionTitle}>Scanned</div>
                <div>{selectedFinding.scanTimestamp}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

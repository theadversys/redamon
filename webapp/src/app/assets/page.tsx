'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/providers/ProjectProvider'
import {
  Server, Globe, Network, Shield, AlertTriangle, ChevronUp, ChevronDown,
  Search, RefreshCw, ExternalLink, Filter, Database,
} from 'lucide-react'
import styles from './assets.module.css'
import type { AssetRow } from '@/app/api/assets/route'

// ─── Types ────────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'type' | 'openPorts' | 'vulnCount' | 'lastSeen'
type SortDir = 'asc' | 'desc'
type FilterType = 'all' | 'subdomain' | 'ip' | 'domain'

interface AssetsResponse {
  assets: AssetRow[]
  projectId: string
  target?: string
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function severityBadge(critical: number, high: number) {
  if (critical > 0) return <span className={`${styles.badge} ${styles.badgeCritical}`}>CRITICAL</span>
  if (high > 0) return <span className={`${styles.badge} ${styles.badgeHigh}`}>HIGH</span>
  return null
}

function portPill(port: number, service?: string) {
  const wellKnown: Record<number, string> = {
    21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns',
    80: 'http', 110: 'pop3', 143: 'imap', 443: 'https', 445: 'smb',
    3306: 'mysql', 5432: 'pg', 6379: 'redis', 8080: 'http-alt', 8443: 'https-alt',
    27017: 'mongo', 9200: 'elastic',
  }
  const label = service ?? wellKnown[port] ?? String(port)
  const isRisky = [21, 23, 3306, 5432, 6379, 27017, 9200, 445].includes(port)
  return (
    <span key={port} className={`${styles.portPill} ${isRisky ? styles.portPillRisky : ''}`}>
      {port}<em>{label !== String(port) ? `/${label}` : ''}</em>
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
function AssetsInner() {
  const router = useRouter()
  const { projectId } = useProject()

  const [data, setData] = useState<AssetsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('all')
  const [sortKey, setSortKey] = useState<SortKey>('vulnCount')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchAssets = async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/assets?projectId=${projectId}`)
      const json = (await res.json()) as AssetsResponse
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAssets() }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sorted + filtered list
  const rows = useMemo(() => {
    let list = data?.assets ?? []
    if (typeFilter !== 'all') list = list.filter((a) => a.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.ip ?? '').toLowerCase().includes(q) ||
          a.technologies.some((t) => t.toLowerCase().includes(q))
      )
    }
    return [...list].sort((a, b) => {
      let av: string | number, bv: string | number
      switch (sortKey) {
        case 'name': av = a.name; bv = b.name; break
        case 'type': av = a.type; bv = b.type; break
        case 'openPorts': av = a.openPorts.length; bv = b.openPorts.length; break
        case 'lastSeen': av = a.lastSeen ?? ''; bv = b.lastSeen ?? ''; break
        default: av = a.vulnCount; bv = b.vulnCount
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, typeFilter, search, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
    ) : null

  const selected = selectedId ? rows.find((r) => r.id === selectedId) : null

  // Stats
  const totalVulns = (data?.assets ?? []).reduce((s, a) => s + a.vulnCount, 0)
  const criticalAssets = (data?.assets ?? []).filter((a) => a.criticalCount > 0).length

  if (!projectId) {
    return (
      <div className={styles.empty}>
        <Database size={40} className={styles.emptyIcon} />
        <p>No project selected.</p>
        <p className={styles.hint}>Use the project selector in the top bar to choose a project.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Server size={20} className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Asset Inventory</h1>
            {data?.target && <p className={styles.subtitle}>{data.target}</p>}
          </div>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.btnGhost} onClick={fetchAssets} disabled={loading}>
            <RefreshCw size={14} className={loading ? styles.spin : undefined} />
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className={styles.btnGhost}
            onClick={() => router.push(`/graph?projectId=${projectId}`)}
          >
            <ExternalLink size={14} /> View Graph
          </button>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <Globe size={16} className={styles.statIcon} />
          <span className={styles.statValue}>{data?.assets.length ?? '–'}</span>
          <span className={styles.statLabel}>Total Assets</span>
        </div>
        <div className={styles.statCard}>
          <Network size={16} className={styles.statIcon} />
          <span className={styles.statValue}>
            {(data?.assets ?? []).filter((a) => a.type === 'ip').length}
          </span>
          <span className={styles.statLabel}>IP Addresses</span>
        </div>
        <div className={styles.statCard}>
          <Globe size={16} className={styles.statIcon} />
          <span className={styles.statValue}>
            {(data?.assets ?? []).filter((a) => a.type === 'subdomain').length}
          </span>
          <span className={styles.statLabel}>Subdomains</span>
        </div>
        <div className={styles.statCard} data-risk={criticalAssets > 0 ? 'critical' : undefined}>
          <AlertTriangle size={16} className={styles.statIcon} />
          <span className={styles.statValue}>{totalVulns}</span>
          <span className={styles.statLabel}>Total Findings</span>
        </div>
        <div className={styles.statCard} data-risk={criticalAssets > 0 ? 'critical' : undefined}>
          <Shield size={16} className={styles.statIcon} />
          <span className={styles.statValue}>{criticalAssets}</span>
          <span className={styles.statLabel}>Critical Assets</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Search hostname, IP, technology…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.filters}>
          <Filter size={13} />
          {(['all', 'subdomain', 'ip', 'domain'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${typeFilter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setTypeFilter(f)}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ── Main content: table + side panel ── */}
      <div className={styles.content}>
        <div className={styles.tableWrap}>
          {rows.length === 0 && !loading ? (
            <div className={styles.emptyTable}>
              <Database size={32} className={styles.emptyIcon} />
              <p>No assets found for this project yet.</p>
              <p className={styles.hint}>
                Run a reconnaissance scan to populate the asset inventory.
              </p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('name')} className={styles.sortable}>
                    Asset <SortIcon k="name" />
                  </th>
                  <th onClick={() => toggleSort('type')} className={styles.sortable}>
                    Type <SortIcon k="type" />
                  </th>
                  <th onClick={() => toggleSort('openPorts')} className={styles.sortable}>
                    Open Ports <SortIcon k="openPorts" />
                  </th>
                  <th>Technologies</th>
                  <th onClick={() => toggleSort('vulnCount')} className={styles.sortable}>
                    Findings <SortIcon k="vulnCount" />
                  </th>
                  <th onClick={() => toggleSort('lastSeen')} className={styles.sortable}>
                    Last Seen <SortIcon k="lastSeen" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${styles.row} ${selectedId === row.id ? styles.rowSelected : ''} ${row.criticalCount > 0 ? styles.rowCritical : ''}`}
                    onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                  >
                    <td className={styles.nameCell}>
                      <span className={styles.assetName}>{row.name}</span>
                      {row.ip && row.name !== row.ip && (
                        <span className={styles.ipBadge}>{row.ip}</span>
                      )}
                      {severityBadge(row.criticalCount, row.highCount)}
                    </td>
                    <td>
                      <span className={`${styles.typeBadge} ${styles[`type_${row.type}`]}`}>
                        {row.type}
                      </span>
                    </td>
                    <td className={styles.portsCell}>
                      {row.openPorts.slice(0, 8).map((p) => {
                        const svc = row.services.find((s) => s.port === p)
                        return portPill(p, svc?.service)
                      })}
                      {row.openPorts.length > 8 && (
                        <span className={styles.morePorts}>+{row.openPorts.length - 8}</span>
                      )}
                    </td>
                    <td className={styles.techCell}>
                      {row.technologies.slice(0, 4).map((t) => (
                        <span key={t} className={styles.techTag}>{t}</span>
                      ))}
                      {row.technologies.length > 4 && (
                        <span className={styles.morePorts}>+{row.technologies.length - 4}</span>
                      )}
                    </td>
                    <td>
                      <span className={row.vulnCount > 0 ? styles.vulnCount : styles.noVulns}>
                        {row.vulnCount > 0 ? row.vulnCount : '–'}
                      </span>
                    </td>
                    <td className={styles.dateCell}>
                      {row.lastSeen
                        ? new Date(row.lastSeen).toLocaleDateString()
                        : <span className={styles.dimText}>unknown</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Side panel ── */}
        {selected && (
          <div className={styles.sidePanel}>
            <div className={styles.sidePanelHeader}>
              <strong>{selected.name}</strong>
              <button className={styles.closeBtn} onClick={() => setSelectedId(null)}>✕</button>
            </div>
            <div className={styles.sidePanelBody}>
              {selected.ip && (
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>IP</span>
                  <span>{selected.ip}</span>
                </div>
              )}
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Type</span>
                <span>{selected.type}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Findings</span>
                <span>
                  {selected.vulnCount} total
                  {selected.criticalCount > 0 && `, ${selected.criticalCount} critical`}
                  {selected.highCount > 0 && `, ${selected.highCount} high`}
                </span>
              </div>

              {selected.openPorts.length > 0 && (
                <>
                  <div className={styles.metaLabel} style={{ marginTop: '1rem' }}>
                    Open Ports ({selected.openPorts.length})
                  </div>
                  <div className={styles.serviceTable}>
                    {selected.services.map((s) => (
                      <div key={s.port} className={styles.serviceRow}>
                        <span className={styles.servicePort}>{s.port}/{s.protocol ?? 'tcp'}</span>
                        <span>{s.service ?? '–'}</span>
                        {s.version && <span className={styles.serviceVersion}>{s.version}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {selected.technologies.length > 0 && (
                <>
                  <div className={styles.metaLabel} style={{ marginTop: '1rem' }}>
                    Technologies
                  </div>
                  <div className={styles.techList}>
                    {selected.technologies.map((t) => (
                      <span key={t} className={styles.techTag}>{t}</span>
                    ))}
                  </div>
                </>
              )}

              <div style={{ marginTop: '1.5rem', display: 'flex', gap: '8px' }}>
                <button
                  className={styles.btn}
                  onClick={() =>
                    router.push(`/graph?projectId=${projectId}&highlight=${encodeURIComponent(selected.name)}`)
                  }
                >
                  <ExternalLink size={12} /> View in Graph
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


export default function AssetsPage() {
  return <AssetsInner />
}

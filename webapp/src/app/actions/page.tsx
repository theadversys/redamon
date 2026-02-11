'use client'

import { useState, useEffect } from 'react'
import { useProject } from '@/providers/ProjectProvider'
import { ClipboardList, Activity, Shield, Network, Target, User, Clock, Filter } from 'lucide-react'
import styles from './page.module.css'

interface Action {
  id: string
  type: string
  action: string
  description: string
  status: string
  timestamp: string
  projectId: string
  userId: string
  metadata?: Record<string, any>
}

interface ActionsResponse {
  actions: Action[]
  stats: {
    total: number
    byType: {
      recon: number
      vulnerability: number
      agent: number
      user: number
      other: number
    }
    byStatus: {
      success: number
      error: number
      running: number
      pending: number
    }
  }
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  recon: <Network size={16} />,
  vulnerability: <Shield size={16} />,
  agent: <Activity size={16} />,
  user: <User size={16} />,
  other: <ClipboardList size={16} />,
}

const TYPE_COLORS: Record<string, string> = {
  recon: '#3b82f6',
  vulnerability: '#ef4444',
  agent: '#8b5cf6',
  user: '#10b981',
  other: '#6b7280',
}

const STATUS_COLORS: Record<string, string> = {
  success: '#10b981',
  error: '#ef4444',
  running: '#3b82f6',
  pending: '#eab308',
}

export default function ActionsPage() {
  const { projectId } = useProject()
  const [data, setData] = useState<ActionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }

    const fetchActions = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams({ projectId })
        if (typeFilter) params.append('type', typeFilter)
        if (statusFilter) params.append('status', statusFilter)

        const response = await fetch(`/api/actions?${params}`)
        if (!response.ok) {
          throw new Error('Failed to fetch actions')
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

    fetchActions()
    
    // Refresh every 5 seconds to get new actions
    const interval = setInterval(fetchActions, 5000)
    return () => clearInterval(interval)
  }, [projectId, typeFilter, statusFilter])

  if (!projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.noProject}>
          <h2>No Project Selected</h2>
          <p>Select a project from the dropdown in the header to view actions log.</p>
        </div>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading actions...</div>
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

  const actions = data?.actions || []
  const stats = data?.stats

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <ClipboardList size={24} />
          <h1>Actions Log</h1>
          {stats && <span className={styles.badge}>{stats.total}</span>}
        </div>

        {stats && (
          <div className={styles.stats}>
            <div className={styles.statCard} style={{ borderColor: TYPE_COLORS.recon }}>
              <Network size={20} />
              <div>
                <span className={styles.statLabel}>Recon</span>
                <span className={styles.statValue}>{stats.byType.recon}</span>
              </div>
            </div>
            <div className={styles.statCard} style={{ borderColor: TYPE_COLORS.vulnerability }}>
              <Shield size={20} />
              <div>
                <span className={styles.statLabel}>Vulnerabilities</span>
                <span className={styles.statValue}>{stats.byType.vulnerability}</span>
              </div>
            </div>
            <div className={styles.statCard} style={{ borderColor: TYPE_COLORS.agent }}>
              <Activity size={20} />
              <div>
                <span className={styles.statLabel}>Agent</span>
                <span className={styles.statValue}>{stats.byType.agent}</span>
              </div>
            </div>
            <div className={styles.statCard} style={{ borderColor: TYPE_COLORS.user }}>
              <User size={20} />
              <div>
                <span className={styles.statLabel}>User</span>
                <span className={styles.statValue}>{stats.byType.user}</span>
              </div>
            </div>
          </div>
        )}

        <div className={styles.filters}>
          <Filter size={16} />
          <select
            value={typeFilter || ''}
            onChange={(e) => setTypeFilter(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All Types</option>
            <option value="recon">Recon</option>
            <option value="vulnerability">Vulnerability</option>
            <option value="agent">Agent</option>
            <option value="user">User</option>
            <option value="other">Other</option>
          </select>
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <div className={styles.content}>
        {actions.length === 0 ? (
          <div className={styles.empty}>
            <ClipboardList size={48} />
            <h2>No Actions Found</h2>
            <p>Actions will appear here as you use the system.</p>
          </div>
        ) : (
          <div className={styles.list}>
            {actions.map((action) => (
              <div key={action.id} className={styles.actionCard}>
                <div className={styles.actionHeader}>
                  <div className={styles.actionTitle}>
                    <span
                      className={styles.typeBadge}
                      style={{ backgroundColor: TYPE_COLORS[action.type] || TYPE_COLORS.other }}
                    >
                      {TYPE_ICONS[action.type] || TYPE_ICONS.other}
                      {action.type.toUpperCase()}
                    </span>
                    <h3>{action.action}</h3>
                  </div>
                  <div className={styles.actionMeta}>
                    <span
                      className={styles.statusBadge}
                      style={{ backgroundColor: STATUS_COLORS[action.status] || STATUS_COLORS.pending }}
                    >
                      {action.status.toUpperCase()}
                    </span>
                    <span className={styles.timestamp}>
                      <Clock size={14} />
                      {new Date(action.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>

                {action.description && (
                  <p className={styles.description}>{action.description}</p>
                )}

                {action.metadata && Object.keys(action.metadata).length > 0 && (
                  <div className={styles.metadata}>
                    <strong>Details:</strong>
                    <pre>{JSON.stringify(action.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

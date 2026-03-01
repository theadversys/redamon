'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import {
  ExternalLink,
  Network,
  ShieldCheck,
  Target,
  BarChart3,
  FolderOpen,
} from 'lucide-react'
import { useProject } from '@/providers/ProjectProvider'
import { useProjectById } from '@/hooks'
import styles from './page.module.css'

const AGENT_ZERO_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AGENT_ZERO_URL ||
        `${window.location.origin}/api/a0`)
    : ''

export default function HomePage() {
  const { currentProject, projectId, userId } = useProject()
  const { data: project } = useProjectById(projectId)
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState<{
    vulnTotal: number
    nodeTotal: number
    riskScore: number
    secretsTotal: number
  } | null>(null)
  const [recentActions, setRecentActions] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!projectId) {
      setStats(null)
      setRecentActions([])
      return
    }

    const fetchStats = async () => {
      try {
        const [vulnRes, graphRes, secretRes] = await Promise.all([
          fetch(`/api/vulnerabilities?projectId=${projectId}`),
          fetch(`/api/graph?projectId=${projectId}`),
          fetch(`/api/github-stats?projectId=${projectId}`),
        ])

        let vulnTotal = 0
        let riskScore = 0
        if (vulnRes.ok) {
          const data = await vulnRes.json()
          vulnTotal = data.stats?.total ?? 0
          const sev = data.stats?.bySeverity ?? {}
          riskScore = Math.min(
            100,
            Math.round(
              (sev.critical ?? 0) * 10 +
              (sev.high ?? 0) * 5 +
              (sev.medium ?? 0) * 2 +
              (sev.low ?? 0) * 0.5
            )
          )
        }

        let nodeTotal = 0
        if (graphRes.ok) {
          const data = await graphRes.json()
          nodeTotal = data.nodes?.length ?? 0
        }

        let secretsTotal = 0
        if (secretRes.ok) {
          const data = await secretRes.json()
          secretsTotal = data.totalFindings ?? 0
        }

        setStats({ vulnTotal, nodeTotal, riskScore, secretsTotal })
      } catch {
        // stats stay null
      }
    }

    const fetchActions = async () => {
      try {
        const res = await fetch(`/api/actions?projectId=${projectId}&limit=8`)
        if (res.ok) {
          const data = await res.json()
          setRecentActions(Array.isArray(data) ? data.slice(0, 8) : [])
        }
      } catch {
        // actions stay empty
      }
    }

    fetchStats()
    fetchActions()
  }, [projectId])

  const riskLevel = useMemo(() => {
    const score = stats?.riskScore ?? 0
    if (score > 70) return { label: 'CRITICAL', color: 'var(--status-error)' }
    if (score > 30) return { label: 'ELEVATED', color: 'var(--status-warning)' }
    if (score > 0) return { label: 'NOMINAL', color: 'var(--status-info)' }
    return { label: 'CLEAN', color: 'var(--status-success)' }
  }, [stats])

  const iframeSrc = useMemo(() => {
    if (!AGENT_ZERO_BASE_URL) return ''
    const base = AGENT_ZERO_BASE_URL.replace(/\/$/, '')
    const params = new URLSearchParams()
    if (projectId) params.set('project_id', projectId)
    if (userId) params.set('user_id', userId)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }, [projectId, userId])

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <PanelGroup direction="horizontal" className={styles.panelGroup}>
        {/* Left Pane — Agent Zero Chat */}
        <Panel defaultSize={65} minSize={30} maxSize={85} className={styles.panel}>
          <div className={styles.chatPane}>
            <div className={styles.heroBanner}>
              <div className={styles.heroText}>
                <span className={styles.heroTitle}>Agent Zero</span>
                <span className={styles.heroTagline}>
                  Your autonomous security operations agent. Ask anything.
                </span>
              </div>
            </div>
            <div className={styles.iframeWrapper}>
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
                  <a
                    href={AGENT_ZERO_BASE_URL || 'http://localhost:50001'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.externalLink}
                  >
                    <ExternalLink size={14} />
                    Open Agent Zero in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className={styles.resizeHandle} />

        {/* Right Pane — Context Sidebar */}
        <Panel defaultSize={35} minSize={15} maxSize={70} className={styles.panel}>
          <div className={styles.sidebar}>
            {/* Project Summary */}
            <div className={styles.sidebarSection}>
              <div className={styles.sectionTitle}>Active Project</div>
              {currentProject ? (
                <div className={styles.projectCard}>
                  <div>
                    <div className={styles.projectName}>{currentProject.name}</div>
                    <div className={styles.projectDomain}>{currentProject.targetDomain}</div>
                  </div>
                  {stats && (
                    <>
                      <span
                        className={styles.riskBadge}
                        style={{
                          color: riskLevel.color,
                          background: `color-mix(in srgb, ${riskLevel.color} 12%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${riskLevel.color} 25%, transparent)`,
                        }}
                      >
                        {riskLevel.label} — {stats.riskScore}%
                      </span>
                      <div className={styles.projectStats}>
                        <div className={styles.miniStat}>
                          <span className={styles.miniStatLabel}>Vulns</span>
                          <span className={styles.miniStatValue}>{stats.vulnTotal}</span>
                        </div>
                        <div className={styles.miniStat}>
                          <span className={styles.miniStatLabel}>Nodes</span>
                          <span className={styles.miniStatValue}>{stats.nodeTotal}</span>
                        </div>
                        <div className={styles.miniStat}>
                          <span className={styles.miniStatLabel}>Secrets</span>
                          <span className={styles.miniStatValue}>{stats.secretsTotal}</span>
                        </div>
                        <div className={styles.miniStat}>
                          <span className={styles.miniStatLabel}>Risk</span>
                          <span className={styles.miniStatValue} style={{ color: riskLevel.color }}>
                            {stats.riskScore}%
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className={styles.noProject}>
                  <FolderOpen size={32} className={styles.noProjectIcon} />
                  <p>
                    No project selected. Ask Agent Zero to list your projects or create a new one.
                  </p>
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className={styles.sidebarSection}>
              <div className={styles.sectionTitle}>Recent Activity</div>
              {recentActions.length > 0 ? (
                <div className={styles.activityList}>
                  {recentActions.map((action: any, i: number) => (
                    <div key={action.id || i} className={styles.activityItem}>
                      <div className={styles.activityDot} />
                      <div className={styles.activityContent}>
                        <span className={styles.activityText}>
                          {action.description || action.action || action.type || 'Action performed'}
                        </span>
                        <span className={styles.activityTime}>
                          {action.createdAt
                            ? new Date(action.createdAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyActivity}>
                  {projectId
                    ? 'No recent activity for this project.'
                    : 'Select a project to see activity.'}
                </div>
              )}
            </div>

            {/* Quick Links */}
            <div className={styles.sidebarSection}>
              <div className={styles.sectionTitle}>Quick Links</div>
              <div className={styles.quickLinks}>
                <Link href="/graph" className={styles.quickLink}>
                  <span className={styles.quickLinkIcon}><Network size={14} /></span>
                  Graph Map
                </Link>
                <Link href="/vulnerabilities" className={styles.quickLink}>
                  <span className={styles.quickLinkIcon}><ShieldCheck size={14} /></span>
                  Vulnerabilities
                </Link>
                <Link href="/mitre" className={styles.quickLink}>
                  <span className={styles.quickLinkIcon}><Target size={14} /></span>
                  MITRE ATT&CK
                </Link>
                <Link href="/dashboard" className={styles.quickLink}>
                  <span className={styles.quickLinkIcon}><BarChart3 size={14} /></span>
                  Analytics
                </Link>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

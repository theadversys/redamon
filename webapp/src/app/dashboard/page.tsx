'use client'

import React, { useMemo, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProject } from '@/providers/ProjectProvider'
import {
    ShieldCheck,
    Target,
    Key,
    Network,
    AlertTriangle,
    Activity,
    Server,
    Cpu,
    Github,
    ChevronRight,
    Monitor
} from 'lucide-react'
import {
    useProjectById,
    useReconStatus,
    useTheme
} from '@/hooks'
import { Skeleton } from '@/components/ui'
import styles from './page.module.css'

const MITRE_TACTICS = [
    'Reconnaissance',
    'Resource Dev',
    'Initial Access',
    'Execution',
    'Persistence',
    'Privilege Esc',
    'Defense Evasion',
    'Credential Access',
    'Discovery',
    'Lateral Movement',
    'Collection',
    'Command & Control',
    'Exfiltration',
    'Impact'
]

export default function DashboardPage() {
    const { projectId } = useProject()
    const router = useRouter()
    const { data: project, isLoading: projectLoading } = useProjectById(projectId)
    const { isDark } = useTheme()
    const [mounted, setMounted] = useState(false)

    // Fetch various stats
    const [vulnStats, setVulnStats] = useState<any>(null)
    const [secretStats, setSecretStats] = useState<any>(null)
    const [graphStats, setGraphStats] = useState<any>(null)
    const [loadingStats, setLoadingStats] = useState(true)

    const { state: reconState } = useReconStatus({
        projectId,
        enabled: !!projectId,
    })

    useEffect(() => {
        setMounted(true)
        if (!projectId) return

        const fetchAllStats = async () => {
            setLoadingStats(true)
            try {
                const [vulnRes, secretRes, graphRes] = await Promise.all([
                    fetch(`/api/vulnerabilities?projectId=${projectId}`),
                    fetch(`/api/github-stats?projectId=${projectId}`),
                    fetch(`/api/graph?projectId=${projectId}`)
                ])

                if (vulnRes.ok) {
                    const vulnData = await vulnRes.json()
                    setVulnStats(vulnData.stats)
                }
                if (secretRes.ok) {
                    const secretData = await secretRes.json()
                    setSecretStats(secretData)
                }
                if (graphRes.ok) {
                    const graphData = await graphRes.json()
                    setGraphStats({
                        totalNodes: graphData.nodes?.length || 0,
                        nodesByType: (graphData.nodes || []).reduce((acc: any, node: any) => {
                            acc[node.type] = (acc[node.type] || 0) + 1
                            return acc
                        }, {})
                    })
                }
            } catch (err) {
                console.error('Failed to fetch dashboard stats', err)
            } finally {
                setLoadingStats(false)
            }
        }

        fetchAllStats()
    }, [projectId])

    const riskScore = useMemo(() => {
        if (!vulnStats) return 0
        const { critical = 0, high = 0, medium = 0, low = 0 } = vulnStats.bySeverity
        const score = (critical * 10) + (high * 5) + (medium * 2) + (low * 0.5)
        return Math.min(100, Math.round(score))
    }, [vulnStats])

    const riskLevel = useMemo(() => {
        if (riskScore > 70) return { label: 'CRITICAL RISK', color: 'var(--status-error)', glow: 'var(--color-red-glow-20)' }
        if (riskScore > 30) return { label: 'ELEVATED RISK', color: 'var(--status-warning)', glow: 'var(--color-amber-glow-20)' }
        if (riskScore > 0) return { label: 'NOMINAL RISK', color: 'var(--status-info)', glow: 'var(--color-blue-glow-20)' }
        return { label: 'CLEAN', color: 'var(--status-success)', glow: 'var(--color-green-glow-20)' }
    }, [riskScore])

    if (!mounted) return null

    if (!projectId) {
        return (
            <div className={styles.page}>
                <div className={styles.noProject}>
                    <LayoutDashboardIcon size={48} className={styles.noProjectIcon} />
                    <h2>Command Center Locked</h2>
                    <p>Select a project to initiate tactical oversight.</p>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.page}>
            {/* Atmosphere Glow */}
            <div className={styles.atmosphere} />

            <header className={styles.header}>
                <div className={styles.titleSection}>
                    <div className={styles.statusPulse} style={{ backgroundColor: riskLevel.color, boxShadow: `0 0 10px ${riskLevel.glow}` }} />
                    <div>
                        <h1>Command Center</h1>
                        <p className={styles.subtitle}>
                            Operational Status: <span style={{ color: riskLevel.color }}>{riskLevel.label}</span> • Project: {project?.name || '...'}
                        </p>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.timeSection}>
                        <Activity size={14} className={styles.pulseIcon} />
                        <span>REAL-TIME MONITORING ACTIVE</span>
                    </div>
                </div>
            </header>

            <div className={styles.grid}>
                {/* Top Feature Stats */}
                <div className={styles.statRow}>
                    <StatCard
                        label="Security Risk Score"
                        value={riskScore}
                        unit="%"
                        icon={<ShieldCheck />}
                        loading={loadingStats}
                        color={riskLevel.color}
                        progress={riskScore}
                    />
                    <StatCard
                        label="Total Intelligence Nodes"
                        value={graphStats?.totalNodes}
                        icon={<Network />}
                        loading={loadingStats}
                        href="/graph"
                    />
                    <StatCard
                        label="Vulnerabilities Found"
                        value={vulnStats?.total}
                        icon={<AlertTriangle />}
                        loading={loadingStats}
                        color={vulnStats?.bySeverity.critical > 0 ? 'var(--status-error)' : undefined}
                        href="/vulnerabilities"
                    />
                    <StatCard
                        label="Exposed Secrets"
                        value={secretStats?.totalFindings}
                        icon={<Key />}
                        loading={loadingStats}
                        color={secretStats?.totalFindings > 0 ? 'var(--status-error)' : undefined}
                        href="/secrets"
                    />
                </div>

                {/* Visual Charts Section */}
                <div className={styles.mainGrid}>
                    <div className={styles.mainColumn}>
                        <GlassCard title="Vulnerability Distribution" icon={<AlertTriangle />} href="/vulnerabilities">
                            <div className={styles.chartWrapper}>
                                {loadingStats ? <Skeleton height={200} /> : (
                                    <VulnerabilityChart stats={vulnStats?.bySeverity} />
                                )}
                            </div>
                        </GlassCard>

                        <GlassCard title="Asset Topology Breakdown" icon={<Server />} href="/graph">
                            <div className={styles.nodeGrid}>
                                {loadingStats ? <Skeleton height={150} /> : (
                                    Object.entries(graphStats?.nodesByType || {}).map(([type, count]: [any, any]) => (
                                        <div key={type} className={styles.nodeItem}>
                                            <span className={styles.nodeType}>{type}</span>
                                            <div className={styles.nodeBarContainer}>
                                                <div
                                                    className={styles.nodeBar}
                                                    style={{ width: `${Math.min(100, (count / graphStats.totalNodes) * 100)}%` }}
                                                />
                                            </div>
                                            <span className={styles.nodeCount}>{count}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </GlassCard>
                    </div>

                    <div className={styles.sideColumn}>
                        <GlassCard title="MITRE ATT&CK Coverage" icon={<Target />} href="/mitre">
                            <div className={styles.mitrePreview}>
                                <div className={styles.mitreStat}>
                                    <span className={styles.mitreVal}>14/14</span>
                                    <span className={styles.mitreLab}>Tactics Mapped</span>
                                </div>
                                <div className={styles.mitreGrid}>
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={styles.mitreBlock}
                                            style={{ opacity: 0.3 + (Math.random() * 0.7) }}
                                        />
                                    ))}
                                </div>
                                <div className={styles.glassButton}>
                                    View Full Matrix <ChevronRight size={14} />
                                </div>
                            </div>
                        </GlassCard>

                        <GlassCard title="Active Operations" icon={<Cpu />} href="/graph">
                            <div className={styles.operationsList}>
                                <div className={styles.opItem}>
                                    <div className={styles.opInfo}>
                                        <span className={styles.opLabel}>Reconnaissance Pulse</span>
                                        <span className={styles.opStatus} data-status={reconState?.status}>
                                            {reconState?.status.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className={styles.opProgress}>
                                        <div className={`${styles.opProgressBar} ${reconState?.status === 'running' ? styles.opAnimating : ''}`} />
                                    </div>
                                </div>
                                <div className={styles.opItem}>
                                    <div className={styles.opInfo}>
                                        <span className={styles.opLabel}>Panda AI Strategist</span>
                                        <span className={styles.opStatus} data-status="connected">CONNECTED</span>
                                    </div>
                                </div>
                                <div className={styles.opItem}>
                                    <div className={styles.opInfo}>
                                        <span className={styles.opLabel}>GitHub Ingestion</span>
                                        <span className={styles.opStatus} data-status={secretStats ? 'active' : 'idle'}>
                                            {secretStats ? 'SYNCED' : 'IDLE'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ label, value, unit, icon, loading, color, progress, href }: any) {
    const router = useRouter()
    const handleClick = href ? () => router.push(href) : undefined

    return (
        <div
            className={`${styles.statCard} ${href ? styles.clickable : ''}`}
            style={{ '--accent-color': color } as any}
            onClick={handleClick}
            role={href ? 'link' : undefined}
        >
            <div className={styles.statHeader}>
                <span className={styles.statLabel}>{label}</span>
                <div className={styles.statIcon} style={{ color: color }}>{icon}</div>
            </div>
            <div className={styles.statBody}>
                {loading ? <Skeleton variant="title" width={80} /> : (
                    <div className={styles.statValueContainer}>
                        <span className={styles.statValue}>{value ?? 0}</span>
                        {unit && <span className={styles.statUnit}>{unit}</span>}
                    </div>
                )}
            </div>
            {typeof progress === 'number' && (
                <div className={styles.statProgress}>
                    <div className={styles.statProgressFill} style={{ width: `${progress}%`, backgroundColor: color }} />
                </div>
            )}
            {href && <div className={styles.cardLink}><ChevronRight size={14} /></div>}
        </div>
    )
}

function GlassCard({ title, icon, children, href }: any) {
    const router = useRouter()
    const handleClick = href ? () => router.push(href) : undefined

    return (
        <div
            className={`${styles.glassCard} ${href ? styles.clickable : ''}`}
            onClick={handleClick}
            role={href ? 'link' : undefined}
        >
            <div className={styles.cardHeader}>
                {icon}
                <h3>{title}</h3>
                {href && (
                    <div className={styles.cardHeaderAction}>
                        <span>View Details</span>
                        <ChevronRight size={14} />
                    </div>
                )}
            </div>
            <div className={styles.cardContent}>
                {children}
            </div>
        </div>
    )
}

function VulnerabilityChart({ stats }: any) {
    const data = useMemo(() => {
        if (!stats) return []
        return [
            { label: 'Critical', value: stats.critical, color: 'var(--status-error)' },
            { label: 'High', value: stats.high, color: 'var(--color-orange-500)' },
            { label: 'Medium', value: stats.medium, color: 'var(--status-warning)' },
            { label: 'Low', value: stats.low, color: 'var(--status-info)' },
        ]
    }, [stats])

    const total = data.reduce((acc, d) => acc + d.value, 0)

    return (
        <div className={styles.vulnChart}>
            <div className={styles.chartBars}>
                {data.map((d) => (
                    <div key={d.label} className={styles.chartBarItem}>
                        <div className={styles.chartBarInfo}>
                            <span>{d.label}</span>
                            <span>{d.value}</span>
                        </div>
                        <div className={styles.chartBarTrack}>
                            <div
                                className={styles.chartBarFill}
                                style={{
                                    width: `${total > 0 ? (d.value / total) * 100 : 0}%`,
                                    backgroundColor: d.color,
                                    boxShadow: `0 0 10px ${d.color}44`
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            <div className={styles.donutPreview}>
                <svg viewBox="0 0 100 100" className={styles.donutSvg}>
                    <circle cx="50" cy="50" r="40" className={styles.donutTrack} />
                    {data.reduce((acc: any, d, i) => {
                        const percentage = total > 0 ? (d.value / total) * 100 : 0
                        const offset = acc.offset
                        acc.elements.push(
                            <circle
                                key={d.label}
                                cx="50" cy="50" r="40"
                                className={styles.donutFill}
                                stroke={d.color}
                                strokeDasharray={`${percentage * 2.51} 251`}
                                strokeDashoffset={-offset * 2.51}
                            />
                        )
                        acc.offset += percentage
                        return acc
                    }, { offset: 0, elements: [] as any[] }).elements}
                </svg>
                <div className={styles.donutCenter}>
                    <span className={styles.donutTotal}>{total}</span>
                    <span className={styles.donutLabel}>Total</span>
                </div>
            </div>
        </div>
    )
}

function LayoutDashboardIcon({ size, className }: any) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
    )
}

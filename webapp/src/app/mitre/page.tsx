'use client'

import { useState, useEffect, useRef } from 'react'
import { useProject } from '@/providers/ProjectProvider'
import { Target, Shield, ChevronDown, ChevronRight, ExternalLink, RefreshCw, X, AlertTriangle, Zap, Info, CheckCircle } from 'lucide-react'
import styles from './page.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Finding {
  id: string
  name: string
  severity: string
  targetHost?: string | null
  source?: string | null
}

interface TechniqueHit {
  techniqueId: string
  findings: Finding[]
  maxSeverity: string
  maxSevWeight: number
  count: number
}

interface Technique {
  id: string
  name: string
  url: string
  isSubtechnique: boolean
  hit: TechniqueHit | null
}

interface Tactic {
  id: string
  name: string
  shortName: string
  color: string
  techniques: Technique[]
  hitCount: number
  totalCount: number
  coverage: number
  maxSeverity: string
}

interface AttackStats {
  totalFindings: number
  totalTechniques: number
  hitTechniques: number
  coverage: number
  bySeverity: Record<string, number>
}

interface AttackResponse {
  tactics: Tactic[]
  stats: AttackStats
  error?: string
}

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEV_CONFIG: Record<string, { color: string; glow: string; bg: string; border: string; label: string; icon: React.ElementType }> = {
  critical: {
    color: '#e53935',
    glow: 'rgba(229,57,53,0.5)',
    bg: 'rgba(229,57,53,0.15)',
    border: 'rgba(229,57,53,0.45)',
    label: 'Critical',
    icon: Zap,
  },
  high: {
    color: '#f97316',
    glow: 'rgba(249,115,22,0.45)',
    bg: 'rgba(249,115,22,0.12)',
    border: 'rgba(249,115,22,0.4)',
    label: 'High',
    icon: AlertTriangle,
  },
  medium: {
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.4)',
    bg: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.35)',
    label: 'Medium',
    icon: AlertTriangle,
  },
  low: {
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.35)',
    bg: 'rgba(59,130,246,0.10)',
    border: 'rgba(59,130,246,0.3)',
    label: 'Low',
    icon: Info,
  },
  info: {
    color: '#6b7280',
    glow: 'rgba(107,114,128,0.2)',
    bg: 'rgba(107,114,128,0.07)',
    border: 'rgba(107,114,128,0.2)',
    label: 'Info',
    icon: Info,
  },
  none: {
    color: '#1f2937',
    glow: 'transparent',
    bg: 'transparent',
    border: 'rgba(255,255,255,0.04)',
    label: '—',
    icon: CheckCircle,
  },
}

function getSev(s: string) {
  return SEV_CONFIG[s?.toLowerCase()] ?? SEV_CONFIG.none
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MitrePage() {
  const { projectId } = useProject()
  const [data, setData] = useState<AttackResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTechnique, setSelectedTechnique] = useState<{ technique: Technique; tactic: Tactic } | null>(null)
  const [activeTacticFilter, setActiveTacticFilter] = useState<string | null>(null)
  const [activeSevFilter, setActiveSevFilter] = useState<string | null>(null)
  const [showOnlyHits, setShowOnlyHits] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    if (!projectId) { setLoading(false); return }
    try {
      setLoading(true)
      const res = await fetch(`/api/mitre/attack?projectId=${projectId}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 30000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Close drawer on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setSelectedTechnique(null)
      }
    }
    if (selectedTechnique) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [selectedTechnique])

  if (!projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <Target size={48} className={styles.emptyIcon} />
          <h2>No Project Selected</h2>
          <p>Select a project to view the MITRE ATT&amp;CK matrix.</p>
        </div>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading ATT&amp;CK matrix…</span>
        </div>
      </div>
    )
  }

  const tactics = data?.tactics ?? []
  const stats = data?.stats
  const visibleTactics = activeTacticFilter
    ? tactics.filter((t) => t.id === activeTacticFilter)
    : tactics

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleRow}>
            <div className={styles.titleIcon}>
              <Target size={20} />
            </div>
            <div>
              <h1 className={styles.title}>MITRE ATT&amp;CK Matrix</h1>
              <p className={styles.subtitle}>Enterprise — findings mapped to tactics &amp; techniques</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              className={`${styles.toggleBtn} ${showOnlyHits ? styles.toggleActive : ''}`}
              onClick={() => setShowOnlyHits((v) => !v)}
            >
              Show only hits
            </button>
            <button className={styles.refreshBtn} onClick={fetchData} disabled={loading}>
              <RefreshCw size={14} className={loading ? styles.spinning : ''} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className={styles.statsRow}>
            <StatPill label="Findings" value={stats.totalFindings} color="#e53935" />
            <StatPill label="Techniques Hit" value={`${stats.hitTechniques} / ${stats.totalTechniques}`} color="#f97316" />
            <StatPill label="Coverage" value={`${stats.coverage}%`} color="#f59e0b" />
            {Object.entries(stats.bySeverity)
              .filter(([, n]) => n > 0)
              .sort(([a], [b]) => {
                const order = ['critical', 'high', 'medium', 'low', 'info']
                return order.indexOf(a) - order.indexOf(b)
              })
              .map(([sev, count]) => (
                <StatPill
                  key={sev}
                  label={sev.charAt(0).toUpperCase() + sev.slice(1)}
                  value={count}
                  color={getSev(sev).color}
                  onClick={() => setActiveSevFilter(activeSevFilter === sev ? null : sev)}
                  active={activeSevFilter === sev}
                />
              ))}
          </div>
        )}

        {/* Tactic filter pills */}
        <div className={styles.tacticFilters}>
          <button
            className={`${styles.tacticPill} ${!activeTacticFilter ? styles.tacticPillActive : ''}`}
            onClick={() => setActiveTacticFilter(null)}
          >
            All Tactics
          </button>
          {tactics.map((t) => (
            <button
              key={t.id}
              className={`${styles.tacticPill} ${activeTacticFilter === t.id ? styles.tacticPillActive : ''}`}
              style={activeTacticFilter === t.id ? { '--tactic-color': t.color } as React.CSSProperties : {}}
              onClick={() => setActiveTacticFilter(activeTacticFilter === t.id ? null : t.id)}
            >
              <span
                className={styles.tacticDot}
                style={t.hitCount > 0 ? { background: t.color } : {}}
              />
              {t.shortName}
              {t.hitCount > 0 && <span className={styles.tacticBadge}>{t.hitCount}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Matrix ── */}
      <div className={styles.matrixWrapper}>
        <div className={styles.matrix}>
          {visibleTactics.map((tactic) => {
            const techs = tactic.techniques.filter((tech) => {
              if (showOnlyHits && !tech.hit) return false
              if (activeSevFilter && (!tech.hit || tech.hit.maxSeverity.toLowerCase() !== activeSevFilter)) return false
              return true
            })
            if (techs.length === 0 && (showOnlyHits || activeSevFilter)) return null

            return (
              <div key={tactic.id} className={styles.tacticColumn}>
                {/* Tactic header */}
                <div
                  className={styles.tacticHeader}
                  style={{ '--tc': tactic.color } as React.CSSProperties}
                >
                  <div className={styles.tacticHeaderInner}>
                    <span className={styles.tacticId}>{tactic.id}</span>
                    <span className={styles.tacticName}>{tactic.name}</span>
                  </div>
                  {tactic.hitCount > 0 && (
                    <div className={styles.tacticCoverage}>
                      <div
                        className={styles.tacticBar}
                        style={{
                          width: `${tactic.coverage}%`,
                          background: getSev(tactic.maxSeverity).color,
                        }}
                      />
                      <span className={styles.tacticBarLabel}>{tactic.hitCount}/{tactic.totalCount}</span>
                    </div>
                  )}
                </div>

                {/* Technique cells */}
                <div className={styles.techniqueList}>
                  {techs.map((tech) => {
                    const sev = tech.hit ? getSev(tech.hit.maxSeverity) : getSev('none')
                    const isActive =
                      selectedTechnique?.technique.id === tech.id
                    const isSub = tech.isSubtechnique

                    return (
                      <button
                        key={tech.id}
                        className={`${styles.techCell} ${tech.hit ? styles.techCellHit : styles.techCellEmpty} ${isActive ? styles.techCellActive : ''} ${isSub ? styles.techCellSub : ''}`}
                        style={
                          tech.hit
                            ? ({
                                '--sev-color': sev.color,
                                '--sev-glow': sev.glow,
                                '--sev-bg': sev.bg,
                                '--sev-border': sev.border,
                              } as React.CSSProperties)
                            : undefined
                        }
                        onClick={() =>
                          tech.hit
                            ? setSelectedTechnique(isActive ? null : { technique: tech, tactic })
                            : undefined
                        }
                        disabled={!tech.hit}
                        title={tech.hit ? `${tech.id}: ${tech.name} — ${tech.hit.count} finding(s)` : `${tech.id}: ${tech.name}`}
                      >
                        <span className={styles.techId}>{tech.id}</span>
                        <span className={styles.techName}>{tech.name}</span>
                        {tech.hit && (
                          <span className={styles.techCount}>{tech.hit.count}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className={styles.legend}>
        {(['critical', 'high', 'medium', 'low', 'info'] as const).map((s) => {
          const cfg = getSev(s)
          return (
            <div key={s} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.glow}` }} />
              <span style={{ color: cfg.color }}>{cfg.label}</span>
            </div>
          )
        })}
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#1f2937' }} />
          <span style={{ color: '#4b5563' }}>No findings</span>
        </div>
        <span className={styles.legendNote}>Click a highlighted cell to inspect findings</span>
      </div>

      {/* ── Finding drawer ── */}
      {selectedTechnique && (
        <div className={styles.drawerOverlay}>
          <div className={styles.drawer} ref={drawerRef}>
            <DrawerContent
              technique={selectedTechnique.technique}
              tactic={selectedTechnique.tactic}
              onClose={() => setSelectedTechnique(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  color,
  onClick,
  active,
}: {
  label: string
  value: string | number
  color: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      className={`${styles.statPill} ${active ? styles.statPillActive : ''} ${onClick ? styles.statPillClickable : ''}`}
      style={{ '--pill-color': color } as React.CSSProperties}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className={styles.statPillValue} style={{ color }}>{value}</span>
      <span className={styles.statPillLabel}>{label}</span>
    </button>
  )
}

// ── Technique drawer content ──────────────────────────────────────────────────

function DrawerContent({
  technique,
  tactic,
  onClose,
}: {
  technique: Technique
  tactic: Tactic
  onClose: () => void
}) {
  const hit = technique.hit!
  const sev = getSev(hit.maxSeverity)
  const SevIcon = sev.icon

  // Group findings by severity
  const byLevel: Record<string, Finding[]> = {}
  for (const f of hit.findings) {
    const s = f.severity?.toLowerCase() || 'info'
    if (!byLevel[s]) byLevel[s] = []
    byLevel[s].push(f)
  }
  const sevOrder = ['critical', 'high', 'medium', 'low', 'info']

  return (
    <>
      <div className={styles.drawerHeader} style={{ '--tc': tactic.color } as React.CSSProperties}>
        <div className={styles.drawerTitleRow}>
          <div>
            <div className={styles.drawerTacticLabel} style={{ color: tactic.color }}>
              {tactic.id} · {tactic.name}
            </div>
            <div className={styles.drawerTechId}>
              {technique.id}
              {technique.isSubtechnique && <span className={styles.subBadge}>Sub-technique</span>}
            </div>
            <h2 className={styles.drawerTechName}>{technique.name}</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.drawerMeta}>
          <span className={styles.drawerSevBadge} style={{ background: sev.bg, border: `1px solid ${sev.border}`, color: sev.color }}>
            <SevIcon size={12} />
            Max: {sev.label}
          </span>
          <span className={styles.drawerCount}>{hit.count} finding{hit.count !== 1 ? 's' : ''}</span>
          <a
            href={technique.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.drawerLink}
          >
            <ExternalLink size={12} />
            MITRE ATT&amp;CK
          </a>
        </div>
      </div>

      <div className={styles.drawerBody}>
        {sevOrder.map((s) => {
          const findings = byLevel[s]
          if (!findings?.length) return null
          const cfg = getSev(s)
          const Icon = cfg.icon
          return (
            <div key={s} className={styles.drawerSevGroup}>
              <div className={styles.drawerSevGroupHeader} style={{ color: cfg.color }}>
                <Icon size={14} />
                <span>{cfg.label}</span>
                <span className={styles.drawerSevCount}>{findings.length}</span>
              </div>
              <div className={styles.drawerFindingList}>
                {findings.map((f) => (
                  <div key={f.id} className={styles.drawerFinding} style={{ borderLeftColor: cfg.color }}>
                    <span className={styles.drawerFindingName}>{f.name}</span>
                    <div className={styles.drawerFindingMeta}>
                      {f.targetHost && <span className={styles.drawerFindingHost}>{f.targetHost}</span>}
                      {f.source && <span className={styles.drawerFindingSource}>{f.source}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

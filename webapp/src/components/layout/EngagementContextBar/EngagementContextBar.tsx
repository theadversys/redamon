/**
 * EngagementContextBar
 *
 * Slim 40px bar rendered above the Agent Zero iframe.
 * Shows live engagement state: project, kill chain stage, vuln counts, risk,
 * secrets. Uses the useEngagementBrief hook for auto-refreshing data.
 */

'use client'

import Link from 'next/link'
import {
  Target,
  ShieldAlert,
  KeyRound,
  ExternalLink,
  Settings,
  ChevronRight,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEngagementBrief } from '@/hooks/useEngagementBrief'
import { useProject } from '@/providers/ProjectProvider'
import styles from './EngagementContextBar.module.css'

// Kill chain stage colour mapping
const STAGE_COLORS: Record<number, string> = {
  1: '#60a5fa', // blue  — Recon
  2: '#a78bfa', // violet — Weaponization
  3: '#f472b6', // pink  — Delivery
  4: '#f97316', // orange — Exploitation
  5: '#ef4444', // red   — Installation
  6: '#dc2626', // crimson — C2
  7: '#991b1b', // deep red — Actions
}

const STAGE_LABELS: Record<number, string> = {
  1: 'Recon',
  2: 'Weapon',
  3: 'Delivery',
  4: 'Exploit',
  5: 'Install',
  6: 'C2',
  7: 'Actions',
}

interface EngagementContextBarProps {
  agentZeroHref: string
}

export function EngagementContextBar({ agentZeroHref }: EngagementContextBarProps) {
  const { projectId, currentProject } = useProject()
  const { brief, isLoading } = useEngagementBrief(projectId)

  const hasProject = !!currentProject
  const stage = brief?.killChain.stage ?? 1
  const stageStatus = brief?.killChain.status ?? 'idle'
  const stageColor = STAGE_COLORS[stage] ?? '#60a5fa'
  const stageLabel = STAGE_LABELS[stage] ?? 'Recon'
  const isActive = stageStatus === 'running'

  const critical = brief?.vulnerabilities.critical ?? 0
  const high = brief?.vulnerabilities.high ?? 0
  const total = brief?.vulnerabilities.total ?? 0
  const secrets = brief?.attack_surface.secretsFound ?? 0
  const hosts = brief?.attack_surface.hosts ?? 0

  // Risk colour
  const riskScore =
    critical * 10 + high * 5 + (brief?.vulnerabilities.medium ?? 0) * 2
  const riskColor =
    riskScore > 70
      ? 'var(--status-error, #ef4444)'
      : riskScore > 30
      ? 'var(--status-warning, #f59e0b)'
      : riskScore > 0
      ? 'var(--status-info, #60a5fa)'
      : 'var(--status-success, #22c55e)'
  const riskLabel =
    riskScore > 70 ? 'CRITICAL' : riskScore > 30 ? 'ELEVATED' : riskScore > 0 ? 'LOW' : 'CLEAN'

  return (
    <div className={styles.bar}>
      {/* ── LEFT: project identity ───────────────────────────────────────── */}
      <div className={styles.left}>
        {hasProject ? (
          <>
            <div className={styles.projectPill}>
              <Target size={12} className={styles.projectIcon} />
              <span className={styles.projectName}>{currentProject.name}</span>
              {currentProject.targetDomain && (
                <>
                  <ChevronRight size={10} className={styles.sep} />
                  <span className={styles.projectDomain}>{currentProject.targetDomain}</span>
                </>
              )}
            </div>

            {/* Kill chain stage */}
            <div
              className={`${styles.stagePill} ${isActive ? styles.stageActive : ''}`}
              style={{ '--stage-color': stageColor } as React.CSSProperties}
              title={`Kill Chain: Stage ${stage} — ${brief?.killChain.stageName ?? stageLabel} [${stageStatus.toUpperCase()}]`}
            >
              <Activity size={11} />
              <span>S{stage} · {stageLabel}</span>
              {isActive && <span className={styles.stageDot} />}
            </div>

            {/* Vulns */}
            {total > 0 && (
              <Link href="/vulnerabilities" className={styles.metricPill} style={{ '--pill-color': critical > 0 ? '#ef4444' : high > 0 ? '#f97316' : '#60a5fa' } as React.CSSProperties}>
                <ShieldAlert size={11} />
                <span>{total} vulns</span>
                {critical > 0 && (
                  <span className={styles.critBadge}>{critical} crit</span>
                )}
              </Link>
            )}

            {/* Secrets */}
            {secrets > 0 && (
              <Link href="/secrets" className={styles.metricPill} style={{ '--pill-color': '#a78bfa' } as React.CSSProperties}>
                <KeyRound size={11} />
                <span>{secrets} secret{secrets !== 1 ? 's' : ''}</span>
              </Link>
            )}

            {/* Hosts */}
            {hosts > 0 && (
              <div className={styles.metricPill} style={{ '--pill-color': '#34d399' } as React.CSSProperties}>
                <Wifi size={11} />
                <span>{hosts} host{hosts !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Risk badge */}
            {total > 0 && (
              <div
                className={styles.riskBadge}
                style={{ '--risk-color': riskColor } as React.CSSProperties}
              >
                {riskLabel}
              </div>
            )}
          </>
        ) : (
          <div className={styles.noProject}>
            <WifiOff size={12} />
            <span>No project selected — ask Agent Zero to list or create a project</span>
          </div>
        )}
      </div>

      {/* ── RIGHT: actions ───────────────────────────────────────────────── */}
      <div className={styles.right}>
        {projectId && (
          <Link href={`/projects/${projectId}/settings`} className={styles.actionBtn} title="Project settings">
            <Settings size={13} />
          </Link>
        )}
        <a
          href={agentZeroHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.actionBtn}
          title="Open Agent Zero in new tab (full interface)"
        >
          <ExternalLink size={13} />
          <span className={styles.actionLabel}>Full view</span>
        </a>
      </div>
    </div>
  )
}

export default EngagementContextBar

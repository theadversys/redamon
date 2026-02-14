'use client'

import { useState, useEffect } from 'react'
import { useProject } from '@/providers/ProjectProvider'
import Link from 'next/link'
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Filter, Target, FileText, Key } from 'lucide-react'
import { EvidenceDrawer } from './components/EvidenceDrawer'
import styles from './page.module.css'

interface Vulnerability {
  id: string
  name: string
  severity: string
  source: string
  category?: string
  cvssScore?: number
  description?: string
  solution?: string
  url?: string
  cveIds: string[]
  endpoints: Array<{ url: string; path: string; method: string }>
  parameters: Array<{ name: string; type: string }>
  ips: string[]
  subdomains: string[]
  domains: string[]
  baseUrls: string[]
  attackTechniques?: Array<{ id: string; name: string; tactic: string }>
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
    bySource: {
      nuclei: number
      gvm: number
      security_check: number
    }
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
  critical: <AlertTriangle size={16} />,
  high: <AlertCircle size={16} />,
  medium: <AlertCircle size={16} />,
  low: <Info size={16} />,
  info: <Info size={16} />,
}

export default function VulnerabilitiesPage() {
  const { projectId } = useProject()
  const [data, setData] = useState<VulnerabilitiesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  const [evidenceDrawerVuln, setEvidenceDrawerVuln] = useState<{ id: string; name: string } | null>(null)

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
    
    // Refresh every 10 seconds to get new vulnerabilities dynamically
    const interval = setInterval(fetchVulnerabilities, 10000)
    return () => clearInterval(interval)
  }, [projectId, severityFilter, sourceFilter])

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

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading vulnerabilities...</div>
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

  const vulnerabilities = data?.vulnerabilities || []
  const stats = data?.stats

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <div className={styles.titleSection}>
            <ShieldCheck size={24} />
            <h1>Vulnerabilities</h1>
            {stats && <span className={styles.badge}>{stats.total}</span>}
          </div>
          {projectId && (
            <Link
              href={`/secrets?project=${projectId}`}
              className={styles.secretsLink}
            >
              <Key size={14} />
              GitHub Secrets & AI Attack Surface →
            </Link>
          )}
        </div>

        {stats && (
          <div className={styles.stats}>
            <div className={styles.statCard} style={{ borderColor: SEVERITY_COLORS.critical }}>
              <span className={styles.statLabel}>Critical</span>
              <span className={styles.statValue}>{stats.bySeverity.critical}</span>
            </div>
            <div className={styles.statCard} style={{ borderColor: SEVERITY_COLORS.high }}>
              <span className={styles.statLabel}>High</span>
              <span className={styles.statValue}>{stats.bySeverity.high}</span>
            </div>
            <div className={styles.statCard} style={{ borderColor: SEVERITY_COLORS.medium }}>
              <span className={styles.statLabel}>Medium</span>
              <span className={styles.statValue}>{stats.bySeverity.medium}</span>
            </div>
            <div className={styles.statCard} style={{ borderColor: SEVERITY_COLORS.low }}>
              <span className={styles.statLabel}>Low</span>
              <span className={styles.statValue}>{stats.bySeverity.low}</span>
            </div>
          </div>
        )}

        <div className={styles.filters}>
          <Filter size={16} />
          <select
            value={severityFilter || ''}
            onChange={(e) => setSeverityFilter(e.target.value || null)}
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
            value={sourceFilter || ''}
            onChange={(e) => setSourceFilter(e.target.value || null)}
            className={styles.filterSelect}
          >
            <option value="">All Sources</option>
            <option value="nuclei">Nuclei</option>
            <option value="gvm">GVM/OpenVAS</option>
            <option value="security_check">Security Check</option>
          </select>
        </div>
      </div>

      <div className={styles.content}>
        {vulnerabilities.length === 0 ? (
          <div className={styles.empty}>
            <ShieldCheck size={48} />
            <h2>No Vulnerabilities Found</h2>
            {data?.scanStatus?.skipped ? (
              <>
                <p className={styles.warningText}>
                  <strong>Vulnerability scan was skipped:</strong> {data.scanStatus.skipReason || 'Unknown reason'}
                </p>
                <p className={styles.infoText}>
                  Modules executed: {data.scanStatus.modulesExecuted.join(', ') || 'None'}
                </p>
                <p className={styles.infoText}>
                  The vulnerability scanner requires live HTTP targets to scan. Ensure your target domain is accessible and has open ports.
                </p>
              </>
            ) : (
              <p>Run a vulnerability scan to discover security issues.</p>
            )}
          </div>
        ) : (
          <div className={styles.list}>
            {vulnerabilities.map((vuln) => (
              <div key={vuln.id} className={styles.vulnCard}>
                <div className={styles.vulnHeader}>
                  <div className={styles.vulnTitle}>
                    <span
                      className={styles.severityBadge}
                      style={{ backgroundColor: SEVERITY_COLORS[vuln.severity] || SEVERITY_COLORS.info }}
                    >
                      {SEVERITY_ICONS[vuln.severity]}
                      {vuln.severity.toUpperCase()}
                    </span>
                    <h3>{vuln.name}</h3>
                  </div>
                  <div className={styles.vulnMeta}>
                    <span className={styles.sourceBadge}>{vuln.source}</span>
                    {vuln.cvssScore && (
                      <span className={styles.cvssBadge}>CVSS: {vuln.cvssScore.toFixed(1)}</span>
                    )}
                    <button
                      type="button"
                      className={styles.viewEvidenceButton}
                      onClick={() => setEvidenceDrawerVuln({ id: vuln.id, name: vuln.name })}
                      title="View evidence"
                    >
                      <FileText size={14} />
                      View Evidence
                    </button>
                  </div>
                </div>

                {vuln.description && (
                  <p className={styles.description}>{vuln.description}</p>
                )}

                {vuln.cveIds.length > 0 && (
                  <div className={styles.cves}>
                    <strong>CVEs:</strong> {vuln.cveIds.join(', ')}
                  </div>
                )}

                {vuln.endpoints.length > 0 && (
                  <div className={styles.related}>
                    <strong>Found at:</strong>
                    <ul>
                      {vuln.endpoints.map((ep, i) => (
                        <li key={i}>{ep.method} {ep.path}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {vuln.solution && (
                  <div className={styles.solution}>
                    <strong>Solution:</strong>
                    <p>{vuln.solution}</p>
                  </div>
                )}

                {vuln.attackTechniques && vuln.attackTechniques.length > 0 && (
                  <div className={styles.attackTechniques}>
                    <strong>
                      <Target size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      MITRE ATT&CK Techniques:
                    </strong>
                    <div className={styles.techniqueList}>
                      {vuln.attackTechniques.map((tech, i) => (
                        <span key={i} className={styles.techniqueBadge} title={tech.name}>
                          {tech.id}
                          {tech.tactic && <span className={styles.tactic}> • {tech.tactic}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {projectId && (
        <EvidenceDrawer
          vulnerabilityId={evidenceDrawerVuln?.id ?? ''}
          projectId={projectId}
          vulnerabilityName={evidenceDrawerVuln?.name}
          isOpen={!!evidenceDrawerVuln}
          onClose={() => setEvidenceDrawerVuln(null)}
        />
      )}
    </div>
  )
}

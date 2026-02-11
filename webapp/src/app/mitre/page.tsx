'use client'

import { useState, useEffect } from 'react'
import { useProject } from '@/providers/ProjectProvider'
import { Target, Network, Shield } from 'lucide-react'
import styles from './page.module.css'

interface CWE {
  id: string
  cweId: string
  name: string
  description?: string
  abstraction: string
  mapping: string
  url: string
  isLeaf: boolean
  consequences?: any
  mitigations?: any
  detectionMethods?: any
  linkedCves: Array<{ id: string; severity: string; cvss?: number }>
  linkedCapecs: Array<{ id: string; name: string; severity: string }>
}

interface CAPEC {
  id: string
  numericId: number
  name: string
  description?: string
  likelihood: string
  severity: string
  prerequisites?: string
  executionFlow?: any
  url: string
  relatedCwes: string[]
  linkedCwes: Array<{ id: string; name: string }>
  linkedCves: Array<{ id: string; severity: string; cvss?: number }>
}

interface MitreResponse {
  cwes: CWE[]
  capecs: CAPEC[]
  stats: {
    totalCwes: number
    totalCapecs: number
    cwesByAbstraction: {
      Pillar: number
      Class: number
      Base: number
      Variant: number
    }
    capecsBySeverity: {
      'Very High': number
      'High': number
      'Medium': number
      'Low': number
      'Very Low': number
    }
  }
}

export default function MitrePage() {
  const { projectId } = useProject()
  const [data, setData] = useState<MitreResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'cwe' | 'capec'>('cwe')

  useEffect(() => {
    if (!projectId) {
      setLoading(false)
      return
    }

    const fetchMitreData = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/mitre?projectId=${projectId}`)
        if (!response.ok) {
          throw new Error('Failed to fetch MITRE data')
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

    fetchMitreData()
    
    // Refresh every 15 seconds to get new MITRE data dynamically
    const interval = setInterval(fetchMitreData, 15000)
    return () => clearInterval(interval)
  }, [projectId])

  if (!projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.noProject}>
          <h2>No Project Selected</h2>
          <p>Select a project from the dropdown in the header to view MITRE ATT&CK data.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading MITRE data...</div>
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

  const cwes = data?.cwes || []
  const capecs = data?.capecs || []
  const stats = data?.stats

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <Target size={24} />
          <h1>MITRE ATT&CK / CWE / CAPEC</h1>
        </div>

        {stats && (
          <div className={styles.stats}>
            <div className={styles.statCard}>
              <Network size={20} />
              <div>
                <span className={styles.statLabel}>CWE Weaknesses</span>
                <span className={styles.statValue}>{stats.totalCwes}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <Shield size={20} />
              <div>
                <span className={styles.statLabel}>CAPEC Patterns</span>
                <span className={styles.statValue}>{stats.totalCapecs}</span>
              </div>
            </div>
          </div>
        )}

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'cwe' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('cwe')}
          >
            <Network size={16} />
            CWE Weaknesses ({cwes.length})
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'capec' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('capec')}
          >
            <Shield size={16} />
            CAPEC Patterns ({capecs.length})
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {activeTab === 'cwe' ? (
          cwes.length === 0 ? (
            <div className={styles.empty}>
              <Network size={48} />
              <h2>No CWE Weaknesses Found</h2>
              <p>Run a vulnerability scan with MITRE enrichment enabled to discover CWE weaknesses.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {cwes.map((cwe) => (
                <div key={cwe.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3>
                        <a href={cwe.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                          {cwe.cweId}
                        </a>
                        {cwe.name}
                      </h3>
                      <div className={styles.meta}>
                        <span className={styles.badge}>{cwe.abstraction}</span>
                        <span className={styles.badge}>{cwe.mapping}</span>
                        {cwe.isLeaf && <span className={styles.badge}>Leaf</span>}
                      </div>
                    </div>
                    <div className={styles.linkedCount}>
                      {cwe.linkedCves.length} CVE{cwe.linkedCves.length !== 1 ? 's' : ''}
                      {cwe.linkedCapecs.length > 0 && (
                        <> • {cwe.linkedCapecs.length} CAPEC{cwe.linkedCapecs.length !== 1 ? 's' : ''}</>
                      )}
                    </div>
                  </div>

                  {cwe.description && (
                    <p className={styles.description}>{cwe.description}</p>
                  )}

                  {cwe.mitigations && Array.isArray(cwe.mitigations) && cwe.mitigations.length > 0 && (
                    <div className={styles.section}>
                      <strong>Mitigations:</strong>
                      <ul>
                        {cwe.mitigations.map((mit: any, i: number) => (
                          <li key={i}>{mit.description || mit}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {cwe.linkedCves.length > 0 && (
                    <div className={styles.section}>
                      <strong>Linked CVEs:</strong>
                      <div className={styles.cveList}>
                        {cwe.linkedCves.map((cve) => (
                          <span key={cve.id} className={styles.cveBadge}>
                            {cve.id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          capecs.length === 0 ? (
            <div className={styles.empty}>
              <Shield size={48} />
              <h2>No CAPEC Patterns Found</h2>
              <p>Run a vulnerability scan with MITRE enrichment enabled to discover CAPEC attack patterns.</p>
            </div>
          ) : (
            <div className={styles.list}>
              {capecs.map((capec) => (
                <div key={capec.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3>
                        <a href={capec.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                          {capec.id}
                        </a>
                        {capec.name}
                      </h3>
                      <div className={styles.meta}>
                        <span className={styles.badge} style={{ backgroundColor: getSeverityColor(capec.severity) }}>
                          {capec.severity}
                        </span>
                        <span className={styles.badge}>Likelihood: {capec.likelihood}</span>
                      </div>
                    </div>
                    <div className={styles.linkedCount}>
                      {capec.linkedCves.length} CVE{capec.linkedCves.length !== 1 ? 's' : ''}
                      {capec.linkedCwes.length > 0 && (
                        <> • {capec.linkedCwes.length} CWE{capec.linkedCwes.length !== 1 ? 's' : ''}</>
                      )}
                    </div>
                  </div>

                  {capec.description && (
                    <p className={styles.description}>{capec.description}</p>
                  )}

                  {capec.prerequisites && (
                    <div className={styles.section}>
                      <strong>Prerequisites:</strong>
                      <p>{capec.prerequisites}</p>
                    </div>
                  )}

                  {capec.linkedCves.length > 0 && (
                    <div className={styles.section}>
                      <strong>Linked CVEs:</strong>
                      <div className={styles.cveList}>
                        {capec.linkedCves.map((cve) => (
                          <span key={cve.id} className={styles.cveBadge}>
                            {cve.id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    'Very High': '#ef4444',
    'High': '#f97316',
    'Medium': '#eab308',
    'Low': '#3b82f6',
    'Very Low': '#6b7280',
  }
  return colors[severity] || '#6b7280'
}

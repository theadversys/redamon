'use client'

import { useEffect, useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import styles from './AttackPathsDrawer.module.css'

export interface AttackPath {
  rank: number
  vulnerabilityId: string
  name: string
  severity: string
  category?: string
  cveIds: string[]
  targetIp: string | null
  targetPort: number | null
  targetHost: string | null
  matchedAt: string | null
  baseUrls: string[]
  exploitType: string
  metasploitHint: string
  curlCommand?: string
}

interface AttackPathsDrawerProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  limit?: number
}

export function AttackPathsDrawer({
  isOpen,
  onClose,
  projectId,
  limit = 5,
}: AttackPathsDrawerProps) {
  const [paths, setPaths] = useState<AttackPath[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !projectId) return
    setLoading(true)
    setError(null)
    fetch(`/api/attack-paths?projectId=${projectId}&limit=${limit}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch attack paths')
        return res.json()
      })
      .then((data) => setPaths(data.attackPaths || []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [isOpen, projectId, limit])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.drawer}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attack-paths-title"
      >
        <div className={styles.header}>
          <h3 id="attack-paths-title" className={styles.title}>Attack Paths</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className={styles.content}>
          {loading && <div className={styles.loading}>Loading...</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && !error && paths.length === 0 && (
            <div className={styles.empty} role="status">
              No attack paths found. Run recon to discover vulnerabilities.
            </div>
          )}
          {!loading && !error && paths.length > 0 && (
            <ul className={styles.list}>
              {paths.map((p) => (
                <li key={p.vulnerabilityId} className={styles.item}>
                  <div className={styles.itemHeader}>
                    <span className={styles.rank}>#{p.rank}</span>
                    <span className={`${styles.severity} ${styles[`severity${p.severity}`] || styles.severityinfo}`}>
                      {p.severity}
                    </span>
                  </div>
                  <div className={styles.itemName}>{p.name}</div>
                  {p.targetIp && (
                    <div className={styles.itemTarget}>
                      Target: {p.targetIp}
                      {p.targetPort && `:${p.targetPort}`}
                    </div>
                  )}
                  {p.baseUrls.length > 0 && (
                    <div className={styles.itemUrl}>{p.baseUrls[0]}</div>
                  )}
                  <div className={styles.itemHint}>
                    <ChevronRight size={12} />
                    {p.metasploitHint}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

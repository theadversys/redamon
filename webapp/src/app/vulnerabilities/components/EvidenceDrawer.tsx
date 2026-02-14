'use client'

import { useState, useEffect, useCallback } from 'react'
import { Drawer } from '@/components/ui'
import { ChevronDown, ChevronRight, Copy, FileText, Loader2 } from 'lucide-react'
import type { Evidence } from '@/lib/evidenceTypes'
import styles from './EvidenceDrawer.module.css'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
}

interface EvidenceDrawerProps {
  vulnerabilityId: string
  projectId: string
  vulnerabilityName?: string
  isOpen: boolean
  onClose: () => void
}

export function EvidenceDrawer({
  vulnerabilityId,
  projectId,
  vulnerabilityName,
  isOpen,
  onClose,
}: EvidenceDrawerProps) {
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const fetchEvidence = useCallback(async () => {
    if (!projectId || !vulnerabilityId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ projectId, vulnerabilityId })
      const res = await fetch(`/api/evidence?${params}`)
      if (!res.ok) {
        if (res.status === 404) {
          setEvidence([])
          return
        }
        throw new Error('Failed to fetch evidence')
      }
      const data = await res.json()
      setEvidence(data.evidence || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setEvidence([])
    } finally {
      setLoading(false)
    }
  }, [projectId, vulnerabilityId])

  useEffect(() => {
    if (isOpen && projectId && vulnerabilityId) {
      fetchEvidence()
    }
  }, [isOpen, projectId, vulnerabilityId, fetchEvidence])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  const title = vulnerabilityName
    ? `Evidence for ${vulnerabilityName}`
    : 'Evidence'

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      mode="overlay"
      width="420px"
      title={title}
    >
      <div className={styles.content}>
        {loading && (
          <div className={styles.loading}>
            <Loader2 size={24} className={styles.spinner} />
            <span>Loading evidence...</span>
          </div>
        )}

        {error && !loading && (
          <div className={styles.error}>
            <p>{error}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={fetchEvidence}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && evidence.length === 0 && (
          <div className={styles.empty}>
            <FileText size={40} />
            <p>No evidence records yet.</p>
            <p className={styles.emptyHint}>
              Evidence is created when vulnerabilities are discovered during
              recon.
            </p>
          </div>
        )}

        {!loading && !error && evidence.length > 0 && (
          <div className={styles.list}>
            {evidence.map((item) => {
              const isExpanded = expandedIds.has(item.id)
              return (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div className={styles.badges}>
                      <span className={styles.phaseBadge}>{item.phase}</span>
                      <span className={styles.toolBadge}>{item.tool}</span>
                      {item.severity && (
                        <span
                          className={styles.severityBadge}
                          style={{
                            backgroundColor:
                              SEVERITY_COLORS[item.severity] ??
                              SEVERITY_COLORS.info,
                          }}
                        >
                          {item.severity}
                        </span>
                      )}
                    </div>
                    <span className={styles.timestamp}>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString()
                        : ''}
                    </span>
                  </div>
                  <p className={styles.summary}>{item.summary}</p>
                  <div className={styles.rawSection}>
                    <button
                      type="button"
                      className={styles.expandButton}
                      onClick={() => toggleExpand(item.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                      Show raw output
                    </button>
                    {isExpanded && (
                      <div className={styles.rawContent}>
                        <pre>{item.rawOutput || '(none)'}</pre>
                        {item.rawOutput && (
                          <button
                            type="button"
                            className={styles.copyButton}
                            onClick={() => copyToClipboard(item.rawOutput)}
                            title="Copy to clipboard"
                          >
                            <Copy size={14} />
                            Copy
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Drawer>
  )
}

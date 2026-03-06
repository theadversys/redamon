'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/components/ui'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
  Ticket,
  UserPlus,
  CheckCircle2,
  ExternalLink,
  Download,
} from 'lucide-react'
import type { Evidence } from '@/lib/evidenceTypes'
import { type VulnStatus, VULN_STATUS_LABELS } from '@/lib/vulnerability-types'
import { getAssetFromVuln } from '@/lib/asset-utils'
import { parseEvidence, extractProofHighlight } from '@/lib/evidence-parser'
import { synthesizeAISummary } from '@/lib/vuln-summary'
import styles from './VulnPreviewDrawer.module.css'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
}

export interface VulnWithEndpoints {
  id: string
  name: string
  severity: string
  source: string
  toolName?: string
  category?: string
  description?: string
  solution?: string
  cveIds?: string[]
  endpoints: Array<{ url: string; path: string; method: string }>
  baseUrls: string[]
  attackTechniques?: Array<{ id: string; name: string; tactic: string }>
}

interface VulnPreviewDrawerProps {
  vulnerability: VulnWithEndpoints | null
  projectId: string
  userId?: string
  workflow?: { status: string; ownerId: string | null; ticket?: { ticketUrl: string; provider: string } | null; commentCount?: number }
  onUpdate?: (updates: Record<string, unknown>) => Promise<unknown>
  isOpen: boolean
  onClose: () => void
  onStatusChange?: () => void
}

export function VulnPreviewDrawer({
  vulnerability,
  projectId,
  userId,
  workflow: workflowProp,
  onUpdate,
  isOpen,
  onClose,
  onStatusChange,
}: VulnPreviewDrawerProps) {
  const router = useRouter()
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [assignModal, setAssignModal] = useState(false)
  const [statusModal, setStatusModal] = useState(false)
  const [assignValue, setAssignValue] = useState('')
  const [statusValue, setStatusValue] = useState<VulnStatus>('open')
  const [riskReason, setRiskReason] = useState('')
  const [riskApproverId, setRiskApproverId] = useState('')
  const [riskExpiresAt, setRiskExpiresAt] = useState('')
  const [fpReason, setFpReason] = useState('')
  const [retesting, setRetesting] = useState(false)
  const [creatingTicket, setCreatingTicket] = useState(false)

  const workflow = workflowProp ?? {
    status: 'open' as VulnStatus,
    ownerId: null,
    ticket: null,
    commentCount: 0,
  }

  const fetchEvidence = useCallback(async () => {
    if (!projectId || !vulnerability?.id) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ projectId, vulnerabilityId: vulnerability.id })
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
  }, [projectId, vulnerability?.id])

  useEffect(() => {
    if (isOpen && projectId && vulnerability?.id) {
      fetchEvidence()
    }
  }, [isOpen, projectId, vulnerability?.id, fetchEvidence])

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

  const handleStatusChange = async (newStatus: VulnStatus) => {
    if (!vulnerability || !onUpdate) return
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'risk_accepted') {
      if (!riskReason || !riskApproverId || !riskExpiresAt) return
      updates.riskReason = riskReason
      updates.riskApproverId = riskApproverId
      updates.riskExpiresAt = riskExpiresAt
    }
    if (newStatus === 'false_positive') {
      if (!fpReason) return
      updates.fpReason = fpReason
    }
    await onUpdate(updates)
    setStatusModal(false)
    setRiskReason('')
    setRiskApproverId('')
    setRiskExpiresAt('')
    setFpReason('')
    onStatusChange?.()
  }

  const handleRetest = async () => {
    if (!vulnerability || !projectId) return
    setRetesting(true)
    try {
      const res = await fetch(`/api/findings/${projectId}/${vulnerability.id}/retest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulateResult: 'still_vulnerable' }),
      })
      const data = await res.json()
      if (data.canTransitionToVerified) onStatusChange?.()
    } finally {
      setRetesting(false)
    }
  }

  const handleCreateTicket = async () => {
    if (!vulnerability || !projectId) return
    if (workflow.ticket?.ticketUrl) {
      window.open(workflow.ticket.ticketUrl, '_blank')
      return
    }
    setCreatingTicket(true)
    try {
      const entrypoints = (vulnerability.endpoints || []).map(
        (ep) => `${ep.method} ${ep.path || ep.url}`
      )
      const assetData = getAssetFromVuln(vulnerability)
      const summary = synthesizeAISummary(
        vulnerability,
        evidence.map((e) => extractProofHighlight(e.rawOutput || '')).filter((h): h is string => !!h),
        entrypoints.length
      )
      const body = {
        action: 'create' as const,
        provider: 'github',
        title: vulnerability.name,
        severity: vulnerability.severity,
        asset: assetData.label,
        entrypoints,
        summary: `${summary.what}\n\n${summary.why}\n\n${summary.fix}`,
        remediation: vulnerability.solution || summary.fix,
      }
      const res = await fetch(`/api/findings/${projectId}/${vulnerability.id}/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ticketUrl) {
        window.open(data.ticketUrl, '_blank')
        onStatusChange?.()
      } else if (data.error) {
        alert(data.error)
      }
    } finally {
      setCreatingTicket(false)
    }
  }

  const handleAssign = async (owner: string) => {
    if (!vulnerability || !onUpdate) return
    await onUpdate({ ownerId: owner || null })
    setAssignModal(false)
    setAssignValue('')
    onStatusChange?.()
  }

  const title = vulnerability ? `Preview: ${vulnerability.name}` : 'Preview'

  if (!vulnerability) return null

  const entrypoints = vulnerability.endpoints || []
  const asset = getAssetFromVuln(vulnerability)
  const evidenceHighlights = evidence
    .map((e) => extractProofHighlight(e.rawOutput || ''))
    .filter((h): h is string => !!h)
  const aiSummary = synthesizeAISummary(
    vulnerability,
    evidenceHighlights,
    entrypoints.length
  )

  const handleOpenDetails = () => {
    onClose()
    router.push(`/vulnerabilities/${projectId}/${vulnerability.id}`)
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="right"
      mode="overlay"
      width="480px"
      title={title}
    >
      <div className={styles.content}>
        {/* AI Summary */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Summary</h3>
          <div className={styles.aiSummary}>
            <p><strong>What it is:</strong> {aiSummary.what}</p>
            <p><strong>Why it matters:</strong> {aiSummary.why}</p>
            <p><strong>What to fix:</strong> {aiSummary.fix}</p>
          </div>
        </section>

        {/* Affected instances */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Affected instances</h3>
          {entrypoints.length === 0 ? (
            <p className={styles.muted}>No endpoints recorded</p>
          ) : (
            <div className={styles.instancesTable}>
              <table>
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {entrypoints.slice(0, 10).map((ep, i) => (
                    <tr key={i}>
                      <td><code>{ep.method}</code></td>
                      <td><code className={styles.pathTruncate}>{ep.path || ep.url}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {entrypoints.length > 10 && (
                <p className={styles.muted}>+{entrypoints.length - 10} more</p>
              )}
            </div>
          )}
        </section>

        {/* Evidence preview */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Evidence</h3>
          {loading && (
            <div className={styles.loading}>
              <Loader2 size={20} className={styles.spinner} />
              <span>Loading evidence...</span>
            </div>
          )}
          {error && !loading && (
            <div className={styles.error}>
              <p>{error}</p>
              <button type="button" className={styles.retryButton} onClick={fetchEvidence}>
                Retry
              </button>
            </div>
          )}
          {!loading && !error && evidence.length === 0 && (
            <p className={styles.muted}>No evidence records yet.</p>
          )}
          {!loading && !error && evidence.length > 0 && (
            <div className={styles.evidenceList}>
              {evidence.map((item) => {
                const isExpanded = expandedIds.has(item.id)
                const structured = parseEvidence(item.rawOutput || '')
                const proofHighlight = extractProofHighlight(item.rawOutput || '')
                return (
                  <div key={item.id} className={styles.evidenceCard}>
                    <div className={styles.evidenceHeader}>
                      <span className={styles.phaseBadge}>{item.phase}</span>
                      <span className={styles.toolBadge}>{item.tool}</span>
                      {item.severity && (
                        <span
                          className={styles.severityBadge}
                          style={{
                            backgroundColor:
                              SEVERITY_COLORS[item.severity] ?? SEVERITY_COLORS.info,
                          }}
                        >
                          {item.severity}
                        </span>
                      )}
                      <span className={styles.timestamp}>
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString()
                          : ''}
                      </span>
                    </div>
                    <p className={styles.summary}>{item.summary}</p>

                    {structured.request && (
                      <div className={styles.structuredEvidence}>
                        <div className={styles.structuredSection}>
                          <strong>Request</strong>
                          <div className={styles.requestLine}>
                            <code>{structured.request.method}</code>
                            <code className={styles.urlTruncate}>{structured.request.url}</code>
                          </div>
                          {structured.request.headers.length > 0 && (
                            <div className={styles.headersList}>
                              {structured.request.headers.map((h, i) => (
                                <div key={i} className={styles.headerRow}>
                                  <span className={styles.headerName}>{h.name}:</span>
                                  <span className={h.redacted ? styles.redacted : ''}>
                                    {h.value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {proofHighlight && (
                          <div className={styles.proofHighlight}>
                            <strong>Proof</strong>
                            <pre>{proofHighlight}</pre>
                          </div>
                        )}
                      </div>
                    )}

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
                        {isExpanded ? 'Hide raw output' : 'Show raw output'}
                      </button>
                      {isExpanded && (
                        <div className={styles.rawContent}>
                          <pre>{item.rawOutput || '(none)'}</pre>
                          <div className={styles.copyRow}>
                            <button
                              type="button"
                              className={styles.copyButton}
                              onClick={() => copyToClipboard(item.rawOutput || '')}
                            >
                              <Copy size={14} />
                              Copy
                            </button>
                            <button
                              type="button"
                              className={styles.copyButton}
                              onClick={() => {
                                const blob = new Blob(
                                  [
                                    JSON.stringify({
                                      request: structured.request,
                                      response: structured.response,
                                      proof: proofHighlight,
                                      raw: item.rawOutput,
                                    }),
                                  ],
                                  { type: 'application/json' }
                                )
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `evidence-${vulnerability.id}-${item.id}.json`
                                a.click()
                                URL.revokeObjectURL(url)
                              }}
                            >
                              <Download size={14} />
                              Download proof
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Primary actions */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Actions</h3>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionButtonPrimary}
              onClick={handleOpenDetails}
            >
              <ExternalLink size={14} />
              Open details
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleRetest}
              disabled={retesting}
            >
              {retesting ? <Loader2 size={14} className={styles.spinner} /> : <RefreshCw size={14} />}
              Retest
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleCreateTicket}
              disabled={creatingTicket}
            >
              {creatingTicket ? <Loader2 size={14} className={styles.spinner} /> : <Ticket size={14} />}
              {workflow.ticket ? 'View ticket' : 'Create ticket'}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => setAssignModal(true)}
            >
              <UserPlus size={14} />
              {workflow.ownerId || 'Assign'}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => {
                setStatusValue((workflow.status as VulnStatus) || 'open')
                setStatusModal(true)
              }}
            >
              <CheckCircle2 size={14} />
              {VULN_STATUS_LABELS[(workflow.status as VulnStatus) || 'open']}
            </button>
          </div>
        </section>

        {/* Assign modal (inline) */}
        {assignModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <h4>Assign owner</h4>
              <input
                type="text"
                placeholder="Name or email"
                value={assignValue}
                onChange={(e) => setAssignValue(e.target.value)}
                className={styles.input}
              />
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalButtonSecondary}
                  onClick={() => {
                    setAssignModal(false)
                    setAssignValue('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.modalButtonPrimary}
                  onClick={() => handleAssign(assignValue)}
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status modal (inline) */}
        {statusModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <h4>Change status</h4>
              <div className={styles.statusOptions}>
                {(
                  [
                    'open',
                    'in_progress',
                    'fixed',
                    'verified',
                    'risk_accepted',
                    'false_positive',
                  ] as VulnStatus[]
                ).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={
                      statusValue === s
                        ? styles.statusOptionActive
                        : styles.statusOption
                    }
                    onClick={() => setStatusValue(s)}
                  >
                    {VULN_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              {statusValue === 'risk_accepted' && (
                <div className={styles.statusFields}>
                  <label>Reason (required)</label>
                  <input
                    type="text"
                    placeholder="Reason for risk acceptance"
                    value={riskReason}
                    onChange={(e) => setRiskReason(e.target.value)}
                    className={styles.input}
                  />
                  <label>Approver (required)</label>
                  <input
                    type="text"
                    placeholder="Approver ID or email"
                    value={riskApproverId}
                    onChange={(e) => setRiskApproverId(e.target.value)}
                    className={styles.input}
                  />
                  <label>Expires at (required)</label>
                  <input
                    type="date"
                    value={riskExpiresAt}
                    onChange={(e) => setRiskExpiresAt(e.target.value)}
                    className={styles.input}
                  />
                </div>
              )}
              {statusValue === 'false_positive' && (
                <div className={styles.statusFields}>
                  <label>Reason (required)</label>
                  <input
                    type="text"
                    placeholder="Evidence or reason for false positive"
                    value={fpReason}
                    onChange={(e) => setFpReason(e.target.value)}
                    className={styles.input}
                  />
                </div>
              )}
              {statusValue === 'verified' && (
                <p className={styles.statusHint}>
                  Verified requires a successful retest. Run Retest first; if the finding is no longer detected, you can set Verified.
                </p>
              )}
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalButtonSecondary}
                  onClick={() => {
                    setStatusModal(false)
                    setRiskReason('')
                    setRiskApproverId('')
                    setRiskExpiresAt('')
                    setFpReason('')
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.modalButtonPrimary}
                  onClick={() => handleStatusChange(statusValue)}
                  disabled={
                    (statusValue === 'risk_accepted' && (!riskReason || !riskApproverId || !riskExpiresAt)) ||
                    (statusValue === 'false_positive' && !fpReason)
                  }
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

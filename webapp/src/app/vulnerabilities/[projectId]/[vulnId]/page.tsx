'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Copy,
  Download,
  RefreshCw,
  Ticket,
  FileText,
} from 'lucide-react'
import type { Evidence } from '@/lib/evidenceTypes'
import { VULN_STATUS_LABELS } from '@/lib/vulnerability-types'
import { getAssetFromVuln } from '@/lib/asset-utils'
import { parseEvidence, extractProofHighlight } from '@/lib/evidence-parser'
import { synthesizeAISummary } from '@/lib/vuln-summary'
import styles from './page.module.css'

interface Vulnerability {
  id: string
  name: string
  severity: string
  source: string
  toolName?: string
  category?: string
  cvssScore?: number
  description?: string
  solution?: string
  cveIds: string[]
  endpoints: Array<{ url: string; path: string; method: string }>
  baseUrls: string[]
  attackTechniques?: Array<{ id: string; name: string; tactic: string }>
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  info: '#6b7280',
}

type TabId = 'overview' | 'fix' | 'evidence' | 'timeline' | 'comments'

export default function VulnDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const vulnId = params.vulnId as string

  const [vuln, setVuln] = useState<Vulnerability | null>(null)
  const [findingState, setFindingState] = useState<{
    status: string
    ownerId: string | null
    firstSeenAt: string | null
    lastSeenAt: string | null
    updatedAt: string
    updatedById: string | null
    ticket: { ticketUrl: string; provider: string } | null
  } | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [creatingTicket, setCreatingTicket] = useState(false)

  useEffect(() => {
    if (!projectId || !vulnId) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const [vulnRes, evRes] = await Promise.all([
          fetch(`/api/vulnerabilities/${projectId}/${vulnId}`),
          fetch(`/api/evidence?projectId=${projectId}&vulnerabilityId=${vulnId}`),
        ])
        if (!vulnRes.ok) {
          const errData = await vulnRes.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to fetch vulnerability')
        }
        const found = await vulnRes.json()
        setVuln(found)

        const stateRes = await fetch(
          `/api/findings/${projectId}/${vulnId}?severity=${encodeURIComponent(found.severity || '')}`
        )
        if (stateRes.ok) {
          const stateData = await stateRes.json()
          setFindingState(stateData)
        }

        if (evRes.ok) {
          const evData = await evRes.json()
          setEvidence(evData.evidence || [])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [projectId, vulnId])

  if (loading && !vuln) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  if (error || !vuln) {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <p>{error || 'Not found'}</p>
          <Link href={`/vulnerabilities`} className={styles.backLink}>
            <ChevronLeft size={16} />
            Back to list
          </Link>
        </div>
      </div>
    )
  }

  const workflow = findingState ?? {
    status: 'open',
    ownerId: null,
    firstSeenAt: null,
    lastSeenAt: null,
    updatedAt: new Date().toISOString(),
    updatedById: null,
    ticket: null,
  }
  const asset = getAssetFromVuln(vuln)
  const entrypoints = vuln.endpoints || []
  const evidenceHighlights = evidence
    .map((e) => extractProofHighlight(e.rawOutput || ''))
    .filter((h): h is string => !!h)
  const aiSummary = synthesizeAISummary(vuln, evidenceHighlights, entrypoints.length)

  const handleCreateTicket = useCallback(async () => {
    if (!projectId || !vulnId || !vuln) return
    if (workflow.ticket?.ticketUrl) {
      window.open(workflow.ticket.ticketUrl, '_blank')
      return
    }
    setCreatingTicket(true)
    try {
      const epList = entrypoints.map((ep) => `${ep.method} ${ep.path || ep.url}`)
      const body = {
        action: 'create' as const,
        provider: 'github',
        title: vuln.name,
        severity: vuln.severity,
        asset: asset.label,
        entrypoints: epList,
        summary: `${aiSummary.what}\n\n${aiSummary.why}\n\n${aiSummary.fix}`,
        remediation: vuln.solution || aiSummary.fix,
      }
      const res = await fetch(`/api/findings/${projectId}/${vulnId}/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ticketUrl) {
        window.open(data.ticketUrl, '_blank')
        const stateRes = await fetch(
          `/api/findings/${projectId}/${vulnId}?severity=${encodeURIComponent(vuln.severity || '')}`
        )
        if (stateRes.ok) {
          const stateData = await stateRes.json()
          setFindingState(stateData)
        }
      } else if (data.error) {
        alert(data.error)
      }
    } finally {
      setCreatingTicket(false)
    }
  }, [projectId, vulnId, vuln, workflow.ticket?.ticketUrl, entrypoints, asset.label, aiSummary])

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'fix', label: 'Fix' },
    { id: 'evidence', label: 'Evidence' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'comments', label: 'Comments' },
  ]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/vulnerabilities" className={styles.breadcrumb}>
          <ChevronLeft size={16} />
          Vulnerabilities
        </Link>
        <div className={styles.headerRow}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{vuln.name}</h1>
            <div className={styles.badges}>
              <span
                className={styles.severityBadge}
                style={{ backgroundColor: SEVERITY_COLORS[vuln.severity] || SEVERITY_COLORS.info }}
              >
                {vuln.severity.toUpperCase()}
              </span>
              <span className={styles.statusBadge}>{VULN_STATUS_LABELS[workflow.status as keyof typeof VULN_STATUS_LABELS] || workflow.status}</span>
              <span className={styles.sourceBadge}>
                {vuln.toolName ? `${vuln.source} (${vuln.toolName})` : vuln.source}
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.actionBtn} title="Retest (stub)">
              <RefreshCw size={14} />
              Retest
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              title={workflow.ticket ? 'View ticket' : 'Create ticket'}
              onClick={handleCreateTicket}
              disabled={creatingTicket}
            >
              {creatingTicket ? (
                <RefreshCw size={14} className={styles.spin} />
              ) : (
                <Ticket size={14} />
              )}
              {workflow.ticket ? 'View ticket' : 'Create ticket'}
            </button>
            <button type="button" className={styles.actionBtn} title="Export (stub)">
              <FileText size={14} />
              Export
            </button>
          </div>
        </div>
      </header>

      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'overview' && (
          <OverviewTab vuln={vuln} asset={asset} workflow={workflow} aiSummary={aiSummary} />
        )}
        {activeTab === 'fix' && <FixTab vuln={vuln} />}
        {activeTab === 'evidence' && (
          <EvidenceTab vuln={vuln} evidence={evidence} />
        )}
        {activeTab === 'timeline' && <TimelineTab evidence={evidence} />}
        {activeTab === 'comments' && (
          <CommentsTab projectId={projectId} vulnId={vulnId} />
        )}
      </div>
    </div>
  )
}

function OverviewTab({
  vuln,
  asset,
  workflow,
  aiSummary,
}: {
  vuln: Vulnerability
  asset: { label: string; source: string }
  workflow: { firstSeenAt: string | null; lastSeenAt: string | null; ownerId: string | null; updatedAt: string; updatedById: string | null }
  aiSummary: { what: string; why: string; fix: string; howExploited?: string; howToVerify?: string }
}) {
  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : '—'

  return (
    <div className={styles.tabContent}>
      <div className={styles.aiSummaryBlock}>
        <h3>AI Summary</h3>
        <dl>
          <dt>What it is</dt>
          <dd>{aiSummary.what}</dd>
          <dt>Why it matters</dt>
          <dd>{aiSummary.why}</dd>
          {aiSummary.howExploited && (
            <>
              <dt>How exploited</dt>
              <dd>{aiSummary.howExploited}</dd>
            </>
          )}
          <dt>What to fix</dt>
          <dd>{aiSummary.fix}</dd>
          {aiSummary.howToVerify && (
            <>
              <dt>How to verify</dt>
              <dd>{aiSummary.howToVerify}</dd>
            </>
          )}
        </dl>
      </div>
      <div className={styles.overviewGrid}>
        <div className={styles.metadataCard}>
          <h3>Metadata</h3>
          <dl>
            <dt>Severity</dt>
            <dd>{vuln.severity}</dd>
            <dt>Status</dt>
            <dd>{workflow.ownerId ? 'Assigned' : 'Open'}</dd>
            <dt>Asset</dt>
            <dd title={`Derived from: ${asset.source}`}>{asset.label}</dd>
            <dt>First discovered</dt>
            <dd>{formatDate(workflow.firstSeenAt)}</dd>
            <dt>Last seen</dt>
            <dd>{formatDate(workflow.lastSeenAt)}</dd>
            <dt>Scanner</dt>
            <dd>{vuln.toolName ? `${vuln.source} (${vuln.toolName})` : vuln.source}</dd>
            <dt>Last updated</dt>
            <dd>
              {formatDate(workflow.updatedAt)}
              {workflow.updatedById && (
                <span className={styles.updatedBy}> by {workflow.updatedById}</span>
              )}
            </dd>
          </dl>
          <h3>Mappings</h3>
          <dl>
            {vuln.category && (
              <>
                <dt>CWE</dt>
                <dd>{vuln.category}</dd>
              </>
            )}
            <dt>OWASP</dt>
            <dd>{vuln.category?.includes('injection') ? 'A03:2021 Injection' : '—'}</dd>
            <dt>MITRE ATT&CK</dt>
            <dd>
              {vuln.attackTechniques?.length
                ? vuln.attackTechniques.map((t) => `${t.id} ${t.name}`).join(', ')
                : '—'}
            </dd>
          </dl>
        </div>
        <div className={styles.summaryCard}>
          <h3>Description</h3>
          {vuln.description ? <p>{vuln.description}</p> : <p className={styles.muted}>No description</p>}
          <h3>Affected instances</h3>
          {vuln.endpoints?.length ? (
            <table className={styles.instancesTable}>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {vuln.endpoints.map((ep, i) => (
                  <tr key={i}>
                    <td><code>{ep.method}</code></td>
                    <td><code>{ep.path || ep.url}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>No endpoints recorded</p>
          )}
        </div>
      </div>
    </div>
  )
}

function FixTab({ vuln }: { vuln: Vulnerability }) {
  const category = vuln.category || ''
  const isInjection = category.includes('sqli') || category.includes('injection') || category.includes('xss')
  return (
    <div className={styles.tabContent}>
      <section className={styles.fixSection}>
        <h3>Recommended remediation</h3>
        <p>{vuln.solution || 'Apply secure coding practices. Validate and sanitize all user input. Use parameterized queries for database access. Follow principle of least privilege.'}</p>
      </section>
      <section className={styles.fixSection}>
        <h3>Secure configuration guidance</h3>
        <ul>
          <li>OAuth redirect URI: use exact match, not wildcard</li>
          <li>Cookies: set HttpOnly, Secure, SameSite=Strict</li>
          <li>CORS: allow only trusted origins; avoid wildcard</li>
          <li>Headers: set secure defaults (X-Content-Type-Options, CSP, etc.)</li>
        </ul>
      </section>
      <section className={styles.fixSection}>
        <h3>Code-level guidance</h3>
        <ul>
          {isInjection ? (
            <>
              <li>Use parameterized queries or prepared statements; never concatenate user input into SQL</li>
              <li>Validate and sanitize all user input; encode output for context (HTML, JS, URL)</li>
              <li>Apply the principle of least privilege</li>
            </>
          ) : (
            <>
              <li>Validate and sanitize all user input</li>
              <li>Use parameterized queries for database access</li>
              <li>Follow least-privilege and defense in depth</li>
            </>
          )}
        </ul>
      </section>
      <section className={styles.fixSection}>
        <h3>Verification steps</h3>
        <ol>
          <li>Apply the recommended fix</li>
          <li>Retest the affected endpoint(s) using the same payload</li>
          <li>Confirm the vulnerability no longer reproduces</li>
          <li>Run a full regression scan if applicable</li>
        </ol>
      </section>
      <section className={styles.fixSection}>
        <h3>Compensating controls</h3>
        <ul>
          <li>WAF rule to block known attack patterns</li>
          <li>Rate limiting on sensitive endpoints</li>
          <li>Input validation at the edge</li>
        </ul>
      </section>
      <section className={styles.fixSection}>
        <h3>Create PR checklist</h3>
        <ul>
          <li><strong>Files/configs likely touched:</strong> Request handlers, validation layer, DB access layer</li>
          <li><strong>Required tests:</strong> Unit tests for new validation; integration test for affected endpoint</li>
          <li><strong>Rollout:</strong> Feature flag or staged rollout</li>
          <li><strong>Monitoring:</strong> Verify no regressions in error rates or latency</li>
        </ul>
      </section>
    </div>
  )
}

function EvidenceTab({ vuln, evidence }: { vuln: Vulnerability; evidence: Evidence[] }) {
  const [stepsExpanded, setStepsExpanded] = useState(true)
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }

  const stepsToReplicate = evidence.length > 0
    ? (() => {
        const first = evidence[0]
        const structured = parseEvidence(first.rawOutput || '')
        const steps: string[] = []
        if (structured.request) {
          steps.push(`Send ${structured.request.method} request to ${structured.request.url}`)
          if (structured.request.body) steps.push('Include the payload in the request body')
        }
        steps.push('Observe the response for vulnerability indicators')
        steps.push('Compare with expected secure behavior')
        return steps
      })()
    : []

  return (
    <div className={styles.tabContent}>
      {evidence.length > 0 && stepsToReplicate.length > 0 && (
        <section className={styles.collapsibleSection}>
          <button
            type="button"
            className={styles.collapsibleHeader}
            onClick={() => setStepsExpanded((e) => !e)}
            aria-expanded={stepsExpanded}
          >
            <span>Steps to replicate</span>
            <span className={styles.collapsibleIcon}>{stepsExpanded ? '−' : '+'}</span>
          </button>
          {stepsExpanded && (
            <ol className={styles.stepsList}>
              {stepsToReplicate.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          )}
        </section>
      )}
      {evidence.length === 0 ? (
        <p className={styles.muted}>No evidence records yet.</p>
      ) : (
        evidence.map((item) => {
          const structured = parseEvidence(item.rawOutput || '')
          const proof = extractProofHighlight(item.rawOutput || '')
          return (
            <div key={item.id} className={styles.evidenceBlock}>
              <div className={styles.evidenceMeta}>
                <span>{item.tool}</span>
                <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</span>
              </div>
              {structured.request && (
                <div className={styles.structuredBlock}>
                  <h4>Request</h4>
                  <div className={styles.requestBlock}>
                    <code>{structured.request.method} {structured.request.url}</code>
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => copyToClipboard(structured.request!.url)}
                    >
                      <Copy size={12} />
                      Copy
                    </button>
                  </div>
                </div>
              )}
              {proof && (
                <div className={styles.proofBlock}>
                  <h4>Proof</h4>
                  <pre>{proof}</pre>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => copyToClipboard(proof)}
                  >
                    <Copy size={12} />
                    Copy
                  </button>
                </div>
              )}
              <div className={styles.downloadRow}>
                <button
                  type="button"
                  className={styles.downloadBtn}
                  onClick={() => {
                    const blob = new Blob(
                      [
                        JSON.stringify({
                          vulnerability: vuln.name,
                          request: structured.request,
                          proof,
                          raw: item.rawOutput,
                        }),
                      ],
                      { type: 'application/json' }
                    )
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `proof-${vuln.id}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <Download size={14} />
                  Download proof bundle
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function CommentsTab({
  projectId,
  vulnId,
}: {
  projectId: string
  vulnId: string
}) {
  const [comments, setComments] = useState<Array<{ id: string; authorId: string; body: string; createdAt: string }>>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/findings/${projectId}/${vulnId}/comments`)
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments || [])
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, vulnId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handlePost = async () => {
    if (!newComment.trim() || posting) return
    setPosting(true)
    try {
      const res = await fetch(`/api/findings/${projectId}/${vulnId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setComments((prev) => [...prev, data])
        setNewComment('')
      }
    } finally {
      setPosting(false)
    }
  }

  if (loading) return <p className={styles.muted}>Loading comments...</p>

  return (
    <div className={styles.tabContent}>
      <div className={styles.commentsPanel}>
        <div className={styles.commentForm}>
          <textarea
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className={styles.commentInput}
            rows={3}
          />
          <button
            type="button"
            className={styles.commentSubmit}
            onClick={handlePost}
            disabled={!newComment.trim() || posting}
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
        <ul className={styles.commentList}>
          {comments.map((c) => (
            <li key={c.id} className={styles.commentItem}>
              <div className={styles.commentMeta}>
                <span className={styles.commentAuthor}>{c.authorId}</span>
                <span className={styles.commentTime}>
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className={styles.commentBody}>{c.body}</p>
            </li>
          ))}
        </ul>
        {comments.length === 0 && (
          <p className={styles.muted}>No comments yet. Add one above.</p>
        )}
      </div>
    </div>
  )
}

function TimelineTab({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className={styles.tabContent}>
      <h3>Agent trace / Scan timeline</h3>
      <p className={styles.muted}>
        How this finding was discovered: phases, tools, and steps taken.
      </p>
      {evidence.length === 0 ? (
        <p className={styles.muted}>No scan events recorded yet.</p>
      ) : (
        <ul className={styles.timeline}>
          {evidence.map((item) => (
            <li key={item.id} className={styles.timelineItem}>
              <span className={styles.timelineTime}>
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
              </span>
              <span className={styles.timelinePhase}>{item.phase}</span>
              <span className={styles.timelineTool}>{item.tool}</span>
              <span className={styles.timelineSummary}>{item.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

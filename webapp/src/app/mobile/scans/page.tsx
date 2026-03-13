'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Smartphone, Upload, Shield, AlertTriangle, CheckCircle,
  XCircle, Clock, RefreshCw, Download, ChevronRight,
  Activity, Lock, Wifi, Eye, Package, Key, X, Zap,
  Bot, FileText, Info, ArrowLeft, Filter, ExternalLink,
  Code2, BookOpen, Wrench, Tag, Copy, Check,
} from 'lucide-react'
import { parseMobSFReport, MobileFinding, Severity, OWASP_MOBILE_TOP10 } from '@/lib/mobile/report-parser'
import styles from './page.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'ANDROID' | 'IOS' | 'WINDOWS'
type ScanStatus = 'UPLOADING' | 'SCANNING' | 'COMPLETE' | 'FAILED'
type SevFilter = 'ALL' | Severity

interface MobileScan {
  id: string
  appName: string
  packageName?: string | null
  version?: string | null
  platform: Platform
  fileName: string
  fileSize?: number | null
  status: ScanStatus
  score?: number | null
  grade?: string | null
  agentRunId?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  findings?: any
  scorecard?: any
  cveData?: any
  mobsfHash?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'var(--text-tertiary)'
  if (score >= 90) return 'var(--status-success)'
  if (score >= 70) return 'var(--status-warning)'
  if (score >= 40) return 'var(--status-warning)'
  return 'var(--status-error)'
}

function gradeColor(grade: string | null | undefined): string {
  if (!grade) return 'var(--text-tertiary)'
  if (grade === 'A') return 'var(--status-success)'
  if (grade === 'B') return 'var(--status-success-text)'
  if (grade === 'C') return 'var(--status-warning-text)'
  if (grade === 'D') return 'var(--status-error-text)'
  return 'var(--status-error)'
}

function platformLabel(p: Platform) {
  if (p === 'ANDROID') return { label: 'Android', cls: styles.badgeAndroid }
  if (p === 'IOS') return { label: 'iOS', cls: styles.badgeIos }
  return { label: 'Windows', cls: styles.badgeWindows }
}

function statusLabel(s: ScanStatus) {
  const map: Record<ScanStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    UPLOADING: { label: 'Uploading', cls: styles.statusUploading, icon: <Upload size={12} /> },
    SCANNING:  { label: 'Scanning',  cls: styles.statusScanning,  icon: <Activity size={12} /> },
    COMPLETE:  { label: 'Complete',  cls: styles.statusComplete,  icon: <CheckCircle size={12} /> },
    FAILED:    { label: 'Failed',    cls: styles.statusFailed,    icon: <XCircle size={12} /> },
  }
  return map[s]
}

/** Parse "file/path.java:42 — code snippet" into parts */
function parseEvidenceString(evidence?: string | null): { fileRef: string | null; lineNum: string | null; snippet: string | null } {
  if (!evidence) return { fileRef: null, lineNum: null, snippet: null }
  const dashIdx = evidence.indexOf(' — ')
  let filePart = dashIdx !== -1 ? evidence.substring(0, dashIdx).trim() : evidence.trim()
  const snippet = dashIdx !== -1 ? evidence.substring(dashIdx + 3).trim() : null

  // Extract line number from "file.java:42"
  const colonIdx = filePart.lastIndexOf(':')
  let lineNum: string | null = null
  if (colonIdx !== -1) {
    const maybeNum = filePart.substring(colonIdx + 1)
    if (/^\d+$/.test(maybeNum)) {
      lineNum = maybeNum
      filePart = filePart.substring(0, colonIdx)
    }
  }

  // Only treat as fileRef if it has path chars
  const isPath = filePart.includes('/') || filePart.includes('.') || /\w+\.\w+/.test(filePart)
  return {
    fileRef: isPath ? filePart : null,
    lineNum,
    snippet: snippet || (!isPath ? filePart : null),
  }
}

function sevClass(sev: Severity): string {
  const map: Record<Severity, string> = {
    CRITICAL: styles.sevCritical,
    HIGH:     styles.sevHigh,
    MEDIUM:   styles.sevMedium,
    LOW:      styles.sevLow,
    INFO:     styles.sevInfo,
  }
  return map[sev] ?? styles.sevInfo
}

function owaspCategoryLabel(id: string): string {
  return (OWASP_MOBILE_TOP10 as any)[id]?.title ?? id
}

// Score ring SVG
function ScoreRing({ score, size = 80 }: { score: number | null | undefined; size?: number }) {
  const radius = (size - 10) / 2
  const circumference = 2 * Math.PI * radius
  const progress = score != null ? (score / 100) * circumference : 0
  const color = scoreColor(score)
  return (
    <div className={styles.scoreRing} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border-default)" strokeWidth={6}/>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${progress} ${circumference}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dasharray 0.8s ease' }}/>
      </svg>
      <div className={styles.scoreRingLabel} style={{ color }}>{score != null ? score : '—'}</div>
    </div>
  )
}

// OWASP category map (used in drawer)
const OWASP_CATEGORIES = [
  { id: 'M1',  label: 'Improper Credential Usage',            icon: <Key size={14} /> },
  { id: 'M2',  label: 'Inadequate Supply Chain Security',     icon: <Package size={14} /> },
  { id: 'M3',  label: 'Insecure Authentication/Authorization', icon: <Lock size={14} /> },
  { id: 'M4',  label: 'Insufficient Input/Output Validation', icon: <AlertTriangle size={14} /> },
  { id: 'M5',  label: 'Insecure Communication',               icon: <Wifi size={14} /> },
  { id: 'M6',  label: 'Inadequate Privacy Controls',          icon: <Eye size={14} /> },
  { id: 'M7',  label: 'Insufficient Binary Protections',      icon: <Shield size={14} /> },
  { id: 'M8',  label: 'Security Misconfiguration',            icon: <Activity size={14} /> },
  { id: 'M9',  label: 'Insecure Data Storage',                icon: <FileText size={14} /> },
  { id: 'M10', label: 'Insufficient Cryptography',            icon: <Lock size={14} /> },
]

function formatFramework(fw: string): string {
  const map: Record<string, string> = {
    OWASP_MOBILE: 'OWASP Mobile', GDPR: 'GDPR Art.32',
    PCI_DSS: 'PCI-DSS v4', HIPAA: 'HIPAA §164.312', SOC2: 'SOC 2'
  }
  return map[fw] ?? fw
}

// ─── Finding Detail View ───────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button className={styles.copyBtn} onClick={handleCopy} title="Copy to clipboard">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function FindingDetailView({ finding, onBack }: { finding: MobileFinding; onBack: () => void }) {
  const { fileRef, lineNum, snippet } = parseEvidenceString(finding.evidence)
  const catInfo = OWASP_CATEGORIES.find(c => c.id === finding.owaspCategory)

  return (
    <div className={styles.findingDetail}>
      {/* Back nav */}
      <button className={styles.findingDetailBack} onClick={onBack}>
        <ArrowLeft size={14} /> Back to Evidence
      </button>

      {/* Header */}
      <div className={styles.findingDetailHeader}>
        <div className={styles.findingDetailBadges}>
          <span className={`${styles.sevBadgeLg} ${sevClass(finding.severity)}`}>{finding.severity}</span>
          <span className={styles.owaspPill}>{finding.owaspCategory}</span>
          {finding.cveIds && finding.cveIds.length > 0 && (
            <span className={styles.cvePillCount}>{finding.cveIds.length} CVE{finding.cveIds.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <h3 className={styles.findingDetailTitle}>{finding.title}</h3>
        <p className={styles.findingDetailCategory}>{catInfo?.label ?? owaspCategoryLabel(finding.owaspCategory)}</p>
      </div>

      <div className={styles.findingDetailBody}>
        {/* Evidence Location + Snippet */}
        {(fileRef || snippet) && (
          <div className={styles.evidenceBlock}>
            <div className={styles.evidenceBlockLabel}>
              <Code2 size={13} /> Evidence
            </div>
            {fileRef && (
              <div className={styles.fileRefRow}>
                <span className={styles.fileRefIcon}>📁</span>
                <code className={styles.fileRefCode}>{fileRef}{lineNum ? `:${lineNum}` : ''}</code>
                {lineNum && <span className={styles.lineNumBadge}>Line {lineNum}</span>}
                <CopyButton text={fileRef + (lineNum ? `:${lineNum}` : '')} />
              </div>
            )}
            {snippet && (
              <div className={styles.codeBlockWrap}>
                <div className={styles.codeBlockHeader}>
                  <span className={styles.codeBlockLang}>
                    {fileRef?.endsWith('.java') ? 'java' :
                     fileRef?.endsWith('.kt')   ? 'kotlin' :
                     fileRef?.endsWith('.swift')? 'swift' :
                     fileRef?.endsWith('.js') || fileRef?.endsWith('.ts') ? 'javascript' : 'code'}
                  </span>
                  <CopyButton text={snippet} />
                </div>
                <pre className={styles.codeBlock}><code>{snippet}</code></pre>
              </div>
            )}
            {!fileRef && !snippet && finding.evidence && (
              <div className={styles.rawEvidenceBlock}>
                <pre className={styles.codeBlock}><code>{finding.evidence}</code></pre>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className={styles.detailSection}>
          <div className={styles.detailSectionLabel}><BookOpen size={13} /> Description</div>
          <p className={styles.detailSectionText}>{finding.description}</p>
        </div>

        {/* CVE IDs */}
        {finding.cveIds && finding.cveIds.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionLabel}><Tag size={13} /> CVE Identifiers</div>
            <div className={styles.cveRow}>
              {finding.cveIds.map(cve => (
                <a
                  key={cve}
                  href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.cveBadge}
                >
                  {cve} <ExternalLink size={10} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation */}
        <div className={`${styles.detailSection} ${styles.recommendationSection}`}>
          <div className={styles.detailSectionLabel}><Wrench size={13} /> Recommendation</div>
          <p className={styles.recommendationText}>{finding.recommendation}</p>
        </div>

        {/* References */}
        {finding.references && finding.references.length > 0 && (
          <div className={styles.detailSection}>
            <div className={styles.detailSectionLabel}><ExternalLink size={13} /> References</div>
            <div className={styles.refLinks}>
              {finding.references.map((ref, i) => (
                <a key={i} href={ref} target="_blank" rel="noopener noreferrer" className={styles.refLink}>
                  {ref.replace('https://', '').split('/')[0]}
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Evidence Tab ──────────────────────────────────────────────────────────────

function EvidenceTab({
  parsedFindings,
  appName,
  scanId,
  onSelectFinding,
}: {
  parsedFindings: MobileFinding[]
  appName: string
  scanId: string
  onSelectFinding: (f: MobileFinding) => void
}) {
  const [sevFilter, setSevFilter] = useState<SevFilter>('ALL')
  const [exporting, setExporting] = useState(false)

  const counts: Record<string, number> = { ALL: parsedFindings.length }
  for (const f of parsedFindings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1
  }

  const filtered = sevFilter === 'ALL' ? parsedFindings : parsedFindings.filter(f => f.severity === sevFilter)

  const handleExportJSON = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/mobile/scans/${scanId}/evidence-export`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${appName.replace(/\s+/g, '_')}_evidence.json`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) { console.error(e) }
    setExporting(false)
  }

  const SEV_ORDER: SevFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
  const SEV_COLORS: Record<string, string> = {
    CRITICAL: '#c084fc', HIGH: '#f87171', MEDIUM: '#fb923c', LOW: '#facc15', INFO: '#60a5fa'
  }

  return (
    <div className={styles.evidenceTab}>
      {/* Filter bar */}
      <div className={styles.evidenceFilterBar}>
        <div className={styles.evidenceFilters}>
          <Filter size={13} className={styles.filterIcon} />
          {SEV_ORDER.map(sev => {
            const cnt = counts[sev] ?? 0
            if (sev !== 'ALL' && !cnt) return null
            return (
              <button
                key={sev}
                className={`${styles.sevFilterPill} ${sevFilter === sev ? styles.sevFilterActive : ''}`}
                style={sevFilter === sev && sev !== 'ALL' ? { borderColor: SEV_COLORS[sev], color: SEV_COLORS[sev] } : {}}
                onClick={() => setSevFilter(sev)}
              >
                {sev === 'ALL' ? 'All' : sev}
                <span className={styles.sevFilterCount}>{cnt}</span>
              </button>
            )
          })}
        </div>
        <button className={styles.exportBtn} onClick={handleExportJSON} disabled={exporting}>
          <Download size={13} />
          {exporting ? 'Exporting…' : 'Export JSON'}
        </button>
      </div>

      {/* Summary bar */}
      <div className={styles.evidenceSummaryBar}>
        {(['CRITICAL','HIGH','MEDIUM','LOW'] as Severity[]).map(sev => {
          const cnt = counts[sev] ?? 0
          if (!cnt) return null
          return (
            <div key={sev} className={styles.evidenceSummaryItem}
              style={{ borderLeftColor: SEV_COLORS[sev] }}>
              <span style={{ color: SEV_COLORS[sev] }} className={styles.evidenceSumCount}>{cnt}</span>
              <span className={styles.evidenceSumLabel}>{sev}</span>
            </div>
          )
        })}
        <div className={styles.evidenceSummaryItem} style={{ borderLeftColor: 'var(--border-default)' }}>
          <span className={styles.evidenceSumCount}>{parsedFindings.length}</span>
          <span className={styles.evidenceSumLabel}>TOTAL</span>
        </div>
      </div>

      {/* Findings list grouped by OWASP */}
      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle size={32} />
          <p>No findings at this severity level</p>
        </div>
      ) : (
        <div className={styles.evidenceList}>
          {OWASP_CATEGORIES.filter(cat =>
            filtered.some(f => f.owaspCategory === cat.id)
          ).map(cat => {
            const catFindings = filtered.filter(f => f.owaspCategory === cat.id)
            return (
              <div key={cat.id} className={styles.evidenceGroup}>
                <div className={styles.evidenceGroupHeader}>
                  <span className={styles.evidenceGroupId}>{cat.id}</span>
                  <span className={styles.evidenceGroupTitle}>{cat.label}</span>
                  <span className={styles.evidenceGroupCount}>{catFindings.length}</span>
                </div>
                {catFindings.map(f => {
                  const { fileRef, lineNum, snippet } = parseEvidenceString(f.evidence)
                  return (
                    <button
                      key={f.id}
                      className={styles.evidenceItem}
                      onClick={() => onSelectFinding(f)}
                    >
                      <div className={styles.evidenceItemTop}>
                        <span className={`${styles.sevBadge} ${sevClass(f.severity)}`}>{f.severity}</span>
                        <span className={styles.evidenceItemTitle}>{f.title}</span>
                        {f.cveIds && f.cveIds.length > 0 && (
                          <span className={styles.cveCount}>{f.cveIds.length} CVE</span>
                        )}
                        <ChevronRight size={14} className={styles.evidenceArrow} />
                      </div>
                      {(fileRef || snippet) && (
                        <div className={styles.evidenceItemLocation}>
                          {fileRef && (
                            <span className={styles.evidenceFileRef}>
                              <span className={styles.evidenceFileIcon}>📁</span>
                              <code>{fileRef}{lineNum ? `:${lineNum}` : ''}</code>
                            </span>
                          )}
                          {snippet && (
                            <code className={styles.evidenceSnippet}>{snippet.substring(0, 80)}{snippet.length > 80 ? '…' : ''}</code>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Scan Detail Drawer ────────────────────────────────────────────────────────

function detectSecretType(s: string): string {
  const lower = s.toLowerCase()
  if (lower.includes('firebase')) return 'FIREBASE'
  if (lower.includes('api_key') || lower.includes('apikey')) return 'API KEY'
  if (lower.includes('password') || lower.includes('passwd')) return 'PASSWORD'
  if (lower.includes('token')) return 'TOKEN'
  if (lower.includes('secret')) return 'SECRET KEY'
  if (lower.includes('aws')) return 'AWS'
  if (lower.includes('private_key') || lower.includes('privatekey')) return 'PRIVATE KEY'
  if (lower.includes('url') || lower.includes('endpoint')) return 'ENDPOINT'
  return 'SECRET'
}

const DRAWER_MIN_WIDTH = 380
const DRAWER_MAX_WIDTH = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.95) : 1200
const DRAWER_DEFAULT_WIDTH = 680
const DRAWER_WIDTH_KEY = 'mobile-scan-drawer-width'

function ScanDrawer({ scan, onClose }: { scan: MobileScan; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview'|'findings'|'evidence'|'network'|'components'|'sbom'|'compliance'>('overview')
  const [revealedSecrets, setRevealedSecrets] = useState<Set<number>>(new Set())
  const [complianceReports, setComplianceReports] = useState<any[]>([])
  const [complianceLoading, setComplianceLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [selectedFinding, setSelectedFinding] = useState<MobileFinding | null>(null)

  // ── Resizable drawer ────────────────────────────────────────────────────────
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DRAWER_DEFAULT_WIDTH
    const saved = localStorage.getItem(DRAWER_WIDTH_KEY)
    if (saved) {
      const n = parseInt(saved, 10)
      if (n >= DRAWER_MIN_WIDTH && n <= window.innerWidth * 0.95) return n
    }
    return DRAWER_DEFAULT_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartX = useRef<number>(0)
  const resizeStartWidth = useRef<number>(DRAWER_DEFAULT_WIDTH)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeStartX.current = e.clientX
    resizeStartWidth.current = drawerWidth
    setIsResizing(true)

    const onMove = (ev: MouseEvent) => {
      const delta = resizeStartX.current - ev.clientX
      const next = Math.min(
        Math.max(resizeStartWidth.current + delta, DRAWER_MIN_WIDTH),
        Math.round(window.innerWidth * 0.95)
      )
      setDrawerWidth(next)
    }
    const onUp = () => {
      setIsResizing(false)
      setDrawerWidth(prev => {
        localStorage.setItem(DRAWER_WIDTH_KEY, String(prev))
        return prev
      })
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [drawerWidth])

  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(catId) ? next.delete(catId) : next.add(catId)
      return next
    })
  }

  const handleAnalyzeWithAI = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiAnalysis(null)
    try {
      const res = await fetch('/api/mobile/scans/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId: scan.id,
          appName: scan.appName,
          platform: scan.platform,
          score: scan.score,
          grade: scan.grade,
          findings: scan.findings,
        }),
      })
      const data = await res.json()
      if (data.response) setAiAnalysis(data.response)
      else setAiError(data.error || 'AI analysis failed')
    } catch (e: any) {
      setAiError(e.message)
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab !== 'compliance') return
    if (complianceReports.length > 0) return
    setComplianceLoading(true)
    fetch(`/api/mobile/scans/${scan.id}/compliance`)
      .then(r => r.json())
      .then(d => setComplianceReports(d.reports || []))
      .catch(() => {})
      .finally(() => setComplianceLoading(false))
  }, [activeTab, scan.id, complianceReports.length])

  // Parse findings with the proper parser
  const rawFindings = scan.findings
    ? (typeof scan.findings === 'string' ? (() => { try { return JSON.parse(scan.findings) } catch { return {} } })() : scan.findings)
    : {}

  const parsed = React.useMemo(() => {
    try { return parseMobSFReport(rawFindings, scan.platform as 'ANDROID' | 'IOS') }
    catch { return null }
  }, [scan.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const parsedFindings: MobileFinding[] = parsed?.findings ?? []

  // Legacy helpers for overview tab
  const findings = rawFindings
  const permissions = findings?.permissions?.permission_details ||
    findings?.permissions?.dangerous_permissions || []
  const networkFindings = findings?.network_security || findings?.certificate_analysis || null
  const secrets = findings?.secrets || findings?.hardcoded_secrets || []

  const owaspData: Record<string, 'pass' | 'warning' | 'fail'> = {}
  if (findings) {
    OWASP_CATEGORIES.forEach(cat => { owaspData[cat.id] = 'pass' })
    if (secrets.length > 0) owaspData['M1'] = 'fail'
    if (parsed?.vulnerableLibraries?.length ?? 0 > 0) owaspData['M2'] = 'fail'
    if (parsed?.networkSecurity?.clearTextTraffic) owaspData['M5'] = 'fail'
    if (parsed?.networkSecurity?.customTrustManager) owaspData['M5'] = 'fail'
    if (parsed?.binaryProtections?.debuggable) owaspData['M7'] = 'fail'
    if (parsed?.binaryProtections?.backupEnabled) owaspData['M8'] = 'warning'
    if (!parsed?.binaryProtections?.obfuscated && scan.platform === 'ANDROID') owaspData['M7'] = (owaspData['M7'] === 'fail') ? 'fail' : 'warning'
  }

  // ── Pre-compute Surface tab data (avoid IIFE in JSX) ──────────────────────
  const behaviourEntries: [string, any][] = rawFindings?.behaviour
    ? (Array.isArray(rawFindings.behaviour)
        ? (rawFindings.behaviour as any[]).map((r: any, i: number): [string, any] => [String(i), r])
        : Object.entries(rawFindings.behaviour))
    : []

  const browsableEntries: [string, any][] = rawFindings?.browsable_activities
    ? (Array.isArray(rawFindings.browsable_activities)
        ? (rawFindings.browsable_activities as any[]).map((r: any, i: number): [string, any] => [String(i), r])
        : Object.entries(rawFindings.browsable_activities))
    : []

  const androidApiEntries: [string, any][] = rawFindings?.android_api
    ? Object.entries(rawFindings.android_api)
    : []

  // Handle finding selection — switch to evidence tab
  const handleSelectFinding = (f: MobileFinding) => {
    setSelectedFinding(f)
    setActiveTab('evidence')
  }

  return (
    <div className={`${styles.drawerOverlay} ${isResizing ? styles.drawerResizing : ''}`} onClick={onClose}>
      <div
        className={styles.drawer}
        style={{ width: drawerWidth }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Resize handle ── */}
        <div
          className={styles.resizeHandle}
          onMouseDown={startResize}
          title="Drag to resize"
        >
          <div className={styles.resizeHandleDots} />
        </div>

        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitle}>
            <span className={platformLabel(scan.platform).cls + ' ' + styles.platformBadge}>
              {platformLabel(scan.platform).label}
            </span>
            <h2>{scan.appName}</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={styles.drawerTabs}>
          {(['overview', 'findings', 'evidence', 'network', 'components', 'sbom', 'compliance'] as const).map(tab => {
            const trackerCount = rawFindings?.trackers?.detected_trackers ?? 0
            const domainCount = rawFindings?.domains ? Object.keys(rawFindings.domains).length : 0
          const behaviourCount = behaviourEntries.length
            const sbomCount = rawFindings?.sbom?.sbom_versioned?.length ?? 0
            const tabLabel: Record<string, React.ReactNode> = {
              overview: 'Overview',
              findings: 'Findings',
              evidence: <>Evidence {parsedFindings.length > 0 && <span className={styles.tabBadge}>{parsedFindings.length}</span>}</>,
              network: <>Network {(trackerCount + domainCount) > 0 && <span className={styles.tabBadge}>{trackerCount > 0 ? trackerCount + ' trackers' : domainCount + ' domains'}</span>}</>,
              components: <>Surface {behaviourCount > 0 && <span className={styles.tabBadge}>{behaviourCount}</span>}</>,
              sbom: <>SBOM {sbomCount > 0 && <span className={styles.tabBadge}>{sbomCount}</span>}</>,
              compliance: 'Compliance',
            }
            return (
              <button
                key={tab}
                className={`${styles.drawerTab} ${activeTab === tab ? styles.drawerTabActive : ''}`}
                onClick={() => { setActiveTab(tab as any); if (tab !== 'evidence') setSelectedFinding(null) }}
              >
                {tabLabel[tab]}
              </button>
            )
          })}
        </div>

        <div className={styles.drawerBody}>
          {/* ── FINDING DETAIL (overlay within drawer body) ── */}
          {selectedFinding && activeTab === 'evidence' ? (
            <FindingDetailView finding={selectedFinding} onBack={() => setSelectedFinding(null)} />
          ) : (
            <>
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && <>
              <div className={styles.drawerSummary}>
                <div className={styles.appMeta}>
                  <div className={styles.metaRow}><span className={styles.metaKey}>Package</span><span className={styles.metaVal}>{scan.packageName || '—'}</span></div>
                  <div className={styles.metaRow}><span className={styles.metaKey}>Version</span><span className={styles.metaVal}>{scan.version || '—'}</span></div>
                  <div className={styles.metaRow}><span className={styles.metaKey}>File</span><span className={styles.metaVal}>{scan.fileName}</span></div>
                  {scan.fileSize && <div className={styles.metaRow}><span className={styles.metaKey}>Size</span><span className={styles.metaVal}>{formatBytes(scan.fileSize)}</span></div>}
                  <div className={styles.metaRow}><span className={styles.metaKey}>Status</span><span className={styles.metaVal}>{scan.status}</span></div>
                  {parsed && (
                    <>
                    <div className={styles.metaRow}><span className={styles.metaKey}>Critical</span><span className={styles.metaVal} style={{ color: '#c084fc' }}>{parsed.summary.critical}</span></div>
                    <div className={styles.metaRow}><span className={styles.metaKey}>High</span><span className={styles.metaVal} style={{ color: '#f87171' }}>{parsed.summary.high}</span></div>
                    <div className={styles.metaRow}><span className={styles.metaKey}>Medium</span><span className={styles.metaVal} style={{ color: '#fb923c' }}>{parsed.summary.medium}</span></div>
                    <div className={styles.metaRow}><span className={styles.metaKey}>Low</span><span className={styles.metaVal} style={{ color: '#facc15' }}>{parsed.summary.low}</span></div>
                    </>
                  )}
                </div>
                <div className={styles.scoreSection}>
                  <ScoreRing score={scan.score} size={100} />
                  <div className={styles.gradeBadge} style={{ color: gradeColor(scan.grade) }}>{scan.grade || '—'}</div>
                  <div className={styles.scoreLabel}>Security Score</div>
                </div>
              </div>

              {/* Binary protections quick view */}
              {parsed?.binaryProtections && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><Shield size={16} /> Binary Protections</h3>
                  <div className={styles.protectionGrid}>
                    {[
                      { key: 'obfuscated',        label: 'Obfuscation' },
                      { key: 'rootDetection',     label: 'Root Detection' },
                      { key: 'emulatorDetection', label: 'Emulator Detection' },
                      { key: 'antiTamper',        label: 'Anti-Tamper' },
                      { key: 'debuggable',        label: 'Debuggable', invert: true },
                      { key: 'backupEnabled',     label: 'Backup Enabled', invert: true },
                    ].map(({ key, label, invert }) => {
                      const val = (parsed.binaryProtections as any)[key]
                      const isGood = invert ? !val : val
                      return (
                        <div key={key} className={`${styles.protectionItem} ${isGood ? styles.protectionPass : styles.protectionFail}`}>
                          {isGood ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          <span>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* OWASP Top 10 grid */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}><Shield size={16} /> OWASP Mobile Top 10</h3>
                <div className={styles.owaspGrid}>
                  {OWASP_CATEGORIES.map(cat => {
                    const result = owaspData[cat.id] || (scan.status === 'COMPLETE' ? 'pass' : 'unknown')
                    const catCount = parsedFindings.filter(f => f.owaspCategory === cat.id).length
                    return (
                      <button key={cat.id}
                        className={`${styles.owaspRow} ${styles['owasp_' + result]}`}
                        onClick={() => catCount > 0 && handleSelectFinding(parsedFindings.find(f => f.owaspCategory === cat.id)!)}
                        style={{ cursor: catCount > 0 ? 'pointer' : 'default' }}
                      >
                        <span className={styles.owaspId}>{cat.id}</span>
                        <span className={styles.owaspIcon}>{cat.icon}</span>
                        <span className={styles.owaspLabel}>{cat.label}</span>
                        <span className={styles.owaspStatus}>
                          {result === 'pass' ? <CheckCircle size={14} /> :
                           result === 'warning' ? <AlertTriangle size={14} /> :
                           result === 'fail' ? <XCircle size={14} /> : <Clock size={14} />}
                          {catCount > 0 && <span className={styles.owaspCount}>{catCount}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Hardcoded Secrets quick summary */}
              {parsed?.hardcodedSecrets && parsed.hardcodedSecrets.length > 0 && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><Key size={16} /> Hardcoded Secrets ({parsed.hardcodedSecrets.length})</h3>
                  <div className={styles.secretList}>
                    {parsed.hardcodedSecrets.slice(0, 8).map((s, i) => (
                      <div key={i} className={styles.secretRow}>
                        <span className={styles.secretType}>{s.type}</span>
                        <span className={styles.secretFile}>{s.location}</span>
                        {s.value && <code className={styles.secretValue}>{s.value.substring(0, 40)}{s.value.length > 40 ? '…' : ''}</code>}
                      </div>
                    ))}
                    {parsed.hardcodedSecrets.length > 8 && (
                      <button className={styles.moreFindings} onClick={() => setActiveTab('evidence')}>
                        +{parsed.hardcodedSecrets.length - 8} more — view in Evidence tab
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Vulnerable Libraries */}
              {parsed?.vulnerableLibraries && parsed.vulnerableLibraries.length > 0 && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><Package size={16} /> Vulnerable Libraries</h3>
                  <div className={styles.libList}>
                    {parsed.vulnerableLibraries.map((lib, i) => (
                      <div key={i} className={styles.libRow}>
                        <span className={`${styles.sevBadge} ${sevClass(lib.severity)}`}>{lib.severity}</span>
                        <span className={styles.libName}>{lib.name}@{lib.version}</span>
                        <div className={styles.libCves}>
                          {lib.cveIds.slice(0, 3).map(cve => (
                            <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noopener noreferrer" className={styles.cveBadge}>{cve}</a>
                          ))}
                          {lib.cveIds.length > 3 && <span className={styles.moreCves}>+{lib.cveIds.length - 3}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Network Security */}
              {parsed?.networkSecurity && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><Wifi size={16} /> Network Security</h3>
                  <div className={styles.protectionGrid}>
                    {[
                      { key: 'clearTextTraffic',  label: 'Cleartext Traffic',  invert: true },
                      { key: 'certificatePinning',label: 'Certificate Pinning' },
                      { key: 'customTrustManager',label: 'Custom TrustManager', invert: true },
                      { key: 'weakTlsConfig',     label: 'Weak TLS Config',     invert: true },
                    ].map(({ key, label, invert }) => {
                      const val = (parsed.networkSecurity as any)[key]
                      const isGood = invert ? !val : val
                      return (
                        <div key={key} className={`${styles.protectionItem} ${isGood ? styles.protectionPass : styles.protectionFail}`}>
                          {isGood ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          <span>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Download HTML Report */}
              {scan.mobsfHash && (
                <div className={styles.section}>
                  <a href={`/api/mobile/scans/${scan.id}/report`} className={styles.downloadBtn} target="_blank" rel="noopener noreferrer">
                    <Download size={16} /> Download HTML Security Report
                  </a>
                </div>
              )}

              {/* AI Analysis */}
              <div className={styles.section}>
                {aiAnalysis ? (
                  <div className={styles.aiResult}>
                    <div className={styles.aiResultHeader}>
                      <Bot size={15} />
                      <span>AI Security Analysis</span>
                      <button className={styles.aiResultClose} onClick={() => setAiAnalysis(null)}>✕</button>
                    </div>
                    <div className={styles.aiResultBody}>
                      {aiAnalysis.split('\n').map((line, i) => (
                        <p key={i} className={line.startsWith('**') ? styles.aiResultHeading : styles.aiResultLine}>
                          {line.replace(/\*\*/g, '')}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : aiError ? (
                  <div className={styles.aiError}>
                    <AlertTriangle size={14} /> {aiError}
                    <button className={styles.aiAnalyzeBtn} onClick={handleAnalyzeWithAI} style={{ marginTop: '0.5rem' }}>
                      <Bot size={16} /> Retry Analysis
                    </button>
                  </div>
                ) : (
                  <button className={styles.aiAnalyzeBtn} onClick={handleAnalyzeWithAI} disabled={aiLoading}>
                    <Bot size={16} />
                    {aiLoading ? 'Analyzing… this may take 30–60s' : 'Analyze with AI Agent'}
                  </button>
                )}
              </div>
            </>}

            {/* ── FINDINGS TAB ── */}
            {activeTab === 'findings' && (
              <div className={styles.findingsContainer}>
                {OWASP_CATEGORIES.map(cat => {
                  const catFindings = parsedFindings.filter(f => f.owaspCategory === cat.id)
                  const hasFindings = catFindings.length > 0
                  return (
                    <div key={cat.id} className={`${styles.owaspCategory} ${hasFindings ? styles.owaspCategoryFail : styles.owaspCategoryPass}`}>
                      <div className={styles.owaspCategoryHeader}>
                        <span className={styles.owaspId}>{cat.id}</span>
                        <span className={styles.owaspTitle}>{cat.label}</span>
                        <span className={`${styles.owaspBadge} ${hasFindings ? styles.owaspFail : styles.owaspPass}`}>
                          {hasFindings ? `${catFindings.length} finding${catFindings.length > 1 ? 's' : ''}` : 'PASS'}
                        </span>
                      </div>
                      {hasFindings && (
                        <div className={styles.owaspFindings}>
                          {(expandedCategories.has(cat.id) ? catFindings : catFindings.slice(0, 3)).map((f, i) => {
                            const { fileRef, lineNum } = parseEvidenceString(f.evidence)
                            return (
                              <button
                                key={i}
                                className={`${styles.findingRow} ${styles.findingRowClickable}`}
                                onClick={() => handleSelectFinding(f)}
                              >
                                <div className={styles.findingRowMain}>
                                  <span className={`${styles.severityBadge} ${sevClass(f.severity)}`}>{f.severity}</span>
                                  <span className={styles.findingTitle}>{f.title}</span>
                                  {f.cveIds && f.cveIds.length > 0 && (
                                    <span className={styles.cveMini}>{f.cveIds.length} CVE</span>
                                  )}
                                  <ChevronRight size={12} className={styles.findingArrow} />
                                </div>
                                {fileRef && (
                                  <div className={styles.findingEvidence}>
                                    <span className={styles.findingFileRef}>📁 {fileRef}{lineNum ? `:${lineNum}` : ''}</span>
                                  </div>
                                )}
                              </button>
                            )
                          })}
                          {catFindings.length > 3 && (
                            <button className={styles.moreFindings} onClick={() => toggleCategoryExpand(cat.id)}>
                              {expandedCategories.has(cat.id)
                                ? '▲ Show less'
                                : `+${catFindings.length - 3} more — click to expand`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── EVIDENCE TAB ── */}
            {activeTab === 'evidence' && (
              <EvidenceTab
                parsedFindings={parsedFindings}
                appName={scan.appName}
                scanId={scan.id}
                onSelectFinding={f => setSelectedFinding(f)}
              />
            )}

            {/* ── NETWORK & PRIVACY TAB ── */}
            {activeTab === 'network' && (
              <div className={styles.tabContent}>

                {/* Privacy Trackers */}
                <div className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <h3 className={styles.sectionTitle}>
                      <Eye size={16} /> Privacy Trackers
                      <span className={styles.sectionBadge}>{rawFindings?.trackers?.detected_trackers ?? 0} detected</span>
                    </h3>
                    <button
                      className={styles.networkDownloadBtn}
                      title="Download network report as JSON"
                      onClick={() => {
                        const rf = rawFindings
                        const trackers = rf?.trackers?.trackers ?? []
                        const domains = rf?.domains ? Object.entries(rf.domains).map(([domain, info]: [string, any]) => ({
                          domain,
                          flagged: info.bad === 'yes' || !!info.bad_domains,
                          geolocation: info.geolocation ?? null,
                        })) : []
                        const firebase = (rf?.firebase_urls ?? []).map((item: any) => typeof item === 'string'
                          ? { url: item, severity: 'info', description: '' }
                          : { url: item.title ?? '', severity: item.severity ?? 'info', description: item.description ?? '' }
                        )
                        const certFindings = (rf?.certificate_analysis?.certificate_findings ?? []).map((f: any) => {
                          const [sev, msg] = Array.isArray(f) ? f : [f.status ?? 'INFO', f.description ?? '']
                          return { severity: String(sev), description: String(msg) }
                        })
                        const secrets = (rf?.secrets ?? []).map((s: any) => {
                          const isStr = typeof s === 'string'
                          return {
                            type: isStr ? detectSecretType(s) : (s.type || s.name || s.rule_id || 'SECRET'),
                            value: isStr ? s : (s.match || s.value || s.secret || s.secret_value || ''),
                            file: isStr ? '' : (s.file || s.path || ''),
                            line: isStr ? null : (s.line ?? null),
                          }
                        })
                        const emails: string[] = (rf?.emails ?? []).flatMap((item: any) => {
                          if (typeof item === 'string') return [item]
                          return Array.isArray(item?.emails) ? item.emails : []
                        })
                        const payload = {
                          exportedAt: new Date().toISOString(),
                          app: { name: scan.appName, packageName: scan.packageName ?? null, platform: scan.platform },
                          summary: {
                            trackerCount: trackers.length,
                            domainCount: domains.length,
                            flaggedDomains: domains.filter(d => d.flagged).length,
                            firebaseEndpoints: firebase.length,
                            certificateFindings: certFindings.length,
                            hardcodedSecrets: secrets.length,
                            embeddedEmails: emails.length,
                          },
                          trackers,
                          domains,
                          firebaseEndpoints: firebase,
                          certificateAnalysis: {
                            findings: certFindings,
                            info: rf?.certificate_analysis?.certificate_info ?? null,
                          },
                          hardcodedSecrets: secrets,
                          embeddedEmails: emails,
                        }
                        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `network-report-${scan.appName.replace(/[^a-z0-9]/gi, '_')}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                    >
                      <Download size={13} /> Export JSON
                    </button>
                  </div>
                  {rawFindings?.trackers?.trackers?.length > 0 ? (
                    <div className={styles.trackerList}>
                      {rawFindings.trackers.trackers.map((t: any, i: number) => (
                        <div key={i} className={styles.trackerRow}>
                          <div className={styles.trackerName}>{t.name}</div>
                          <div className={styles.trackerCats}>
                            {(Array.isArray(t.categories) ? t.categories : t.categories ? String(t.categories).split(',').map((s: string) => s.trim()) : []).map((c: string) => (
                              <span key={c} className={styles.trackerCat}>{c}</span>
                            ))}
                          </div>
                          {t.url && (
                            <a href={t.url} target="_blank" rel="noopener noreferrer" className={styles.trackerLink}>
                              <ExternalLink size={11} /> Exodus
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}><CheckCircle size={14} /> No trackers detected</div>
                  )}
                </div>

                {/* Domains */}
                {rawFindings?.domains && Object.keys(rawFindings.domains).length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Wifi size={16} /> Network Domains ({Object.keys(rawFindings.domains).length})</h3>
                    <div className={styles.domainList}>
                      {Object.entries(rawFindings.domains).slice(0, 40).map(([domain, info]: [string, any]) => (
                        <div key={domain} className={`${styles.domainRow} ${(info.bad_domains || info.bad === 'yes') ? styles.domainBad : ''}`}>
                          <span className={styles.domainName}>{domain}</span>
                          {(info.bad_domains || info.bad === 'yes') && <span className={styles.domainBadBadge}>⚠ Flagged</span>}
                          {info.geolocation?.country_long && <span className={styles.domainGeo}>{info.geolocation.country_long}</span>}
                        </div>
                      ))}
                      {Object.keys(rawFindings.domains).length > 40 && (
                        <div className={styles.moreCount}>+{Object.keys(rawFindings.domains).length - 40} more domains</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Firebase Endpoints */}
                {rawFindings?.firebase_urls?.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Zap size={16} /> Firebase Endpoints ({rawFindings.firebase_urls.length})</h3>
                    <div className={styles.urlList}>
                      {rawFindings.firebase_urls.map((item: any, i: number) => {
                        const title = typeof item === 'string' ? item : (typeof item?.title === 'string' ? item.title : '')
                        const desc = typeof item?.description === 'string' ? item.description : ''
                        const sev = typeof item?.severity === 'string' ? item.severity.toLowerCase() : 'info'
                        const displayText = desc || title
                        return (
                          <div key={i} className={`${styles.urlRow} ${sev === 'high' ? styles.certWarn : sev === 'secure' ? styles.certOk : styles.certInfo}`}>
                            {title && desc ? <div className={styles.urlTitle}>{title}</div> : null}
                            <code className={styles.urlCode}>{displayText}</code>
                            <CopyButton text={displayText} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Certificate Analysis */}
                {rawFindings?.certificate_analysis && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Lock size={16} /> Certificate Analysis</h3>
                    {rawFindings.certificate_analysis.certificate_findings?.length > 0 ? (
                      <div className={styles.certList}>
                        {rawFindings.certificate_analysis.certificate_findings.map((finding: any, i: number) => {
                          const [sev, msg] = Array.isArray(finding) ? finding : [finding.status ?? 'INFO', finding.description ?? JSON.stringify(finding)]
                          const sevLower = String(sev).toLowerCase()
                          return (
                            <div key={i} className={`${styles.certRow} ${sevLower === 'high' || sevLower === 'warning' ? styles.certWarn : sevLower === 'info' ? styles.certInfo : styles.certOk}`}>
                              <span className={styles.certSev}>{sev}</span>
                              <span className={styles.certMsg}>{msg}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className={styles.emptyState}><CheckCircle size={14} /> Certificate appears valid</div>
                    )}
                    {rawFindings.certificate_analysis.certificate_info && (
                      <pre className={styles.certRaw}>{rawFindings.certificate_analysis.certificate_info}</pre>
                    )}
                  </div>
                )}

                {/* Hardcoded Secrets — with reveal */}
                {rawFindings?.secrets?.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionTitleRow}>
                      <h3 className={styles.sectionTitle}><Key size={16} /> Hardcoded Secrets ({rawFindings.secrets.length})</h3>
                      <button
                        className={styles.downloadBtn}
                        onClick={() => {
                          const lines: string[] = rawFindings.secrets.map((s: any, i: number) => {
                            const isStr = typeof s === 'string'
                            const val = isStr ? s : (s.match || s.value || s.secret || s.secret_value || '')
                            const label = isStr ? detectSecretType(s) : (s.type || s.name || s.rule_id || 'SECRET')
                            const file = isStr ? '' : (s.file || s.path || '')
                            return `[${label}]${file ? ' ' + file : ''}\n${val}`
                          })
                          const content = `# Hardcoded Secrets — ${scan.appName}\n# Extracted: ${new Date().toISOString()}\n# Total: ${rawFindings.secrets.length}\n\n` + lines.join('\n\n---\n\n')
                          const blob = new Blob([content], { type: 'text/plain' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `secrets-${scan.appName.replace(/[^a-z0-9]/gi, '_')}.txt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                      >
                        <Download size={13} /> Export ({rawFindings.secrets.length})
                      </button>
                    </div>
                    <div className={styles.secretsTable}>
                      {rawFindings.secrets.map((s: any, i: number) => {
                        // secrets can be plain strings or objects
                        const isStr = typeof s === 'string'
                        const val: string = isStr ? s : (s.match || s.value || s.secret || s.secret_value || '')
                        const label: string = isStr ? detectSecretType(s) : (s.type || s.name || s.rule_id || 'SECRET')
                        const file: string = isStr ? '' : (s.file || s.path || '')
                        const line: string = isStr ? '' : (s.line ? `:${s.line}` : '')
                        const isRevealed = revealedSecrets.has(i)
                        return (
                          <div key={i} className={styles.secretEntry}>
                            <div className={styles.secretEntryHeader}>
                              <span className={styles.secretType}>{label}</span>
                              <span className={styles.secretFile}>{file}{line || (file ? '' : '—')}</span>
                              {val && (
                                <button className={styles.revealBtn} onClick={() => {
                                  const next = new Set(revealedSecrets)
                                  isRevealed ? next.delete(i) : next.add(i)
                                  setRevealedSecrets(next)
                                }}>
                                  {isRevealed ? <Eye size={11} /> : <Eye size={11} />} {isRevealed ? 'Hide' : 'Reveal'}
                                </button>
                              )}
                            </div>
                            {isRevealed && val && (
                              <div className={styles.secretValueRow}>
                                <code className={styles.secretValueCode}>{val}</code>
                                <CopyButton text={val} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Emails */}
                {rawFindings?.emails?.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Info size={16} /> Embedded Emails</h3>
                    <div className={styles.emailList}>
                      {rawFindings.emails.flatMap((item: any, i: number) => {
                        if (typeof item === 'string') {
                          return [(
                            <div key={i} className={styles.emailRow}>
                              <span className={styles.emailAddr}>{item}</span>
                              <CopyButton text={item} />
                            </div>
                          )]
                        }
                        const emailArr: string[] = Array.isArray(item?.emails) ? item.emails.filter((e: any) => typeof e === 'string') : []
                        const path: string = typeof item?.path === 'string' ? item.path : ''
                        return emailArr.map((e: string, j: number) => (
                          <div key={`${i}-${j}`} className={styles.emailRow}>
                            <span className={styles.emailAddr}>{e}</span>
                            {path && <span className={styles.emailFile}>{path}</span>}
                            <CopyButton text={e} />
                          </div>
                        ))
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ATTACK SURFACE TAB ── */}
            {activeTab === 'components' && (
              <div className={styles.tabContent}>
                {/* AppSec Summary */}
                {rawFindings?.appsec && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Activity size={16} /> Application Security Summary</h3>
                    <div className={styles.appsecGrid}>
                      {[
                        { key: 'high',    label: 'High Risk', color: '#f87171' },
                        { key: 'warning', label: 'Warnings',  color: '#fb923c' },
                        { key: 'hotspot', label: 'Hotspots',  color: '#fbbf24' },
                        { key: 'info',    label: 'Info',      color: '#60a5fa' },
                        { key: 'secure',  label: 'Secure',    color: '#34d399' },
                      ].map(({ key, label, color }) => {
                        const raw = (rawFindings.appsec as any)[key]
                        const count = Array.isArray(raw) ? raw.length : (typeof raw === 'number' ? raw : 0)
                        return (
                          <div key={key} className={styles.appsecCard} style={{ borderColor: color + '40' }}>
                            <div className={styles.appsecCount} style={{ color }}>{count}</div>
                            <div className={styles.appsecLabel}>{label}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* APKiD Binary Analysis */}
                {rawFindings?.apkid && Object.keys(rawFindings.apkid).length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Shield size={16} /> Binary Analysis (APKiD)</h3>
                    {Object.entries(rawFindings.apkid).map(([dex, analysis]: [string, any]) => (
                      <div key={dex} className={styles.apkidBlock}>
                        <div className={styles.apkidDex}>{dex}</div>
                        {analysis.compiler?.length > 0 && (
                          <div className={styles.apkidRow}><span className={styles.apkidLabel}>Compiler</span><span className={styles.apkidVals}>{analysis.compiler.join(', ')}</span></div>
                        )}
                        {analysis.obfuscator?.length > 0 && (
                          <div className={styles.apkidRow}><span className={styles.apkidLabel}>Obfuscator</span><span className={styles.apkidVals}>{analysis.obfuscator.join(', ')}</span></div>
                        )}
                        {analysis.anti_vm?.length > 0 && (
                          <div className={`${styles.apkidRow} ${styles.apkidWarn}`}><span className={styles.apkidLabel}>Anti-VM</span><span className={styles.apkidVals}>{analysis.anti_vm.join(', ')}</span></div>
                        )}
                        {analysis.anti_debug?.length > 0 && (
                          <div className={`${styles.apkidRow} ${styles.apkidWarn}`}><span className={styles.apkidLabel}>Anti-Debug</span><span className={styles.apkidVals}>{analysis.anti_debug.join(', ')}</span></div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Exported Components */}
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}><ExternalLink size={16} /> Exported Components (Attack Surface)</h3>
                  <div className={styles.componentGrid}>
                    {[
                      { key: 'exported_activities', label: 'Activities', icon: '📱' },
                      { key: 'exported_services',   label: 'Services',   icon: '⚙️' },
                      { key: 'exported_receivers',  label: 'Receivers',  icon: '📡' },
                      { key: 'exported_providers',  label: 'Providers',  icon: '🗄️' },
                    ].map(({ key, label, icon }) => {
                      // MobSF stores exported counts in exported_count object
                      const count = rawFindings?.exported_count?.[key]
                        ?? (typeof rawFindings?.[key] === 'number' ? rawFindings[key] : 0)
                      return (
                        <div key={key} className={`${styles.componentCard} ${count > 20 ? styles.componentCardHigh : count > 0 ? styles.componentCardWarn : styles.componentCardOk}`}>
                          <div className={styles.componentIcon}>{icon}</div>
                          <div className={styles.componentCount}>{count}</div>
                          <div className={styles.componentLabel}>{label}</div>
                        </div>
                      )
                    })}
                  </div>
                  {((rawFindings?.exported_count?.exported_activities ?? 0) > 0 ||
                    (rawFindings?.exported_count?.exported_services ?? 0) > 0) && (
                    <div className={styles.attackSurfaceNote}>
                      <AlertTriangle size={13} /> Exported components are accessible by other apps on the device and may enable intent hijacking, data theft, or privilege escalation.
                    </div>
                  )}
                </div>

                {/* Deep Links */}
                {browsableEntries.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><ExternalLink size={16} /> Deep Link Attack Surface ({browsableEntries.length})</h3>
                    <div className={styles.deepLinkList}>
                      {browsableEntries.map(([activityName, info]) => {
                        const infoObj = info && typeof info === 'object' ? info : {}
                        const schemes = Array.isArray(infoObj.schemes) ? infoObj.schemes.join(', ') : (typeof infoObj.schemes === 'string' ? infoObj.schemes : '')
                        const hosts = Array.isArray(infoObj.hosts) ? infoObj.hosts.join(', ') : (typeof infoObj.hosts === 'string' ? infoObj.hosts : '')
                        return (
                          <div key={activityName} className={styles.deepLinkRow}>
                            <code className={styles.deepLinkScheme}>{schemes || 'deep-link'}</code>
                            <span className={styles.deepLinkActivity}>{hosts ? `${hosts} → ` : ''}{String(activityName).split('.').pop()}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Behaviour Analysis */}
                {behaviourEntries.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Activity size={16} /> Behaviour Analysis ({behaviourEntries.length} rules matched)</h3>
                    <div className={styles.behaviourList}>
                      {behaviourEntries.slice(0, 30).map(([ruleId, rule]) => {
                        const meta = (rule && typeof rule === 'object' && rule.metadata && typeof rule.metadata === 'object') ? rule.metadata : {}
                        const sevLower = String(meta.severity ?? '').toLowerCase()
                        const labelStr = Array.isArray(meta.label) ? meta.label.join(', ') : (typeof meta.label === 'string' ? meta.label : '')
                        const title = (typeof meta.title === 'string' ? meta.title : '') || labelStr || ruleId
                        const desc = typeof meta.description === 'string' ? meta.description : ''
                        const fileList: string[] = rule && rule.files
                          ? (Array.isArray(rule.files) ? rule.files.filter((f: any) => typeof f === 'string') : Object.keys(rule.files))
                          : []
                        return (
                          <div key={ruleId} className={`${styles.behaviourRow} ${sevLower === 'high' ? styles.behaviourHigh : sevLower === 'warning' || sevLower === 'medium' ? styles.behaviourWarn : styles.behaviourInfo}`}>
                            <div className={styles.behaviourTitle}>{title}</div>
                            {desc && desc !== title && <div className={styles.behaviourDesc}>{desc}</div>}
                            {fileList.length > 0 && (
                              <div className={styles.behaviourFiles}>
                                {fileList.slice(0, 3).map((f, j) => <code key={j} className={styles.behaviourFile}>{f}</code>)}
                                {fileList.length > 3 && <span className={styles.behaviourMoreFiles}>+{fileList.length - 3} more</span>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {behaviourEntries.length > 30 && (
                        <div className={styles.moreCount}>+{behaviourEntries.length - 30} more behaviour rules</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Android API Usage */}
                {androidApiEntries.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Code2 size={16} /> Sensitive Android API Usage</h3>
                    <div className={styles.apiUsageList}>
                      {androidApiEntries.slice(0, 25).map(([apiName, detail]) => {
                        const meta = (detail && typeof detail === 'object' && detail.metadata && typeof detail.metadata === 'object') ? detail.metadata : {}
                        const desc = typeof meta.description === 'string' ? meta.description : ''
                        const fileList: string[] = detail && detail.files
                          ? (Array.isArray(detail.files) ? detail.files.filter((f: any) => typeof f === 'string') : Object.keys(detail.files))
                          : []
                        return (
                          <div key={apiName} className={styles.apiUsageRow}>
                            <div className={styles.apiUsageName}>{apiName.replace(/_/g, ' ')}</div>
                            {desc && <div className={styles.apiUsageMeta}>{desc}</div>}
                            {fileList.length > 0 && (
                              <div className={styles.apiUsageFiles}>
                                {fileList.slice(0, 2).map((f, fi) => <code key={fi} className={styles.apiUsageFile}>{f}</code>)}
                                {fileList.length > 2 && <span className={styles.behaviourMoreFiles}>+{fileList.length - 2} more</span>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SBOM TAB ── */}
            {activeTab === 'sbom' && (
              <div className={styles.tabContent}>
                {/* Versioned dependencies */}
                {rawFindings?.sbom?.sbom_versioned?.length > 0 ? (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Package size={16} /> Dependencies ({rawFindings.sbom.sbom_versioned.length})</h3>
                    <div className={styles.sbomTable}>
                      <div className={styles.sbomHeader}>
                        <span>Package</span>
                        <span>Version</span>
                        <span>Group</span>
                      </div>
                      {rawFindings.sbom.sbom_versioned.map((dep: any, i: number) => {
                        // MobSF returns strings like "group:name@version" or objects
                        let pkgName = '', pkgVersion = '', pkgGroup = ''
                        if (typeof dep === 'string') {
                          const atIdx = dep.lastIndexOf('@')
                          const raw = atIdx > -1 ? dep.substring(0, atIdx) : dep
                          pkgVersion = atIdx > -1 ? dep.substring(atIdx + 1) : '—'
                          const colonIdx = raw.lastIndexOf(':')
                          pkgGroup = colonIdx > -1 ? raw.substring(0, colonIdx) : '—'
                          pkgName  = colonIdx > -1 ? raw.substring(colonIdx + 1) : raw
                        } else {
                          pkgName    = dep.name ?? dep.package ?? '—'
                          pkgVersion = dep.version ?? dep.ver ?? '—'
                          pkgGroup   = dep.group ?? dep.path ?? '—'
                        }
                        const isVuln = parsed?.vulnerableLibraries?.some((v: any) =>
                          pkgName.toLowerCase().includes(v.name?.toLowerCase() ?? '') ||
                          (v.name?.toLowerCase() ?? '').includes(pkgName.toLowerCase())
                        )
                        return (
                          <div key={i} className={`${styles.sbomRow} ${isVuln ? styles.sbomRowVuln : ''}`}>
                            <span className={styles.sbomName}>{pkgName}</span>
                            <span className={styles.sbomVersion}>{pkgVersion}</span>
                            <span className={styles.sbomPath}>{pkgGroup}</span>
                            {isVuln && <span className={styles.sbomVulnBadge}>⚠ CVE</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Package size={16} /> Dependencies</h3>
                    <div className={styles.emptyState}><Package size={28} style={{ opacity: 0.3 }} /><p>No versioned SBOM data — run a full scan to extract</p></div>
                  </div>
                )}

                {/* Package namespaces */}
                {rawFindings?.sbom?.sbom_packages?.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><Tag size={16} /> Package Namespaces ({rawFindings.sbom.sbom_packages.length})</h3>
                    <div className={styles.packageList}>
                      {rawFindings.sbom.sbom_packages.slice(0, 60).map((pkg: string, i: number) => (
                        <span key={i} className={styles.packageChip}>{pkg}</span>
                      ))}
                      {rawFindings.sbom.sbom_packages.length > 60 && (
                        <span className={styles.moreCount}>+{rawFindings.sbom.sbom_packages.length - 60} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Vulnerable Libraries */}
                {parsed?.vulnerableLibraries && parsed.vulnerableLibraries.length > 0 && (
                  <div className={styles.section}>
                    <h3 className={styles.sectionTitle}><AlertTriangle size={16} /> Vulnerable Libraries ({parsed.vulnerableLibraries.length})</h3>
                    <div className={styles.libList}>
                      {parsed.vulnerableLibraries.map((lib: any, i: number) => (
                        <div key={i} className={styles.libRow}>
                          <span className={`${styles.sevBadge} ${sevClass(lib.severity)}`}>{lib.severity}</span>
                          <span className={styles.libName}>{lib.name}@{lib.version}</span>
                          <div className={styles.libCves}>
                            {lib.cveIds.slice(0, 3).map((cve: string) => (
                              <a key={cve} href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noopener noreferrer" className={styles.cveBadge}>{cve}</a>
                            ))}
                            {lib.cveIds.length > 3 && <span className={styles.moreCves}>+{lib.cveIds.length - 3}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}


            {activeTab === 'compliance' && (
              <div className={styles.complianceGrid}>
                {complianceLoading ? (
                  <div className={styles.loadingText}>Generating compliance reports...</div>
                ) : complianceReports.map(report => (
                  <div key={report.id} className={styles.complianceCard}>
                    <div className={styles.complianceCardHeader}>
                      <span className={styles.frameworkBadge} data-framework={report.framework}>
                        {formatFramework(report.framework)}
                      </span>
                      <span className={`${styles.complianceStatus} ${styles[`status${report.status}`]}`}>
                        {report.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className={styles.complianceScoreRow}>
                      <div className={styles.complianceScoreRing}>
                        <svg width="60" height="60" viewBox="0 0 60 60">
                          <circle cx="30" cy="30" r="24" fill="none" stroke="var(--border-subtle)" strokeWidth="6"/>
                          <circle cx="30" cy="30" r="24" fill="none"
                            stroke={report.score >= 70 ? 'var(--accent-green, #00ff9d)' : report.score >= 40 ? 'var(--accent-orange, #ff9500)' : 'var(--accent-red, #ff3b30)'}
                            strokeWidth="6"
                            strokeDasharray={`${(report.score / 100) * 150.8} 150.8`}
                            strokeLinecap="round" transform="rotate(-90 30 30)" />
                          <text x="30" y="34" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text-primary)">{report.score}%</text>
                        </svg>
                      </div>
                      <p className={styles.complianceSummary}>{report.summary}</p>
                    </div>
                    {report.controls?.length > 0 && (
                      <div className={styles.controlsList}>
                        {report.controls.map((ctrl: any) => (
                          <div key={ctrl.controlId} className={styles.controlRow}>
                            <span className={`${styles.controlStatus} ${styles[`ctrl${ctrl.status}`]}`}>
                              {ctrl.status === 'PASS' ? '✓' : ctrl.status === 'FAIL' ? '✗' : '~'}
                            </span>
                            <span className={styles.controlId}>{ctrl.controlId}</span>
                            <span className={styles.controlName}>{ctrl.controlName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {!complianceLoading && complianceReports.length === 0 && (
                  <div className={styles.emptyState}>
                    {scan?.status !== 'COMPLETE'
                      ? 'Compliance reports available after scan completes'
                      : 'No compliance reports generated yet'}
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Scan Card ────────────────────────────────────────────────────────────────

function ScanCard({ scan, onClick }: { scan: MobileScan; onClick: () => void }) {
  const { label, cls } = platformLabel(scan.platform)
  const st = statusLabel(scan.status)
  return (
    <div className={styles.scanCard} onClick={onClick}>
      <div className={styles.cardTop}>
        <div className={styles.cardLeft}>
          <div className={styles.cardIcon}>
            {scan.platform === 'IOS' ? (
              <svg viewBox="0 0 24 24" width="28" height="28" fill="var(--accent-secondary)">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            ) : scan.platform === 'ANDROID' ? (
              <svg viewBox="0 0 24 24" width="28" height="28" fill="var(--status-success)">
                <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zm-2.5-1C2.67 17 2 16.33 2 15.5v-7C2 7.67 2.67 7 3.5 7S5 7.67 5 8.5v7c0 .83-.67 1.5-1.5 1.5zm17 0c-.83 0-1.5-.67-1.5-1.5v-7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5zM15.53 2.16l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
              </svg>
            ) : (
              <Smartphone size={28} color="var(--text-secondary)" />
            )}
          </div>
          <div className={styles.cardInfo}>
            <div className={styles.cardName}>{scan.appName}</div>
            {scan.packageName && <div className={styles.cardPackage}>{scan.packageName}</div>}
            <div className={styles.cardMeta}>
              <span className={`${styles.platformBadge} ${cls}`}>{label}</span>
              {scan.version && <span className={styles.versionBadge}>v{scan.version}</span>}
            </div>
          </div>
        </div>
        <ScoreRing score={scan.score} size={60} />
      </div>
      <div className={styles.cardBottom}>
        <span className={`${styles.statusBadge} ${st.cls}`}>{st.icon} {st.label}</span>
        <span className={styles.cardDate}>{new Date(scan.createdAt).toLocaleDateString()}</span>
        <ChevronRight size={14} className={styles.cardArrow} />
      </div>
    </div>
  )
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────

function UploadZone({ onUpload }: { onUpload: (file: File) => void }) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setPreview(file)
  }, [])
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setPreview(file)
  }
  const getExt = (name: string) => name.split('.').pop()?.toLowerCase() || ''
  const platform = preview ? (getExt(preview.name) === 'ipa' ? 'IOS' : getExt(preview.name) === 'appx' ? 'WINDOWS' : 'ANDROID') : null
  return (
    <div className={styles.uploadSection}>
      <div
        className={`${styles.uploadZone} ${dragging ? styles.uploadZoneDragging : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".apk,.ipa,.appx,.xapk" style={{ display: 'none' }} onChange={handleFile} />
        {!preview ? (
          <div className={styles.uploadPrompt}>
            <div className={styles.uploadIcon}><Upload size={32} /></div>
            <div className={styles.uploadText}>
              <strong>Drop APK / IPA / APPX here</strong>
              <span>or click to browse</span>
            </div>
            <div className={styles.uploadHint}>Supports Android APK, iOS IPA, Windows APPX</div>
          </div>
        ) : (
          <div className={styles.filePreview}>
            <div className={styles.filePreviewIcon}>
              {platform === 'IOS' ? (
                <svg viewBox="0 0 24 24" width="40" height="40" fill="var(--accent-secondary)">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="40" height="40" fill="var(--status-success)">
                  <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zm-2.5-1C2.67 17 2 16.33 2 15.5v-7C2 7.67 2.67 7 3.5 7S5 7.67 5 8.5v7c0 .83-.67 1.5-1.5 1.5zm17 0c-.83 0-1.5-.67-1.5-1.5v-7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5zM15.53 2.16l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
                </svg>
              )}
            </div>
            <div className={styles.filePreviewInfo}>
              <div className={styles.filePreviewName}>{preview.name}</div>
              <div className={styles.filePreviewMeta}>
                <span className={`${styles.platformBadge} ${platformLabel(platform!).cls}`}>{platformLabel(platform!).label}</span>
                <span className={styles.filePreviewSize}>{formatBytes(preview.size)}</span>
              </div>
            </div>
            <button className={styles.clearFile} onClick={e => { e.stopPropagation(); setPreview(null) }}><X size={14} /></button>
          </div>
        )}
      </div>
      {preview && (
        <button className={styles.uploadBtn} onClick={e => { e.stopPropagation(); onUpload(preview); setPreview(null) }}>
          <Zap size={16} /> Start Security Scan
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MobilePage() {
  const [scans, setScans] = useState<MobileScan[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedScan, setSelectedScan] = useState<MobileScan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  const fetchScans = useCallback(async () => {
    try {
      const res = await fetch('/api/mobile/scans')
      const data = await res.json()
      setScans(data.scans || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchScans() }, [fetchScans])

  useEffect(() => {
    const hasActive = scans.some(s => s.status === 'SCANNING' || s.status === 'UPLOADING')
    if (!hasActive) return
    const t = setInterval(fetchScans, 5000)
    return () => clearInterval(t)
  }, [scans, fetchScans])

  const handleUpload = async (file: File) => {
    setUploading(true); setError(null); setUploadSuccess(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/mobile/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setUploadSuccess(`${file.name} uploaded — scan started!`)
      await fetchScans()
    } catch (e: any) { setError(e.message) }
    finally { setUploading(false) }
  }

  const openScanDetail = async (scan: MobileScan) => {
    if (!scan.findings) {
      try {
        const res = await fetch(`/api/mobile/scans/${scan.id}`)
        const data = await res.json()
        setSelectedScan(data.scan)
      } catch { setSelectedScan(scan) }
    } else { setSelectedScan(scan) }
  }

  const totalScans = scans.length
  const completedScans = scans.filter(s => s.status === 'COMPLETE')
  const avgScore = completedScans.length > 0
    ? Math.round(completedScans.reduce((a, s) => a + (s.score || 0), 0) / completedScans.length)
    : null
  const criticalCount = completedScans.filter(s => (s.score ?? 100) < 40).length

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}><Smartphone size={28} /></div>
          <div>
            <h1 className={styles.heroTitle}>Mobile Pen-Testing</h1>
            <p className={styles.heroSubtitle}>OWASP Mobile Top 10 analysis — Android, iOS &amp; Windows apps via MobSF</p>
          </div>
        </div>
        <div className={styles.stats}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{totalScans}</div>
            <div className={styles.statLabel}>Total Scans</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: 'var(--status-error)' }}>{criticalCount}</div>
            <div className={styles.statLabel}>Critical Risk</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: scoreColor(avgScore) }}>{avgScore ?? '—'}</div>
            <div className={styles.statLabel}>Avg Score</div>
          </div>
        </div>
      </div>

      {error && (
        <div className={styles.alertError}>
          <AlertTriangle size={16} /> {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {uploadSuccess && (
        <div className={styles.alertSuccess}>
          <CheckCircle size={16} /> {uploadSuccess}
          <button onClick={() => setUploadSuccess(null)}><X size={14} /></button>
        </div>
      )}
      {uploading && (
        <div className={styles.alertInfo}>
          <RefreshCw size={16} className={styles.spinIcon} /> Uploading and initializing scan…
        </div>
      )}

      <div className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}><Upload size={16} /><span>Upload App</span></div>
          <UploadZone onUpload={handleUpload} />
        </div>

        <div className={styles.scansPanel}>
          <div className={styles.panelHeader}>
            <Shield size={16} /><span>Recent Scans</span>
            <button className={styles.refreshBtn} onClick={fetchScans}><RefreshCw size={14} /></button>
          </div>
          {loading ? (
            <div className={styles.loadingState}><RefreshCw size={24} className={styles.spinIcon} /><span>Loading scans…</span></div>
          ) : scans.length === 0 ? (
            <div className={styles.emptyState}>
              <Smartphone size={48} />
              <h3>No scans yet</h3>
              <p>Upload an APK or IPA to begin mobile security analysis</p>
            </div>
          ) : (
            <div className={styles.scanGrid}>
              {scans.map(scan => <ScanCard key={scan.id} scan={scan} onClick={() => openScanDetail(scan)} />)}
            </div>
          )}
        </div>
      </div>

      {selectedScan && <ScanDrawer scan={selectedScan} onClose={() => setSelectedScan(null)} />}
    </div>
  )
}

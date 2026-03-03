'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Play, Activity, ExternalLink, Shield, FileText,
  CheckCircle, XCircle, StopCircle, Loader2,
  BarChart3, AlertTriangle, TrendingUp, TrendingDown,
  Download, ChevronDown, ChevronUp,
} from 'lucide-react'
import styles from './page.module.css'
import {
  SCAN_PROFILES,
  PLUGINS,
  PLUGIN_CATEGORIES,
  STRATEGIES,
  STRATEGY_CATEGORIES,
  type ScanProfile,
} from '@/lib/ai-security/catalog'

const PROMPTFOO_URL = process.env.NEXT_PUBLIC_PROMPTFOO_URL || 'http://localhost:15500'

type TabId = 'dashboard' | 'scans' | 'findings' | 'compliance' | 'report'

interface ScanRecord {
  id: string
  name: string
  status: string
  targetUrl: string
  targetType?: string
  profile: string
  purpose?: string | null
  systemPrompt?: string | null
  plugins?: unknown
  strategies?: unknown
  numTests?: number
  systemRiskScore: number | null
  totalTests: number | null
  passedTests: number | null
  failedTests: number | null
  createdAt: string
  completedAt: string | null
  _count: { findings: number }
}

interface Finding {
  id: string
  plugin: string
  strategy: string | null
  severity: string
  category: string
  prompt: string
  response: string
  riskScore: number | null
}

interface ComplianceScorecard {
  framework: string
  frameworkLabel: string
  overallScore: number
  passedControls: number
  failedControls: number
  notTestedControls: number
  controls: Array<{
    control: { id: string; name: string }
    status: string
    findingCount: number
  }>
}

export default function AISecurityPage() {
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [iframeKey, setIframeKey] = useState(Date.now())
  const [promptfooExpanded, setPromptfooExpanded] = useState(true)
  const [tabsExpanded, setTabsExpanded] = useState(true)

  // Scan launcher state
  const [targetUrl, setTargetUrl] = useState('https://api.openai.com/v1/chat/completions')
  const [targetType, setTargetType] = useState<string>('openai')
  const [selectedProfile, setSelectedProfile] = useState('quick')
  const [purpose, setPurpose] = useState('')
  const [customPlugins, setCustomPlugins] = useState<string[]>(['prompt-extraction', 'pii:direct', 'hallucination'])
  const [customStrategies, setCustomStrategies] = useState<string[]>(['jailbreak', 'base64'])
  const [customNumTests, setCustomNumTests] = useState(5)
  const [pluginSearch, setPluginSearch] = useState('')
  const [strategySearch, setStrategySearch] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([])
  const [policies, setPolicies] = useState<Array<{ id: string; name: string; description: string | null }>>([])
  const [testGenerationInstructions, setTestGenerationInstructions] = useState('')
  const [language, setLanguage] = useState<string[]>([])
  const [languageOther, setLanguageOther] = useState('')

  // Active scan state
  const [runningScanId, setRunningScanId] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    success: boolean; findingsCount?: number; scanId?: string; error?: string
  } | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Data state
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [compliance, setCompliance] = useState<ComplianceScorecard[]>([])
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null)
  const [selectedScanForConfig, setSelectedScanForConfig] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<{
    trend: string; latestRiskScore: number | null; scanCount: number
  } | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Fetch scans
  const fetchScans = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-security/scans?limit=50')
      const data = await res.json()
      setScans(data.scans || [])
    } catch { /* ignore */ }
  }, [])

  // Fetch trends
  const fetchTrends = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-security/trends?period=30d')
      const data = await res.json()
      setTrendData(data)
    } catch { /* ignore */ }
  }, [])

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-security/policies?limit=50')
      const data = await res.json()
      setPolicies(data.policies || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (mounted) {
      fetchScans()
      fetchTrends()
      fetchPolicies()
    }
  }, [mounted, fetchScans, fetchTrends, fetchPolicies])

  // Poll running scan
  useEffect(() => {
    if (!runningScanId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/ai-security/scans/${runningScanId}/status`)
        const data = await res.json()
        setScanStatus(data.status)
        if (data.status === 'ready_to_ingest') {
          const ingestRes = await fetch(`/api/ai-security/scans/${runningScanId}/ingest`, { method: 'POST' })
          const ingestData = await ingestRes.json()
          setLastResult({ success: true, findingsCount: ingestData.findingsCount, scanId: runningScanId })
          setRunningScanId(null)
          setScanStatus(null)
          setIframeKey(Date.now())
          fetchScans()
          fetchTrends()
        } else if (data.status === 'completed') {
          setLastResult({ success: true, findingsCount: data.findingsCount, scanId: runningScanId })
          setRunningScanId(null)
          setScanStatus(null)
          setIframeKey(Date.now())
          fetchScans()
          fetchTrends()
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          setLastResult({ success: false, error: data.errorMessage || 'Scan failed' })
          setRunningScanId(null)
          setScanStatus(null)
        }
      } catch { /* ignore */ }
    }
    pollRef.current = setInterval(poll, 3000)
    poll()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [runningScanId, fetchScans, fetchTrends])

  // Fetch findings for a scan
  const fetchFindings = async (scanId: string) => {
    try {
      const res = await fetch(`/api/ai-security/findings?scanId=${scanId}&limit=100`)
      const data = await res.json()
      setFindings(data.findings || [])
      setSelectedScanId(scanId)
    } catch { /* ignore */ }
  }

  // Fetch compliance for a scan
  const fetchCompliance = async (scanId: string) => {
    try {
      const res = await fetch(`/api/ai-security/compliance/${scanId}`)
      const data = await res.json()
      setCompliance(data.scorecards || [])
      setSelectedScanId(scanId)
    } catch { /* ignore */ }
  }

  const resolvedProfile = SCAN_PROFILES.find(p => p.id === selectedProfile) as ScanProfile | undefined
  const activeProfile =
    selectedProfile === 'custom'
      ? {
          id: 'custom',
          label: 'Custom',
          desc: 'Custom plugins and strategies',
          plugins: customPlugins,
          strategies: customStrategies,
          numTests: customNumTests,
        }
      : (resolvedProfile ?? SCAN_PROFILES[0])

  const startScan = async () => {
    if (selectedProfile === 'custom' && customPlugins.length === 0) {
      setLastResult({ success: false, error: 'Select at least one plugin for custom profile' })
      return
    }
    setLastResult(null)
    try {
      const res = await fetch('/api/ai-security/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${activeProfile.label} — ${new Date().toLocaleTimeString()}`,
          targetUrl,
          targetType,
          plugins: activeProfile.plugins,
          strategies: activeProfile.strategies,
          profile: selectedProfile,
          numTests: activeProfile.numTests,
          purpose: purpose || undefined,
          systemPrompt: systemPrompt.trim() || undefined,
          policyIds: selectedPolicyIds.length > 0 ? selectedPolicyIds : undefined,
          testGenerationInstructions: testGenerationInstructions.trim() || undefined,
          language: (() => {
            const custom = languageOther.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
            const all = [...language, ...custom]
            return all.length > 0 ? all : undefined
          })(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setRunningScanId(data.scanId)
        setScanStatus('running')
        fetchScans()
      } else {
        setLastResult({ success: false, error: data.error })
      }
    } catch {
      setLastResult({ success: false, error: 'Failed to start scan' })
    }
  }

  const cancelScan = async () => {
    if (!runningScanId) return
    await fetch(`/api/ai-security/scans/${runningScanId}/status`, { method: 'DELETE' })
    setRunningScanId(null)
    setScanStatus(null)
    setLastResult({ success: false, error: 'Scan cancelled' })
  }

  const isRunning = !!runningScanId

  const latestCompletedScan = scans.find(s => s.status === 'completed')
  const latestRisk = latestCompletedScan?.systemRiskScore ?? 0
  const riskColor = latestRisk >= 9.0 ? styles.sevCritical
    : latestRisk >= 7.0 ? styles.sevHigh
    : latestRisk >= 4.0 ? styles.sevMedium
    : latestRisk > 0 ? styles.sevLow
    : styles.sevNone
  const riskLabelText = latestRisk >= 9.0 ? 'Critical'
    : latestRisk >= 7.0 ? 'High'
    : latestRisk >= 4.0 ? 'Medium'
    : latestRisk > 0 ? 'Low'
    : 'No Data'

  const totalFindings = scans.reduce((n, s) => n + (s._count?.findings || 0), 0)
  const completedScans = scans.filter(s => s.status === 'completed').length

  if (!mounted) return null

  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={14} /> },
    { id: 'scans', label: 'Scans', icon: <Activity size={14} /> },
    { id: 'findings', label: 'Findings', icon: <AlertTriangle size={14} /> },
    { id: 'compliance', label: 'Compliance', icon: <Shield size={14} /> },
    { id: 'report', label: 'Report', icon: <FileText size={14} /> },
  ]

  return (
    <div className={styles.page}>
      {/* Compact title bar */}
      <div className={styles.titleBar}>
        <div className={styles.titleSection}>
          <div className={styles.statusPulse} data-status={isRunning ? 'running' : 'idle'} />
          <div>
            <h1>AI Security & Red Teaming</h1>
            <p className={styles.subtitle}>
              ENTERPRISE LLM VULNERABILITY MANAGEMENT &bull; POWERED BY PROMPTFOO
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {isRunning && (
            <div className={styles.statusChip}>
              <Loader2 size={12} className={styles.spinIcon} />
              <span>{scanStatus === 'running' ? 'Scanning...' : scanStatus}</span>
            </div>
          )}
          {lastResult && !isRunning && (
            <div className={`${styles.statusChip} ${lastResult.success ? styles.chipSuccess : styles.chipError}`}>
              {lastResult.success
                ? <><CheckCircle size={12} /> {lastResult.findingsCount ?? 0} findings</>
                : <><XCircle size={12} /> {lastResult.error}</>
              }
            </div>
          )}
          <a href={PROMPTFOO_URL} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
            Promptfoo UI <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Top panel: Promptfoo (main focus) */}
      <div className={`${styles.panel} ${styles.promptfooPanel} ${promptfooExpanded ? styles.panelExpanded : styles.panelCollapsed}`}>
        <div className={styles.panelHeader} onClick={() => setPromptfooExpanded(!promptfooExpanded)}>
          <div className={styles.panelTitle}>Promptfoo</div>
          <button className={styles.panelToggle} onClick={e => { e.stopPropagation(); setPromptfooExpanded(!promptfooExpanded); }}>
            {promptfooExpanded ? <><ChevronUp size={14} /> Collapse</> : <><ChevronDown size={14} /> Expand</>}
          </button>
        </div>
        <div className={`${styles.panelBody} ${!promptfooExpanded ? styles.panelBodyHidden : ''}`}>
          <div className={styles.promptfooIframeWrap}>
            <iframe key={iframeKey} src={PROMPTFOO_URL} className={styles.promptfooIframe}
              title="PromptFoo Red Team Report"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        </div>
      </div>

      {/* Bottom panel: Dashboard / Scans / Findings / Compliance / Report */}
      <div className={`${styles.panel} ${styles.tabsPanel} ${tabsExpanded ? styles.panelExpanded : styles.panelCollapsed}`}>
        <div className={styles.panelHeader} onClick={() => setTabsExpanded(!tabsExpanded)}>
          <div className={styles.tabsHeader}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                onClick={e => { e.stopPropagation(); setActiveTab(t.id); }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <button className={styles.panelToggle} onClick={e => { e.stopPropagation(); setTabsExpanded(!tabsExpanded); }}>
            {tabsExpanded ? <><ChevronDown size={14} /> Collapse</> : <><ChevronUp size={14} /> Expand</>}
          </button>
        </div>
        <div className={`${styles.panelBody} ${!tabsExpanded ? styles.panelBodyHidden : ''}`}>
        {/* ── DASHBOARD TAB ─────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className={styles.tabContent}>
            <div className={styles.dashGrid}>
              <div className={styles.riskGauge}>
                <div className={`${styles.riskScoreValue} ${riskColor}`}>
                  {latestRisk > 0 ? latestRisk.toFixed(1) : '—'}
                </div>
                <div className={`${styles.riskScoreLabel} ${riskColor}`}>{riskLabelText}</div>
                <div className={styles.riskSla}>
                  {latestRisk >= 9 ? 'Fix within 24-48 hours'
                    : latestRisk >= 7 ? 'Fix within 1-2 weeks'
                    : latestRisk >= 4 ? 'Fix within 30-90 days'
                    : latestRisk > 0 ? 'Next maintenance cycle'
                    : 'Run a scan to see risk score'}
                </div>
                {trendData && trendData.trend !== 'insufficient-data' && (
                  <div className={styles.statusChip}>
                    {trendData.trend === 'improving'
                      ? <><TrendingDown size={12} /> Improving</>
                      : trendData.trend === 'degrading'
                      ? <><TrendingUp size={12} /> Degrading</>
                      : <>Stable</>
                    }
                  </div>
                )}
              </div>

              <div className={styles.metricsRow}>
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>{completedScans}</div>
                  <div className={styles.metricLabel}>Completed Scans</div>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>{totalFindings}</div>
                  <div className={styles.metricLabel}>Total Findings</div>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>
                    {latestCompletedScan
                      ? `${latestCompletedScan.totalTests ?? 0}`
                      : '—'}
                  </div>
                  <div className={styles.metricLabel}>Latest Tests</div>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>
                    {latestCompletedScan && latestCompletedScan.totalTests
                      ? `${Math.round(((latestCompletedScan.passedTests ?? 0) / latestCompletedScan.totalTests) * 100)}%`
                      : '—'}
                  </div>
                  <div className={styles.metricLabel}>Pass Rate</div>
                </div>
                <div className={styles.metricCard}>
                  <div className={styles.metricValue}>{trendData?.scanCount ?? 0}</div>
                  <div className={styles.metricLabel}>Scans (30d)</div>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Recent Scans</h3>
              {scans.length === 0 ? (
                <div className={styles.emptyState}><p>No scans yet. Start your first scan below.</p></div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Profile</th>
                      <th>Risk</th>
                      <th>Findings</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.slice(0, 10).map(s => (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => {
                        if (s.status === 'completed') {
                          fetchFindings(s.id)
                          fetchCompliance(s.id)
                          setActiveTab('findings')
                        }
                      }}>
                        <td>{s.name}</td>
                        <td>
                          <span className={`${styles.statusChip} ${
                            s.status === 'completed' ? styles.chipSuccess
                              : s.status === 'failed' ? styles.chipError
                              : s.status === 'running' ? styles.chipWarn
                              : ''
                          }`}>{s.status}</span>
                        </td>
                        <td>{s.profile}</td>
                        <td className={
                          (s.systemRiskScore ?? 0) >= 9 ? styles.sevCritical
                            : (s.systemRiskScore ?? 0) >= 7 ? styles.sevHigh
                            : (s.systemRiskScore ?? 0) >= 4 ? styles.sevMedium
                            : styles.sevLow
                        }>
                          {s.systemRiskScore != null ? s.systemRiskScore.toFixed(1) : '—'}
                        </td>
                        <td>{s._count?.findings ?? 0}</td>
                        <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── SCANS TAB ─────────────────────────────────────── */}
        {activeTab === 'scans' && (
          <div className={styles.tabContent}>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Application Purpose (Recommended)</h3>
              <p className={styles.helperText}>
                Describe what this AI application does. The more specific you are, the better the attack quality.
                Include: user roles, data access, features, and security boundaries.
              </p>
              <textarea
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
                className={styles.textArea}
                placeholder="e.g. Customer service chatbot for Acme Corp. Helps users with order status, returns, and product questions. Has access to: order history, account info. Must not: access other users' data, process refunds without auth."
                rows={3}
              />
              {!purpose.trim() && (
                <p className={styles.purposeNudge}>
                  Tip: Adding a purpose significantly improves attack relevance. Run without one for a generic baseline.
                </p>
              )}
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>System Prompt (Optional)</h3>
              <p className={styles.helperText}>
                If your target uses a system prompt, paste it here. It will be prepended to adversarial inputs for testing.
              </p>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                className={styles.textArea}
                placeholder="e.g. You are a helpful customer service assistant. Never reveal internal systems."
                rows={2}
              />
            </div>

            {policies.length > 0 && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Custom Policies (Optional)</h3>
                <p className={styles.helperText}>
                  Select saved policies to test against. Scans will generate attacks that try to violate these policies.
                </p>
                <div className={styles.policyCheckboxes}>
                  {policies.map(p => (
                    <label key={p.id} className={styles.pickerItem}>
                      <input
                        type="checkbox"
                        checked={selectedPolicyIds.includes(p.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedPolicyIds(prev => [...prev, p.id])
                          else setSelectedPolicyIds(prev => prev.filter(x => x !== p.id))
                        }}
                      />
                      <span>{p.name}</span>
                      {p.description && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}> — {p.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Test Generation Instructions (Optional)</h3>
              <p className={styles.helperText}>
                Domain-specific guidance for attack generation. E.g. healthcare: "Focus on HIPAA violations and medical terminology."
              </p>
              <textarea
                value={testGenerationInstructions}
                onChange={e => setTestGenerationInstructions(e.target.value)}
                className={styles.textArea}
                placeholder="e.g. Generate attacks using medical terminology and realistic patient scenarios. Focus on HIPAA compliance."
                rows={2}
              />
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Attack Language (Optional)</h3>
              <p className={styles.helperText}>
                ISO 639-1 codes for adversarial test generation. Leave empty for English. Multi-language tests whether safety holds across languages.
              </p>
              <div className={styles.languageRow}>
                {[
                  { code: 'en', label: 'English' },
                  { code: 'es', label: 'Spanish' },
                  { code: 'fr', label: 'French' },
                  { code: 'de', label: 'German' },
                  { code: 'zh', label: 'Chinese' },
                  { code: 'ja', label: 'Japanese' },
                  { code: 'ar', label: 'Arabic' },
                ].map(({ code, label }) => (
                  <label key={code} className={styles.pickerItem}>
                    <input
                      type="checkbox"
                      checked={language.includes(code)}
                      onChange={e => {
                        if (e.target.checked) setLanguage(prev => [...prev, code])
                        else setLanguage(prev => prev.filter(x => x !== code))
                      }}
                    />
                    <span>{label} ({code})</span>
                  </label>
                ))}
                <span className={styles.helperText} style={{ marginLeft: 8 }}>
                  Other:
                </span>
                <input
                  type="text"
                  value={languageOther}
                  onChange={e => setLanguageOther(e.target.value)}
                  placeholder="e.g. pt, ru, ko"
                  className={styles.urlInput}
                  style={{ width: 120, marginLeft: 4 }}
                />
              </div>
            </div>

            <div className={styles.launchBar}>
              <select value={targetType} onChange={e => setTargetType(e.target.value)} className={styles.select}>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="http">HTTP Endpoint</option>
                <option value="mcp">MCP Server</option>
              </select>
              <input type="text" value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
                className={styles.urlInput} placeholder="Target URL" />
              <select value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)} className={styles.select}>
                {SCAN_PROFILES.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {isRunning ? (
                <button onClick={cancelScan} className={styles.cancelBtn}>
                  <StopCircle size={14} /> Cancel
                </button>
              ) : (
                <button onClick={startScan} className={styles.runBtn}>
                  <Play size={14} /> Start Scan
                </button>
              )}
            </div>

            {selectedProfile === 'custom' && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Custom Plugins & Strategies</h3>
                <p className={styles.helperText}>
                  Select plugins (vulnerability types) and strategies (attack techniques). Plugins marked with 🌐 require PROMPTFOO_API_KEY.
                </p>
                {customPlugins.some(id => PLUGINS.find(p => p.id === id)?.remoteOnly) && (
                  <div className={styles.remoteWarning}>
                    Some selected plugins require PROMPTFOO_API_KEY or remote generation. Without it, they may be skipped.
                  </div>
                )}
                <div className={styles.customPickerGrid}>
                  <div>
                    <label className={styles.pickerLabel}>Plugins ({customPlugins.length})</label>
                    <input
                      type="text"
                      value={pluginSearch}
                      onChange={e => setPluginSearch(e.target.value)}
                      placeholder="Search plugins..."
                      className={styles.urlInput}
                      style={{ marginBottom: 8, maxWidth: 200 }}
                    />
                    <div className={styles.pickerList}>
                      {(Object.keys(PLUGIN_CATEGORIES) as Array<keyof typeof PLUGIN_CATEGORIES>).map(cat => {
                        const items = PLUGINS.filter(
                          p => p.category === cat && (!pluginSearch || p.id.toLowerCase().includes(pluginSearch.toLowerCase()) || p.label.toLowerCase().includes(pluginSearch.toLowerCase()))
                        )
                        if (items.length === 0) return null
                        return (
                          <div key={cat} className={styles.pickerGroup}>
                            <div className={styles.pickerGroupTitle}>{PLUGIN_CATEGORIES[cat]}</div>
                            {items.map(p => (
                              <label key={p.id} className={styles.pickerItem}>
                                <input
                                  type="checkbox"
                                  checked={customPlugins.includes(p.id)}
                                  onChange={e => {
                                    if (e.target.checked) setCustomPlugins(prev => [...prev, p.id])
                                    else setCustomPlugins(prev => prev.filter(x => x !== p.id))
                                  }}
                                />
                                <span>{p.label}</span>
                                {p.remoteOnly && <span className={styles.remoteBadge}>🌐</span>}
                              </label>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className={styles.pickerLabel}>Strategies ({customStrategies.length})</label>
                    <input
                      type="text"
                      value={strategySearch}
                      onChange={e => setStrategySearch(e.target.value)}
                      placeholder="Search strategies..."
                      className={styles.urlInput}
                      style={{ marginBottom: 8, maxWidth: 200 }}
                    />
                    <div className={styles.pickerList}>
                      {(Object.keys(STRATEGY_CATEGORIES) as Array<keyof typeof STRATEGY_CATEGORIES>).map(cat => {
                        const items = STRATEGIES.filter(
                          s => s.category === cat && (!strategySearch || s.id.toLowerCase().includes(strategySearch.toLowerCase()) || s.label.toLowerCase().includes(strategySearch.toLowerCase()))
                        )
                        if (items.length === 0) return null
                        return (
                          <div key={cat} className={styles.pickerGroup}>
                            <div className={styles.pickerGroupTitle}>{STRATEGY_CATEGORIES[cat]}</div>
                            {items.map(s => (
                              <label key={s.id} className={styles.pickerItem}>
                                <input
                                  type="checkbox"
                                  checked={customStrategies.includes(s.id)}
                                  onChange={e => {
                                    if (e.target.checked) setCustomStrategies(prev => [...prev, s.id])
                                    else setCustomStrategies(prev => prev.filter(x => x !== s.id))
                                  }}
                                />
                                <span>{s.label}</span>
                                {s.remoteOnly && <span className={styles.remoteBadge}>🌐</span>}
                              </label>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <label className={styles.pickerLabel}>
                    Tests per plugin:
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customNumTests}
                      onChange={e => setCustomNumTests(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))}
                      className={styles.select}
                      style={{ marginLeft: 8, width: 60 }}
                    />
                  </label>
                </div>
              </div>
            )}

            {selectedScanForConfig && (() => {
              const scan = scans.find(s => s.id === selectedScanForConfig)
              if (!scan) return null
              const plugins = Array.isArray(scan.plugins) ? (scan.plugins as string[]).join(', ') : String(scan.plugins ?? '—')
              const strategies = Array.isArray(scan.strategies)
                ? (scan.strategies as string[]).join(', ')
                : typeof scan.strategies === 'object' && scan.strategies !== null
                  ? JSON.stringify(scan.strategies).slice(0, 80) + '…'
                  : String(scan.strategies ?? '—')
              const trunc = (s: string, n: number) => (s?.length > n ? s.slice(0, n) + '…' : s || '—')
              return (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Scan Configuration</h3>
                  <p className={styles.helperText}>Selected scan: {scan.name}</p>
                  <dl className={styles.configSummary}>
                    <dt>Profile</dt><dd>{scan.profile}</dd>
                    <dt>Target type</dt><dd>{scan.targetType ?? 'http'}</dd>
                    <dt>Target URL</dt><dd title={scan.targetUrl}>{trunc(scan.targetUrl, 60)}</dd>
                    <dt>Plugins</dt><dd>{trunc(plugins, 80)}</dd>
                    <dt>Strategies</dt><dd>{trunc(strategies, 80)}</dd>
                    <dt>Tests per plugin</dt><dd>{scan.numTests ?? '—'}</dd>
                    <dt>Purpose</dt><dd>{trunc(scan.purpose ?? '', 100)}</dd>
                    <dt>System prompt</dt><dd>{trunc(scan.systemPrompt ?? '', 100)}</dd>
                  </dl>
                </div>
              )
            })()}

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>All Scans</h3>
              <p className={styles.helperText}>Click a row to view its configuration above.</p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Target</th>
                    <th>Profile</th>
                    <th>Risk Score</th>
                    <th>Tests</th>
                    <th>Findings</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map(s => (
                    <tr
                      key={s.id}
                      className={selectedScanForConfig === s.id ? styles.rowSelected : ''}
                      onClick={() => setSelectedScanForConfig(s.id)}
                    >
                      <td>{s.name}</td>
                      <td>
                        <span className={`${styles.statusChip} ${
                          s.status === 'completed' ? styles.chipSuccess
                            : s.status === 'failed' ? styles.chipError
                            : s.status === 'running' ? styles.chipWarn
                            : ''
                        }`}>{s.status}</span>
                      </td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.targetUrl}
                      </td>
                      <td>{s.profile}</td>
                      <td className={
                        (s.systemRiskScore ?? 0) >= 9 ? styles.sevCritical
                          : (s.systemRiskScore ?? 0) >= 7 ? styles.sevHigh
                          : (s.systemRiskScore ?? 0) >= 4 ? styles.sevMedium
                          : styles.sevLow
                      }>
                        {s.systemRiskScore != null ? s.systemRiskScore.toFixed(1) : '—'}
                      </td>
                      <td>{s.totalTests ?? '—'}</td>
                      <td>{s._count?.findings ?? 0}</td>
                      <td>{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td>
                        {s.status === 'completed' && (
                          <button className={styles.externalLink} style={{ padding: '4px 8px', fontSize: 10 }}
                            onClick={e => { e.stopPropagation(); fetchFindings(s.id); fetchCompliance(s.id); setActiveTab('findings') }}>
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── FINDINGS TAB ──────────────────────────────────── */}
        {activeTab === 'findings' && (
          <div className={styles.tabContent}>
            {selectedScanId && (
              <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Showing findings for scan: {selectedScanId}
                </span>
                <button className={styles.externalLink} style={{ padding: '4px 8px', fontSize: 10 }}
                  onClick={() => { setActiveTab('compliance'); }}>
                  <Shield size={10} /> View Compliance
                </button>
                <a className={styles.externalLink} style={{ padding: '4px 8px', fontSize: 10 }}
                  href={`/api/ai-security/reports/${selectedScanId}?format=html`}
                  target="_blank" rel="noopener noreferrer">
                  <Download size={10} /> HTML Report
                </a>
                <a className={styles.externalLink} style={{ padding: '4px 8px', fontSize: 10 }}
                  href={`/api/ai-security/reports/${selectedScanId}?format=pdf`}
                  target="_blank" rel="noopener noreferrer">
                  <FileText size={10} /> PDF Report
                </a>
              </div>
            )}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Findings ({findings.length})</h3>
              {findings.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No findings loaded. Click a completed scan to view its findings.</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Plugin</th>
                      <th>Strategy</th>
                      <th>Category</th>
                      <th>Risk</th>
                      <th>Prompt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map(f => (
                      <tr key={f.id}>
                        <td className={
                          f.severity === 'critical' ? styles.sevCritical
                            : f.severity === 'high' ? styles.sevHigh
                            : f.severity === 'medium' ? styles.sevMedium
                            : styles.sevLow
                        }>
                          <strong>{f.severity.toUpperCase()}</strong>
                        </td>
                        <td>{f.plugin}</td>
                        <td>{f.strategy || '—'}</td>
                        <td>{f.category}</td>
                        <td>{f.riskScore?.toFixed(1) ?? '—'}</td>
                        <td>
                          <div className={styles.promptBlock}>
                            {f.prompt.slice(0, 300)}{f.prompt.length > 300 ? '...' : ''}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── COMPLIANCE TAB ────────────────────────────────── */}
        {activeTab === 'compliance' && (
          <div className={styles.tabContent}>
            {selectedScanId && compliance.length === 0 && (
              <div className={styles.emptyState}>
                <p>Loading compliance data...</p>
              </div>
            )}
            {!selectedScanId && (
              <div className={styles.emptyState}>
                <p>Select a completed scan from the Dashboard or Scans tab to view compliance scorecards.</p>
              </div>
            )}

            {compliance.length > 0 && (
              <>
                <div className={styles.complianceRow}>
                  {compliance.map(sc => (
                    <div key={sc.framework} className={styles.complianceBadge}>
                      <div className={`${styles.complianceScore} ${
                        sc.overallScore >= 80 ? styles.sevLow
                          : sc.overallScore >= 50 ? styles.sevMedium
                          : styles.sevCritical
                      }`}>
                        {sc.overallScore}%
                      </div>
                      <div>
                        <div className={styles.complianceName}>{sc.frameworkLabel}</div>
                        <div className={styles.complianceDetail}>
                          {sc.passedControls} passed / {sc.failedControls} failed / {sc.notTestedControls} not tested
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {compliance.map(sc => (
                  <div key={sc.framework} className={styles.section}>
                    <h3 className={styles.sectionTitle}>{sc.frameworkLabel}</h3>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Control</th>
                          <th>Name</th>
                          <th>Status</th>
                          <th>Findings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sc.controls.map(c => (
                          <tr key={c.control.id}>
                            <td><strong>{c.control.id}</strong></td>
                            <td>{c.control.name}</td>
                            <td>
                              <span className={`${styles.statusChip} ${
                                c.status === 'pass' ? styles.chipSuccess
                                  : c.status === 'fail' ? styles.chipError
                                  : c.status === 'partial' ? styles.chipWarn
                                  : ''
                              }`}>
                                {c.status.toUpperCase()}
                              </span>
                            </td>
                            <td>{c.findingCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── REPORT TAB ────────────────────────────────────── */}
        {activeTab === 'report' && (
          <div className={styles.tabContent}>
            {selectedScanId ? (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Export Report</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Generate downloadable reports for auditors and compliance teams. Includes executive summary,
                  CVSS risk scores, compliance scorecards, all findings, and remediation recommendations.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <a className={styles.runBtn}
                    href={`/api/ai-security/reports/${selectedScanId}?format=json`}
                    target="_blank" rel="noopener noreferrer">
                    <Download size={14} /> JSON Report
                  </a>
                  <a className={styles.runBtn}
                    href={`/api/ai-security/reports/${selectedScanId}?format=html`}
                    target="_blank" rel="noopener noreferrer">
                    <FileText size={14} /> HTML Report
                  </a>
                  <a className={styles.runBtn}
                    href={`/api/ai-security/reports/${selectedScanId}?format=pdf`}
                    target="_blank" rel="noopener noreferrer">
                    <FileText size={14} /> PDF Report
                  </a>
                </div>
              </div>
            ) : (
              <div className={styles.emptyState}>
                <p>Select a completed scan to generate reports.</p>
                <p style={{ fontSize: 12 }}>Click a completed scan in the Dashboard or Scans tab first.</p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

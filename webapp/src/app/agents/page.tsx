'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot, Shield, Zap, Globe, Radio, FileText, Play, Loader2,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, Cpu, Hash,
  Wrench, BookOpen, BarChart2, X, Info, Sparkles, Activity,
  RefreshCw, Clock, ExternalLink,
} from 'lucide-react'
import styles from './page.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────────────────

interface AgentProfile {
  slug: string
  name: string
  description: string
  modelProvider: string
  modelName: string
  tags: string[]
  tools: string[]
  skills: string[]
  systemPrompt?: string
  runCount?: number
  successRate?: number
}

type SpawnStatus = 'idle' | 'running' | 'completed' | 'failed'

interface LogLine {
  ts: string
  msg: string
}

// ── Constants ─────────────────────────────────────────────────────────────────────────────────

const DEFAULT_PROFILES: AgentProfile[] = [
  {
    slug: 'recon-specialist',
    name: 'Recon Specialist',
    description: 'Expert in passive and active reconnaissance. Masters OSINT enumeration, network scanning, subdomain discovery, and attack surface mapping.',
    modelProvider: 'anthropic',
    modelName: 'claude-opus-4-5',
    tags: ['Reconnaissance', 'OSINT', 'Network'],
    tools: ['spiderfoot', 'nmap', 'amass', 'shodan'],
    skills: ['recon-kill-chain', 'osint-enumeration'],
    systemPrompt: 'You are an expert reconnaissance specialist. Map the full attack surface using OSINT and active scanning. Use SpiderFoot, Nmap, Amass, and Shodan to enumerate subdomains, open ports, and infrastructure.',
    runCount: 12,
    successRate: 92,
  },
  {
    slug: 'vuln-scanner',
    name: 'Vulnerability Scanner',
    description: 'Automated vulnerability discovery using Nuclei templates, Nikto, Nessus, and known CVE detection across services.',
    modelProvider: 'anthropic',
    modelName: 'claude-opus-4-5',
    tags: ['Scanning', 'CVE', 'Risk'],
    tools: ['nuclei', 'nikto', 'nessus', 'openvas'],
    skills: ['vuln-scan-chain', 'cve-lookup'],
    systemPrompt: 'You are a vulnerability scanning specialist. Systematically identify security weaknesses using Nuclei, Nikto, Nessus, and OpenVAS. Correlate findings with CVE databases and assess risk using CVSS scoring.',
    runCount: 8,
    successRate: 88,
  },
  {
    slug: 'exploit-engineer',
    name: 'Exploit Engineer',
    description: 'Weaponization and exploitation specialist using Metasploit with human-in-the-loop controls.',
    modelProvider: 'anthropic',
    modelName: 'claude-opus-4-5',
    tags: ['Exploitation', 'Metasploit', 'HITL'],
    tools: ['metasploit', 'searchsploit', 'msfconsole'],
    skills: ['exploit-chain', 'payload-builder'],
    systemPrompt: 'You are an exploit engineering specialist with human-in-the-loop controls. Select exploits, prepare payloads, and execute with explicit operator approval at each step.',
    runCount: 4,
    successRate: 75,
  },
  {
    slug: 'webapp-tester',
    name: 'Web App Tester',
    description: 'Full OWASP Top 10 coverage — SQLi, XSS, SSRF, auth bypass, and IDOR detection using Burp, SQLMap, ZAP and FFUF.',
    modelProvider: 'anthropic',
    modelName: 'claude-opus-4-5',
    tags: ['OWASP', 'Web', 'Injection'],
    tools: ['burp', 'sqlmap', 'zap', 'ffuf'],
    skills: ['owasp-top10', 'webapp-kill-chain'],
    systemPrompt: 'You are a web application penetration tester specializing in OWASP Top 10. Use Burp Suite, SQLMap, OWASP ZAP, and FFUF to discover injection flaws, authentication weaknesses, SSRF, and IDOR vulnerabilities.',
    runCount: 15,
    successRate: 95,
  },
  {
    slug: 'c2-operator',
    name: 'C2 Operator',
    description: 'Command and control post-exploitation specialist using Cobalt Strike, Empire, and Covenant.',
    modelProvider: 'anthropic',
    modelName: 'claude-opus-4-5',
    tags: ['C2', 'Post-Exploit', 'HITL'],
    tools: ['cobalt-strike', 'empire', 'covenant'],
    skills: ['c2-chain', 'lateral-movement'],
    systemPrompt: 'You are a C2 operator and post-exploitation specialist with strict human-in-the-loop controls. Manage implant infrastructure, conduct lateral movement, establish persistence with explicit operator approval.',
    runCount: 2,
    successRate: 80,
  },
  {
    slug: 'report-writer',
    name: 'Report Writer',
    description: 'Produces professional penetration test reports with CVSS scoring, remediation guidance, and executive summaries.',
    modelProvider: 'anthropic',
    modelName: 'claude-haiku-4-5',
    tags: ['Reporting', 'CVSS', 'Remediation'],
    tools: ['pandoc', 'latex', 'wkhtmltopdf'],
    skills: ['report-template', 'cvss-scoring'],
    systemPrompt: 'You are a technical report writer for penetration tests. Synthesize findings into professional reports with executive summaries, technical details, CVSS scores, and prioritized remediation guidance.',
    runCount: 18,
    successRate: 100,
  },
]

const AGENT_COLORS: Record<string, string> = {
  'recon-specialist': '#6366f1',
  'vuln-scanner': '#f59e0b',
  'exploit-engineer': '#ef4444',
  'webapp-tester': '#10b981',
  'c2-operator': '#8b5cf6',
  'report-writer': '#3b82f6',
}

const AGENT_ICONS: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  'recon-specialist': Globe,
  'vuln-scanner': Shield,
  'exploit-engineer': Zap,
  'webapp-tester': Globe,
  'c2-operator': Radio,
  'report-writer': FileText,
}

// ── AgentIcon ─────────────────────────────────────────────────────────────────────────────────

function AgentIcon({ slug, size = 24 }: { slug: string; size?: number }) {
  const color = AGENT_COLORS[slug] ?? '#6366f1'
  const Icon = AGENT_ICONS[slug] ?? Bot
  return (
    <div
      className={styles.agentIcon}
      style={{ background: color + '22', border: `1px solid ${color}44` }}
    >
      <Icon size={size} style={{ color }} />
    </div>
  )
}

// ── ProfileDetail ─────────────────────────────────────────────────────────────────────────────────

function ProfileDetail({
  profile,
  onClose,
  onSpawn,
}: {
  profile: AgentProfile
  onClose: () => void
  onSpawn: (p: AgentProfile) => void
}) {
  const color = AGENT_COLORS[profile.slug] ?? '#6366f1'
  const Icon = AGENT_ICONS[profile.slug] ?? Bot

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.detailModal}>
        <div className={styles.detailHeader} style={{ borderTop: `3px solid ${color}` }}>
          <div style={{
            width: 52, height: 52, borderRadius: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: color + '22', border: `1px solid ${color}44`, flexShrink: 0,
          }}>
            <Icon size={26} style={{ color }} />
          </div>
          <div className={styles.detailTitle}>
            <h2>{profile.name}</h2>
            <p>{profile.description}</p>
          </div>
          <div className={styles.detailHeaderActions}>
            <button
              className={styles.detailSpawnBtn}
              style={{ width: 'auto' }}
              onClick={() => { onClose(); onSpawn(profile) }}
            >
              <Play size={15} /> Spawn Agent
            </button>
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </div>

        <div className={styles.detailBody}>
          <div className={styles.statsRow}>
            <div className={styles.statBox}>
              <span className={styles.statBoxValue}>{profile.runCount ?? 0}</span>
              <span className={styles.statBoxLabel}>Runs</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxValue}>{profile.successRate ?? 0}%</span>
              <span className={styles.statBoxLabel}>Success</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxValue}>{(profile.tools ?? []).length}</span>
              <span className={styles.statBoxLabel}>Tools</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statBoxValue}>{(profile.skills ?? []).length}</span>
              <span className={styles.statBoxLabel}>Skills</span>
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Model</span>
            <div className={styles.modelBadge}>
              <Cpu size={14} />
              {profile.modelProvider} / {profile.modelName}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Specialisations</span>
            <div className={styles.tagRow}>
              {(profile.tags ?? []).map((t) => <span key={t} className={styles.tag}>{t}</span>)}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>MCP Tools</span>
            <div className={styles.toolGrid}>
              {(profile.tools ?? []).map((t) => (
                <div key={t} className={styles.toolBadge}><Hash size={12} />{t}</div>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Skill Packs</span>
            <div className={styles.toolGrid}>
              {(profile.skills ?? []).map((s) => (
                <div key={s} className={styles.skillBadge}><BookOpen size={12} />{s}</div>
              ))}
            </div>
          </div>

          {profile.systemPrompt && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>System Prompt</span>
              <pre className={styles.promptBox}>{profile.systemPrompt}</pre>
            </div>
          )}

          <button
            className={styles.detailSpawnBtn}
            onClick={() => { onClose(); onSpawn(profile) }}
          >
            <Play size={16} /> Spawn {profile.name}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── SpawnModal ─────────────────────────────────────────────────────────────────────────────────

function SpawnModal({
  profile,
  onClose,
  initialTask,
}: {
  profile: AgentProfile
  onClose: () => void
  initialTask?: string
}) {
  const [task, setTask] = useState(initialTask ?? '')
  const [runId, setRunId] = useState<string | null>(null)
  const [status, setStatus] = useState<SpawnStatus>('idle')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [termOpen, setTermOpen] = useState(true)
  const termRef = useRef<HTMLDivElement>(null)

  const color = AGENT_COLORS[profile.slug] ?? '#6366f1'
  const Icon = AGENT_ICONS[profile.slug] ?? Bot

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [logs])

  useEffect(() => {
    if (!runId) return
    const es = new EventSource(`/api/agent-runs/${runId}/stream`)
    es.onmessage = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === 'log') {
        setLogs((prev) => [...prev, { ts: data.timestamp ?? new Date().toISOString(), msg: data.message ?? '' }])
      }
      if (data.type === 'done') {
        setStatus(data.status === 'COMPLETED' ? 'completed' : 'failed')
        es.close()
      }
      if (data.type === 'error') {
        setLogs((prev) => [...prev, { ts: new Date().toISOString(), msg: data.message ?? 'Error' }])
        setStatus('failed')
        es.close()
      }
    }
    es.onerror = () => { setStatus('failed'); es.close() }
    return () => es.close()
  }, [runId])

  const handleSpawn = async () => {
    if (!task.trim()) return
    setStatus('running')
    setLogs([])
    try {
      const res = await fetch(`/api/agents/${profile.slug}/spawn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Spawn failed')
      setRunId(data.runId)
    } catch (err) {
      setStatus('failed')
      setLogs([{ ts: new Date().toISOString(), msg: String(err) }])
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.spawnModal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <Icon size={20} style={{ color }} />
            <span>Spawn {profile.name}</span>
            {status === 'running' && <Loader2 size={16} className={styles.spinning} />}
            {status === 'completed' && <CheckCircle2 size={16} className={styles.iconSuccess} />}
            {status === 'failed' && <XCircle size={16} className={styles.iconError} />}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <div>
            <label className={styles.fieldLabel}>Task / Objective</label>
            <textarea
              className={styles.taskInput}
              placeholder="Describe the task for this agent..."
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={status === 'running'}
              rows={4}
            />
          </div>

          <div className={styles.spawnRow}>
            <button
              className={styles.spawnBtnLg}
              onClick={handleSpawn}
              disabled={!task.trim() || status === 'running'}
            >
              {status === 'running' ? (
                <><Loader2 size={16} className={styles.spinning} /> Running...</>
              ) : (
                <><Play size={16} /> Spawn Agent</>
              )}
            </button>
            {status !== 'idle' && (
              <span className={styles.statusBadge} data-status={status}>
                {status.toUpperCase()}
              </span>
            )}
          </div>

          {(status !== 'idle' || logs.length > 0) && (
            <div className={styles.terminalWrapper}>
              <button className={styles.termToggle} onClick={() => setTermOpen((v) => !v)}>
                <BarChart2 size={14} />
                Agent Output
                {termOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {termOpen && (
                <div className={styles.terminal} ref={termRef}>
                  {logs.map((line, i) => (
                    <div key={i} className={styles.termLine}>
                      <span className={styles.termTs}>{new Date(line.ts).toLocaleTimeString()}</span>
                      <span className={styles.termMsg}>{line.msg}</span>
                    </div>
                  ))}
                  {status === 'running' && (
                    <div className={styles.termLine} style={{ color: '#6366f1' }}>
                      <span className={styles.termCursor}>▮</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Agent Card ─────────────────────────────────────────────────────────────────────────────────

function AgentCard({
  profile,
  onViewDetails,
  onSpawn,
}: {
  profile: AgentProfile
  onViewDetails: (p: AgentProfile) => void
  onSpawn: (p: AgentProfile) => void
}) {
  const color = AGENT_COLORS[profile.slug] ?? '#6366f1'
  const Icon = AGENT_ICONS[profile.slug] ?? Bot

  return (
    <div
      className={styles.agentCard}
      style={{ '--agent-color': color } as React.CSSProperties}
      onClick={() => onViewDetails(profile)}
    >
      <div className={styles.cardHeader}>
        <div
          className={styles.agentIcon}
          style={{ background: color + '22', border: `1px solid ${color}44` }}
        >
          <Icon size={24} style={{ color }} />
        </div>
        <div className={styles.cardMeta}>
          <h3 className={styles.agentName}>{profile.name}</h3>
          <p className={styles.agentDesc}>{profile.description}</p>
        </div>
      </div>

      <div className={styles.tagRow}>
        {(profile.tags ?? []).map((tag) => (
          <span key={tag} className={styles.tag}>{tag}</span>
        ))}
      </div>

      <div className={styles.toolRow}>
        {(profile.tools ?? []).slice(0, 4).map((tool) => (
          <span key={tool} className={styles.tool}>{tool}</span>
        ))}
        {(profile.tools ?? []).length > 4 && (
          <span className={styles.tool}>+{(profile.tools ?? []).length - 4}</span>
        )}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.stat}>
          <BarChart2 size={12} />
          {profile.runCount ?? 0} runs
          {profile.successRate != null && ` · ${profile.successRate}%`}
        </div>
        <div className={styles.cardActions}>
          <button
            className={styles.detailsBtn}
            onClick={(e) => { e.stopPropagation(); onViewDetails(profile) }}
          >
            <Info size={12} /> Details
          </button>
          <button
            className={styles.spawnBtn}
            onClick={(e) => { e.stopPropagation(); onSpawn(profile) }}
          >
            <Play size={12} /> Spawn
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────────────────

// ── AgentRun type (from API) ──────────────────────────────────────────────────────────────

interface AgentRun {
  id: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  task: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  a0ContextId?: string
  profile: {
    slug: string
    name: string
    color: string
    tags: string[]
  }
}

// ── Live Runs component ───────────────────────────────────────────────────────────────────

function LiveRuns() {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(Date.now())
  const [autoRefresh, setAutoRefresh] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRuns = useCallback(async () => {
    try {
      const r = await fetch('/api/agent-runs?limit=15')
      const data = await r.json()
      if (Array.isArray(data.runs)) setRuns(data.runs)
      setLastRefresh(Date.now())
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRuns()
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchRuns, 5000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchRuns, autoRefresh])

  function statusColor(s: string) {
    if (s === 'COMPLETED') return 'var(--status-success-text, #22c55e)'
    if (s === 'FAILED') return 'var(--status-error-text, #ef4444)'
    if (s === 'RUNNING') return '#818cf8'
    return 'var(--text-tertiary)'
  }

  function statusLabel(s: string) {
    if (s === 'COMPLETED') return '✓ Done'
    if (s === 'FAILED') return '✗ Failed'
    if (s === 'RUNNING') return '⟳ Running'
    return 'Queued'
  }

  function formatDuration(ms?: number) {
    if (!ms) return ''
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  function timeAgo(iso: string) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(iso).toLocaleDateString()
  }

  const activeCount = runs.filter(r => r.status === 'RUNNING').length

  return (
    <div className={styles.liveRunsSection}>
      <div className={styles.sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 className={styles.sectionTitle}>
            <Activity size={13} style={{ display: 'inline', marginRight: 5 }} />
            Live Activity Feed
          </h2>
          {activeCount > 0 && (
            <span className={styles.activeCount}>{activeCount} running</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Updated {timeAgo(new Date(lastRefresh).toISOString())}
          </span>
          <button
            className={styles.refreshBtn}
            onClick={() => { setAutoRefresh(v => !v) }}
            title={autoRefresh ? 'Auto-refresh ON — click to pause' : 'Auto-refresh OFF — click to enable'}
            style={{ color: autoRefresh ? '#6366f1' : 'var(--text-tertiary)' }}
          >
            <RefreshCw size={12} className={autoRefresh ? styles.spinning : undefined} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button className={styles.refreshBtn} onClick={fetchRuns} title="Refresh now">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState} style={{ padding: '24px' }}>
          <Loader2 size={16} className={styles.spinning} /> Loading runs…
        </div>
      ) : runs.length === 0 ? (
        <div className={styles.emptyRuns}>
          <Activity size={20} style={{ opacity: 0.3 }} />
          <span>No agent runs yet — spawn an agent above or trigger one from Agent Zero</span>
        </div>
      ) : (
        <div className={styles.runsList}>
          {runs.map(run => (
            <div key={run.id} className={styles.runRow}>
              <div
                className={styles.runStatusDot}
                style={{ background: statusColor(run.status) }}
                title={run.status}
              />
              <div className={styles.runProfile}>
                <span
                  className={styles.runProfileName}
                  style={{ color: AGENT_COLORS[run.profile?.slug] ?? '#6366f1' }}
                >
                  {run.profile?.name ?? run.profile?.slug ?? 'Unknown'}
                </span>
                {run.a0ContextId && (
                  <span className={styles.runSource} title="Triggered by Agent Zero">
                    <Bot size={9} /> A0
                  </span>
                )}
              </div>
              <div className={styles.runTask}>{run.task}</div>
              <div className={styles.runMeta}>
                {run.durationMs ? (
                  <span className={styles.runDuration}>
                    <Clock size={10} /> {formatDuration(run.durationMs)}
                  </span>
                ) : null}
                <span style={{ color: statusColor(run.status), fontSize: 11, fontWeight: 600 }}>
                  {statusLabel(run.status)}
                </span>
                <span className={styles.runTime}>{timeAgo(run.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [detailProfile, setDetailProfile] = useState<AgentProfile | null>(null)
  const [spawnProfile, setSpawnProfile] = useState<AgentProfile | null>(null)
  const [autoTask, setAutoTask] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((data) => {
        const profs: AgentProfile[] = data.profiles?.length > 0 ? data.profiles : DEFAULT_PROFILES
        setProfiles(profs)

        // Auto-spawn from mobile testing page ("Test with AI Agent" button)
        const autoPrompt = sessionStorage.getItem('agentZeroMobilePrompt')
        const autoSlug = sessionStorage.getItem('agentZeroAutoSlug')
        if (autoPrompt) {
          const found = profs.find((p) => p.slug === autoSlug)
            || profs.find((p) => p.name?.toLowerCase().includes('mobile'))
            || profs[0]
          if (found) {
            sessionStorage.removeItem('agentZeroMobilePrompt')
            sessionStorage.removeItem('agentZeroAutoSlug')
            setAutoTask(autoPrompt)
            setSpawnProfile(found)
          }
        }
      })
      .catch(() => setProfiles(DEFAULT_PROFILES))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <Sparkles size={14} />
              <span>Agent Swarm</span>
            </div>
            <h1 className={styles.heroTitle}>Agent Command Center</h1>
            <p className={styles.heroSubtitle}>
              Launch specialised AI agents for every phase of the cyber kill chain.
              Each agent is an expert — spawn one for a task or assemble a swarm for a full engagement.
            </p>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>{profiles.length}</span>
              <span className={styles.heroStatLabel}>Profiles</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>
                {profiles.reduce((a, p) => a + (p.runCount ?? 0), 0)}
              </span>
              <span className={styles.heroStatLabel}>Total Runs</span>
            </div>
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue} style={{ color: '#6366f1' }}>Ready</span>
              <span className={styles.heroStatLabel}>Status</span>
            </div>
          </div>
        </div>

        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>Available Agents</p>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <Loader2 size={24} className={styles.spinning} />
            <span>Loading agent profiles…</span>
          </div>
        ) : (
          <div className={styles.agentGrid}>
            {profiles.map((p) => (
              <AgentCard
                key={p.slug}
                profile={p}
                onViewDetails={setDetailProfile}
                onSpawn={setSpawnProfile}
              />
            ))}
          </div>
        )}

        {/* Live Activity Feed — shows ALL runs: UI-triggered + A0-triggered */}
        <LiveRuns />
      </div>

      {detailProfile && (
        <ProfileDetail
          profile={detailProfile}
          onClose={() => setDetailProfile(null)}
          onSpawn={(p) => { setDetailProfile(null); setSpawnProfile(p) }}
        />
      )}

      {spawnProfile && (
        <SpawnModal
          profile={spawnProfile}
          onClose={() => { setSpawnProfile(null); setAutoTask(null) }}
          initialTask={autoTask ?? undefined}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Play, Pause, Square, FastForward, Shield,
  Upload, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle, Clock, Activity, Download,
} from 'lucide-react'
import styles from './ops.module.css'

const STAGES = [
  { id: 1, name: 'Recon', icon: '🔭', desc: 'App metadata extraction, target enumeration' },
  { id: 2, name: 'Static Analysis', icon: '🔍', desc: 'Code decompilation, secrets, permissions, OWASP Top 10' },
  { id: 3, name: 'Dynamic Analysis', icon: '🔬', desc: 'Runtime instrumentation with Frida (requires emulator)' },
  { id: 4, name: 'Attack Simulation', icon: '🎯', desc: 'Intent hijacking, API fuzzing, auth bypass', requiresHITL: true },
  { id: 5, name: 'Data Exfil Test', icon: '💾', desc: 'Keystore audit, storage encryption, clipboard leakage', requiresHITL: true },
  { id: 6, name: 'Report', icon: '📄', desc: 'Compliance-mapped report: GDPR, PCI-DSS, HIPAA, SOC 2' },
] as const

type RunStatus = 'idle' | 'starting' | 'running' | 'paused' | 'waiting_for_operator' | 'completed' | 'error' | 'stopping'

interface MobileRunLog {
  id: string
  stage: number
  stageName: string
  level: string
  log: string
  toolName?: string | null
  timestamp: string
}

interface MobileRun {
  id: string
  status: RunStatus
  currentStage: number
  currentSubStep?: string | null
  stagesCompleted: number[]
  startedAt?: string | null
  completedAt?: string | null
  waitingForOperator: boolean
  operatorBriefing?: any
  error?: string | null
  notes?: string | null
  logs: MobileRunLog[]
}

interface MobileProject {
  id: string
  name: string
  platform: string
  bundleId?: string | null
  testingTypes: string[]
  description?: string | null
  scans: any[]
  runs: MobileRun[]
}

const STATUS_DOT_COLORS: Record<string, string> = {
  running: 'var(--accent-green, #00c864)',
  starting: 'var(--accent-orange, #ff9500)',
  paused: 'var(--accent-orange, #ff9500)',
  waiting_for_operator: 'var(--accent-critical, #f87171)',
  completed: 'var(--accent-green, #00c864)',
  error: 'var(--accent-red, #ff3b30)',
  stopping: 'var(--accent-orange, #ff9500)',
  idle: 'var(--text-secondary)',
}

function logLevelClass(level: string): string {
  const l = level?.toLowerCase()
  if (l === 'success') return styles.logSuccess
  if (l === 'error') return styles.logError
  if (l === 'warning') return styles.logWarning
  if (l === 'action') return styles.logAction
  return styles.logInfo
}

export default function MobileOpsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()
  const [project, setProject] = useState<MobileProject | null>(null)
  const [activeRun, setActiveRun] = useState<MobileRun | null>(null)
  const [pastRuns, setPastRuns] = useState<MobileRun[]>([])
  const [loading, setLoading] = useState(true)
  const [startingStage, setStartingStage] = useState(1)
  const [showPastRuns, setShowPastRuns] = useState(false)
  const [uploadDrag, setUploadDrag] = useState(false)
  const [uploading, setUploading] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/mobile/projects/${projectId}`)
      if (!res.ok) { router.push('/mobile'); return }
      const data = await res.json()
      const proj: MobileProject = data.project
      setProject(proj)

      const active = proj.runs.find((r) =>
        ['running', 'starting', 'paused', 'waiting_for_operator', 'stopping'].includes(r.status),
      )
      const past = proj.runs.filter((r) => ['completed', 'error', 'idle'].includes(r.status))
      setActiveRun(active || (proj.runs[0]?.status === 'completed' ? proj.runs[0] : null))
      setPastRuns(past)
    } catch {}
    setLoading(false)
  }, [projectId, router])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [activeRun?.logs])

  useEffect(() => {
    if (!activeRun || ['completed', 'error', 'idle'].includes(activeRun.status)) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/mobile/projects/${projectId}/runs/${activeRun.id}`)
        if (!res.ok) return
        const data = await res.json()
        setActiveRun(data.run)
        if (['completed', 'error'].includes(data.run.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          load()
        }
      } catch {}
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeRun?.id, activeRun?.status, projectId, load])

  const startRun = async (fromStage = 1) => {
    try {
      const res = await fetch(`/api/mobile/projects/${projectId}/runs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startStage: fromStage }),
      })
      const data = await res.json()
      if (data.run) { setActiveRun({ ...data.run, logs: data.run.logs ?? [] }); load() }
    } catch {}
  }

  const control = async (action: string) => {
    if (!activeRun) return
    await fetch(`/api/mobile/projects/${projectId}/runs/${activeRun.id}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    load()
  }

  const handleUpload = async (file: File) => {
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('projectId', projectId)
    await fetch('/api/mobile/upload', { method: 'POST', body: fd })
    setUploading(false)
    load()
  }

  const testWithAiAgent = () => {
    if (!project) return
    const prompt = `Perform a comprehensive mobile application security assessment.

**Project:** ${project.name}
**Platform:** ${project.platform}${project.bundleId ? `\n**Bundle ID:** ${project.bundleId}` : ''}${project.description ? `\n**Description:** ${project.description}` : ''}
**Testing Scope:** ${(project.testingTypes ?? []).join(', ') || 'Full security assessment'}${project.scans?.[0] ? `\n**App Binary:** ${project.scans[0].fileName || 'Uploaded'} (MobSF hash: ${project.scans[0].mobsfHash})` : ''}

**Rules of Engagement:**
- Use the mobile-tester agent profile and 6-stage mobile kill chain
- Perform static analysis using MobSF
- Map all findings to OWASP Mobile Top 10 (2024)
- Generate compliance report: GDPR, PCI-DSS, HIPAA, SOC 2
- Request human approval (HITL) before any attack simulation stages
- Provide a detailed security report at the end

Please begin the mobile kill chain assessment now.`
    sessionStorage.setItem('agentZeroMobilePrompt', prompt)
    sessionStorage.setItem('agentZeroAutoSlug', 'mobile-tester')
    router.push('/agents')
  }

  const formatDuration = (start?: string | null, end?: string | null): string => {
    if (!start) return '--'
    const s = new Date(start).getTime()
    const e = end ? new Date(end).getTime() : Date.now()
    const d = Math.floor((e - s) / 1000)
    if (d < 60) return `${d}s`
    if (d < 3600) return `${Math.floor(d / 60)}m ${d % 60}s`
    return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`
  }

  if (loading) return <div className={styles.loading}>Loading...</div>
  if (!project) return null

  const hasBinary = (project.scans ?? []).length > 0
  const isActive = activeRun && ['running', 'starting', 'paused', 'waiting_for_operator', 'stopping'].includes(activeRun.status)
  const isIdle = !isActive

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <button className={styles.backBtn} onClick={() => router.push('/mobile')}>
          <ArrowLeft size={16} /> Mobile Projects
        </button>
        <div className={styles.projectInfo}>
          <span className={styles.platformEmoji}>
            {project.platform === 'ANDROID' ? '🤖' : project.platform === 'IOS' ? '🍎' : '🪟'}
          </span>
          <div>
            <h1 className={styles.projectName}>{project.name}</h1>
            <div className={styles.projectMeta}>
              <span>{project.platform}</span>
              {project.bundleId && (<><span>•</span><span className={styles.bundleId}>{project.bundleId}</span></>)}
              <span>•</span>
              <span>{(project.testingTypes ?? []).length} test type{(project.testingTypes ?? []).length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.opsLayout}>
        {/* LEFT COLUMN */}
        <div className={styles.leftCol}>

          {/* Kill chain */}
          <div className={styles.killChainCard}>
            <div className={styles.killChainTitle}>Mobile Kill Chain</div>
            <div className={styles.stages}>
              {STAGES.map((stage, i) => {
                const completed = (activeRun?.stagesCompleted ?? []).includes(stage.id)
                const active = activeRun?.currentStage === stage.id && !!isActive

                return (
                  <div key={stage.id} className={styles.stageRow}>
                    <div className={styles.stageNodeWrap}>
                      <div className={`${styles.stageNode} ${completed ? styles.stageCompleted : ''} ${active ? styles.stageActive : ''}`}>
                        {completed ? '✓' : active ? <span className={styles.stagePulse} /> : stage.id}
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className={`${styles.stageConnector} ${completed ? styles.stageConnectorDone : ''}`} />
                      )}
                    </div>
                    <div className={styles.stageInfo}>
                      <div className={styles.stageName}>
                        <span className={styles.stageIcon}>{stage.icon}</span>
                        {stage.name}
                        {(stage as any).requiresHITL && <span className={styles.hitlBadge}>HITL</span>}
                      </div>
                      {active && activeRun?.currentSubStep ? (
                        <div className={styles.stageSubStep}>{activeRun.currentSubStep}</div>
                      ) : (
                        <div className={styles.stageDesc}>{stage.desc}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controlsCard}>
            <div className={styles.statusRow}>
              <div className={styles.statusDot} style={{ background: STATUS_DOT_COLORS[activeRun?.status ?? 'idle'] }} />
              <span className={styles.statusLabel}>
                {activeRun?.status === 'running'
                  ? `Running — Stage ${activeRun.currentStage}/6`
                  : activeRun?.status === 'waiting_for_operator'
                    ? 'Waiting for Operator'
                    : activeRun?.status
                      ? activeRun.status.charAt(0).toUpperCase() + activeRun.status.slice(1).replace(/_/g, ' ')
                      : 'Idle'}
              </span>
              {activeRun?.startedAt && (
                <span className={styles.duration}>{formatDuration(activeRun.startedAt, activeRun.completedAt)}</span>
              )}
            </div>

            {/* HITL panel */}
            {activeRun?.waitingForOperator && activeRun.operatorBriefing && (
              <div className={styles.hitlPanel}>
                <div className={styles.hitlHeader}>
                  <AlertTriangle size={16} color="#f87171" />
                  <span className={styles.hitlTitle}>{activeRun.operatorBriefing.title}</span>
                </div>
                <p className={styles.hitlDesc}>{activeRun.operatorBriefing.description}</p>
                <div className={styles.hitlRisk}>
                  Risk Level: <strong>{activeRun.operatorBriefing.riskLevel}</strong>
                </div>
                <div className={styles.hitlActions}>
                  <button className={styles.btnApprove} onClick={() => control('operator_approve')}>
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button className={styles.btnSkip} onClick={() => control('operator_skip')}>
                    <FastForward size={14} /> Skip Stage
                  </button>
                  <button className={styles.btnStop} onClick={() => control('operator_stop')}>
                    <Square size={14} /> Stop
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {activeRun?.status === 'error' && activeRun.error && (
              <div className={styles.errorPanel}>
                <AlertTriangle size={14} />
                <span>{activeRun.error}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className={styles.controlButtons}>
              {isIdle && !activeRun && (
                <>
                  <div className={styles.startConfig}>
                    <label className={styles.startLabel}>Start from stage:</label>
                    <select className={styles.stageSelect} value={startingStage} onChange={(e) => setStartingStage(parseInt(e.target.value))}>
                      {STAGES.map((s) => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                    </select>
                  </div>
                  <button className={styles.btnLaunch} onClick={() => startRun(startingStage)} disabled={!hasBinary}>
                    <Play size={16} /> Launch Assessment
                  </button>
                  {!hasBinary && (
                    <p className={styles.noBinaryNote}>⚠️ Upload an APK / IPA / APPX above to enable the assessment</p>
                  )}
                  <button className={styles.btnAiAgent} onClick={testWithAiAgent}>
                    🤖 Test with AI Agent
                  </button>
                </>
              )}
              {activeRun?.status === 'running' && !activeRun.waitingForOperator && (
                <>
                  <button className={styles.btnPause} onClick={() => control('pause')}>
                    <Pause size={14} /> Pause
                  </button>
                  <button className={styles.btnStop} onClick={() => control('stop')}>
                    <Square size={14} /> Stop
                  </button>
                </>
              )}
              {activeRun?.status === 'paused' && (
                <>
                  <button className={styles.btnResume} onClick={() => control('resume')}>
                    <Play size={14} /> Resume
                  </button>
                  <button className={styles.btnStop} onClick={() => control('stop')}>
                    <Square size={14} /> Stop
                  </button>
                </>
              )}
              {(activeRun?.status === 'completed' || activeRun?.status === 'error') && (
                <>
                  <button className={styles.btnLaunch} onClick={() => startRun(1)} disabled={!hasBinary}>
                    <Play size={16} /> Restart Assessment
                  </button>
                  <button className={styles.btnAiAgent} onClick={testWithAiAgent}>
                    🤖 Test with AI Agent
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Upload zone */}
          {!hasBinary && (
            <div
              className={`${styles.uploadCard} ${uploadDrag ? styles.uploadCardDrag : ''}`}
              onDragOver={(e) => { e.preventDefault(); setUploadDrag(true) }}
              onDragLeave={() => setUploadDrag(false)}
              onDrop={(e) => { e.preventDefault(); setUploadDrag(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
              onClick={() => document.getElementById('opsFileInput')?.click()}>
              <input type="file" id="opsFileInput" accept=".apk,.ipa,.appx" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
              <Upload size={24} strokeWidth={1.5} style={{ opacity: 0.6 }} />
              <span className={styles.uploadText}>
                {uploading ? 'Uploading...' : 'Drop APK / IPA / APPX here to upload'}
              </span>
            </div>
          )}

          {/* Past runs */}
          {pastRuns.length > 0 && (
            <div className={styles.pastRunsCard}>
              <button className={styles.pastRunsHeader} onClick={() => setShowPastRuns((v) => !v)}>
                <Clock size={14} /> Past Runs ({pastRuns.length})
                {showPastRuns ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {showPastRuns && (
                <div className={styles.pastRunsList}>
                  {pastRuns.map((run) => (
                    <div key={run.id} className={styles.pastRunRow} onClick={() => setActiveRun(run)}>
                      <span className={styles.pastRunDot} style={{ background: STATUS_DOT_COLORS[run.status] }} />
                      <span className={styles.pastRunStatus}>{run.status}</span>
                      <span className={styles.pastRunDate}>
                        {run.startedAt ? new Date(run.startedAt).toLocaleDateString() : '--'}
                      </span>
                      <span className={styles.pastRunDuration}>{formatDuration(run.startedAt, run.completedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className={styles.rightCol}>
          {/* Live logs */}
          <div className={styles.logsCard}>
            <div className={styles.logsHeader}>
              <Activity size={14} />
              <span>Assessment Logs</span>
              {isActive && <span className={styles.liveBadge}>● LIVE</span>}
            </div>
            <div className={styles.logsBody}>
              {!activeRun || (activeRun.logs ?? []).length === 0 ? (
                <div className={styles.logsEmpty}>
                  {isIdle ? 'Launch the assessment to see live logs here' : 'Waiting for logs...'}
                </div>
              ) : (
                (activeRun.logs ?? []).map((log) => (
                  <div key={log.id} className={styles.logLine}>
                    <span className={styles.logTime}>
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={styles.logStage}>S{log.stage}</span>
                    {log.toolName && <span className={styles.logTool}>[{log.toolName}]</span>}
                    <span className={`${styles.logText} ${logLevelClass(log.level)}`}>
                      {log.log}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* Results (when completed) */}
          {activeRun?.status === 'completed' && project.scans[0] && (
            <div className={styles.resultsCard}>
              <div className={styles.resultsHeader}>
                <Shield size={16} />
                <span>Assessment Results</span>
              </div>
              <div className={styles.resultsBody}>
                <div className={styles.scoreSection}>
                  <div className={styles.scoreBig}>{project.scans[0].score ?? '--'}</div>
                  <div className={styles.scoreLabel}>/100 Security Score</div>
                  <div className={styles.gradeBadge}>{project.scans[0].grade ?? '--'}</div>
                </div>
                <div className={styles.resultActions}>
                  <button className={styles.btnViewScans} onClick={() => router.push(`/mobile/scans`)}>
                    View Full Report
                  </button>
                  <a
                    href={`/api/mobile/scans/${project.scans[0].id}/report`}
                    className={styles.btnDownload}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={14} /> Download HTML Security Report
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

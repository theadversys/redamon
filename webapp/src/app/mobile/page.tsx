'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Smartphone, Plus, ChevronRight, Activity,
  MoreVertical, Pencil, Trash2, X, CheckSquare,
} from 'lucide-react'
import styles from './page.module.css'

interface MobileProject {
  id: string
  name: string
  description?: string | null
  platform: 'ANDROID' | 'IOS' | 'WINDOWS'
  bundleId?: string | null
  testingTypes: string[]
  createdAt: string
  scans: Array<{ id: string; status: string; score: number | null; grade: string | null; completedAt: string | null }>
  runs: Array<{ id: string; status: string; currentStage: number; startedAt: string | null; completedAt: string | null }>
  _count: { scans: number; runs: number }
}

const PLATFORM_LABELS: Record<string, string> = { ANDROID: 'Android', IOS: 'iOS', WINDOWS: 'Windows' }
const PLATFORM_ICONS: Record<string, string> = { ANDROID: '🤖', IOS: '🍎', WINDOWS: '🪟' }
const TESTING_TYPE_LABELS: Record<string, string> = {
  static_analysis: 'Static Analysis',
  dynamic_analysis: 'Dynamic Analysis',
  compliance: 'Compliance',
  red_team: 'Red Team',
  owasp_mobile: 'OWASP Mobile Top 10',
}

function ScoreRing({ score, grade, size = 48 }: { score: number | null; grade: string | null; size?: number }) {
  const r = size * 0.38
  const circ = 2 * Math.PI * r
  const pct = score !== null ? score / 100 : 0
  const color =
    score === null ? 'var(--border-subtle)'
    : score >= 70 ? 'var(--accent-green, #00c864)'
    : score >= 40 ? 'var(--accent-orange, #ff9500)'
    : 'var(--accent-red, #ff3b30)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={size*0.1} />
      {score !== null && (
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.1}
          strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      )}
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size*0.22} fontWeight="700" fill="var(--text-primary)">
        {score !== null ? (grade ?? '--') : '--'}
      </text>
    </svg>
  )
}

function RunStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    running:              { label: 'Running',          color: 'var(--accent-green, #00c864)' },
    starting:             { label: 'Starting',         color: 'var(--accent-orange, #ff9500)' },
    paused:               { label: 'Paused',           color: 'var(--accent-orange, #ff9500)' },
    waiting_for_operator: { label: 'Awaiting Approval',color: '#f87171' },
    completed:            { label: 'Completed',        color: 'var(--accent-green, #00c864)' },
    error:                { label: 'Error',            color: 'var(--accent-red, #ff3b30)' },
    stopping:             { label: 'Stopping',         color: 'var(--accent-orange, #ff9500)' },
    idle:                 { label: 'Idle',             color: 'var(--text-secondary)' },
  }
  const c = cfg[status] ?? cfg.idle
  return (
    <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:10,
      background:`${c.color}22`, color:c.color, letterSpacing:'0.3px' }}>
      {status === 'running' && <span style={{ marginRight:4 }}>●</span>}
      {c.label}
    </span>
  )
}

/* ── Confirm Dialog ─────────────────────────────────────────────── */
function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.dialogIcon}><Trash2 size={20} color="var(--accent-red, #ff3b30)" /></div>
        <p className={styles.dialogMsg}>{message}</p>
        <div className={styles.dialogActions}>
          <button className={styles.btnCancel} onClick={onCancel}>Cancel</button>
          <button className={styles.btnDanger} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

/* ── Edit Modal ─────────────────────────────────────────────────── */
function EditModal({ project, onSave, onClose }: {
  project: MobileProject; onSave: (id: string, data: Partial<MobileProject>) => Promise<void>; onClose: () => void
}) {
  const [name, setName] = useState(project.name)
  const [desc, setDesc] = useState(project.description ?? '')
  const [bundleId, setBundleId] = useState(project.bundleId ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    await onSave(project.id, { name: name.trim(), description: desc || null, bundleId: bundleId || null })
    setSaving(false)
    onClose()
  }

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.editModalHeader}>
          <span className={styles.editModalTitle}>Edit Project</span>
          <button className={styles.editModalClose} onClick={onClose}><X size={16} /></button>
        </div>
        <div className={styles.editModalBody}>
          <label className={styles.fieldLabel}>Project Name *</label>
          <input className={styles.fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          <label className={styles.fieldLabel}>Description</label>
          <textarea className={styles.fieldTextarea} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional description" rows={3} />
          <label className={styles.fieldLabel}>Bundle ID / Package Name</label>
          <input className={styles.fieldInput} value={bundleId} onChange={(e) => setBundleId(e.target.value)} placeholder="com.example.app" />
        </div>
        <div className={styles.editModalFooter}>
          <button className={styles.btnCancel} onClick={onClose}>Cancel</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════════════ */
export default function MobileProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<MobileProject[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null)
  const [editProject, setEditProject] = useState<MobileProject | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mobile/projects')
      const data = await res.json()
      setProjects(data.projects ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allSelected = projects.length > 0 && selected.size === projects.length
  const someSelected = selected.size > 0

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(projects.map((p) => p.id)))
  }

  const deleteProjects = async (ids: string[]) => {
    await Promise.all(ids.map((id) => fetch(`/api/mobile/projects/${id}`, { method: 'DELETE' })))
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
    setConfirmDelete(null)
    load()
  }

  const saveProject = async (id: string, data: Partial<MobileProject>) => {
    await fetch(`/api/mobile/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    load()
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}><Smartphone size={22} /></div>
          <div>
            <h1 className={styles.headerTitle}>Mobile Testing</h1>
            <p className={styles.headerSub}>OWASP Mobile Top 10 • Static &amp; Dynamic Analysis • Compliance</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={() => router.push('/mobile/scans')}>
            <Activity size={14} /> All Scans
          </button>
          <button className={styles.btnPrimary} onClick={() => router.push('/mobile/new')}>
            <Plus size={16} /> New Project
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{projects.length}</div>
          <div className={styles.statLabel}>Projects</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{projects.filter((p) => p.runs[0]?.status === 'running').length}</div>
          <div className={styles.statLabel}>Active Runs</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{projects.filter((p) => (p.scans[0]?.score ?? 0) >= 70).length}</div>
          <div className={styles.statLabel}>High Score</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{projects.reduce((a, p) => a + p._count.runs, 0)}</div>
          <div className={styles.statLabel}>Total Runs</div>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {projects.length > 0 && (
        <div className={`${styles.bulkToolbar} ${someSelected ? styles.bulkToolbarVisible : ''}`}>
          <label className={styles.selectAllLabel} onClick={toggleAll}>
            <CheckSquare size={15} className={allSelected ? styles.checkActive : styles.checkInactive} />
            {allSelected ? 'Deselect all' : `Select all (${projects.length})`}
          </label>
          {someSelected && (
            <>
              <span className={styles.bulkCount}>{selected.size} selected</span>
              <button
                className={styles.btnDangerSm}
                onClick={() => setConfirmDelete({
                  ids: [...selected],
                  label: `Delete ${selected.size} project${selected.size > 1 ? 's' : ''}?`,
                })}
              >
                <Trash2 size={13} /> Delete selected
              </button>
              <button className={styles.btnCancelSm} onClick={() => setSelected(new Set())}>
                <X size={13} /> Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className={styles.loadingState}>Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className={styles.emptyState}>
          <Smartphone size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
          <h2>No mobile projects yet</h2>
          <p>Create a project to start a mobile application security assessment</p>
          <button className={styles.btnPrimary} onClick={() => router.push('/mobile/new')}>
            <Plus size={16} /> Create First Project
          </button>
        </div>
      ) : (
        <div className={styles.projectsGrid} ref={menuRef}>
          {projects.map((project) => {
            const latestScan = project.scans[0]
            const latestRun = project.runs[0]
            const isActive = latestRun && ['running', 'starting', 'paused', 'waiting_for_operator'].includes(latestRun.status)
            const isSelected = selected.has(project.id)
            const menuOpen = menuOpenId === project.id

            return (
              <div
                key={project.id}
                className={`${styles.projectCard} ${isActive ? styles.projectCardActive : ''} ${isSelected ? styles.projectCardSelected : ''}`}
                onClick={() => router.push(`/mobile/${project.id}`)}
              >
                {/* Checkbox */}
                <div
                  className={`${styles.cardCheckbox} ${isSelected ? styles.cardCheckboxVisible : ''}`}
                  onClick={(e) => toggleSelect(project.id, e)}
                  title={isSelected ? 'Deselect' : 'Select'}
                >
                  <div className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}>
                    {isSelected && <span>✓</span>}
                  </div>
                </div>

                <div className={styles.cardHeader}>
                  <div className={styles.cardHeaderLeft}>
                    <span className={styles.platformIcon}>{PLATFORM_ICONS[project.platform]}</span>
                    <div>
                      <div className={styles.cardTitle}>{project.name}</div>
                      <div className={styles.cardSub}>
                        <span className={styles.platformBadge}>{PLATFORM_LABELS[project.platform]}</span>
                        {project.bundleId && <span className={styles.bundleId}>{project.bundleId}</span>}
                      </div>
                    </div>
                  </div>
                  <div className={styles.cardTopRight}>
                    <ScoreRing score={latestScan?.score ?? null} grade={latestScan?.grade ?? null} />
                    {/* ⋮ Menu */}
                    <div className={styles.menuWrap}>
                      <button
                        className={styles.menuBtn}
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpen ? null : project.id) }}
                        title="Options"
                      >
                        <MoreVertical size={15} />
                      </button>
                      {menuOpen && (
                        <div className={styles.dropdown}>
                          <button
                            className={styles.dropdownItem}
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); setEditProject(project) }}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <div className={styles.dropdownDivider} />
                          <button
                            className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuOpenId(null)
                              setConfirmDelete({ ids: [project.id], label: `Delete "${project.name}"?` })
                            }}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.testingTypes}>
                  {(project.testingTypes ?? []).map((t) => (
                    <span key={t} className={styles.testingTypeBadge}>{TESTING_TYPE_LABELS[t] ?? t}</span>
                  ))}
                </div>

                {project.description && <p className={styles.cardDesc}>{project.description}</p>}

                <div className={styles.runStatus}>
                  {latestRun ? (
                    <>
                      <RunStatusBadge status={latestRun.status} />
                      {latestRun.status === 'running' && (
                        <span className={styles.stageIndicator}>Stage {latestRun.currentStage}/6</span>
                      )}
                    </>
                  ) : (
                    <span className={styles.noRun}>No assessments run</span>
                  )}
                </div>

                <div className={styles.cardFooter}>
                  <div className={styles.cardMeta}>
                    <span>{project._count.runs} run{project._count.runs !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>{project._count.scans} scan{project._count.scans !== 1 ? 's' : ''}</span>
                  </div>
                  <ChevronRight size={14} className={styles.chevron} />
                </div>

                {isActive && <div className={styles.activeIndicator} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.label + ' This cannot be undone.'}
          onConfirm={() => deleteProjects(confirmDelete.ids)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Edit modal */}
      {editProject && (
        <EditModal
          project={editProject}
          onSave={saveProject}
          onClose={() => setEditProject(null)}
        />
      )}
    </div>
  )
}


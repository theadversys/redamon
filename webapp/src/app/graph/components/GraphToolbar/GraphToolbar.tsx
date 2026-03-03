'use client'

import { useRouter } from 'next/navigation'
import { Sparkles, Play, Download, Loader2, Terminal, Settings, X, PanelLeft, Layout, LayoutGrid, Bot, ChevronDown, Swords, Crosshair, HardDrive, Flag, Square, Pause, PlayCircle } from 'lucide-react'
import { Toggle, Menu, MenuItem } from '@/components/ui'
import type { ReconStatus } from '@/lib/recon-types'
import type { ViewMode, LayoutMode } from '@/hooks/usePanelLayout'
import styles from './GraphToolbar.module.css'

interface GraphToolbarProps {
  projectId: string
  is3D: boolean
  showLabels: boolean
  onToggle3D: (value: boolean) => void
  onToggleLabels: (value: boolean) => void
  effectiveViewMode: ViewMode
  effectiveLayoutMode: LayoutMode
  onLayoutModeChange?: (mode: LayoutMode) => void
  activeTab: 'graph' | 'panda-ai' | 'a0'
  onHideAI?: () => void
  onShowAI?: () => void
  onSelectTab?: (tab: 'graph' | 'panda-ai' | 'a0') => void
  // Target info
  targetDomain?: string
  subdomainList?: string[]
  // Recon props
  onStartRecon?: () => void
  onStopRecon?: () => void
  onPauseRecon?: () => void
  onResumeRecon?: () => void
  onDownloadJSON?: () => void
  reconStatus?: ReconStatus
  hasReconData?: boolean
  // Kill Chain actions
  onViewAttackPaths?: () => void
  onGeneratePayload?: () => void
  onRecordPersistence?: () => void
  onRecordAction?: () => void
}

export function GraphToolbar({
  projectId,
  is3D,
  showLabels,
  onToggle3D,
  onToggleLabels,
  effectiveViewMode,
  effectiveLayoutMode,
  onLayoutModeChange,
  activeTab,
  onHideAI,
  onShowAI,
  onSelectTab,
  // Target info
  targetDomain,
  subdomainList = [],
  // Recon props
  onStartRecon,
  onStopRecon,
  onPauseRecon,
  onResumeRecon,
  onDownloadJSON,
  reconStatus = 'idle',
  hasReconData = false,
  // Kill Chain actions
  onViewAttackPaths,
  onGeneratePayload,
  onRecordPersistence,
  onRecordAction,
}: GraphToolbarProps) {
  const router = useRouter()
  const isTestRunning = reconStatus === 'running' || reconStatus === 'starting'
  const isTestPaused = reconStatus === 'paused'
  const isTestActive = isTestRunning || isTestPaused

  const handleOpenSettings = () => {
    if (projectId) {
      router.push(`/projects/${projectId}/settings`)
    }
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.section}>
        <span className={styles.sectionLabel}>View Mode</span>
        <Toggle
          checked={is3D}
          onChange={onToggle3D}
          labelOff="2D"
          labelOn="3D"
          aria-label="Toggle 2D/3D view"
        />
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Labels</span>
        <Toggle
          checked={showLabels}
          onChange={onToggleLabels}
          labelOff="Off"
          labelOn="On"
          aria-label="Toggle labels"
        />
      </div>

      {/* Layout mode: Single vs All (three-pane) - always visible */}
      <div className={styles.divider} />
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Layout</span>
        <div className={styles.layoutSwitcher} role="group" aria-label="Layout mode">
          <button
            className={`${styles.layoutButton} ${effectiveLayoutMode === 'single' ? styles.layoutButtonActive : ''}`}
            onClick={() => onLayoutModeChange?.('single')}
            aria-label="Single layout (Graph or AI)"
            title="Single layout"
          >
            <Layout size={14} />
            <span>Single</span>
          </button>
          <button
            className={`${styles.layoutButton} ${effectiveLayoutMode === 'all' ? styles.layoutButtonActive : ''}`}
            onClick={() => onLayoutModeChange?.('all')}
            aria-label="All panes (Graph + Chat + Recon)"
            title="All three visible"
          >
            <LayoutGrid size={14} />
            <span>All</span>
          </button>
        </div>
      </div>

      {targetDomain && (
        <>
          <div className={styles.divider} />
          <div className={styles.targetSection}>
            {subdomainList.length > 0 && (
              <div className={styles.subdomainWrapper}>
                <span className={styles.subdomainList}>
                  {subdomainList.join(', ')}
                </span>
                <div className={styles.subdomainTooltip}>
                  {subdomainList.join(', ')}
                </div>
              </div>
            )}
            <span className={styles.targetDomain}>{targetDomain}</span>
          </div>
        </>
      )}

      <div className={styles.spacer} />

      {/* Launch Test & Controls */}
      {projectId && (
        <>
          {isTestActive ? (
            <div className={styles.testControlStrip}>
              <div className={styles.testStatus}>
                <span className={styles.testPulse} aria-hidden />
                {isTestPaused ? (
                  <>
                    <Pause size={14} />
                    <span>Test paused</span>
                  </>
                ) : (
                  <>
                    <Loader2 size={14} className={styles.spinner} />
                    <span>Test running…</span>
                  </>
                )}
              </div>
              <div className={styles.testActions}>
                {isTestPaused && onResumeRecon && (
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={onResumeRecon}
                    title="Resume test"
                    aria-label="Resume test"
                  >
                    <PlayCircle size={12} />
                    <span>Resume</span>
                  </button>
                )}
                {isTestRunning && onPauseRecon && (
                  <button
                    type="button"
                    className={styles.controlButton}
                    onClick={onPauseRecon}
                    title="Pause test"
                    aria-label="Pause test"
                  >
                    <Pause size={12} />
                    <span>Pause</span>
                  </button>
                )}
                {onStopRecon && (
                  <button
                    type="button"
                    className={`${styles.controlButton} ${styles.controlButtonStop}`}
                    onClick={onStopRecon}
                    title="Stop test completely"
                    aria-label="Stop test"
                  >
                    <Square size={12} />
                    <span>Stop</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              className={styles.reconButton}
              onClick={onStartRecon}
              disabled={false}
              title="Launch full cyber kill chain test (Stage 1: Reconnaissance)"
            >
              <Play size={14} />
              <span>Launch Test</span>
            </button>
          )}

          <button
            className={styles.downloadButton}
            onClick={onDownloadJSON}
            disabled={!hasReconData || isTestActive}
            title={hasReconData ? 'Download Recon JSON' : 'No data available'}
          >
            <Download size={14} />
          </button>

          <Menu
            trigger={
              <button
                className={styles.actionsButton}
                title="Kill Chain actions"
                aria-label="Kill Chain actions"
              >
                <Swords size={14} />
                <span>Actions</span>
                <ChevronDown size={12} />
              </button>
            }
            align="right"
          >
            <MenuItem icon={<Swords size={14} />} onClick={onViewAttackPaths}>
              View Attack Paths
            </MenuItem>
            <MenuItem icon={<Crosshair size={14} />} onClick={onGeneratePayload}>
              Generate Payload
            </MenuItem>
            <MenuItem icon={<HardDrive size={14} />} onClick={onRecordPersistence}>
              Record Persistence
            </MenuItem>
            <MenuItem icon={<Flag size={14} />} onClick={onRecordAction}>
              Record Action
            </MenuItem>
          </Menu>

          <div className={styles.divider} />
        </>
      )}

      <div className={styles.projectBadge}>
        <span className={styles.projectLabel}>Project:</span>
        <span className={styles.projectId}>{projectId}</span>
        <button
          className={styles.settingsButton}
          onClick={handleOpenSettings}
          title="Project Settings"
          aria-label="Open project settings"
        >
          <Settings size={14} />
        </button>
      </div>

      <div className={styles.divider} />

      {/* Tab/Split mode: only when in Single layout */}
      {effectiveLayoutMode === 'single' && effectiveViewMode === 'tab' && (
        <>
          <button
            className={`${styles.tabButton} ${activeTab === 'graph' ? styles.tabButtonActive : ''}`}
            onClick={() => onSelectTab?.('graph')}
            aria-label="Show Graph"
            title="Show Graph"
          >
            <PanelLeft size={14} />
            <span>Graph</span>
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'panda-ai' ? styles.tabButtonActive : ''}`}
            onClick={() => onSelectTab?.('panda-ai')}
            aria-label="Show Panda AI Assistant"
            title="Panda AI (Guided/Offensive)"
          >
            <Sparkles size={14} />
            <span>Panda AI</span>
          </button>
          <button
            className={`${styles.tabButton} ${activeTab === 'a0' ? styles.tabButtonActive : ''}`}
            onClick={() => onSelectTab?.('a0')}
            aria-label="Show Agent Zero"
            title="Agent Zero (General-purpose)"
          >
            <Bot size={14} />
            <span>Agent Zero</span>
          </button>
        </>
      )}

      {/* Split mode: show Hide/Show AI + Panda AI / Agent Zero switcher - only when Single layout */}
      {effectiveLayoutMode === 'single' && effectiveViewMode === 'split' && (
        <>
          <button
            className={`${styles.aiButton} ${activeTab === 'panda-ai' ? styles.aiButtonActive : ''}`}
            onClick={() => {
              onSelectTab?.('panda-ai')
              onShowAI?.()
            }}
            aria-label="Show Panda AI"
            title="Panda AI (Guided/Offensive)"
          >
            <Sparkles size={14} />
            <span>Panda AI</span>
          </button>
          <button
            className={`${styles.aiButton} ${activeTab === 'a0' ? styles.aiButtonActive : ''}`}
            onClick={() => {
              onSelectTab?.('a0')
              onShowAI?.()
            }}
            aria-label="Show Agent Zero"
            title="Agent Zero (General-purpose)"
          >
            <Bot size={14} />
            <span>Agent Zero</span>
          </button>
          {onHideAI && (
            <button
              className={styles.aiButton}
              onClick={onHideAI}
              aria-label="Hide AI Panel"
              title="Hide AI Panel"
            >
              <X size={14} />
              <span>Hide</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}

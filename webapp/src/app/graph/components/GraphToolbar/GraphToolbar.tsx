'use client'

import { useRouter } from 'next/navigation'
import { Sparkles, Play, Download, Loader2, Terminal, Settings, X, PanelLeft, Layout, LayoutGrid } from 'lucide-react'
import { Toggle } from '@/components/ui'
import type { ReconStatus } from '@/lib/recon-types'
import type { ViewMode, LayoutMode } from '../../hooks/usePanelLayout'
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
  activeTab: 'graph' | 'ai'
  onHideAI?: () => void
  onShowAI?: () => void
  onSelectTab?: (tab: 'graph' | 'ai') => void
  // Target info
  targetDomain?: string
  subdomainList?: string[]
  // Recon props
  onStartRecon?: () => void
  onDownloadJSON?: () => void
  reconStatus?: ReconStatus
  hasReconData?: boolean
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
  onDownloadJSON,
  reconStatus = 'idle',
  hasReconData = false,
}: GraphToolbarProps) {
  const router = useRouter()
  const isReconRunning = reconStatus === 'running' || reconStatus === 'starting'

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

      {/* Recon Actions */}
      {projectId && (
        <>
          <button
            className={`${styles.reconButton} ${isReconRunning ? styles.reconButtonActive : ''}`}
            onClick={onStartRecon}
            disabled={isReconRunning}
            title={isReconRunning ? 'Recon in progress...' : 'Start Reconnaissance'}
          >
            {isReconRunning ? (
              <Loader2 size={14} className={styles.spinner} />
            ) : (
              <Play size={14} />
            )}
            <span>{isReconRunning ? 'Running...' : 'Start Recon'}</span>
          </button>

          <button
            className={styles.downloadButton}
            onClick={onDownloadJSON}
            disabled={!hasReconData || isReconRunning}
            title={hasReconData ? 'Download Recon JSON' : 'No data available'}
          >
            <Download size={14} />
          </button>

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
            className={`${styles.tabButton} ${activeTab === 'ai' ? styles.tabButtonActive : ''}`}
            onClick={() => onSelectTab?.('ai')}
            aria-label="Show AI Assistant"
            title="Show AI Assistant"
          >
            <Sparkles size={14} />
            <span>AI</span>
          </button>
        </>
      )}

      {/* Split mode: show Hide/Show AI buttons - only when Single layout */}
      {effectiveLayoutMode === 'single' && effectiveViewMode === 'split' && (
        <>
          {onHideAI && (
            <button
              className={styles.aiButton}
              onClick={onHideAI}
              aria-label="Hide AI Assistant"
              title="Hide AI Assistant"
            >
              <X size={14} />
              <span>Hide AI</span>
            </button>
          )}
          {onShowAI && (
            <button
              className={styles.aiButton}
              onClick={onShowAI}
              aria-label="Show AI Assistant"
              title="Show AI Assistant"
            >
              <Sparkles size={14} />
              <span>Show AI</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}

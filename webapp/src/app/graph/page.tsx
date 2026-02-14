'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GraphToolbar } from './components/GraphToolbar'
import { GraphCanvas } from './components/GraphCanvas'
import { NodeDrawer } from './components/NodeDrawer'
import { AIPanel } from './components/AIPanel/AIPanel'
import { PageBottomBar } from './components/PageBottomBar'
import { ReconConfirmModal } from './components/ReconConfirmModal'
import { PanelLayout } from './components/PanelLayout/PanelLayout'
import { useGraphData, useNodeSelection } from './hooks'
import { useTheme, useSession, useReconStatus, useReconSSE, useProjectById } from '@/hooks'
import { useProject } from '@/providers/ProjectProvider'
import { usePanelLayout } from './hooks/usePanelLayout'
import styles from './page.module.css'

export default function GraphPage() {
  const router = useRouter()
  const { projectId, userId, currentProject, isLoading: projectLoading } = useProject()
  const { data: fullProject } = useProjectById(projectId)

  const [is3D, setIs3D] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [isReconModalOpen, setIsReconModalOpen] = useState(false)
  const [hasReconData, setHasReconData] = useState(false)
  const [graphStats, setGraphStats] = useState<{ totalNodes: number; nodesByType: Record<string, number> } | null>(null)
  const [activeTab, setActiveTab] = useState<'graph' | 'ai'>('graph')

  const { selectedNode, drawerOpen, selectNode, clearSelection } = useNodeSelection()
  const { isDark } = useTheme()
  const { sessionId, resetSession } = useSession()
  
  // Panel layout state management
  const {
    effectiveViewMode,
    effectiveLayoutMode,
    setLayoutMode,
    hideAI,
    showAI,
  } = usePanelLayout()

  // Recon status hook - must be before useGraphData to provide isReconRunning
  const {
    state: reconState,
    isLoading: isReconLoading,
    startRecon,
    stopRecon,
  } = useReconStatus({
    projectId,
    enabled: !!projectId,
  })

  // Check if recon is running to enable auto-refresh of graph data
  const isReconRunning = reconState?.status === 'running' || reconState?.status === 'starting'

  // Graph data with auto-refresh every 5 seconds while recon is running
  const { data, isLoading, error, refetch: refetchGraph } = useGraphData(projectId, {
    isReconRunning,
  })

  // Recon logs SSE hook
  const {
    logs: reconLogs,
    currentPhase,
    currentPhaseNumber,
    clearLogs,
  } = useReconSSE({
    projectId,
    enabled: reconState?.status === 'running' || reconState?.status === 'starting',
  })

  // Check if recon data exists
  const checkReconData = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/recon/${projectId}/download`, { method: 'HEAD' })
      setHasReconData(response.ok)
    } catch {
      setHasReconData(false)
    }
  }, [projectId])

  // Calculate graph stats when data changes
  useEffect(() => {
    if (data?.nodes) {
      const nodesByType: Record<string, number> = {}
      data.nodes.forEach(node => {
        const type = node.type || 'Unknown'
        nodesByType[type] = (nodesByType[type] || 0) + 1
      })
      setGraphStats({
        totalNodes: data.nodes.length,
        nodesByType,
      })
    } else {
      setGraphStats(null)
    }
  }, [data])

  // Check for recon data on mount and when project changes
  useEffect(() => {
    checkReconData()
  }, [checkReconData])

  // Refresh graph data when recon completes
  useEffect(() => {
    if (reconState?.status === 'completed' || reconState?.status === 'error') {
      refetchGraph()
      checkReconData()
    }
  }, [reconState?.status, refetchGraph, checkReconData])

  // Auto-switch to AI tab when recon starts (if in tab mode)
  useEffect(() => {
    if ((reconState?.status === 'running' || reconState?.status === 'starting') && effectiveViewMode === 'tab') {
      setActiveTab('ai')
    }
  }, [reconState?.status, effectiveViewMode])

  const handleStartRecon = useCallback(() => {
    setIsReconModalOpen(true)
  }, [])

  const handleConfirmRecon = useCallback(async () => {
    clearLogs()
    const result = await startRecon()
    if (result) {
      setIsReconModalOpen(false)
      // Auto-switch to AI tab (Recon tab) when recon starts
      if (effectiveViewMode === 'tab') {
        setActiveTab('ai')
      }
    }
  }, [startRecon, clearLogs, effectiveViewMode])

  const handleStopRecon = useCallback(async () => {
    await stopRecon()
  }, [stopRecon])

  const handleDownloadJSON = useCallback(async () => {
    if (!projectId) return
    window.open(`/api/recon/${projectId}/download`, '_blank')
  }, [projectId])

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (!projectId) return
    const res = await fetch(`/api/graph?nodeId=${nodeId}&projectId=${projectId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || 'Failed to delete node')
      return
    }
    refetchGraph()
  }, [projectId, refetchGraph])

  const handleSelectTab = useCallback((tab: 'graph' | 'ai') => {
    setActiveTab(tab)
  }, [])

  // Show message if no project is selected
  if (!projectLoading && !projectId) {
    return (
      <div className={styles.page}>
        <div className={styles.noProject}>
          <h2>No Project Selected</h2>
          <p>Select a project from the dropdown in the header or create a new one.</p>
          <button className="primaryButton" onClick={() => router.push('/projects')}>
            Go to Projects
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <GraphToolbar
        projectId={projectId || ''}
        is3D={is3D}
        showLabels={showLabels}
        onToggle3D={setIs3D}
        onToggleLabels={setShowLabels}
        effectiveViewMode={effectiveViewMode}
        effectiveLayoutMode={effectiveLayoutMode}
        onLayoutModeChange={setLayoutMode}
        activeTab={activeTab}
        onHideAI={hideAI}
        onShowAI={showAI}
        onSelectTab={handleSelectTab}
        // Target info
        targetDomain={currentProject?.targetDomain}
        subdomainList={currentProject?.subdomainList}
        // Recon props
        onStartRecon={handleStartRecon}
        onDownloadJSON={handleDownloadJSON}
        reconStatus={reconState?.status || 'idle'}
        hasReconData={hasReconData}
      />

      <div className={styles.body}>
        <NodeDrawer
          node={selectedNode}
          isOpen={drawerOpen}
          onClose={clearSelection}
          onDeleteNode={handleDeleteNode}
          projectId={projectId}
        />
        <PanelLayout
          graphContent={(dimensions) => (
            <GraphCanvas
              data={data}
              isLoading={isLoading}
              error={error}
              projectId={projectId || ''}
              is3D={is3D}
              width={dimensions.width}
              height={dimensions.height}
              showLabels={showLabels}
              selectedNode={selectedNode}
              onNodeClick={selectNode}
              isDark={isDark}
            />
          )}
          aiContent={
            <AIPanel
              userId={userId || ''}
              projectId={projectId || ''}
              sessionId={sessionId || ''}
              onResetSession={resetSession}
              modelName={currentProject?.agentOpenaiModel}
              reconLogs={reconLogs}
              currentPhase={currentPhase}
              currentPhaseNumber={currentPhaseNumber}
              reconStatus={reconState?.status || 'idle'}
              onClearLogs={clearLogs}
              onStartRecon={handleStartRecon}
              onStopRecon={handleStopRecon}
              isReconLoading={isReconLoading}
              showBothPanes={effectiveLayoutMode === 'all'}
              onCloseChat={() => {
                hideAI()
                handleSelectTab('graph')
              }}
              onCloseRecon={() => {
                hideAI()
                handleSelectTab('graph')
              }}
              onBothPanelsClosed={() => {
                setLayoutMode('single')
                handleSelectTab('graph')
              }}
            />
          }
          activeTab={activeTab}
          onTabChange={handleSelectTab}
          effectiveLayoutMode={effectiveLayoutMode}
        />
      </div>

      <ReconConfirmModal
        isOpen={isReconModalOpen}
        onClose={() => setIsReconModalOpen(false)}
        onConfirm={handleConfirmRecon}
        projectName={currentProject?.name || 'Unknown'}
        targetDomain={currentProject?.targetDomain || 'Unknown'}
        stats={graphStats}
        isLoading={isReconLoading}
        scanModules={fullProject?.scanModules}
        githubTargetOrg={fullProject?.githubTargetOrg}
      />

      <PageBottomBar data={data} is3D={is3D} showLabels={showLabels} />
    </div>
  )
}

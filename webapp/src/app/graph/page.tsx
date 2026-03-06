'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { GraphToolbar } from './components/GraphToolbar'
import { GraphCanvas } from './components/GraphCanvas'
import { NodeDrawer } from './components/NodeDrawer'
import { AIPanel } from './components/AIPanel/AIPanel'
import { A0Panel } from './components/A0Panel/A0Panel'
import { PageBottomBar } from './components/PageBottomBar'
import { ReconConfirmModal } from './components/ReconConfirmModal'
import { AttackPathsDrawer } from './components/AttackPathsDrawer/AttackPathsDrawer'
import { PayloadGeneratorModal } from './components/PayloadGeneratorModal/PayloadGeneratorModal'
import { RecordPersistenceModal } from './components/RecordPersistenceModal/RecordPersistenceModal'
import { RecordActionModal } from './components/RecordActionModal/RecordActionModal'
import { PanelLayout } from './components/PanelLayout/PanelLayout'
import { useGraphData, useNodeSelection } from './hooks'
import { useTheme, useSession, useKillChainStatus, useKillChainSSE, useProjectById, usePanelLayout } from '@/hooks'
import { useProject } from '@/providers/ProjectProvider'
import { NODE_COLORS } from './config'
import { getNodeId } from './utils/linkHelpers'
import { GraphData } from './types'
import styles from './page.module.css'

const ALL_NODE_TYPES = Object.keys(NODE_COLORS).filter((k) => k !== 'Default')

function filterGraphData(data: GraphData | undefined, visibleTypes: Set<string>): GraphData | undefined {
  if (!data?.nodes) return data
  const filteredNodes = data.nodes.filter((n) => visibleTypes.has(n.type))
  const visibleIds = new Set(filteredNodes.map((n) => n.id))
  const filteredLinks = data.links.filter(
    (l) => visibleIds.has(getNodeId(l.source)) && visibleIds.has(getNodeId(l.target))
  )
  return {
    ...data,
    nodes: filteredNodes,
    links: filteredLinks,
  }
}

export default function GraphPage() {
  const router = useRouter()
  const { projectId, userId, currentProject, isLoading: projectLoading } = useProject()
  const { data: fullProject } = useProjectById(projectId)

  const [is3D, setIs3D] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [isReconModalOpen, setIsReconModalOpen] = useState(false)
  const [isAttackPathsOpen, setIsAttackPathsOpen] = useState(false)
  const [isPayloadModalOpen, setIsPayloadModalOpen] = useState(false)
  const [isPersistenceModalOpen, setIsPersistenceModalOpen] = useState(false)
  const [isActionModalOpen, setIsActionModalOpen] = useState(false)
  const [hasReconData, setHasReconData] = useState(false)
  const [graphStats, setGraphStats] = useState<{ totalNodes: number; nodesByType: Record<string, number> } | null>(null)
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<string>>(
    () => new Set(ALL_NODE_TYPES)
  )

  const { selectedNode, drawerOpen, selectNode, clearSelection } = useNodeSelection()
  const { isDark } = useTheme()
  const { sessionId, resetSession } = useSession()

  // Panel layout state management (activeTab persisted so Agent Zero doesn't disappear on refresh)
  const {
    effectiveViewMode,
    effectiveLayoutMode,
    activeTab,
    panelSizes,
    containerRef,
    setActiveTab,
    setLayoutMode,
    setPanelSizes,
    hideAI,
    showAI,
  } = usePanelLayout()

  // Kill chain status hook - must be before useGraphData to provide isTestRunning
  const {
    state: killChainState,
    isLoading: isKillChainLoading,
    error: killChainError,
    startKillChain,
    stopKillChain,
    pauseKillChain,
    resumeKillChain,
  } = useKillChainStatus({
    projectId,
    enabled: !!projectId,
  })

  // Check if kill chain test is running to enable auto-refresh of graph data
  const isTestRunning = killChainState?.status === 'running' || killChainState?.status === 'starting'

  // Graph data with auto-refresh every 5 seconds while test is running
  const { data, isLoading, error, refetch: refetchGraph } = useGraphData(projectId, {
    isReconRunning: isTestRunning,
  })

  // Kill chain logs SSE hook
  const {
    logs: reconLogs,
    currentPhase,
    currentPhaseNumber,
    clearLogs,
    currentStage,
    currentStageName,
  } = useKillChainSSE({
    projectId,
    enabled:
      killChainState?.status === 'running' ||
      killChainState?.status === 'starting' ||
      killChainState?.status === 'paused',
    status: killChainState?.status ?? null,
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

  // Sync visible types when new node types appear in data (e.g. DNSRecord from API)
  useEffect(() => {
    if (!data?.nodes) return
    const typesInData = new Set(data.nodes.map((n) => n.type).filter(Boolean))
    setVisibleNodeTypes((prev) => {
      const next = new Set(prev)
      let changed = false
      typesInData.forEach((t) => {
        if (!next.has(t)) {
          next.add(t)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [data?.nodes])

  // Filtered graph data based on visible node types
  const filteredData = useMemo(
    () => filterGraphData(data, visibleNodeTypes),
    [data, visibleNodeTypes]
  )

  const handleVisibleTypesChange = useCallback((newSet: Set<string>) => {
    setVisibleNodeTypes(new Set(newSet))
  }, [])

  // Calculate graph stats when data changes (from raw data for filter counts)
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

  // Refresh graph data when kill chain completes
  useEffect(() => {
    if (killChainState?.status === 'completed' || killChainState?.status === 'error') {
      refetchGraph()
      checkReconData()
    }
  }, [killChainState?.status, refetchGraph, checkReconData])

  // Auto-switch to Panda AI tab when test starts (if in tab mode)
  useEffect(() => {
    if ((killChainState?.status === 'running' || killChainState?.status === 'starting') && effectiveViewMode === 'tab') {
      setActiveTab('panda-ai')
    }
  }, [killChainState?.status, effectiveViewMode])

  const handleStartRecon = useCallback(() => {
    setIsReconModalOpen(true)
  }, [])

  const handleConfirmRecon = useCallback(
    async (startStage: number) => {
      clearLogs()
      console.log(`[Launch Test] startStage=${startStage} sending ${startStage === 2 ? '{ startStage: 2 }' : 'undefined'}`)
      const result = await startKillChain(
        startStage === 2 ? { startStage: 2 } : undefined
      )
      if (result) {
        setIsReconModalOpen(false)
        // Auto-switch to Panda AI tab when test starts
        if (effectiveViewMode === 'tab') {
          setActiveTab('panda-ai')
        }
      }
    },
    [startKillChain, clearLogs, effectiveViewMode]
  )

  const handleStopRecon = useCallback(async () => {
    await stopKillChain()
  }, [stopKillChain])

  const handlePauseRecon = useCallback(async () => {
    await pauseKillChain()
  }, [pauseKillChain])

  const handleResumeRecon = useCallback(async () => {
    await resumeKillChain()
  }, [resumeKillChain])

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

  const handleSelectTab = useCallback((tab: 'graph' | 'panda-ai' | 'a0') => {
    setActiveTab(tab)
  }, [])

  const handleShowAI = useCallback(() => {
    if (activeTab === 'graph') {
      setActiveTab('panda-ai')
    }
    showAI()
  }, [activeTab, showAI])

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
        onShowAI={handleShowAI}
        onSelectTab={handleSelectTab}
        // Target info
        targetDomain={currentProject?.targetDomain}
        subdomainList={currentProject?.subdomainList}
        // Recon props
        onStartRecon={handleStartRecon}
        onStopRecon={handleStopRecon}
        onPauseRecon={handlePauseRecon}
        onResumeRecon={handleResumeRecon}
        onDownloadJSON={handleDownloadJSON}
        reconStatus={killChainState?.status || 'idle'}
        hasReconData={hasReconData}
        onViewAttackPaths={() => setIsAttackPathsOpen(true)}
        onGeneratePayload={() => setIsPayloadModalOpen(true)}
        onRecordPersistence={() => setIsPersistenceModalOpen(true)}
        onRecordAction={() => setIsActionModalOpen(true)}
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
              data={filteredData}
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
            activeTab === 'a0' ? (
              <A0Panel
                projectId={projectId || ''}
                userId={userId || ''}
                reconLogs={reconLogs}
                currentPhase={currentPhase}
                currentPhaseNumber={currentPhaseNumber}
                reconStatus={killChainState?.status || 'idle'}
                onClearLogs={clearLogs}
                onStartRecon={handleStartRecon}
                onStopRecon={handleStopRecon}
                isReconLoading={isKillChainLoading}
                stageTitle={`Stage ${currentStage}: ${currentStageName}`}
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
            ) : (
              <AIPanel
                userId={userId || ''}
                projectId={projectId || ''}
                sessionId={sessionId || ''}
                onResetSession={resetSession}
                modelName={currentProject?.agentOpenaiModel}
                reconLogs={reconLogs}
                currentPhase={currentPhase}
                currentPhaseNumber={currentPhaseNumber}
                reconStatus={killChainState?.status || 'idle'}
                onClearLogs={clearLogs}
                onStartRecon={handleStartRecon}
                onStopRecon={handleStopRecon}
                isReconLoading={isKillChainLoading}
                stageTitle={`Stage ${currentStage}: ${currentStageName}`}
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
            )
          }
          activeTab={activeTab}
          onTabChange={handleSelectTab}
          effectiveLayoutMode={effectiveLayoutMode}
          effectiveViewMode={effectiveViewMode}
          panelSizes={panelSizes}
          containerRef={containerRef}
          onPanelResize={setPanelSizes}
        />
      </div>

      <ReconConfirmModal
        isOpen={isReconModalOpen}
        onClose={() => setIsReconModalOpen(false)}
        onConfirm={handleConfirmRecon}
        launchError={killChainError}
        projectName={currentProject?.name || 'Unknown'}
        targetDomain={currentProject?.targetDomain || 'Unknown'}
        stats={graphStats}
        isLoading={isKillChainLoading}
        scanModules={fullProject?.scanModules}
        githubTargetOrg={fullProject?.githubTargetOrg}
      />

      <AttackPathsDrawer
        isOpen={isAttackPathsOpen}
        onClose={() => setIsAttackPathsOpen(false)}
        projectId={projectId || ''}
      />

      <PayloadGeneratorModal
        isOpen={isPayloadModalOpen}
        onClose={() => setIsPayloadModalOpen(false)}
      />

      <RecordPersistenceModal
        isOpen={isPersistenceModalOpen}
        onClose={() => setIsPersistenceModalOpen(false)}
        projectId={projectId || ''}
        userId={userId || ''}
        sessionId={sessionId && !isNaN(parseInt(sessionId, 10)) ? parseInt(sessionId, 10) : undefined}
        onSuccess={refetchGraph}
      />

      <RecordActionModal
        isOpen={isActionModalOpen}
        onClose={() => setIsActionModalOpen(false)}
        projectId={projectId || ''}
        userId={userId || ''}
        sessionId={sessionId && !isNaN(parseInt(sessionId, 10)) ? parseInt(sessionId, 10) : undefined}
        onSuccess={refetchGraph}
      />

      <PageBottomBar
        data={filteredData}
        is3D={is3D}
        showLabels={showLabels}
        visibleNodeTypes={visibleNodeTypes}
        onVisibleTypesChange={handleVisibleTypesChange}
        nodesByType={graphStats?.nodesByType}
      />
    </div>
  )
}

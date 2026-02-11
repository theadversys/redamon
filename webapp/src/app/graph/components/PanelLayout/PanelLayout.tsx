/**
 * Panel Layout Component
 * 
 * Single layout owner - controls all view mode decisions and persistence.
 * Wraps react-resizable-panels PanelGroup/Panel/PanelResizeHandle.
 * Exposes graphContainerRef for ResizeObserver integration.
 */

'use client'

import { useRef, ReactNode, useEffect } from 'react'
import { usePanelLayout } from '../../hooks/usePanelLayout'
import { useGraphPanelDimensions } from '../../hooks/useGraphPanelDimensions'
import styles from './PanelLayout.module.css'

// Import react-resizable-panels (should be bundled by Next.js)
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'

// Log immediately when module loads
console.log('[PanelLayout] 📦 MODULE LOADED - react-resizable-panels imported:', {
  PanelGroup: typeof PanelGroup,
  Panel: typeof Panel,
  PanelResizeHandle: typeof PanelResizeHandle
})

// Debug: Log when PanelLayout module loads (this runs immediately when module is imported)
if (typeof window !== 'undefined') {
  console.log('[PanelLayout] 📦 MODULE LOADED - This confirms the file is being bundled and imported')
}

interface PanelLayoutProps {
  graphContent: (dimensions: { width: number; height: number }) => ReactNode
  aiContent: ReactNode
  activeTab?: 'graph' | 'ai' // For tab mode
  onTabChange?: (tab: 'graph' | 'ai') => void
}

export function PanelLayout({
  graphContent,
  aiContent,
  activeTab = 'graph',
  onTabChange,
}: PanelLayoutProps) {
  // Log immediately when function is called (before any hooks)
  console.log('[PanelLayout] 🚀🚀🚀 FUNCTION CALLED - Component is rendering!')
  console.log('[PanelLayout] Build version: panel-layout-v1-2026-02-10')
  
  const {
    effectiveViewMode,
    panelSizes,
    containerRef,
    setPanelSizes,
  } = usePanelLayout()
  
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const graphDimensions = useGraphPanelDimensions(graphPanelRef)
  
  // Debug logging - guaranteed mount-time log (runs on every render)
  useEffect(() => {
    console.log('[PanelLayout] ✅✅✅ COMPONENT MOUNTED - Client hydration successful!')
    console.log('[PanelLayout] effectiveViewMode:', effectiveViewMode, 'panelSizes:', panelSizes)
    console.log('[PanelLayout] PanelGroup available:', typeof PanelGroup !== 'undefined')
    console.log('[PanelLayout] viewMode will be:', effectiveViewMode || 'split')
  }, [effectiveViewMode, panelSizes])
  
  const handlePanelResize = (sizes: number[]) => {
    if (sizes.length === 2) {
      setPanelSizes([sizes[0], sizes[1]])
    }
  }
  
  // Split mode: show both panels side-by-side
  // Always default to split mode if effectiveViewMode is not set
  const viewMode = effectiveViewMode || 'split'
  
  // Force split mode for now to debug - always show split
  try {
    if (viewMode === 'split') {
      return (
        <div ref={containerRef} className={styles.container} data-testid="panel-layout-split">
          <PanelGroup
            direction="horizontal"
            onLayout={handlePanelResize}
            className={styles.panelGroup}
          >
            {/* Graph Panel */}
            <Panel
              defaultSize={panelSizes[0]}
              minSize={40} // 40% minimum
              className={styles.panel}
            >
              <div ref={graphPanelRef} className={styles.graphPanel}>
                {graphContent(graphDimensions)}
              </div>
            </Panel>
            
            {/* Resize Handle */}
            <PanelResizeHandle className={styles.resizeHandle} />
            
            {/* AI Panel */}
            <Panel
              defaultSize={panelSizes[1]}
              minSize={25} // 25% minimum
              className={styles.panel}
            >
              <div className={styles.aiPanel}>
                {aiContent}
              </div>
            </Panel>
          </PanelGroup>
        </div>
      )
    }
  } catch (error) {
    console.error('[PanelLayout] Error rendering split mode:', error)
    // Fallback: render content without panels
    return (
      <div ref={containerRef} className={styles.container}>
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          <div style={{ flex: '1 1 65%' }}>{graphContent(graphDimensions)}</div>
          <div style={{ width: '4px', background: '#333', cursor: 'col-resize' }} />
          <div style={{ flex: '1 1 35%' }}>{aiContent}</div>
        </div>
      </div>
    )
  }
  
  // Tab mode: show single panel based on activeTab
  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.tabContainer}>
        {activeTab === 'graph' ? (
          <div ref={graphPanelRef} className={styles.fullPanel}>
            {graphContent(graphDimensions)}
          </div>
        ) : (
          <div className={styles.fullPanel}>
            {aiContent}
          </div>
        )}
      </div>
    </div>
  )
}

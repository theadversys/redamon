/**
 * Panel Layout Component
 * 
 * Single layout owner - controls all view mode decisions and persistence.
 * Wraps react-resizable-panels PanelGroup/Panel/PanelResizeHandle.
 * Exposes graphContainerRef for ResizeObserver integration.
 */

'use client'

import { useRef, ReactNode, RefObject } from 'react'
import { ViewMode } from '@/hooks/usePanelLayout'
import { useGraphPanelDimensions } from '../../hooks/useGraphPanelDimensions'
import styles from './PanelLayout.module.css'

// Import react-resizable-panels (should be bundled by Next.js)
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'

interface PanelLayoutProps {
  graphContent: (dimensions: { width: number; height: number }) => ReactNode
  aiContent: ReactNode
  activeTab?: 'graph' | 'panda-ai' | 'a0' // For tab mode
  onTabChange?: (tab: 'graph' | 'panda-ai' | 'a0') => void
  /** When 'all', use three-pane layout (Graph | Chat+Recon stacked) */
  effectiveLayoutMode?: 'single' | 'all'
  /** Props from usePanelLayout hook in parent */
  effectiveViewMode: ViewMode
  panelSizes: [number, number]
  containerRef: RefObject<HTMLDivElement | null>
  onPanelResize: (sizes: [number, number]) => void
}

export function PanelLayout({
  graphContent,
  aiContent,
  activeTab = 'graph',
  onTabChange,
  effectiveLayoutMode = 'single',
  effectiveViewMode,
  panelSizes,
  containerRef,
  onPanelResize,
}: PanelLayoutProps) {
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const graphDimensions = useGraphPanelDimensions(graphPanelRef)

  const handlePanelResize = (sizes: number[]) => {
    if (sizes.length === 2) {
      onPanelResize([sizes[0], sizes[1]])
    }
  }

  // Three-pane mode: Graph | Chat+Recon (resizable horizontally and vertically)
  if (effectiveLayoutMode === 'all') {
    return (
      <div ref={containerRef} className={styles.container} data-testid="panel-layout-all">
        <PanelGroup
          direction="horizontal"
          className={styles.threePaneGroup}
        >
          {/* Graph Pane - resizable width */}
          <Panel
            defaultSize={65}
            minSize={30}
            maxSize={85}
            className={styles.panel}
          >
            <div ref={graphPanelRef} className={styles.threePaneGraph}>
              {graphContent(graphDimensions)}
            </div>
          </Panel>
          {/* Vertical drag handle: Graph ↔ Right column */}
          <PanelResizeHandle className={styles.resizeHandle} />
          {/* Right column: AI + Recon (AIPanel handles inner vertical resize) */}
          <Panel
            defaultSize={35}
            minSize={15}
            maxSize={70}
            className={styles.panel}
          >
            <div className={styles.threePaneRight}>
              {aiContent}
            </div>
          </Panel>
        </PanelGroup>
      </div>
    )
  }

  // Split mode: show both panels side-by-side
  const viewMode = effectiveViewMode || 'split'

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

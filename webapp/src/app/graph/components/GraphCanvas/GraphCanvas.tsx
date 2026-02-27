'use client'

import dynamic from 'next/dynamic'
import { GraphData, GraphNode } from '../../types'
import { GraphCanvas2D } from './GraphCanvas2D'
import styles from './GraphCanvas.module.css'

// Lazy-load 3D to avoid loading Three.js until 3D mode is selected (reduces multiple Three.js instance risk)
const GraphCanvas3D = dynamic(() => import('./GraphCanvas3D').then((m) => ({ default: m.GraphCanvas3D })), {
  ssr: false,
})

interface GraphCanvasProps {
  data: GraphData | undefined
  isLoading: boolean
  error: Error | null
  projectId: string
  is3D: boolean
  width: number
  height: number
  showLabels: boolean
  selectedNode: GraphNode | null
  onNodeClick: (node: GraphNode) => void
  isDark?: boolean
}

export function GraphCanvas({
  data,
  isLoading,
  error,
  projectId,
  is3D,
  width,
  height,
  showLabels,
  selectedNode,
  onNodeClick,
  isDark = true,
}: GraphCanvasProps) {
  if (isLoading) {
    return <div className={styles.loading}>Loading graph data...</div>
  }

  if (error) {
    return (
      <div className={styles.error}>
        Error: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className={styles.empty}>
        No data found for project: {projectId}
      </div>
    )
  }

  // Use key to force re-mount when theme changes (ForceGraph doesn't update backgroundColor dynamically)
  const themeKey = isDark ? 'dark' : 'light'

  if (is3D) {
    return (
      <div className={styles.wrapper}>
        <GraphCanvas3D
          key={themeKey}
          data={data}
          width={width}
          height={height}
          showLabels={showLabels}
          selectedNode={selectedNode}
          onNodeClick={onNodeClick}
          isDark={isDark}
        />
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <GraphCanvas2D
        key={themeKey}
        data={data}
        width={width}
        height={height}
        showLabels={showLabels}
        selectedNode={selectedNode}
        onNodeClick={onNodeClick}
        isDark={isDark}
      />
    </div>
  )
}

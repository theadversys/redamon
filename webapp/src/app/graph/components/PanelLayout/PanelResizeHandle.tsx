/**
 * Custom Resize Handle Component
 * 
 * Wrapper around react-resizable-panels PanelResizeHandle
 * with PandaExploit theme styling.
 */

'use client'

import { PanelResizeHandle as BasePanelResizeHandle } from 'react-resizable-panels'
import styles from './PanelLayout.module.css'

interface PanelResizeHandleProps {
  className?: string
}

export function PanelResizeHandle({ className }: PanelResizeHandleProps) {
  return (
    <BasePanelResizeHandle
      className={`${styles.resizeHandle} ${className || ''}`}
    />
  )
}

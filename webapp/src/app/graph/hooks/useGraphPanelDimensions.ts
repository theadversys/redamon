/**
 * Graph Panel Dimensions Hook
 * 
 * Uses ResizeObserver to track Graph panel container dimensions.
 * Lives above GraphCanvas to avoid observer churn in renderer.
 * Returns width/height that get passed as props to GraphCanvas.
 */

import { useState, useEffect, RefObject } from 'react'

export interface GraphDimensions {
  width: number
  height: number
}

/**
 * Hook to observe Graph panel container dimensions
 * 
 * @param containerRef - Ref to the Graph panel container element
 * @returns Current width and height of the container
 */
export function useGraphPanelDimensions(
  containerRef: RefObject<HTMLElement | null>
): GraphDimensions {
  const [dimensions, setDimensions] = useState<GraphDimensions>({
    width: 800,
    height: 600,
  })
  
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const updateDimensions = () => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }
    
    // Initial measurement
    updateDimensions()
    
    // Observe container size changes
    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(container)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [containerRef])
  
  return dimensions
}

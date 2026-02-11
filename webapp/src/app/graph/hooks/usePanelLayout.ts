/**
 * Panel Layout State Management Hook
 * 
 * Manages userViewMode (preference) vs effectiveViewMode (with responsive constraints).
 * Preserves panel sizes when switching between modes.
 * Handles localStorage persistence with schema validation.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

const STORAGE_KEY = 'pandaexploit-panel-layout'
const RESPONSIVE_BREAKPOINT = 768 // px

export type ViewMode = 'split' | 'tab'

interface PanelLayoutState {
  userViewMode: ViewMode
  effectiveViewMode: ViewMode
  panelSizes: [number, number] // percentages [graph, ai]
  savedSplitSizes: [number, number] | null // preserved when switching to tab
}

interface StoredLayout {
  viewMode: ViewMode
  panelSizes: [number, number]
}

const DEFAULT_LAYOUT: PanelLayoutState = {
  userViewMode: 'split',
  effectiveViewMode: 'split',
  panelSizes: [65, 35], // Graph 65%, AI 35%
  savedSplitSizes: null,
}

const MIN_SIZES = {
  graph: 40, // 40% minimum
  ai: 25,    // 25% minimum
}

/**
 * Validate and sanitize stored layout data
 */
function validateStoredLayout(data: unknown): StoredLayout | null {
  if (!data || typeof data !== 'object') return null
  
  const obj = data as Record<string, unknown>
  
  // Check viewMode
  if (obj.viewMode !== 'split' && obj.viewMode !== 'tab') return null
  
  // Check panelSizes
  if (!Array.isArray(obj.panelSizes) || obj.panelSizes.length !== 2) return null
  const sizes = obj.panelSizes as [unknown, unknown]
  if (typeof sizes[0] !== 'number' || typeof sizes[1] !== 'number') return null
  
  // Clamp sizes to [min, max] and normalize to 100%
  let graphSize = Math.max(MIN_SIZES.graph, Math.min(90, sizes[0]))
  let aiSize = Math.max(MIN_SIZES.ai, Math.min(60, sizes[1]))
  
  // Normalize to 100%
  const total = graphSize + aiSize
  graphSize = (graphSize / total) * 100
  aiSize = (aiSize / total) * 100
  
  return {
    viewMode: obj.viewMode as ViewMode,
    panelSizes: [graphSize, aiSize],
  }
}

/**
 * Load layout from localStorage
 */
function loadLayout(): StoredLayout | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    
    const parsed = JSON.parse(stored)
    return validateStoredLayout(parsed)
  } catch (error) {
    console.warn('Failed to load panel layout from localStorage:', error)
    return null
  }
}

/**
 * Save layout to localStorage (debounced)
 */
function createDebouncedSave() {
  let timeoutId: NodeJS.Timeout | null = null
  
  return (data: StoredLayout) => {
    if (timeoutId) clearTimeout(timeoutId)
    
    timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch (error) {
        console.warn('Failed to save panel layout to localStorage:', error)
      }
      timeoutId = null
    }, 400) // 400ms debounce
  }
}

export function usePanelLayout() {
  const [state, setState] = useState<PanelLayoutState>(() => {
    // Initialize with split mode by default
    if (typeof window !== 'undefined') {
      const stored = loadLayout()
      if (stored) {
        return {
          userViewMode: stored.viewMode,
          effectiveViewMode: stored.viewMode,
          panelSizes: stored.panelSizes,
          savedSplitSizes: null,
        }
      }
    }
    return DEFAULT_LAYOUT
  })
  const saveDebounced = useRef(createDebouncedSave())
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Load from localStorage on mount (only if not already loaded)
  useEffect(() => {
    if (state.userViewMode === DEFAULT_LAYOUT.userViewMode && state.effectiveViewMode === DEFAULT_LAYOUT.effectiveViewMode) {
      const stored = loadLayout()
      if (stored) {
        setState({
          userViewMode: stored.viewMode,
          effectiveViewMode: stored.viewMode,
          panelSizes: stored.panelSizes,
          savedSplitSizes: null,
        })
      }
    }
  }, [])
  
  // Handle responsive behavior (effectiveViewMode)
  useEffect(() => {
    const updateEffectiveMode = () => {
      if (!containerRef.current) {
        // If container not ready yet, default to split for desktop
        // This ensures we don't start in tab mode incorrectly
        if (typeof window !== 'undefined' && window.innerWidth >= RESPONSIVE_BREAKPOINT) {
          setState(prev => {
            if (prev.effectiveViewMode === 'tab' && prev.userViewMode === 'split') {
              return { ...prev, effectiveViewMode: 'split' }
            }
            return prev
          })
        }
        return
      }
      
      const containerWidth = containerRef.current.clientWidth || window.innerWidth
      const isNarrow = containerWidth < RESPONSIVE_BREAKPOINT
      
      setState(prev => {
        const effectiveViewMode = isNarrow ? 'tab' : prev.userViewMode
        return {
          ...prev,
          effectiveViewMode,
        }
      })
    }
    
    // Initial check with a small delay to ensure container is mounted
    const timeoutId = setTimeout(updateEffectiveMode, 100)
    
    // Watch for resize
    const resizeObserver = new ResizeObserver(updateEffectiveMode)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    } else {
      // If container not ready, try again after a short delay
      const retryTimeout = setTimeout(() => {
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current)
          updateEffectiveMode()
        }
      }, 200)
      return () => {
        clearTimeout(timeoutId)
        clearTimeout(retryTimeout)
        resizeObserver.disconnect()
      }
    }
    
    return () => {
      clearTimeout(timeoutId)
      resizeObserver.disconnect()
    }
  }, [state.userViewMode])
  
  // Set user view mode (persisted preference)
  const setUserViewMode = useCallback((mode: ViewMode) => {
    setState(prev => {
      const containerWidth = containerRef.current?.clientWidth ?? 0
      const newState = {
        ...prev,
        userViewMode: mode,
        effectiveViewMode: prev.effectiveViewMode === 'tab' && mode === 'split' 
          ? (containerWidth >= RESPONSIVE_BREAKPOINT ? 'split' : 'tab')
          : mode,
      }
      
      // Preserve panel sizes when switching to tab
      if (mode === 'tab' && prev.userViewMode === 'split') {
        newState.savedSplitSizes = prev.panelSizes
      }
      
      // Restore panel sizes when switching back to split
      if (mode === 'split' && prev.userViewMode === 'tab' && prev.savedSplitSizes) {
        newState.panelSizes = prev.savedSplitSizes
        newState.savedSplitSizes = null
      }
      
      // Persist userViewMode and panelSizes
      saveDebounced.current({
        viewMode: newState.userViewMode,
        panelSizes: newState.panelSizes,
      })
      
      return newState
    })
  }, [])
  
  // Set panel sizes (only in split mode)
  const setPanelSizes = useCallback((sizes: [number, number]) => {
    setState(prev => {
      if (prev.effectiveViewMode !== 'split') return prev
      
      const newState = {
        ...prev,
        panelSizes: sizes,
      }
      
      // Persist panel sizes
      saveDebounced.current({
        viewMode: newState.userViewMode,
        panelSizes: newState.panelSizes,
      })
      
      return newState
    })
  }, [])
  
  // Hide AI (switch to tab mode)
  const hideAI = useCallback(() => {
    setUserViewMode('tab')
  }, [setUserViewMode])
  
  // Show AI (switch to split mode)
  const showAI = useCallback(() => {
    setUserViewMode('split')
  }, [setUserViewMode])
  
  return {
    userViewMode: state.userViewMode,
    effectiveViewMode: state.effectiveViewMode,
    panelSizes: state.panelSizes,
    containerRef,
    setUserViewMode,
    setPanelSizes,
    hideAI,
    showAI,
  }
}

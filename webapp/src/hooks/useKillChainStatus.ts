'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { KillChainState } from '@/lib/kill-chain-types'

interface UseKillChainStatusOptions {
  projectId: string | null
  enabled?: boolean
  pollingInterval?: number
  onStatusChange?: (status: string) => void
  onComplete?: () => void
  onError?: (error: string) => void
}

interface UseKillChainStatusReturn {
  state: KillChainState | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  startKillChain: (options?: { startStage?: number }) => Promise<KillChainState | null>
  stopKillChain: () => Promise<KillChainState | null>
  pauseKillChain: () => Promise<KillChainState | null>
  resumeKillChain: () => Promise<KillChainState | null>
  advanceKillChain: (targetStage: number) => Promise<KillChainState | null>
  submitOperatorInput: (stage: number, instructions: string, action: 'approve' | 'skip' | 'stop') => Promise<KillChainState | null>
}

const DEFAULT_POLLING_INTERVAL = 5000
const IDLE_POLLING_INTERVAL = 30000

export function useKillChainStatus({
  projectId,
  enabled = true,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
  onStatusChange,
  onComplete,
  onError,
}: UseKillChainStatusOptions): UseKillChainStatusReturn {
  const [state, setState] = useState<KillChainState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previousStatusRef = useRef<string | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const onStatusChangeRef = useRef(onStatusChange)
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
    onCompleteRef.current = onComplete
    onErrorRef.current = onError
  }, [onStatusChange, onComplete, onError])

  const fetchStatus = useCallback(async () => {
    if (!projectId) return

    try {
      const response = await fetch(`/api/kill-chain/${projectId}/status`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch status')
      }

      const data: KillChainState = await response.json()
      setState(data)
      setError(null)

      if (previousStatusRef.current !== data.status) {
        onStatusChangeRef.current?.(data.status)

        if (data.status === 'completed') {
          onCompleteRef.current?.()
        } else if (data.status === 'error' && data.error) {
          onErrorRef.current?.(data.error)
        }

        previousStatusRef.current = data.status
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    }
  }, [projectId])

  const startKillChain = useCallback(
    async (options?: { startStage?: number }): Promise<KillChainState | null> => {
      if (!projectId) return null

      setIsLoading(true)
      setError(null)

      const body: { start_stage?: number } = {}
      if (options?.startStage === 2) body.start_stage = 2
      console.log(`[useKillChainStatus] startKillChain options=${JSON.stringify(options)} body=${JSON.stringify(body)}`)

      try {
        const response = await fetch(`/api/kill-chain/${projectId}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to start kill chain')
        }

        const data: KillChainState = await response.json()
        setState(data)
        previousStatusRef.current = data.status
        return data
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        onErrorRef.current?.(errorMessage)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [projectId]
  )

  const stopKillChain = useCallback(async (): Promise<KillChainState | null> => {
    if (!projectId) return null

    setIsLoading(true)

    try {
      const response = await fetch(`/api/kill-chain/${projectId}/stop`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to stop kill chain')
      }

      const data: KillChainState = await response.json()
      setState(data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  const pauseKillChain = useCallback(async (): Promise<KillChainState | null> => {
    if (!projectId) return null

    try {
      const response = await fetch(`/api/kill-chain/${projectId}/pause`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to pause kill chain')
      }

      const data: KillChainState = await response.json()
      setState(data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return null
    }
  }, [projectId])

  const resumeKillChain = useCallback(async (): Promise<KillChainState | null> => {
    if (!projectId) return null

    try {
      const response = await fetch(`/api/kill-chain/${projectId}/resume`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to resume kill chain')
      }

      const data: KillChainState = await response.json()
      setState(data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return null
    }
  }, [projectId])

  const advanceKillChain = useCallback(async (targetStage: number): Promise<KillChainState | null> => {
    if (!projectId) return null

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/kill-chain/${projectId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_stage: targetStage }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to advance kill chain stage')
      }

      const data: KillChainState = await response.json()
      setState(data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || !enabled) {
      setState(null)
      return
    }

    fetchStatus()
  }, [projectId, enabled, fetchStatus])

  useEffect(() => {
    if (!projectId || !enabled) return

    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    const isActive =
      state?.status === 'running' ||
      state?.status === 'starting' ||
      state?.status === 'paused' ||
      state?.status === 'waiting_for_operator'

    const interval = isActive ? pollingInterval : IDLE_POLLING_INTERVAL

    pollingRef.current = setInterval(fetchStatus, interval)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [projectId, enabled, pollingInterval, fetchStatus, state?.status])

  const submitOperatorInput = useCallback(async (
    stage: number,
    instructions: string,
    action: 'approve' | 'skip' | 'stop'
  ): Promise<KillChainState | null> => {
    if (!projectId) return null

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/kill-chain/${projectId}/operator-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, instructions, action }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit operator input')
      }

      const data: KillChainState = await response.json()
      setState(data)
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  return {
    state,
    isLoading,
    error,
    refetch: fetchStatus,
    startKillChain,
    stopKillChain,
    pauseKillChain,
    resumeKillChain,
    advanceKillChain,
    submitOperatorInput,
  }
}

export default useKillChainStatus

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { KillChainLogEvent } from '@/lib/kill-chain-types'
import type { ReconLogEvent } from '@/lib/recon-types'

interface UseKillChainSSEOptions {
  projectId: string | null
  enabled: boolean
  /** When status is idle/completed, do not reconnect on 404 - avoids reconnect spam after stop */
  status?: string | null
  onLog?: (event: KillChainLogEvent) => void
  onStageChange?: (stage: number, stageName: string) => void
  onComplete?: (status: string, error?: string) => void
  onError?: (error: string) => void
}

interface UseKillChainSSEReturn {
  logs: ReconLogEvent[]
  isConnected: boolean
  error: string | null
  clearLogs: () => void
  currentPhase: string | null
  currentPhaseNumber: number | null
  currentStage: number
  currentStageName: string
}

function toReconLogEvent(kc: KillChainLogEvent, eventId: string): ReconLogEvent {
  return {
    log: kc.log,
    timestamp: kc.timestamp,
    phase: kc.phase ?? kc.subStep,
    phaseNumber: kc.phaseNumber ?? kc.subStepNumber ?? undefined,
    isPhaseStart: kc.isPhaseStart ?? undefined,
    level: kc.level,
    eventId,
  }
}

export function useKillChainSSE({
  projectId,
  enabled,
  status,
  onLog,
  onStageChange,
  onComplete,
  onError,
}: UseKillChainSSEOptions): UseKillChainSSEReturn {
  const [logs, setLogs] = useState<ReconLogEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPhase, setCurrentPhase] = useState<string | null>(null)
  const [currentPhaseNumber, setCurrentPhaseNumber] = useState<number | null>(null)
  const [currentStage, setCurrentStage] = useState(1)
  const [currentStageName, setCurrentStageName] = useState('Reconnaissance')

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5
  const deadRef = useRef(false)   // set true after max retries on 404 — suppresses further connects
  const logIdRef = useRef(0)
  const statusRef = useRef(status)
  statusRef.current = status

  const clearLogs = useCallback(() => {
    setLogs([])
    setCurrentPhase(null)
    setCurrentPhaseNumber(null)
    setCurrentStage(1)
    setCurrentStageName('Reconnaissance')
    logIdRef.current = 0
  }, [])

  const connect = useCallback(() => {
    if (!projectId || !enabled) return
    if (deadRef.current) return   // permanently dead after max 404 retries

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource(`/api/kill-chain/${projectId}/logs`)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
      setError(null)
      reconnectAttempts.current = 0
    }

    eventSource.addEventListener('log', (event) => {
      try {
        const eventData = (event as MessageEvent).data
        if (!eventData) return

        const data = JSON.parse(eventData) as KillChainLogEvent
        logIdRef.current += 1
        const eventId = `killchain-${projectId}-${logIdRef.current}`
        const logEvent = toReconLogEvent(
          { ...data, eventId } as KillChainLogEvent & { eventId?: string },
          eventId
        )
        logEvent.eventId = eventId

        setLogs((prev) => [...prev, logEvent])
        onLog?.(data)

        setCurrentStage(data.stage)
        setCurrentStageName(data.stageName)
        if (data.isPhaseStart && data.phase && data.phaseNumber) {
          setCurrentPhase(data.phase)
          setCurrentPhaseNumber(data.phaseNumber)
          onStageChange?.(data.stage, data.stageName)
        }
      } catch (err) {
        console.error('Error parsing kill chain log event:', err)
      }
    })

    eventSource.addEventListener('error', (event) => {
      try {
        const eventData = (event as MessageEvent).data
        if (!eventData) return
        const data = JSON.parse(eventData)
        if (data.error) {
          setError(data.error)
          onError?.(data.error)
        }
      } catch (err) {
        console.error('Error parsing kill chain error event:', err)
      }
    })

    eventSource.addEventListener('complete', async (event) => {
      try {
        const eventData = (event as MessageEvent).data
        if (!eventData) return

        const data = JSON.parse(eventData)
        onComplete?.(data.status, data.error)
        eventSource.close()
        setIsConnected(false)
        if (data.currentStage) setCurrentStage(data.currentStage)
      } catch (err) {
        console.error('Error parsing kill chain complete event:', err)
      }
    })

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()

      // Do not reconnect when status is idle or completed (e.g. user stopped, 404 expected)
      const currentStatus = statusRef.current
      if (currentStatus === 'idle' || currentStatus === 'completed' || currentStatus === 'error') {
        return
      }

      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
        reconnectAttempts.current++
        reconnectTimeoutRef.current = setTimeout(() => connect(), delay)
      } else {
        deadRef.current = true
        setError('Connection lost. Max reconnection attempts reached.')
        onError?.('Connection lost. Max reconnection attempts reached.')
      }
    }
  }, [projectId, enabled, onLog, onStageChange, onComplete, onError])

  useEffect(() => {
    if (enabled && projectId) {
      // Reset dead state when re-enabled (e.g., new engagement started)
      deadRef.current = false
      reconnectAttempts.current = 0
      connect()
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [enabled, projectId, connect])

  return {
    logs,
    isConnected,
    error,
    clearLogs,
    currentPhase,
    currentPhaseNumber,
    currentStage,
    currentStageName,
  }
}

export default useKillChainSSE

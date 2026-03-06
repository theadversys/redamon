'use client'

import { useState, useEffect, useCallback } from 'react'

export interface FindingStateData {
  status: string
  ownerId: string | null
  watcherIds: string[]
  firstSeenAt: string | null
  lastSeenAt: string | null
  targetDueAt: string | null
  overdue: boolean
  riskReason: string | null
  riskApproverId: string | null
  riskExpiresAt: string | null
  fpReason: string | null
  fpEvidenceRef: string | null
  verificationRunId: string | null
  verificationProofRef: string | null
  updatedAt: string
  updatedById: string | null
  commentCount: number
  ticket: {
    provider: string
    ticketId: string
    ticketUrl: string
    status: string | null
    lastSyncAt: string | null
  } | null
}

export function useFindingStates(projectId: string | null) {
  const [states, setStates] = useState<Record<string, FindingStateData>>({})
  const [loading, setLoading] = useState(false)

  const fetchStates = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/findings/${projectId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setStates(data.states || {})
    } catch {
      setStates({})
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchStates()
  }, [fetchStates])

  const getState = useCallback(
    (vulnId: string): FindingStateData => {
      const s = states[vulnId]
      if (s) return s
      return {
        status: 'open',
        ownerId: null,
        watcherIds: [],
        firstSeenAt: null,
        lastSeenAt: null,
        targetDueAt: null,
        overdue: false,
        riskReason: null,
        riskApproverId: null,
        riskExpiresAt: null,
        fpReason: null,
        fpEvidenceRef: null,
        verificationRunId: null,
        verificationProofRef: null,
        updatedAt: new Date().toISOString(),
        updatedById: null,
        commentCount: 0,
        ticket: null,
      }
    },
    [states]
  )

  const updateState = useCallback(
    async (
      vulnId: string,
      updates: Partial<FindingStateData>,
      userId?: string
    ): Promise<FindingStateData | null> => {
      if (!projectId) return null
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (userId) headers['X-User-Id'] = userId
        const res = await fetch(`/api/findings/${projectId}/${vulnId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updates),
        })
        if (!res.ok) throw new Error(await res.text())
        const data = await res.json()
        setStates((prev) => ({ ...prev, [vulnId]: data }))
        return data
      } catch {
        return null
      }
    },
    [projectId]
  )

  return { states, loading, getState, updateState, refetch: fetchStates }
}

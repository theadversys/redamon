'use client'

import { useCallback, useEffect } from 'react'
import { useSessionStorage } from './useSessionStorage'

const SESSION_STORAGE_KEY = 'pandaexploit-session-id'

function generateSessionId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 10)
  return `session_${timestamp}_${randomPart}`
}

export function useSession() {
  const [sessionId, setSessionId] = useSessionStorage<string>(SESSION_STORAGE_KEY, '')

  // Initialize session on mount if empty
  useEffect(() => {
    if (!sessionId) {
      const envSessionId = process.env.NEXT_PUBLIC_SESSION_ID
      const newSessionId = envSessionId || generateSessionId()
      setSessionId(newSessionId)
    }
  }, [sessionId, setSessionId])

  const resetSession = useCallback(() => {
    const newSessionId = generateSessionId()
    setSessionId(newSessionId)
    return newSessionId
  }, [setSessionId])

  return {
    sessionId,
    resetSession,
  }
}

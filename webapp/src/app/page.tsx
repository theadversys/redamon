'use client'

import { useState, useEffect, useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { useProject } from '@/providers/ProjectProvider'
import { EngagementContextBar } from '@/components/layout/EngagementContextBar'
import styles from './page.module.css'

const AGENT_ZERO_BASE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AGENT_ZERO_URL ||
        `${window.location.origin}/api/a0`)
    : ''

export default function HomePage() {
  const { projectId, userId } = useProject()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const iframeSrc = useMemo(() => {
    if (!AGENT_ZERO_BASE_URL) return ''
    const base = AGENT_ZERO_BASE_URL.replace(/\/$/, '')
    const params = new URLSearchParams()
    if (projectId) params.set('project_id', projectId)
    if (userId) params.set('user_id', userId)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }, [projectId, userId])

  if (!mounted) return null

  return (
    <div className={styles.page}>
      {/* Slim 40px engagement bar — live kill chain + vuln + secrets */}
      <EngagementContextBar agentZeroHref={iframeSrc || AGENT_ZERO_BASE_URL} />

      {/* Full-height Agent Zero iframe */}
      <div className={styles.iframeContainer}>
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            title="Agent Zero — PandaExploit Command Center"
            className={styles.iframe}
            allow="clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          />
        ) : (
          <div className={styles.unavailable}>
            <p>Agent Zero is unavailable.</p>
            <a
              href={AGENT_ZERO_BASE_URL || 'http://localhost:50001'}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <ExternalLink size={14} />
              Open Agent Zero in new tab
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Bot, Play, Activity, ExternalLink,
  CheckCircle, XCircle, StopCircle, Loader2,
} from 'lucide-react'
import styles from './page.module.css'
import { SCAN_PROFILES, type ScanProfile } from '@/lib/ai-security/catalog'

const PROMPTFOO_URL = 'http://localhost:15500'

export default function AISecurityPage() {
  const [mounted, setMounted] = useState(false)
  const [iframeKey, setIframeKey] = useState(Date.now())

  const [targetUrl, setTargetUrl] = useState('https://api.openai.com/v1/chat/completions')
  const [targetType, setTargetType] = useState<'http' | 'openai' | 'anthropic'>('openai')
  const [selectedProfile, setSelectedProfile] = useState('quick')

  const [runningScanId, setRunningScanId] = useState<string | null>(null)
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ success: boolean; findingsCount?: number; error?: string } | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!runningScanId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/ai-security/scans/${runningScanId}/status`)
        const data = await res.json()
        setScanStatus(data.status)

        if (data.status === 'ready_to_ingest') {
          const ingestRes = await fetch(`/api/ai-security/scans/${runningScanId}/ingest`, { method: 'POST' })
          const ingestData = await ingestRes.json()
          setLastResult({ success: true, findingsCount: ingestData.findingsCount })
          setRunningScanId(null)
          setScanStatus(null)
          setIframeKey(Date.now())
        } else if (data.status === 'completed') {
          setLastResult({ success: true, findingsCount: data.findingsCount })
          setRunningScanId(null)
          setScanStatus(null)
          setIframeKey(Date.now())
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          setLastResult({ success: false, error: data.errorMessage || 'Scan failed' })
          setRunningScanId(null)
          setScanStatus(null)
        }
      } catch { /* ignore poll errors */ }
    }
    pollRef.current = setInterval(poll, 3000)
    poll()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [runningScanId])

  const activeProfile = SCAN_PROFILES.find(p => p.id === selectedProfile) as ScanProfile

  const startScan = async () => {
    setLastResult(null)
    try {
      const res = await fetch('/api/ai-security/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${activeProfile.label} — ${new Date().toLocaleTimeString()}`,
          targetUrl,
          targetType,
          plugins: activeProfile.plugins,
          strategies: activeProfile.strategies,
          profile: selectedProfile,
          numTests: activeProfile.numTests,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setRunningScanId(data.scanId)
        setScanStatus('running')
      } else {
        setLastResult({ success: false, error: data.error })
      }
    } catch {
      setLastResult({ success: false, error: 'Failed to start scan' })
    }
  }

  const cancelScan = async () => {
    if (!runningScanId) return
    await fetch(`/api/ai-security/scans/${runningScanId}/status`, { method: 'DELETE' })
    setRunningScanId(null)
    setScanStatus(null)
    setLastResult({ success: false, error: 'Scan cancelled' })
  }

  const isRunning = !!runningScanId

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <div className={styles.statusPulse} data-status={isRunning ? 'running' : 'idle'} />
          <div>
            <h1>AI Security & Red Teaming</h1>
            <p className={styles.subtitle}>
              LLM VULNERABILITY SCANNING &bull; POWERED BY PROMPTFOO
            </p>
          </div>
        </div>

        <div className={styles.launchBar}>
          <select
            value={targetType}
            onChange={e => setTargetType(e.target.value as 'http' | 'openai' | 'anthropic')}
            className={styles.select}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="http">HTTP Endpoint</option>
          </select>

          <input
            type="text"
            value={targetUrl}
            onChange={e => setTargetUrl(e.target.value)}
            className={styles.urlInput}
            placeholder="Target URL"
          />

          <select
            value={selectedProfile}
            onChange={e => setSelectedProfile(e.target.value)}
            className={styles.select}
          >
            {SCAN_PROFILES.filter(p => p.id !== 'custom').map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          {isRunning ? (
            <button onClick={cancelScan} className={styles.cancelBtn}>
              <StopCircle size={14} /> Cancel
            </button>
          ) : (
            <button onClick={startScan} className={styles.runBtn}>
              <Play size={14} /> Scan
            </button>
          )}

          {isRunning && (
            <div className={styles.statusChip}>
              <Loader2 size={12} className={styles.spinIcon} />
              <span>{scanStatus === 'running' ? 'Scanning...' : scanStatus}</span>
            </div>
          )}

          {lastResult && !isRunning && (
            <div className={`${styles.statusChip} ${lastResult.success ? styles.chipSuccess : styles.chipError}`}>
              {lastResult.success
                ? <><CheckCircle size={12} /> {lastResult.findingsCount ?? 0} findings</>
                : <><XCircle size={12} /> {lastResult.error}</>
              }
            </div>
          )}

          <a
            href={PROMPTFOO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.externalLink}
          >
            Launch Standalone <ExternalLink size={12} />
          </a>
        </div>
      </header>

      <div className={styles.iframeContainer}>
        <iframe
          key={iframeKey}
          src={PROMPTFOO_URL}
          className={styles.iframe}
          title="PromptFoo Red Team Report"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    </div>
  )
}

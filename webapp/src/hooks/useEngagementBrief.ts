'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface EngagementBrief {
  project: {
    id: string
    name: string
    target: string
    operatingMode: string
  }
  killChain: {
    status: string
    stage: number
    stageName: string
    startedAt: string | null
  }
  attack_surface: {
    hosts: number
    openPorts: number
    techStack: string[]
    secretsFound: number
  }
  vulnerabilities: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
    criticalCVEs: string[]
  }
  mitre: {
    tacticsCovered: number
    totalTactics: number
  }
  generatedAt: string
}

interface UseEngagementBriefReturn {
  brief: EngagementBrief | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

const REFRESH_INTERVAL_MS = 15_000

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useEngagementBrief(projectId: string | null): UseEngagementBriefReturn {
  const [brief, setBrief] = useState<EngagementBrief | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  const fetchBrief = useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/engagement/brief/${projectId}`)
      if (!res.ok) throw new Error('Failed to fetch engagement brief')
      const data: EngagementBrief = await res.json()
      if (mountedRef.current) {
        setBrief(data)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    mountedRef.current = true
    if (!projectId) {
      setBrief(null)
      return
    }

    fetchBrief()

    intervalRef.current = setInterval(fetchBrief, REFRESH_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [projectId, fetchBrief])

  return { brief, isLoading, error, refetch: fetchBrief }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: format brief as a compact system-prompt injection string
// ──────────────────────────────────────────────────────────────────────────────

export function formatBriefForPrompt(brief: EngagementBrief): string {
  const {
    project,
    killChain,
    attack_surface,
    vulnerabilities,
    mitre,
  } = brief

  const vulnSummary = `${vulnerabilities.total} total (${vulnerabilities.critical} critical, ${vulnerabilities.high} high, ${vulnerabilities.medium} medium)`
  const critCVEs =
    vulnerabilities.criticalCVEs.length > 0
      ? vulnerabilities.criticalCVEs.join(', ')
      : 'None identified'
  const techStr =
    attack_surface.techStack.length > 0
      ? attack_surface.techStack.join(', ')
      : 'Unknown'
  const mitreStr = `${mitre.tacticsCovered}/${mitre.totalTactics} tactics covered`

  return `
════════════════════════════════════════
LIVE ENGAGEMENT BRIEF  (auto-injected)
════════════════════════════════════════
Project      : ${project.name}
Target       : ${project.target}
Mode         : ${project.operatingMode}
Kill Chain   : Stage ${killChain.stage} — ${killChain.stageName} [${killChain.status.toUpperCase()}]
────────────────────────────────────────
Attack Surface
  Hosts      : ${attack_surface.hosts}
  Open Ports : ${attack_surface.openPorts}
  Tech Stack : ${techStr}
  Secrets    : ${attack_surface.secretsFound} found
────────────────────────────────────────
Vulnerabilities : ${vulnSummary}
Critical CVEs   : ${critCVEs}
MITRE ATT&CK    : ${mitreStr}
════════════════════════════════════════
Use this brief as your ground truth for all responses. Reference specific findings when advising.
`.trim()
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: generate context-driven suggested prompts from the brief
// ──────────────────────────────────────────────────────────────────────────────

export function generateSuggestedPrompts(brief: EngagementBrief): string[] {
  const prompts: string[] = []
  const { killChain, vulnerabilities, attack_surface } = brief

  // Stage-specific prompts (highest priority)
  if (killChain.status === 'running' || killChain.status === 'idle') {
    switch (killChain.stage) {
      case 1:
        prompts.push(`Summarize recon findings for ${brief.project.target}`)
        prompts.push('What subdomains and services have been discovered?')
        break
      case 2:
        prompts.push('What payloads should I prepare based on discovered services?')
        prompts.push('Which vulnerabilities are most likely exploitable?')
        break
      case 3:
        prompts.push('What are the best delivery vectors given the attack surface?')
        prompts.push('How should I stage the initial access attempt?')
        break
      case 4:
        prompts.push('Walk me through exploiting the highest-severity vulnerability')
        if (vulnerabilities.criticalCVEs.length > 0) {
          prompts.push(`What is the exploitation path for ${vulnerabilities.criticalCVEs[0]}?`)
        }
        break
      case 5:
        prompts.push('What persistence mechanisms should I deploy?')
        prompts.push('How do I establish a reliable backdoor with low IOC footprint?')
        break
      case 6:
        prompts.push('Set up a C2 channel — recommend the stealthiest option for this target')
        prompts.push('What beaconing interval minimizes detection risk?')
        break
      case 7:
        prompts.push('Map out lateral movement paths from current position')
        prompts.push('What data can be exfiltrated and how?')
        break
    }
  }

  // Data-driven prompts based on findings
  if (vulnerabilities.critical > 0 && prompts.length < 3) {
    prompts.push(`Show me all ${vulnerabilities.critical} critical severity vulnerabilities`)
  }
  if (vulnerabilities.criticalCVEs.length > 0 && prompts.length < 3) {
    prompts.push(`Is there a public PoC for ${vulnerabilities.criticalCVEs[0]}?`)
  }
  if (attack_surface.secretsFound > 0 && prompts.length < 3) {
    prompts.push(`I found ${attack_surface.secretsFound} secrets — which services should I test them against?`)
  }
  if (attack_surface.techStack.length > 0 && prompts.length < 3) {
    prompts.push(`What are known vulnerabilities in ${attack_surface.techStack[0]}?`)
  }

  // Fallback generic prompts
  if (prompts.length === 0) {
    prompts.push(`What vulnerabilities were found on ${brief.project.target}?`)
    prompts.push('Summarize the current attack surface')
    prompts.push('What is the next recommended action?')
  }

  // Return top 3
  return prompts.slice(0, 3)
}

export default useEngagementBrief

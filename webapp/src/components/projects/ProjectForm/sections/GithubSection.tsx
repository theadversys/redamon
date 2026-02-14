'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronDown, Github, Loader2, CheckCircle, XCircle, ExternalLink, ChevronRight } from 'lucide-react'
import { Toggle } from '@/components/ui'
import type { Project } from '@prisma/client'
import styles from '../ProjectForm.module.css'

type FormData = Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'user'>

interface GithubSectionProps {
  data: FormData
  updateField: <K extends keyof FormData>(field: K, value: FormData[K]) => void
  projectId?: string
}

interface GitHubStats {
  totalFindings: number
  lastScanTimestamp?: string | null
  lastScan?: string | null
  bySeverity: Record<string, number>
}

interface GitHubRepo {
  full_name: string
  name: string
  private: boolean
}

export function GithubSection({ data, updateField, projectId }: GithubSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [stats, setStats] = useState<GitHubStats | null>(null)
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [reposLoadStatus, setReposLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [reposLoadMessage, setReposLoadMessage] = useState<string | null>(null)
  const [repoSearch, setRepoSearch] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)

  const hasToken = data.githubAccessToken.length > 0
  const hasOrg = !!data.githubTargetOrg?.trim()
  const allowlist = Array.isArray(data.githubRepoAllowlist) ? data.githubRepoAllowlist : []

  const handleLoadRepos = useCallback(async () => {
    const token = data.githubAccessToken.trim()
    const org = data.githubTargetOrg.trim()
    if (!token || !org) return

    setReposLoadStatus('loading')
    setReposLoadMessage(null)

    try {
      const res = await fetch('/api/github/list-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, org }),
      })
      const result = await res.json()

      if (!res.ok) {
        setReposLoadStatus('error')
        setReposLoadMessage(result.error || result.details || 'Failed to load repositories')
        setRepos([])
        return
      }

      setRepos(result.repos || [])
      setReposLoadStatus('success')
      setReposLoadMessage(`${(result.repos || []).length} repositories loaded`)
    } catch (err) {
      setReposLoadStatus('error')
      setReposLoadMessage(err instanceof Error ? err.message : 'Failed to load repositories')
      setRepos([])
    }
  }, [data.githubAccessToken, data.githubTargetOrg])

  const filteredRepos = repoSearch.trim()
    ? repos.filter((r) => r.full_name.toLowerCase().includes(repoSearch.trim().toLowerCase()))
    : repos

  const toggleRepo = useCallback(
    (fullName: string, checked: boolean) => {
      const current = allowlist
      if (checked) {
        if (!current.includes(fullName)) {
          updateField('githubRepoAllowlist', [...current, fullName].sort())
        }
      } else {
        updateField('githubRepoAllowlist', current.filter((r) => r !== fullName))
      }
    },
    [allowlist, updateField]
  )

  const selectAllRepos = useCallback(() => {
    updateField(
      'githubRepoAllowlist',
      filteredRepos.map((r) => r.full_name).sort()
    )
  }, [filteredRepos, updateField])

  const deselectAllRepos = useCallback(() => {
    updateField('githubRepoAllowlist', [])
  }, [updateField])

  // Fetch GitHub stats when projectId is available (edit mode)
  useEffect(() => {
    if (!projectId || !hasToken) {
      setStats(null)
      return
    }

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/github-stats?projectId=${projectId}`)
        if (res.ok) {
          const data = await res.json()
          setStats({
            totalFindings: data.totalFindings,
            lastScanTimestamp: data.lastScan ?? data.lastScanTimestamp,
            lastScan: data.lastScan ?? data.lastScanTimestamp,
            bySeverity: data.bySeverity || {},
          })
        } else {
          setStats(null)
        }
      } catch {
        setStats(null)
      }
    }

    fetchStats()
  }, [projectId, hasToken])

  const handleTestConnection = async () => {
    const token = data.githubAccessToken.trim()
    if (!token) {
      setTestMessage('Enter a token first')
      setTestStatus('error')
      return
    }

    setTestStatus('loading')
    setTestMessage(null)

    try {
      const res = await fetch('/api/github/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const result = await res.json()

      if (result.valid) {
        setTestStatus('success')
        setTestMessage(
          result.login
            ? `Connected as @${result.login}`
            : 'Token is valid'
        )
      } else {
        setTestStatus('error')
        setTestMessage(result.error || result.details || 'Invalid token')
      }
    } catch (err) {
      setTestStatus('error')
      setTestMessage(err instanceof Error ? err.message : 'Connection failed')
    }
  }

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return 'Never'
    try {
      const d = new Date(ts)
      return d.toLocaleString()
    } catch {
      return ts
    }
  }

  const criticalHigh =
    (stats?.bySeverity?.critical || 0) + (stats?.bySeverity?.high || 0)

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} onClick={() => setIsOpen(!isOpen)}>
        <h2 className={styles.sectionTitle}>
          <Github size={16} />
          GitHub Secret Hunting
        </h2>
        <ChevronDown
          size={16}
          className={`${styles.sectionIcon} ${isOpen ? styles.sectionIconOpen : ''}`}
        />
      </div>

      {isOpen && (
        <div className={styles.sectionContent}>
          <p className={styles.sectionDescription}>
            Scan a GitHub organization for exposed secrets, API keys, AI/LLM credentials, and high-entropy candidates. Enable &quot;GitHub Secrets & AI Attack Surface&quot; in the Target & Modules tab to include this scan when you run Recon.
          </p>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>GitHub Access Token</label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <input
                type="password"
                className="textInput"
                value={data.githubAccessToken}
                onChange={(e) => {
                  updateField('githubAccessToken', e.target.value)
                  setTestStatus('idle')
                }}
                placeholder="ghp_xxxxxxxxxxxx"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="secondaryButton"
                onClick={handleTestConnection}
                disabled={!hasToken || testStatus === 'loading'}
                style={{ whiteSpace: 'nowrap' }}
              >
                {testStatus === 'loading' ? (
                  <Loader2 size={14} className={styles.spinner} />
                ) : (
                  'Test connection'
                )}
              </button>
            </div>
            {testStatus === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-success)', fontSize: 12 }}>
                <CheckCircle size={14} />
                {testMessage}
              </div>
            )}
            {testStatus === 'error' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--status-error)', fontSize: 12 }}>
                <XCircle size={14} />
                {testMessage}
              </div>
            )}
            <span className={styles.fieldHint}>
              Required for GitHub secret scanning. Create a token with repo scope.
            </span>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Target Organization</label>
            <input
              type="text"
              className="textInput"
              value={data.githubTargetOrg}
              onChange={(e) => {
                updateField('githubTargetOrg', e.target.value)
                setRepos([])
                setReposLoadStatus('idle')
              }}
              placeholder="organization-name"
              disabled={!hasToken}
            />
          </div>

          {hasToken && hasOrg && (
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Repositories</label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleLoadRepos}
                  disabled={reposLoadStatus === 'loading'}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {reposLoadStatus === 'loading' ? (
                    <Loader2 size={14} className={styles.spinner} />
                  ) : (
                    'Load Repositories'
                  )}
                </button>
                {reposLoadStatus === 'success' && (
                  <span className={styles.fieldHint} style={{ color: 'var(--status-success)' }}>
                    {reposLoadMessage}
                  </span>
                )}
                {reposLoadStatus === 'error' && (
                  <span className={styles.fieldHint} style={{ color: 'var(--status-error)' }}>
                    {reposLoadMessage}
                  </span>
                )}
              </div>
              <span className={styles.fieldHint}>
                Load repos from the target org. Empty selection = scan all repos.
              </span>
            </div>
          )}

          {repos.length > 0 && (
            <div className={styles.repoSelectionSection}>
              <div className={styles.repoSelectionHeader}>
                <input
                  type="text"
                  className={`textInput ${styles.repoSearchInput}`}
                  placeholder="Filter repositories..."
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  aria-label="Filter repositories"
                />
                <div className={styles.repoSelectionActions}>
                  <button
                    type="button"
                    className={styles.repoSelectButton}
                    onClick={selectAllRepos}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className={styles.repoSelectButton}
                    onClick={deselectAllRepos}
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className={styles.repoList}>
                {filteredRepos.map((repo) => (
                  <label key={repo.full_name} className={styles.repoListItem}>
                    <input
                      type="checkbox"
                      checked={allowlist.includes(repo.full_name)}
                      onChange={(e) => toggleRepo(repo.full_name, e.target.checked)}
                      className={styles.repoCheckbox}
                    />
                    <span className={styles.repoName}>{repo.full_name}</span>
                    {repo.private && (
                      <span className={styles.repoPrivateBadge}>private</span>
                    )}
                  </label>
                ))}
              </div>
              <span className={styles.fieldHint}>
                {allowlist.length === 0
                  ? 'All repos selected for scan (empty = scan entire org)'
                  : `${allowlist.length} repo(s) selected for scan`}
              </span>
            </div>
          )}

          {hasToken && (
            <div className={styles.fieldGroup}>
              <button
                type="button"
                className={styles.manualInputToggle}
                onClick={() => setShowManualInput(!showManualInput)}
                aria-expanded={showManualInput}
              >
                <ChevronRight
                  size={14}
                  className={showManualInput ? styles.manualInputChevronOpen : ''}
                />
                Or enter repos manually
              </button>
              {showManualInput && (
                <div className={styles.manualInputContent}>
                  <input
                    type="text"
                    className="textInput"
                    value={Array.isArray(data.githubRepoAllowlist) ? data.githubRepoAllowlist.join(', ') : ''}
                    onChange={(e) => {
                      const list = e.target.value
                        .split(/[,\s]+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                      updateField('githubRepoAllowlist', list)
                    }}
                    placeholder="org/repo1, org/repo2 (empty = all repos)"
                  />
                  <span className={styles.fieldHint}>
                    Comma-separated. Overrides checkbox selection when used.
                  </span>
                </div>
              )}
            </div>
          )}

          {hasToken && (
            <>
              <div className={styles.subSection}>
                <h3 className={styles.subSectionTitle}>Scan Targets</h3>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Include Forks</span>
                    <p className={styles.toggleDescription}>Scan forked repositories</p>
                  </div>
                  <Toggle
                    checked={data.githubIncludeForks ?? false}
                    onChange={(checked) => updateField('githubIncludeForks', checked)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan Member Repositories</span>
                    <p className={styles.toggleDescription}>Include repositories of organization members</p>
                  </div>
                  <Toggle
                    checked={data.githubScanMembers}
                    onChange={(checked) => updateField('githubScanMembers', checked)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan Gists</span>
                    <p className={styles.toggleDescription}>Search for secrets in gists</p>
                  </div>
                  <Toggle
                    checked={data.githubScanGists}
                    onChange={(checked) => updateField('githubScanGists', checked)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan Commits</span>
                    <p className={styles.toggleDescription}>Search commit history for secrets</p>
                  </div>
                  <Toggle
                    checked={data.githubScanCommits}
                    onChange={(checked) => updateField('githubScanCommits', checked)}
                  />
                </div>
              </div>

              <div className={styles.subSection}>
                <h3 className={styles.subSectionTitle}>Detection Options</h3>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan for Secrets</span>
                    <p className={styles.toggleDescription}>Detect API keys, tokens, credentials</p>
                  </div>
                  <Toggle
                    checked={data.githubScanSecrets ?? true}
                    onChange={(checked) => updateField('githubScanSecrets', checked)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan for High-Entropy Candidates</span>
                    <p className={styles.toggleDescription}>Detect unknown secret formats via entropy</p>
                  </div>
                  <Toggle
                    checked={data.githubScanHighEntropy ?? true}
                    onChange={(checked) => updateField('githubScanHighEntropy', checked)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan for AI/LLM API Keys</span>
                    <p className={styles.toggleDescription}>OpenAI, Anthropic, HuggingFace, Groq, etc.</p>
                  </div>
                  <Toggle
                    checked={data.githubScanAiLlmKeys ?? true}
                    onChange={(checked) => updateField('githubScanAiLlmKeys', checked)}
                  />
                </div>
                <div className={styles.toggleRow}>
                  <div>
                    <span className={styles.toggleLabel}>Scan for AI/LLM Usage</span>
                    <p className={styles.toggleDescription}>Imports, clients, env vars (code patterns)</p>
                  </div>
                  <Toggle
                    checked={data.githubScanAiLlmUsage ?? true}
                    onChange={(checked) => updateField('githubScanAiLlmUsage', checked)}
                  />
                </div>
              </div>

              {data.githubScanCommits && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Max Commits to Scan</label>
                  <input
                    type="number"
                    className="textInput"
                    value={data.githubMaxCommits}
                    onChange={(e) => updateField('githubMaxCommits', parseInt(e.target.value) || 100)}
                    min={1}
                    max={1000}
                  />
                </div>
              )}

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Max Files per Repo</label>
                <input
                  type="number"
                  className="textInput"
                  value={data.githubMaxFilesPerRepo ?? 10000}
                  onChange={(e) => updateField('githubMaxFilesPerRepo', parseInt(e.target.value) || 10000)}
                  min={100}
                  max={100000}
                />
                <span className={styles.fieldHint}>Limit files scanned per repository (default: 10000)</span>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Max File Size (bytes)</label>
                <input
                  type="number"
                  className="textInput"
                  value={data.githubMaxFileSizeBytes ?? 1048576}
                  onChange={(e) => updateField('githubMaxFileSizeBytes', parseInt(e.target.value) || 1048576)}
                  min={1024}
                  max={10485760}
                />
                <span className={styles.fieldHint}>Skip files larger than this (default: 1 MB)</span>
              </div>

              <div className={styles.toggleRow}>
                <div>
                  <span className={styles.toggleLabel}>Output as JSON</span>
                  <p className={styles.toggleDescription}>Save results in JSON format</p>
                </div>
                <Toggle
                  checked={data.githubOutputJson}
                  onChange={(checked) => updateField('githubOutputJson', checked)}
                />
              </div>
            </>
          )}

          {projectId && hasToken && (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Status</h3>
              <p className={styles.fieldHint} style={{ marginBottom: 8 }}>
                Last GitHub scan: {formatTimestamp(stats?.lastScan ?? stats?.lastScanTimestamp ?? null)}
              </p>
              <p className={styles.fieldHint} style={{ marginBottom: 8 }}>
                Total findings: {stats?.totalFindings ?? 0}
                {criticalHigh > 0 && (
                  <span style={{ color: 'var(--status-error)', marginLeft: 8 }}>
                    (Critical: {stats?.bySeverity?.critical ?? 0}, High: {stats?.bySeverity?.high ?? 0})
                  </span>
                )}
              </p>
              <Link
                href={`/secrets?project=${projectId}`}
                className="secondaryButton"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  textDecoration: 'none',
                }}
              >
                View findings
                <ExternalLink size={12} />
              </Link>
            </div>
          )}

          {hasToken && data.githubTargetOrg?.trim() && !data.scanModules?.includes('github') && (
            <div className={styles.subSection} style={{ background: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)', border: '1px solid var(--accent-primary)' }}>
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                <strong>Tip:</strong> Enable &quot;GitHub Secrets & AI Attack Surface&quot; in the Target & Modules tab to run this scan when you start Recon.
              </p>
            </div>
          )}

          {!hasToken && (
            <div className={styles.subSection}>
              <p className={styles.fieldHint}>
                Enter a GitHub access token to enable secret scanning options.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

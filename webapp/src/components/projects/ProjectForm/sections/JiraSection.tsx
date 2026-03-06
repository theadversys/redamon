'use client'

import { useState } from 'react'
import { ChevronDown, Ticket, Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react'
import styles from '../ProjectForm.module.css'

interface JiraSectionProps {
  /** Called when the user wants to test the global Jira config */
  projectId?: string
}

/**
 * JiraSection — shows the global Jira configuration (env-based) with a
 * test-connection button. Jira credentials are set via server-side env vars
 * (JIRA_BASE_URL, JIRA_PROJECT_KEY, JIRA_EMAIL, JIRA_API_TOKEN) so they are
 * never stored in the project record or sent to the browser.
 */
export function JiraSection({ projectId }: JiraSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [jiraInfo, setJiraInfo] = useState<{ baseUrl?: string; projectKey?: string } | null>(null)

  const handleTest = async () => {
    setTestStatus('loading')
    setTestMessage(null)
    setJiraInfo(null)
    try {
      const res = await fetch('/api/integrations/jira/test', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.ok) {
        setTestStatus('success')
        setTestMessage(data.message || 'Connection successful')
        setJiraInfo({ baseUrl: data.baseUrl, projectKey: data.projectKey })
      } else {
        setTestStatus('error')
        setTestMessage(data.error || 'Connection failed — check server env vars')
      }
    } catch {
      setTestStatus('error')
      setTestMessage('Network error — could not reach server')
    }
  }

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setIsOpen((o) => !o)}
      >
        <Ticket size={16} className={styles.sectionIcon} />
        <span className={styles.sectionTitle}>Jira Integration</span>
        <ChevronDown
          size={14}
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      </button>

      {isOpen && (
        <div className={styles.sectionBody}>
          <p className={styles.sectionDescription}>
            Jira credentials are configured via server environment variables and apply globally
            across all projects. Once configured, use <strong>Create Ticket</strong> on any
            finding to push it directly to your Jira project.
          </p>

          {/* Env var reference */}
          <div className={styles.infoBox}>
            <div className={styles.infoBoxTitle}>Required environment variables</div>
            <div className={styles.monoList}>
              <span className={styles.envVar}>JIRA_BASE_URL</span>
              <span className={styles.envVarHint}>e.g. https://yourorg.atlassian.net</span>
              <span className={styles.envVar}>JIRA_PROJECT_KEY</span>
              <span className={styles.envVarHint}>e.g. SEC or VULN</span>
              <span className={styles.envVar}>JIRA_EMAIL</span>
              <span className={styles.envVarHint}>Atlassian account email</span>
              <span className={styles.envVar}>JIRA_API_TOKEN</span>
              <span className={styles.envVarHint}>
                API token from{' '}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  Atlassian API tokens <ExternalLink size={11} />
                </a>
              </span>
            </div>
          </div>

          {/* Test connection */}
          <div className={styles.fieldGroup}>
            <button
              type="button"
              className={styles.testButton}
              onClick={handleTest}
              disabled={testStatus === 'loading'}
            >
              {testStatus === 'loading' ? (
                <><Loader2 size={13} className={styles.spin} /> Testing connection…</>
              ) : (
                <><Ticket size={13} /> Test Jira Connection</>
              )}
            </button>

            {testStatus === 'success' && (
              <div className={styles.testResult} data-status="success">
                <CheckCircle size={13} />
                <span>{testMessage}</span>
                {jiraInfo?.baseUrl && (
                  <a
                    href={jiraInfo.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    {jiraInfo.projectKey} <ExternalLink size={11} />
                  </a>
                )}
              </div>
            )}
            {testStatus === 'error' && (
              <div className={styles.testResult} data-status="error">
                <XCircle size={13} />
                <span>{testMessage}</span>
              </div>
            )}
          </div>

          <p className={styles.helpText}>
            Each finding on the Vulnerabilities page has a <strong>Create Ticket</strong> button.
            Issues are created as <em>Bug</em> type in the configured Jira project with severity
            labels, asset, and remediation steps automatically populated.
          </p>
        </div>
      )}
    </div>
  )
}

export default JiraSection

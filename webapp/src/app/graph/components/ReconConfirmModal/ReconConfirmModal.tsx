'use client'

import { AlertTriangle, Play, Loader2, Github } from 'lucide-react'
import { Modal } from '@/components/ui'
import styles from './ReconConfirmModal.module.css'

const MODULE_LABELS: Record<string, string> = {
  domain_discovery: 'Domain Discovery',
  port_scan: 'Port Scanning',
  http_probe: 'HTTP Probing',
  resource_enum: 'Resource Enumeration',
  vuln_scan: 'Vulnerability Scanning',
  github: 'GitHub Secrets & AI Attack Surface',
}

interface GraphStats {
  totalNodes: number
  nodesByType: Record<string, number>
}

interface ReconConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  projectName: string
  targetDomain: string
  stats: GraphStats | null
  isLoading: boolean
  scanModules?: string[]
  githubTargetOrg?: string
}

export function ReconConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  targetDomain,
  stats,
  isLoading,
  scanModules = [],
  githubTargetOrg = '',
}: ReconConfirmModalProps) {
  const hasExistingData = stats && stats.totalNodes > 0
  const hasGithub = scanModules.includes('github')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Start Assessment"
      size="default"
    >
      <div className={styles.content}>
        <div className={styles.info}>
          <p className={styles.projectInfo}>
            <strong>Project:</strong> {projectName}
          </p>
          <p className={styles.projectInfo}>
            <strong>Target:</strong> {targetDomain}
          </p>
        </div>

        <div className={styles.modulesSection}>
          <p className={styles.modulesTitle}>Modules to run</p>
          <div className={styles.modulesList}>
            {scanModules.length > 0 ? (
              scanModules.map((id) => (
                <span
                  key={id}
                  className={`${styles.moduleBadge} ${id === 'github' ? styles.moduleBadgeGithub : ''}`}
                >
                  {id === 'github' && <Github size={12} />}
                  {MODULE_LABELS[id] || id}
                  {id === 'github' && githubTargetOrg && (
                    <span className={styles.githubOrg}> → {githubTargetOrg}</span>
                  )}
                </span>
              ))
            ) : (
              <span className={styles.modulesDefault}>Domain discovery, port scan, HTTP probe, resource enum, vuln scan</span>
            )}
          </div>
          {!hasGithub && (
            <p className={styles.modulesHint}>
              Enable GitHub in Project Settings → Target & Modules to scan org repos for secrets.
            </p>
          )}
        </div>

        {hasExistingData ? (
          <div className={styles.warning}>
            <AlertTriangle size={20} className={styles.warningIcon} />
            <div className={styles.warningContent}>
              <p className={styles.warningTitle}>Existing Data Found</p>
              <p className={styles.warningText}>
                This project has <strong>{stats.totalNodes}</strong> nodes in the graph database.
                Starting a new assessment will <strong>delete all existing data</strong> and
                replace it with fresh scan results.
              </p>
              <div className={styles.stats}>
                {Object.entries(stats.nodesByType).map(([type, count]) => (
                  <span key={type} className={styles.statBadge}>
                    {type}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.ready}>
            <p>No existing data found. Ready to start assessment (Stage 1: Reconnaissance).</p>
            <p className={styles.readyNote}>
              This will scan <strong>{targetDomain}</strong> and populate the graph database
              with discovered subdomains, ports, services, and vulnerabilities.
            </p>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.cancelButton}
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className={styles.spinner} />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span>{hasExistingData ? 'Delete & Start' : 'Start Assessment'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ReconConfirmModal

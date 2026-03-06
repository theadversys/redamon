'use client'

import { useState } from 'react'
import { AlertTriangle, Play, Loader2, Github, CheckCircle2 } from 'lucide-react'
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
  onConfirm: (startStage: number) => void
  projectName: string
  targetDomain: string
  stats: GraphStats | null
  isLoading: boolean
  scanModules?: string[]
  githubTargetOrg?: string
  launchError?: string | null
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
  launchError = null,
}: ReconConfirmModalProps) {
  const [startStage, setStartStage] = useState<1 | 2>(1)
  const hasExistingData = stats && stats.totalNodes > 0
  const hasGithub = scanModules.includes('github')
  const canLaunchStage2 = startStage === 2 && hasExistingData
  const cannotLaunchStage2 = startStage === 2 && !hasExistingData

  const getConfirmButtonLabel = () => {
    if (startStage === 1) return hasExistingData ? 'Delete & Launch' : 'Launch Test'
    return 'Launch from Weaponization'
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Launch Test"
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

        <div className={styles.stageSection}>
          <p className={styles.stageTitle}>Start from</p>
          <div className={styles.stageOptions}>
            <button
              type="button"
              className={`${styles.stageOption} ${startStage === 1 ? styles.stageOptionActive : ''}`}
              onClick={() => setStartStage(1)}
            >
              <span className={styles.stageOptionLabel}>Stage 1: Reconnaissance</span>
              <span className={styles.stageOptionDesc}>
                Full scan (domain discovery, port scan, HTTP probe, resource enum, vuln scan). Clears existing data.
              </span>
            </button>
            <button
              type="button"
              className={`${styles.stageOption} ${startStage === 2 ? styles.stageOptionActive : ''}`}
              onClick={() => setStartStage(2)}
            >
              <span className={styles.stageOptionLabel}>Stage 2: Weaponization</span>
              <span className={styles.stageOptionDesc}>
                Use existing graph data. Fetch attack paths, generate payload, run delivery through actions. No data deleted.
              </span>
            </button>
          </div>
        </div>

        {startStage === 1 && hasExistingData ? (
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
        ) : startStage === 1 && !hasExistingData ? (
          <div className={styles.ready}>
            <p>No existing data found. Ready to run the full Cyber Kill Chain (Stages 1–7).</p>
            <p className={styles.readyNote}>
              Stage 1 will scan <strong>{targetDomain}</strong> and populate the graph.
              Stages 2–7 run weaponization, delivery, exploitation, installation, C2, and actions.
            </p>
          </div>
        ) : canLaunchStage2 ? (
          <div className={styles.ready}>
            <CheckCircle2 size={20} className={styles.readyIcon} />
            <p>Using existing data. No data will be deleted. Attack paths will be ranked from current vulnerabilities.</p>
          </div>
        ) : (
          <div className={styles.warning}>
            <AlertTriangle size={20} className={styles.warningIcon} />
            <div className={styles.warningContent}>
              <p className={styles.warningTitle}>Stage 2 Requires Graph Data</p>
              <p className={styles.warningText}>
                Select Stage 1 to run a scan first. Stage 2 requires existing graph data (vulnerabilities, attack paths).
              </p>
            </div>
          </div>
        )}

        {launchError && (
          <div className={styles.warning}>
            <AlertTriangle size={20} className={styles.warningIcon} />
            <div className={styles.warningContent}>
              <p className={styles.warningTitle}>Launch Failed</p>
              <p className={styles.warningText}>{launchError}</p>
              <p className={styles.warningHint}>
                Ensure the kill chain orchestrator is running (port 8015). See docs/DEPLOYMENT.md or run: <code>./scripts/run-kill-chain-orchestrator.sh</code>
              </p>
            </div>
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
            onClick={() => onConfirm(startStage)}
            disabled={isLoading || cannotLaunchStage2}
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className={styles.spinner} />
                <span>Starting...</span>
              </>
            ) : (
              <>
                <Play size={14} />
                <span>{getConfirmButtonLabel()}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default ReconConfirmModal

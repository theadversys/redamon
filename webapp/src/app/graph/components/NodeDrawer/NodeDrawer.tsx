'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Drawer } from '@/components/ui'
import { GraphNode } from '../../types'
import { getNodeColor } from '../../utils'
import { formatPropertyValue } from '../../utils/formatters'
import { EvidenceDrawer } from '@/app/vulnerabilities/components/EvidenceDrawer'
import { FileText, Key } from 'lucide-react'
import styles from './NodeDrawer.module.css'

interface NodeDrawerProps {
  node: GraphNode | null
  isOpen: boolean
  onClose: () => void
  onDeleteNode?: (nodeId: string) => Promise<void>
  projectId?: string | null
}

export function NodeDrawer({ node, isOpen, onClose, onDeleteNode, projectId }: NodeDrawerProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false)

  const handleViewInSecrets = () => {
    if (!node || !projectId) return
    onClose()
    router.push(`/secrets?project=${projectId}&id=${node.id}`)
  }

  const handleDelete = async () => {
    if (!node || !onDeleteNode) return
    if (!confirm('Delete this Exploit node and all its connections?')) return
    setIsDeleting(true)
    try {
      await onDeleteNode(node.id)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  // Sort properties with created_at and updated_at at the bottom
  const sortedProperties = node
    ? Object.entries(node.properties || {}).sort(([a], [b]) => {
        const bottomKeys = ['created_at', 'updated_at']
        const aIsBottom = bottomKeys.includes(a)
        const bIsBottom = bottomKeys.includes(b)
        if (aIsBottom && !bIsBottom) return 1
        if (!aIsBottom && bIsBottom) return -1
        if (aIsBottom && bIsBottom) return bottomKeys.indexOf(a) - bottomKeys.indexOf(b)
        return 0
      })
    : []

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      position="left"
      mode="push"
      title={node ? `${node.type}: ${node.name}` : undefined}
    >
      {node && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitleBasicInfo}>Basic Info</h3>
              <div className={styles.sectionActions}>
                {node.type === 'Vulnerability' && projectId && (
                  <button
                    type="button"
                    className={styles.viewEvidenceButton}
                    onClick={() => setEvidenceDrawerOpen(true)}
                    title="View evidence"
                  >
                    <FileText size={14} />
                    View Evidence
                  </button>
                )}
                {node.type === 'GitHubSecret' && projectId && (
                  <button
                    type="button"
                    className={styles.viewEvidenceButton}
                    onClick={handleViewInSecrets}
                    title="View in Secrets"
                  >
                    <Key size={14} />
                    View in Secrets
                  </button>
                )}
                {node.type === 'Exploit' && onDeleteNode && (
                  <button
                    className={styles.deleteButton}
                    onClick={handleDelete}
                    disabled={isDeleting}
                    title="Delete exploit node"
                  >
                    {isDeleting ? '...' : '\uD83D\uDDD1'}
                  </button>
                )}
              </div>
            </div>
            <div className={styles.propertyRow}>
              <span className={styles.propertyKey}>Type</span>
              <span
                className={styles.propertyBadge}
                style={{ backgroundColor: getNodeColor(node) }}
              >
                {node.type}
                {(node.type === 'Persistence' || node.type === 'Action') && (
                  <span className={styles.killChainBadge}>
                    {node.type === 'Persistence' ? ' (Stage 5)' : ' (Stage 7)'}
                  </span>
                )}
              </span>
            </div>
            <div className={styles.propertyRow}>
              <span className={styles.propertyKey}>ID</span>
              <span className={styles.propertyValue}>{node.id}</span>
            </div>
            <div className={styles.propertyRow}>
              <span className={styles.propertyKey}>Name</span>
              <span className={styles.propertyValue}>{node.name}</span>
            </div>
          </div>

          <div className={styles.section}>
            <h3 className={styles.sectionTitleProperties}>Properties</h3>
            {sortedProperties.map(([key, value]) => (
              <div key={key} className={styles.propertyRow}>
                <span className={styles.propertyKey}>{key}</span>
                <span className={styles.propertyValue}>
                  {formatPropertyValue(value)}
                </span>
              </div>
            ))}
            {sortedProperties.length === 0 && (
              <p className={styles.emptyProperties}>No additional properties</p>
            )}
          </div>
        </>
      )}

      {node?.type === 'Vulnerability' && projectId && (
        <EvidenceDrawer
          vulnerabilityId={node.id}
          projectId={projectId}
          vulnerabilityName={node.name}
          isOpen={evidenceDrawerOpen}
          onClose={() => setEvidenceDrawerOpen(false)}
        />
      )}
    </Drawer>
  )
}

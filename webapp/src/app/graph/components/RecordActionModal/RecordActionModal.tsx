'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui'
import styles from './RecordActionModal.module.css'

const ACTION_TYPES = [
  'exfil',
  'lateral_movement',
  'objective',
  'privilege_escalation',
  'credential_access',
  'other',
] as const

interface RecordActionModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  userId: string
  sessionId?: number
  onSuccess?: () => void
}

export function RecordActionModal({
  isOpen,
  onClose,
  projectId,
  userId,
  sessionId,
  onSuccess,
}: RecordActionModalProps) {
  const [actionType, setActionType] = useState<string>(ACTION_TYPES[0])
  const [targetIp, setTargetIp] = useState('')
  const [description, setDescription] = useState('')
  const [sessionIdInput, setSessionIdInput] = useState(sessionId?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!targetIp.trim()) {
      setError('Target IP is required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/graph/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userId,
          actionType,
          targetIp: targetIp.trim(),
          description: description.trim() || undefined,
          sessionId: sessionIdInput ? parseInt(sessionIdInput, 10) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed')
        return
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setError(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Record Action on Objectives"
      size="default"
      footer={
        <div className={styles.footer}>
          <button
            type="button"
            className="primaryButton"
            onClick={handleSubmit}
            disabled={loading || !targetIp.trim()}
          >
            {loading ? 'Saving...' : 'Record'}
          </button>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <label>Action Type *</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            className={styles.select}
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>Target IP *</label>
          <input
            type="text"
            value={targetIp}
            onChange={(e) => setTargetIp(e.target.value)}
            placeholder="192.168.1.10"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Session ID (optional)</label>
          <input
            type="text"
            value={sessionIdInput}
            onChange={(e) => setSessionIdInput(e.target.value)}
            placeholder="e.g. 1"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={styles.textarea}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </Modal>
  )
}

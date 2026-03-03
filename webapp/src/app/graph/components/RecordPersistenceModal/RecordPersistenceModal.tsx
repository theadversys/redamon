'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui'
import styles from './RecordPersistenceModal.module.css'

interface RecordPersistenceModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  userId: string
  sessionId?: number
  onSuccess?: () => void
}

export function RecordPersistenceModal({
  isOpen,
  onClose,
  projectId,
  userId,
  sessionId,
  onSuccess,
}: RecordPersistenceModalProps) {
  const [sessionIdInput, setSessionIdInput] = useState(sessionId?.toString() ?? '')
  const [method, setMethod] = useState('')
  const [targetIp, setTargetIp] = useState('')
  const [module, setModule] = useState('')
  const [path, setPath] = useState('')
  const [trigger, setTrigger] = useState('')
  const [report, setReport] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!method.trim() || !targetIp.trim()) {
      setError('Method and target IP are required')
      return
    }
    const sid = sessionId ?? (sessionIdInput ? parseInt(sessionIdInput, 10) : undefined)
    if (sid == null || isNaN(sid)) {
      setError('Session ID is required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/graph/persistence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userId,
          sessionId: sid,
          method: method.trim(),
          targetIp: targetIp.trim(),
          module: module.trim() || undefined,
          path: path.trim() || undefined,
          trigger: trigger.trim() || undefined,
          report: report.trim() || undefined,
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
      title="Record Persistence"
      size="default"
      footer={
        <div className={styles.footer}>
          <button
            type="button"
            className="primaryButton"
            onClick={handleSubmit}
            disabled={loading || !method.trim() || !targetIp.trim()}
          >
            {loading ? 'Saving...' : 'Record'}
          </button>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <label>Session ID *</label>
          <input
            type="text"
            value={sessionIdInput}
            onChange={(e) => setSessionIdInput(e.target.value)}
            placeholder="e.g. 1"
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Method *</label>
          <input
            type="text"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="e.g. registry, scheduled_task"
            className={styles.input}
          />
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
          <label>Module (optional)</label>
          <input
            type="text"
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Path (optional)</label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Trigger (optional)</label>
          <input
            type="text"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label>Report (optional)</label>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={3}
            className={styles.textarea}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </Modal>
  )
}

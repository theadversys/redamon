'use client'

import { useState } from 'react'
import { X, Copy, Download } from 'lucide-react'
import { Modal } from '@/components/ui'
import styles from './PayloadGeneratorModal.module.css'

const PAYLOAD_TYPES = [
  'windows_meterpreter_reverse_tcp',
  'windows_shell_reverse_tcp',
  'linux_meterpreter_reverse_tcp',
  'linux_shell_reverse_tcp',
  'linux_meterpreter_reverse_https',
] as const

interface PayloadGeneratorModalProps {
  isOpen: boolean
  onClose: () => void
}

export function PayloadGeneratorModal({ isOpen, onClose }: PayloadGeneratorModalProps) {
  const [payloadType, setPayloadType] = useState<string>(PAYLOAD_TYPES[0])
  const [lhost, setLhost] = useState('')
  const [lport, setLport] = useState('4444')
  const [format, setFormat] = useState('exe')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ payload?: string; base64?: string; error?: string } | null>(null)

  const handleGenerate = async () => {
    if (!lhost.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/payloads/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payloadType,
          lhost: lhost.trim(),
          lport: lport.trim() || '4444',
          format,
          outputFormat: 'base64',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ error: data.error || data.hint || 'Failed to generate payload' })
        return
      }
      setResult({ payload: data.payload, base64: data.base64 })
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (result?.base64) {
      navigator.clipboard.writeText(result.base64)
    }
  }

  const handleClose = () => {
    setResult(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Generate Payload"
      size="default"
      footer={
        <div className={styles.footer}>
          <button
            type="button"
            className="primaryButton"
            onClick={handleGenerate}
            disabled={loading || !lhost.trim()}
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      }
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <label>Payload Type</label>
          <select
            value={payloadType}
            onChange={(e) => setPayloadType(e.target.value)}
            className={styles.select}
          >
            {PAYLOAD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>LHOST</label>
            <input
              type="text"
              value={lhost}
              onChange={(e) => setLhost(e.target.value)}
              placeholder="192.168.1.100"
              className={styles.input}
            />
          </div>
          <div className={styles.field}>
            <label>LPORT</label>
            <input
              type="text"
              value={lport}
              onChange={(e) => setLport(e.target.value)}
              placeholder="4444"
              className={styles.input}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label>Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} className={styles.select}>
            <option value="exe">exe</option>
            <option value="raw">raw</option>
          </select>
        </div>
        {result?.error && <div className={styles.error}>{result.error}</div>}
        {result?.base64 && (
          <div className={styles.result}>
            <label>Base64 Payload</label>
            <pre className={styles.pre}>{result.base64}</pre>
            <button type="button" className={styles.copyButton} onClick={handleCopy}>
              <Copy size={14} />
              Copy
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

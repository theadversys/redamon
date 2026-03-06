'use client'

import { useState, KeyboardEvent } from 'react'
import { ChevronDown, Crosshair, X, Plus } from 'lucide-react'
import type { Project } from '@prisma/client'
import styles from '../ProjectForm.module.css'

type FormData = Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'user'>

interface ScopeSectionProps {
  data: Partial<FormData>
  updateField: <K extends keyof FormData>(field: K, value: FormData[K]) => void
}

/**
 * ScopeSection — CIDR-range in-scope list, out-of-scope exclusions,
 * and free-text rules-of-engagement notes.
 *
 * Added via: scopeIpRanges, excludedHosts, scopeNotes Prisma fields.
 */
export function ScopeSection({ data, updateField }: ScopeSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [rangeInput, setRangeInput] = useState('')
  const [excludeInput, setExcludeInput] = useState('')

  const ranges = data.scopeIpRanges ?? []
  const excluded = data.excludedHosts ?? []

  // --- CIDR range helpers ---
  const addRange = () => {
    const val = rangeInput.trim()
    if (!val || ranges.includes(val)) return
    updateField('scopeIpRanges', [...ranges, val])
    setRangeInput('')
  }
  const removeRange = (r: string) => updateField('scopeIpRanges', ranges.filter((x) => x !== r))
  const onRangeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addRange() }
  }

  // --- Exclusion helpers ---
  const addExclusion = () => {
    const val = excludeInput.trim()
    if (!val || excluded.includes(val)) return
    updateField('excludedHosts', [...excluded, val])
    setExcludeInput('')
  }
  const removeExclusion = (r: string) =>
    updateField('excludedHosts', excluded.filter((x) => x !== r))
  const onExcludeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addExclusion() }
  }

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setIsOpen((o) => !o)}
      >
        <Crosshair size={16} className={styles.sectionIcon} />
        <span className={styles.sectionTitle}>Scope &amp; Exclusions</span>
        <ChevronDown
          size={14}
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
        />
      </button>

      {isOpen && (
        <div className={styles.sectionBody}>
          {/* ── In-scope IP ranges / CIDR blocks ── */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              In-scope IP ranges &amp; CIDR blocks
            </label>
            <p className={styles.helpText}>
              Restrict automated scanning to these networks. Leave empty to inherit from Target
              Domain. Accepts IPs (10.0.0.1), ranges (10.0.0.1-254), or CIDR (192.168.0.0/24).
            </p>
            <div className={styles.tagInputRow}>
              <input
                type="text"
                className={styles.input}
                placeholder="192.168.1.0/24 or 10.0.0.0/8"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={onRangeKey}
              />
              <button type="button" className={styles.addTagBtn} onClick={addRange}>
                <Plus size={14} /> Add
              </button>
            </div>
            {ranges.length > 0 && (
              <div className={styles.tagList}>
                {ranges.map((r) => (
                  <span key={r} className={`${styles.tag} ${styles.tagScope}`}>
                    {r}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => removeRange(r)}
                      aria-label={`Remove ${r}`}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Excluded hosts ── */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Out-of-scope / Excluded hosts</label>
            <p className={styles.helpText}>
              Hosts or IPs that must never be scanned or targeted, even if they fall within
              in-scope ranges. Accepts hostnames or IPs.
            </p>
            <div className={styles.tagInputRow}>
              <input
                type="text"
                className={styles.input}
                placeholder="prod-db.internal or 10.0.0.5"
                value={excludeInput}
                onChange={(e) => setExcludeInput(e.target.value)}
                onKeyDown={onExcludeKey}
              />
              <button type="button" className={styles.addTagBtn} onClick={addExclusion}>
                <Plus size={14} /> Exclude
              </button>
            </div>
            {excluded.length > 0 && (
              <div className={styles.tagList}>
                {excluded.map((r) => (
                  <span key={r} className={`${styles.tag} ${styles.tagExclude}`}>
                    {r}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => removeExclusion(r)}
                      aria-label={`Remove ${r}`}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Scope notes / Rules of Engagement ── */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Rules of Engagement / Scope Notes</label>
            <p className={styles.helpText}>
              Freeform notes: authorized hours, prohibited techniques, emergency contacts,
              escalation paths, etc.
            </p>
            <textarea
              className={styles.textarea}
              rows={5}
              placeholder={
                '• Testing window: Mon–Fri 21:00–06:00 UTC\n' +
                '• No DoS / destructive payloads\n' +
                '• Emergency contact: security@acme.com / +1-555-0100'
              }
              value={data.scopeNotes ?? ''}
              onChange={(e) => updateField('scopeNotes', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ScopeSection

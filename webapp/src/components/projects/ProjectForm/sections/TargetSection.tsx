'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, Target } from 'lucide-react'
import { Toggle } from '@/components/ui'
import type { Project } from '@prisma/client'
import styles from '../ProjectForm.module.css'

type FormData = Omit<Project, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'user'>

interface TargetSectionProps {
  data: FormData
  updateField: <K extends keyof FormData>(field: K, value: FormData[K]) => void
}

// Helper to convert stored format (with dots) to display format (without dots)
function toDisplayPrefixes(subdomainList: string[]): string {
  return subdomainList
    .filter(s => s !== '.')  // Exclude root domain marker
    .map(s => s.endsWith('.') ? s.slice(0, -1) : s)  // Remove trailing dot
    .join(', ')
}

// Helper to convert display format to stored format (with trailing dots)
function toStoredPrefixes(displayValue: string, includeRoot: boolean): string[] {
  const prefixes = displayValue
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.endsWith('.') ? s : s + '.')  // Add trailing dot if missing

  if (includeRoot) {
    prefixes.push('.')
  }

  return prefixes
}

export function TargetSection({ data, updateField }: TargetSectionProps) {
  const [isOpen, setIsOpen] = useState(true)

  // Check if root domain is included in the list
  const includesRootDomain = useMemo(() => data.subdomainList.includes('.'), [data.subdomainList])

  // Display value without dots
  const displayPrefixes = useMemo(() => toDisplayPrefixes(data.subdomainList), [data.subdomainList])

  const handlePrefixesChange = (value: string) => {
    updateField('subdomainList', toStoredPrefixes(value, includesRootDomain))
  }

  const handleRootDomainToggle = (checked: boolean) => {
    const currentPrefixes = toDisplayPrefixes(data.subdomainList)
    updateField('subdomainList', toStoredPrefixes(currentPrefixes, checked))
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader} onClick={() => setIsOpen(!isOpen)}>
        <h2 className={styles.sectionTitle}>
          <Target size={16} />
          Target Configuration
        </h2>
        <ChevronDown
          size={16}
          className={`${styles.sectionIcon} ${isOpen ? styles.sectionIconOpen : ''}`}
        />
      </div>

      {isOpen && (
        <div className={styles.sectionContent}>
          <p className={styles.sectionDescription}>
            Define the primary target for your security assessment. The target domain serves as the starting point for all reconnaissance activities, from subdomain enumeration to vulnerability scanning.
          </p>
          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label className={`${styles.fieldLabel} ${styles.fieldLabelRequired}`}>
                Project Name
              </label>
              <input
                type="text"
                className="textInput"
                value={data.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="My Security Project"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={`${styles.fieldLabel} ${styles.fieldLabelRequired}`}>
                Target Domain
              </label>
              <input
                type="text"
                className="textInput"
                value={data.targetDomain}
                onChange={(e) => {
                  let value = e.target.value.trim()
                  // Strip http:// or https:// prefix if user enters it
                  if (value.startsWith('http://') || value.startsWith('https://')) {
                    value = value.replace(/^https?:\/\//, '')
                  }
                  // Remove trailing slashes and paths
                  value = value.split('/')[0].split(':')[0]
                  updateField('targetDomain', value)
                }}
                placeholder="example.com"
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Description</label>
            <textarea
              className="textarea"
              value={data.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Project description (optional)"
              rows={2}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Subdomain Prefixes</label>
            <input
              type="text"
              className="textInput"
              value={displayPrefixes}
              onChange={(e) => handlePrefixesChange(e.target.value)}
              placeholder="www, api, admin (comma-separated)"
            />
            <span className={styles.fieldHint}>
              Leave empty to discover all subdomains. Enter prefixes without dots (e.g., "www, api, gpigs").
            </span>
          </div>

          <div className={styles.toggleRow}>
            <div>
              <span className={styles.toggleLabel}>Include Root Domain</span>
              <p className={styles.toggleDescription}>
                Also scan the root domain (e.g., example.com without subdomain)
              </p>
            </div>
            <Toggle
              checked={includesRootDomain}
              onChange={handleRootDomainToggle}
            />
          </div>

          <div className={styles.subSection}>
            <h3 className={styles.subSectionTitle}>Domain Verification</h3>
            <div className={styles.toggleRow}>
              <div>
                <span className={styles.toggleLabel}>Verify Domain Ownership</span>
                <p className={styles.toggleDescription}>
                  Require DNS TXT record verification before scanning
                </p>
              </div>
              <Toggle
                checked={data.verifyDomainOwnership}
                onChange={(checked) => updateField('verifyDomainOwnership', checked)}
              />
            </div>

            {data.verifyDomainOwnership && (
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Ownership Token</label>
                  <input
                    type="text"
                    className="textInput"
                    value={data.ownershipToken}
                    onChange={(e) => updateField('ownershipToken', e.target.value)}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>TXT Record Prefix</label>
                  <input
                    type="text"
                    className="textInput"
                    value={data.ownershipTxtPrefix}
                    onChange={(e) => updateField('ownershipTxtPrefix', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

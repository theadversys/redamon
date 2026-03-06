'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Upload, Link2, Check } from 'lucide-react'
import styles from './new.module.css'

type Platform = 'ANDROID' | 'IOS' | 'WINDOWS'
type TestingType = 'static_analysis' | 'dynamic_analysis' | 'compliance' | 'red_team' | 'owasp_mobile'

interface FormState {
  name: string
  description: string
  platform: Platform
  bundleId: string
  targetMethod: 'upload' | 'url'
  targetUrl: string
  appStoreUrl: string
  uploadedFile: File | null
  testingTypes: TestingType[]
  agentEnabled: boolean
}

const TESTING_TYPES: Array<{ id: TestingType; label: string; description: string; icon: string }> = [
  { id: 'static_analysis', label: 'Static Analysis', description: 'Decompile and analyze app code, secrets, permissions', icon: '🔍' },
  { id: 'dynamic_analysis', label: 'Dynamic Analysis', description: 'Runtime instrumentation with Frida (requires emulator)', icon: '🔬' },
  { id: 'owasp_mobile', label: 'OWASP Mobile Top 10', description: 'Full OWASP Mobile Top 10 (2024) coverage check', icon: '📋' },
  { id: 'compliance', label: 'Compliance Report', description: 'GDPR, PCI-DSS, HIPAA, SOC 2 compliance mapping', icon: '🛡️' },
  { id: 'red_team', label: 'Red Team Simulation', description: 'Active exploit simulation + data exfil testing (HITL approval required)', icon: '🎯' },
]

export default function NewMobileProjectPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [form, setForm] = useState<FormState>({
    name: '', description: '', platform: 'ANDROID', bundleId: '',
    targetMethod: 'upload', targetUrl: '', appStoreUrl: '',
    uploadedFile: null,
    testingTypes: ['static_analysis', 'owasp_mobile', 'compliance'],
    agentEnabled: true,
  })

  const update = (key: keyof FormState, val: any) => setForm((f) => ({ ...f, [key]: val }))

  const toggleTestingType = (t: TestingType) => {
    setForm((f) => ({
      ...f,
      testingTypes: f.testingTypes.includes(t) ? f.testingTypes.filter((x) => x !== t) : [...f.testingTypes, t],
    }))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) update('uploadedFile', file)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) update('uploadedFile', file)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/mobile/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          platform: form.platform,
          bundleId: form.bundleId || null,
          targetUrl: form.targetUrl || null,
          appStoreUrl: form.appStoreUrl || null,
          testingTypes: form.testingTypes,
          agentEnabled: form.agentEnabled,
        }),
      })
      const data = await res.json()
      const projectId = data.project.id

      if (form.uploadedFile) {
        const fd = new FormData()
        fd.append('file', form.uploadedFile)
        fd.append('projectId', projectId)
        await fetch('/api/mobile/upload', { method: 'POST', body: fd })
      }

      router.push(`/mobile/${projectId}`)
    } catch (err) {
      console.error(err)
      setSaving(false)
    }
  }

  const canNext =
    step === 1 ? form.name.trim().length > 0 :
    step === 2 ? true :
    form.testingTypes.length > 0

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => (step === 1 ? router.push('/mobile') : setStep((s) => s - 1))}>
        <ArrowLeft size={16} /> {step === 1 ? 'Mobile Projects' : 'Back'}
      </button>

      <div className={styles.formContainer}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={styles.stepLine} />
          {[1, 2, 3].map((n) => (
            <div key={n} className={`${styles.stepDot} ${n === step ? styles.stepDotActive : n < step ? styles.stepDotDone : ''}`}>
              {n < step ? <Check size={12} /> : n}
            </div>
          ))}
        </div>

        {/* Step 1: App Info */}
        {step === 1 && (
          <div className={styles.formSection}>
            <h2 className={styles.formTitle}>App Information</h2>
            <p className={styles.formDesc}>Tell us about the mobile application you want to test</p>

            <div className={styles.field}>
              <label className={styles.label}>App Name *</label>
              <input className={styles.input} value={form.name} onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. MyBank iOS App" autoFocus />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Platform</label>
              <div className={styles.platformToggle}>
                {(['ANDROID', 'IOS', 'WINDOWS'] as Platform[]).map((p) => (
                  <button key={p}
                    className={`${styles.platformBtn} ${form.platform === p ? styles.platformBtnActive : ''}`}
                    onClick={() => update('platform', p)}>
                    {p === 'ANDROID' ? '🤖 Android' : p === 'IOS' ? '🍎 iOS' : '🪟 Windows'}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Bundle / Package ID</label>
              <input className={styles.input} value={form.bundleId} onChange={(e) => update('bundleId', e.target.value)}
                placeholder={form.platform === 'ANDROID' ? 'com.example.myapp' : 'com.example.myapp'} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Description</label>
              <textarea className={styles.textarea} value={form.description} onChange={(e) => update('description', e.target.value)}
                placeholder="Brief description of the app, scope, and objectives..." rows={3} />
            </div>
          </div>
        )}

        {/* Step 2: Target */}
        {step === 2 && (
          <div className={styles.formSection}>
            <h2 className={styles.formTitle}>App Target</h2>
            <p className={styles.formDesc}>Upload the app binary or provide a store URL</p>

            <div className={styles.targetTabs}>
              <button
                className={`${styles.targetTab} ${form.targetMethod === 'upload' ? styles.targetTabActive : ''}`}
                onClick={() => update('targetMethod', 'upload')}>
                <Upload size={14} /> Upload Binary
              </button>
              <button
                className={`${styles.targetTab} ${form.targetMethod === 'url' ? styles.targetTabActive : ''}`}
                onClick={() => update('targetMethod', 'url')}>
                <Link2 size={14} /> Store URL
              </button>
            </div>

            {form.targetMethod === 'upload' && (
              <div
                className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${form.uploadedFile ? styles.dropZoneHasFile : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('mobileFileInput')?.click()}>
                <input type="file" id="mobileFileInput" accept=".apk,.ipa,.appx,.xapk" onChange={handleFileInput} style={{ display: 'none' }} />
                {form.uploadedFile ? (
                  <div className={styles.fileSelected}>
                    <span className={styles.fileIcon}>📦</span>
                    <div>
                      <div className={styles.fileName}>{form.uploadedFile.name}</div>
                      <div className={styles.fileSize}>{(form.uploadedFile.size / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                    <button className={styles.removeFile} onClick={(e) => { e.stopPropagation(); update('uploadedFile', null) }}>✕</button>
                  </div>
                ) : (
                  <>
                    <Upload size={32} strokeWidth={1} style={{ opacity: 0.5 }} />
                    <p className={styles.dropText}>Drop your APK, IPA, or APPX here</p>
                    <p className={styles.dropSub}>or click to browse • up to 200MB</p>
                    <div className={styles.fileTypes}>
                      <span>.apk</span><span>.ipa</span><span>.appx</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {form.targetMethod === 'url' && (
              <div className={styles.urlInputs}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    {form.platform === 'ANDROID' ? '🤖 Play Store URL' : '🍎 App Store URL'}
                  </label>
                  <input className={styles.input} value={form.appStoreUrl} onChange={(e) => update('appStoreUrl', e.target.value)}
                    placeholder={form.platform === 'ANDROID'
                      ? 'https://play.google.com/store/apps/details?id=com.example.app'
                      : 'https://apps.apple.com/app/myapp/id123456789'} />
                </div>
                <div className={styles.urlNote}>
                  <span>ℹ️</span>
                  <span>The store URL will be used as a reference target. You can still upload the APK/IPA later on the project page for full static analysis.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Testing Config */}
        {step === 3 && (
          <div className={styles.formSection}>
            <h2 className={styles.formTitle}>Testing Configuration</h2>
            <p className={styles.formDesc}>Select the security tests to run against this application</p>

            <div className={styles.testingTypeGrid}>
              {TESTING_TYPES.map((t) => (
                <div key={t.id}
                  className={`${styles.testingTypeCard} ${form.testingTypes.includes(t.id) ? styles.testingTypeCardSelected : ''}`}
                  onClick={() => toggleTestingType(t.id)}>
                  <div className={styles.testingTypeHeader}>
                    <span className={styles.testingTypeIcon}>{t.icon}</span>
                    <span className={styles.testingTypeLabel}>{t.label}</span>
                    <div className={`${styles.checkbox} ${form.testingTypes.includes(t.id) ? styles.checkboxChecked : ''}`}>
                      {form.testingTypes.includes(t.id) && <Check size={10} />}
                    </div>
                  </div>
                  <p className={styles.testingTypeDesc}>{t.description}</p>
                </div>
              ))}
            </div>

            <div className={styles.agentToggle} onClick={() => update('agentEnabled', !form.agentEnabled)}>
              <div>
                <div className={styles.agentToggleLabel}>🤖 Enable Agent Zero Integration</div>
                <div className={styles.agentToggleSub}>Let Agent Zero autonomously execute the mobile kill chain</div>
              </div>
              <div className={`${styles.toggle} ${form.agentEnabled ? styles.toggleOn : ''}`}>
                <div className={styles.toggleKnob} />
              </div>
            </div>
          </div>
        )}

        {/* Form actions */}
        <div className={styles.formActions}>
          {step < 3 ? (
            <button className={styles.btnNext} onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button className={styles.btnCreate} onClick={handleSubmit} disabled={saving || !canNext}>
              {saving ? 'Creating...' : '🚀 Create Project'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

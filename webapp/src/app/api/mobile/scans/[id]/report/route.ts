import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function severityColor(sev: string): string {
  const s = (sev || '').toUpperCase()
  if (s === 'CRITICAL') return '#c084fc'
  if (s === 'HIGH') return '#f87171'
  if (s === 'MEDIUM') return '#fb923c'
  if (s === 'LOW') return '#fbbf24'
  return '#94a3b8'
}

function scoreColor(score: number | null): string {
  if (score == null) return '#94a3b8'
  if (score >= 80) return '#34d399'
  if (score >= 60) return '#fbbf24'
  if (score >= 40) return '#fb923c'
  return '#f87171'
}

function gradeColor(grade: string | null): string {
  if (!grade) return '#94a3b8'
  if (grade === 'A') return '#34d399'
  if (grade === 'B') return '#86efac'
  if (grade === 'C') return '#fbbf24'
  if (grade === 'D') return '#fb923c'
  return '#f87171'
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

function detectStrSecretType(s: string): string {
  const lower = s.toLowerCase()
  if (lower.includes('firebase_database_url') || lower.includes('firebaseio')) return 'FIREBASE DB URL'
  if (lower.includes('google_api_key') || lower.includes('google_crash_reporting')) return 'GOOGLE API KEY'
  if (lower.includes('api_key') || lower.includes('apikey')) return 'API KEY'
  if (lower.includes('crashlytics') || lower.includes('crash_reporting')) return 'CRASHLYTICS KEY'
  if (lower.includes('password') || lower.includes('passwd')) return 'PASSWORD'
  if (lower.includes('token')) return 'TOKEN'
  if (lower.includes('secret')) return 'SECRET KEY'
  if (lower.includes('aws')) return 'AWS'
  if (lower.includes('private_key') || lower.includes('privatekey')) return 'PRIVATE KEY'
  if (lower.includes('database_url') || lower.includes('firebase_url')) return 'FIREBASE URL'
  if (lower.includes('endpoint') || lower.includes('base_url')) return 'ENDPOINT'
  if (lower.includes('client_id')) return 'CLIENT ID'
  if (lower.includes('client_secret')) return 'CLIENT SECRET'
  return 'SECRET'
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scan = await prisma.mobileScan.findUnique({ where: { id } })
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const f = (scan.findings as any) ?? {}
  const sc = (scan.scorecard as any) ?? {}
  const score = scan.score ?? sc.security_score ?? null
  const grade = scan.grade ?? sc.grade ?? null

  // --- Permissions ---
  const dangerousPerms: string[] = []
  const permDetails = f.permissions?.permission_details ?? f.permissions?.dangerous_permissions ?? []
  for (const p of permDetails) {
    if (typeof p === 'string') dangerousPerms.push(p)
    else if (p?.status === 'dangerous') dangerousPerms.push(p.permission || p.name || JSON.stringify(p))
  }

  // --- Secrets ---
  const secrets: any[] = f.secrets ?? f.hardcoded_secrets ?? []

  // --- Trackers ---
  const trackers: any[] = f.trackers?.trackers ?? []
  const trackerCount = f.trackers?.detected_trackers ?? trackers.length

  // --- Domains ---
  const domains = f.domains ?? {}
  const domainEntries = Object.entries(domains) as [string, any][]
  const flaggedDomains = domainEntries.filter(([, v]) => v?.bad_domains)

  // --- APKID ---
  const apkid = f.apkid ?? {}

  // --- Behaviour (dict keyed by rule ID, each value has {files: dict, metadata: {severity, description, label}}) ---
  const behaviourRaw = f.behaviour ?? {}
  const behaviour: any[] = Array.isArray(behaviourRaw)
    ? behaviourRaw
    : Object.entries(behaviourRaw).map(([id, rule]: [string, any]) => ({
        id,
        files: Object.keys(rule.files ?? {}),
        severity: rule.metadata?.severity ?? 'info',
        title: rule.metadata?.description ?? id,
        description: (rule.metadata?.label ?? []).join(', '),
      }))

  // --- AppSec ---
  const appsec = f.appsec ?? {}
  // appsec.high/warning/etc are arrays of objects from MobSF, not numbers
  const toCount = (v: any) => Array.isArray(v) ? v.length : (typeof v === 'number' ? v : 0)

  // --- SBOM — entries are "group:name@version" strings ---
  const sbomRaw: any[] = f.sbom?.sbom_versioned ?? []
  const sbomVersioned = sbomRaw.map((entry: any) => {
    if (typeof entry === 'string') {
      // format: "group:artifact@version" or "name@version"
      const atIdx = entry.lastIndexOf('@')
      const version = atIdx !== -1 ? entry.slice(atIdx + 1) : '—'
      const pkg = atIdx !== -1 ? entry.slice(0, atIdx) : entry
      return { name: pkg, version }
    }
    return { name: entry.name || entry.library || JSON.stringify(entry), version: entry.version || '—' }
  })

  // --- Firebase — objects with {title, severity, description} ---
  const firebaseRaw: any[] = f.firebase_urls ?? []
  const firebaseEntries = firebaseRaw.map((u: any) => {
    if (typeof u === 'string') return { url: u, title: u, severity: 'info' }
    // Extract URL from description: "The app talks to Firebase database at https://..."
    const urlMatch = (u.description ?? '').match(/https?:\/\/[^\s"]+/)
    return { url: urlMatch ? urlMatch[0] : '', title: u.title ?? '', severity: u.severity ?? 'info' }
  })

  // --- Certificate ---
  const certFindings: any[] = f.certificate_analysis?.certificate_findings ?? []

  // --- Code Analysis ---
  const codeFindings: [string, any][] = Object.entries(f.code_analysis?.findings ?? {}).slice(0, 30)

  // --- Manifest Analysis ---
  const manifestFindings: any[] = f.manifest_analysis?.manifest_findings ?? Object.values(f.manifest_analysis?.findings ?? {}).flat() as any[]

  // --- Exported components — may be arrays of names or counts ---
  const toExportedCount = (v: any): number => {
    if (typeof v === 'number') return v
    if (Array.isArray(v)) return v.length
    if (typeof v === 'string') {
      // stringified array like "['com.foo.Bar', ...]"
      try { const p = JSON.parse(v.replace(/'/g, '"')); return Array.isArray(p) ? p.length : 0 } catch { return 0 }
    }
    return 0
  }
  const toExportedList = (v: any): string[] => {
    if (Array.isArray(v)) return v.map(String)
    if (typeof v === 'string' && v.startsWith('[')) {
      try { return JSON.parse(v.replace(/'/g, '"')) } catch { return [] }
    }
    return []
  }
  const exportedActivities = toExportedCount(f.exported_activities)
  const exportedServices   = toExportedCount(f.exported_services)
  const exportedReceivers  = toExportedCount(f.exported_receivers)
  const exportedProviders  = toExportedCount(f.exported_providers)
  const exportedActivityList = toExportedList(f.exported_activities)

  // Severity summary from appsec
  const highCount     = toCount(appsec.high)
  const warningCount  = toCount(appsec.warning)
  const hotspotCount  = toCount(appsec.hotspot)
  const infoCount     = toCount(appsec.info)
  const secureCount   = toCount(appsec.secure)

  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
  const reportedAt = scan.completedAt
    ? new Date(scan.completedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
    : now

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mobile Security Report – ${esc(scan.appName)}</title>
<style>
  :root {
    --bg: #0f1117; --bg2: #161b27; --bg3: #1e2538; --border: #2a3347;
    --text: #e2e8f0; --muted: #94a3b8; --accent: #6366f1;
    --red: #f87171; --orange: #fb923c; --yellow: #fbbf24;
    --green: #34d399; --purple: #c084fc; --blue: #60a5fa;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  a { color: var(--accent); }
  .page { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }

  /* Header */
  .report-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 32px; background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 32px; flex-wrap: wrap; }
  .report-title { flex: 1; min-width: 200px; }
  .report-title h1 { font-size: 26px; font-weight: 700; color: var(--text); }
  .report-title .subtitle { color: var(--muted); font-size: 14px; margin-top: 4px; }
  .report-title .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .meta-chip { font-size: 11px; padding: 3px 10px; border-radius: 20px; border: 1px solid var(--border); background: var(--bg3); color: var(--muted); }
  .score-block { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 100px; }
  .score-num { font-size: 52px; font-weight: 800; line-height: 1; }
  .score-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  .grade-badge { font-size: 28px; font-weight: 800; padding: 2px 18px; border-radius: 8px; background: var(--bg3); }

  /* Risk summary bar */
  .risk-bar { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-bottom: 32px; }
  .risk-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 16px 12px; text-align: center; }
  .risk-card .num { font-size: 28px; font-weight: 700; line-height: 1; }
  .risk-card .lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

  /* Section */
  .section { background: var(--bg2); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
  .section-header { display: flex; align-items: center; gap: 10px; padding: 14px 18px; background: var(--bg3); border-bottom: 1px solid var(--border); }
  .section-header h2 { font-size: 15px; font-weight: 600; }
  .section-header .badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; background: rgba(99,102,241,0.2); color: var(--accent); margin-left: auto; }
  .section-body { padding: 16px 18px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 8px 10px; background: var(--bg3); color: var(--muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 7px 10px; border-top: 1px solid var(--border); vertical-align: top; word-break: break-all; }
  tr:hover td { background: rgba(255,255,255,0.02); }

  /* Severity badges */
  .sev { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
  .sev-CRITICAL { background: rgba(192,132,252,0.2); color: var(--purple); }
  .sev-HIGH     { background: rgba(248,113,113,0.2); color: var(--red); }
  .sev-MEDIUM   { background: rgba(251,146,60,0.2);  color: var(--orange); }
  .sev-LOW      { background: rgba(251,191,36,0.2);  color: var(--yellow); }
  .sev-INFO     { background: rgba(148,163,184,0.12); color: var(--muted); }
  .sev-WARNING  { background: rgba(251,146,60,0.2);  color: var(--orange); }
  .sev-SAFE, .sev-SECURE { background: rgba(52,211,153,0.15); color: var(--green); }

  /* Grid cards */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
  .stat-card { padding: 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; text-align: center; }
  .stat-card .n { font-size: 22px; font-weight: 700; }
  .stat-card .l { font-size: 11px; color: var(--muted); margin-top: 2px; }

  /* Perm / secret list */
  .pill-list { display: flex; flex-wrap: wrap; gap: 5px; }
  .pill { font-size: 11px; padding: 3px 10px; border-radius: 20px; background: rgba(248,113,113,0.12); color: var(--red); border: 1px solid rgba(248,113,113,0.25); }
  .pill-neutral { background: var(--bg3); color: var(--muted); border: 1px solid var(--border); }

  /* Check / cross */
  .pass::before { content: '✓ '; color: var(--green); }
  .fail::before { content: '✗ '; color: var(--red); }
  .warn::before { content: '⚠ '; color: var(--yellow); }

  /* Binary protection grid */
  .prot-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; }
  .prot-item { padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; }
  .prot-pass { background: rgba(52,211,153,0.1); color: var(--green); }
  .prot-fail { background: rgba(248,113,113,0.1); color: var(--red); }

  /* OWASP grid */
  .owasp-grid { display: grid; gap: 4px; }
  .owasp-row { display: grid; grid-template-columns: 40px 1fr auto; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px; font-size: 12px; }
  .owasp-pass { background: rgba(52,211,153,0.07); }
  .owasp-fail { background: rgba(248,113,113,0.07); }
  .owasp-warn { background: rgba(251,146,60,0.07); }
  .owasp-id { font-weight: 700; color: var(--muted); font-size: 11px; }

  /* Behaviour */
  .beh-row { padding: 8px 12px; border-left: 3px solid var(--border); margin-bottom: 4px; border-radius: 0 4px 4px 0; font-size: 12px; }
  .beh-high   { border-color: var(--red);    background: rgba(248,113,113,0.06); }
  .beh-warn   { border-color: var(--orange); background: rgba(251,146,60,0.06); }
  .beh-info   { border-color: var(--border); background: rgba(255,255,255,0.02); }
  .beh-title  { font-weight: 600; color: var(--text); }
  .beh-desc   { color: var(--muted); margin-top: 2px; font-size: 11px; }
  .beh-files  { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
  .beh-file   { font-family: monospace; font-size: 10px; padding: 1px 5px; background: rgba(0,0,0,0.3); border-radius: 3px; color: var(--muted); }

  /* Footer */
  .report-footer { text-align: center; padding: 32px 0 0; color: var(--muted); font-size: 12px; }
  .watermark { color: var(--accent); font-weight: 700; }

  code { font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 3px; }
  pre { font-family: monospace; font-size: 11px; background: var(--bg3); padding: 10px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; color: var(--muted); max-height: 200px; overflow: auto; }

  @media (max-width: 600px) {
    .risk-bar { grid-template-columns: repeat(3,1fr); }
    .prot-grid { grid-template-columns: repeat(2,1fr); }
    .grid-4 { grid-template-columns: repeat(2,1fr); }
  }
  @media print {
    body { background: #fff; color: #000; }
    .section, .risk-card, .stat-card { border: 1px solid #ccc !important; background: #fafafa !important; }
  }
</style>
</head>
<body>
<div class="page">

<!-- ── HEADER ── -->
<div class="report-header">
  <div class="report-title">
    <h1>${esc(scan.appName)}</h1>
    <div class="subtitle">Mobile Security Assessment Report</div>
    <div class="meta">
      <span class="meta-chip">${esc(scan.platform)}</span>
      ${scan.packageName ? `<span class="meta-chip">${esc(scan.packageName)}</span>` : ''}
      ${scan.version ? `<span class="meta-chip">v${esc(scan.version)}</span>` : ''}
      <span class="meta-chip">${esc(scan.fileName)}</span>
      ${scan.fileSize ? `<span class="meta-chip">${formatBytes(scan.fileSize as number)}</span>` : ''}
      <span class="meta-chip">Scan: ${reportedAt}</span>
      <span class="meta-chip">Generated: ${now}</span>
    </div>
  </div>
  <div class="score-block">
    <div class="score-num" style="color:${scoreColor(score)}">${score ?? '—'}</div>
    <div class="score-label">Security Score</div>
    ${grade ? `<div class="grade-badge" style="color:${gradeColor(grade)}">${esc(grade)}</div>` : ''}
  </div>
</div>

<!-- ── RISK SUMMARY BAR ── -->
<div class="risk-bar">
  <div class="risk-card"><div class="num" style="color:var(--red)">${highCount}</div><div class="lbl">High Risk</div></div>
  <div class="risk-card"><div class="num" style="color:var(--orange)">${warningCount}</div><div class="lbl">Warnings</div></div>
  <div class="risk-card"><div class="num" style="color:var(--yellow)">${hotspotCount}</div><div class="lbl">Hotspots</div></div>
  <div class="risk-card"><div class="num" style="color:var(--blue)">${infoCount}</div><div class="lbl">Info</div></div>
  <div class="risk-card"><div class="num" style="color:var(--green)">${secureCount}</div><div class="lbl">Secure</div></div>
</div>

<!-- ── BINARY PROTECTIONS ── -->
<div class="section">
  <div class="section-header"><h2>🛡️ Binary Protections</h2></div>
  <div class="section-body">
    <div class="prot-grid">
      ${[
        { label: 'Obfuscation',       val: f.obfuscation || f.binary_protections?.obfuscated,             wantTrue: true },
        { label: 'Root Detection',    val: f.root_detection || f.binary_protections?.rootDetection,        wantTrue: true },
        { label: 'Emulator Detection',val: f.emulator_detection || f.binary_protections?.emulatorDetection,wantTrue: true },
        { label: 'Anti-Tamper',       val: f.anti_tamper || f.binary_protections?.antiTamper,              wantTrue: true },
        { label: 'Debuggable Build',  val: f.is_debuggable || f.binary_protections?.debuggable,            wantTrue: false },
        { label: 'Backup Enabled',    val: f.allow_backup || f.binary_protections?.backupEnabled,          wantTrue: false },
        { label: 'Certificate Pinning', val: f.certificate_pinning || f.binary_protections?.certificatePinning, wantTrue: true },
        { label: 'Cleartext Traffic', val: f.cleartext_traffic || f.network_security?.clearTextTraffic,    wantTrue: false },
        { label: 'Custom TrustManager',val: f.custom_trust_manager || f.network_security?.customTrustManager, wantTrue: false },
      ].map(({ label, val, wantTrue }) => {
        const isGood = wantTrue ? !!val : !val
        return `<div class="prot-item ${isGood ? 'prot-pass' : 'prot-fail'}">${isGood ? '✓' : '✗'} ${esc(label)}</div>`
      }).join('')}
    </div>
    ${Object.keys(apkid).length > 0 ? `
    <div style="margin-top:14px">
      <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">APKiD Analysis</div>
      ${Object.entries(apkid).map(([dex, a]: [string, any]) => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:6px;font-size:12px">
          <code>${esc(dex)}</code>
          ${a.compiler?.length ? `<div style="margin-top:6px"><span style="color:var(--muted)">Compiler: </span>${esc(a.compiler.join(', '))}</div>` : ''}
          ${a.obfuscator?.length ? `<div><span style="color:var(--muted)">Obfuscator: </span>${esc(a.obfuscator.join(', '))}</div>` : ''}
          ${a.anti_vm?.length ? `<div style="color:var(--red)">⚠ Anti-VM: ${esc(a.anti_vm.join(', '))}</div>` : ''}
          ${a.anti_debug?.length ? `<div style="color:var(--red)">⚠ Anti-Debug: ${esc(a.anti_debug.join(', '))}</div>` : ''}
        </div>`).join('')}
    </div>` : ''}
  </div>
</div>

<!-- ── ATTACK SURFACE ── -->
<div class="section">
  <div class="section-header"><h2>🎯 Attack Surface — Exported Components</h2></div>
  <div class="section-body">
    <div class="grid-4">
      <div class="stat-card"><div class="n" style="color:${exportedActivities > 20 ? 'var(--red)' : exportedActivities > 0 ? 'var(--orange)' : 'var(--green)'}">${exportedActivities}</div><div class="l">Activities</div></div>
      <div class="stat-card"><div class="n" style="color:${exportedServices > 5 ? 'var(--red)' : exportedServices > 0 ? 'var(--orange)' : 'var(--green)'}">${exportedServices}</div><div class="l">Services</div></div>
      <div class="stat-card"><div class="n" style="color:${exportedReceivers > 5 ? 'var(--red)' : exportedReceivers > 0 ? 'var(--orange)' : 'var(--green)'}">${exportedReceivers}</div><div class="l">Receivers</div></div>
      <div class="stat-card"><div class="n" style="color:${exportedProviders > 2 ? 'var(--red)' : exportedProviders > 0 ? 'var(--orange)' : 'var(--green)'}">${exportedProviders}</div><div class="l">Providers</div></div>
    </div>
    ${(exportedActivities + exportedServices + exportedReceivers + exportedProviders) > 0 ? `<p style="font-size:12px;color:var(--orange);margin-top:10px">⚠ Exported components are accessible by other apps on the device and may enable intent hijacking, data theft, or privilege escalation.</p>` : ''}
    ${exportedActivityList.length > 0 ? `
    <div style="margin-top:12px">
      <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Exported Activities</div>
      ${exportedActivityList.map((a: string) => `<div style="font-size:11px;font-family:monospace;padding:3px 0;color:var(--orange);border-top:1px solid var(--border)">${esc(a)}</div>`).join('')}
    </div>` : ''}
  </div>
</div>

<!-- ── HARDCODED SECRETS ── -->
${secrets.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>🔑 Hardcoded Secrets</h2><span class="badge">${secrets.length} found</span></div>
  <div class="section-body">
    <table>
      <tr><th>Type</th><th>File / Location</th><th>Value (redacted)</th></tr>
    ${secrets.slice(0, 50).map((s: any) => {
        const isStr = typeof s === 'string'
        const rawVal: string = isStr ? s : (typeof s.match === 'string' ? s.match : (s.value ?? s.secret ?? ''))
        const redacted = rawVal.length > 8 ? rawVal.substring(0, 4) + '****' + rawVal.slice(-2) : (rawVal.length > 0 ? '****' : '—')
        const type: string = isStr ? detectStrSecretType(s) : (s.type || s.name || 'SECRET')
        const file: string = isStr ? '' : (s.file || s.path || '')
        const line: string = isStr ? '' : (s.line ? ':' + s.line : '')
        const fullVal: string = isStr ? s : rawVal
        return `<tr>
          <td><span class="sev sev-HIGH">${esc(type)}</span></td>
          <td><code>${esc((file ? file + line : fullVal.substring(0, 60)) || '—')}</code></td>
          <td style="font-family:monospace;font-size:11px;color:var(--yellow)">${esc(redacted)}</td>
        </tr>`
      }).join('')}
    </table>
    ${secrets.length > 50 ? `<p style="font-size:11px;color:var(--muted);margin-top:8px">+${secrets.length - 50} more not shown</p>` : ''}
  </div>
</div>` : ''}

<!-- ── DANGEROUS PERMISSIONS ── -->
${dangerousPerms.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>⚠ Dangerous Permissions</h2><span class="badge">${dangerousPerms.length}</span></div>
  <div class="section-body">
    <div class="pill-list">
      ${dangerousPerms.map((p: string) => `<span class="pill">${esc(p.replace('android.permission.',''))}</span>`).join('')}
    </div>
  </div>
</div>` : ''}

<!-- ── PRIVACY TRACKERS ── -->
${trackerCount > 0 ? `
<div class="section">
  <div class="section-header"><h2>👁 Privacy Trackers</h2><span class="badge">${trackerCount} detected</span></div>
  <div class="section-body">
    <table>
      <tr><th>Tracker Name</th><th>Categories</th><th>Reference</th></tr>
      ${trackers.map((t: any) => {
        const cats = Array.isArray(t.categories) ? t.categories : t.categories ? [String(t.categories)] : []
        return `<tr>
          <td style="font-weight:600">${esc(t.name)}</td>
          <td>${cats.map((c: string) => `<span class="pill-neutral" style="display:inline-block;margin:1px 2px">${esc(c)}</span>`).join(' ')}</td>
          <td>${t.url ? `<a href="${esc(t.url)}" target="_blank">Exodus ↗</a>` : '—'}</td>
        </tr>`
      }).join('')}
    </table>
  </div>
</div>` : ''}

<!-- ── NETWORK & DOMAINS ── -->
${domainEntries.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>🌐 Network Domains</h2><span class="badge">${domainEntries.length} domains${flaggedDomains.length > 0 ? ` · ${flaggedDomains.length} flagged` : ''}</span></div>
  <div class="section-body">
    <table>
      <tr><th>Domain</th><th>Country</th><th>Status</th></tr>
      ${domainEntries.slice(0, 60).map(([domain, info]) => `<tr>
        <td><code>${esc(domain)}</code></td>
        <td style="color:var(--muted)">${esc(info?.geolocation?.country_long || '—')}</td>
        <td>${info?.bad_domains ? `<span class="sev sev-HIGH">⚠ Flagged</span>` : `<span style="color:var(--green);font-size:11px">✓ Clean</span>`}</td>
      </tr>`).join('')}
    </table>
    ${domainEntries.length > 60 ? `<p style="font-size:11px;color:var(--muted);margin-top:8px">+${domainEntries.length - 60} more domains</p>` : ''}
  </div>
</div>` : ''}

<!-- ── FIREBASE URLS ── -->
${firebaseEntries.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>🔥 Firebase Endpoints</h2><span class="badge">${firebaseEntries.length}</span></div>
  <div class="section-body">
    <table>
      <tr><th>Finding</th><th>Endpoint</th><th>Severity</th></tr>
      ${firebaseEntries.map((e: any) => `<tr>
        <td>${esc(e.title)}</td>
        <td>${e.url ? `<code>${esc(e.url)}</code>` : '—'}</td>
        <td><span class="sev sev-${(e.severity || 'info').toUpperCase()}">${esc(e.severity || 'info').toUpperCase()}</span></td>
      </tr>`).join('')}
    </table>
  </div>
</div>` : ''}

<!-- ── CERTIFICATE ANALYSIS ── -->
${certFindings.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>🔒 Certificate Analysis</h2></div>
  <div class="section-body">
    <table>
      <tr><th>Severity</th><th>Finding</th></tr>
      ${certFindings.map((cf: any) => {
        const [sev, msg] = Array.isArray(cf) ? cf : [cf.status ?? 'INFO', cf.description ?? JSON.stringify(cf)]
        const sevUpper = String(sev).toUpperCase()
        return `<tr><td><span class="sev sev-${sevUpper}">${esc(sev)}</span></td><td>${esc(msg)}</td></tr>`
      }).join('')}
    </table>
  </div>
</div>` : ''}

<!-- ── BEHAVIOUR ANALYSIS ── -->
${behaviour.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>🔬 Behaviour Analysis</h2><span class="badge">${behaviour.length} rules matched</span></div>
  <div class="section-body">
    ${behaviour.slice(0, 40).map((rule: any) => {
      const sevLower = String(rule.severity ?? '').toLowerCase()
      const cls = sevLower === 'high' ? 'beh-high' : (sevLower === 'warning' || sevLower === 'medium') ? 'beh-warn' : 'beh-info'
      const files: string[] = rule.files ?? []
      return `<div class="beh-row ${cls}">
        <div class="beh-title">${esc(rule.title || rule.label || String(rule.description ?? '').substring(0, 80))}</div>
        ${rule.description && rule.title ? `<div class="beh-desc">${esc(rule.description)}</div>` : ''}
        ${files.length > 0 ? `<div class="beh-files">${files.slice(0,4).map((fn: string) => `<span class="beh-file">${esc(fn)}</span>`).join('')}${files.length > 4 ? `<span class="beh-file">+${files.length-4}</span>` : ''}</div>` : ''}
      </div>`
    }).join('')}
    ${behaviour.length > 40 ? `<p style="font-size:11px;color:var(--muted);margin-top:8px">+${behaviour.length-40} more rules</p>` : ''}
  </div>
</div>` : ''}

<!-- ── CODE ANALYSIS ── -->
${codeFindings.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>💻 Code Analysis</h2><span class="badge">${codeFindings.length} issues</span></div>
  <div class="section-body">
    <table>
      <tr><th>Issue</th><th>Severity</th><th>File(s)</th></tr>
      ${codeFindings.map(([name, detail]) => {
        const sev = String(detail?.level ?? detail?.severity ?? 'INFO').toUpperCase()
        const rawFiles = detail?.files ?? []
        const files: string[] = Array.isArray(rawFiles) ? rawFiles : Object.keys(rawFiles)
        return `<tr>
          <td style="font-weight:500">${esc(name)}</td>
          <td><span class="sev sev-${sev}">${esc(sev)}</span></td>
          <td><code>${esc(files.slice(0,2).join(', ') || '—')}</code></td>
        </tr>`
      }).join('')}
    </table>
  </div>
</div>` : ''}

<!-- ── MANIFEST ANALYSIS ── -->
${manifestFindings.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>📋 Manifest Analysis</h2><span class="badge">${manifestFindings.length} issues</span></div>
  <div class="section-body">
    <table>
      <tr><th>Severity</th><th>Rule</th><th>Description</th></tr>
      ${manifestFindings.slice(0, 30).map((mf: any) => {
        const sev = String(mf?.severity ?? mf?.level ?? 'INFO').toUpperCase()
        const title = mf?.title || mf?.rule || mf?.name || ''
        const desc = mf?.description || mf?.desc || ''
        return `<tr>
          <td><span class="sev sev-${sev}">${esc(sev)}</span></td>
          <td style="font-weight:500;white-space:nowrap">${esc(title)}</td>
          <td style="color:var(--muted)">${esc(desc)}</td>
        </tr>`
      }).join('')}
    </table>
  </div>
</div>` : ''}

<!-- ── SBOM ── -->
${sbomVersioned.length > 0 ? `
<div class="section">
  <div class="section-header"><h2>📦 Software Bill of Materials (SBOM)</h2><span class="badge">${sbomVersioned.length} dependencies</span></div>
  <div class="section-body">
    <table>
      <tr><th>Package</th><th>Version</th><th>Path</th></tr>
      ${sbomVersioned.slice(0, 60).map((dep: any) => `<tr>
        <td style="font-weight:500">${esc(dep.name)}</td>
        <td><code>${esc(dep.version || dep.ver || '—')}</code></td>
        <td style="color:var(--muted)">${esc(dep.path || '—')}</td>
      </tr>`).join('')}
    </table>
    ${sbomVersioned.length > 60 ? `<p style="font-size:11px;color:var(--muted);margin-top:8px">+${sbomVersioned.length-60} more dependencies</p>` : ''}
  </div>
</div>` : ''}

<!-- ── FOOTER ── -->
<div class="report-footer">
  <p>Generated by <span class="watermark">PandaExploit</span> · Mobile Security Platform · ${now}</p>
  <p style="margin-top:4px">This report is confidential and intended for authorized security personnel only.</p>
</div>

</div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="mobile-report-${esc(scan.appName).replace(/[^a-z0-9]/gi,'-')}.html"`,
    },
  })
}

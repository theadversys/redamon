// OWASP Mobile Top 10 (2024) categories
export const OWASP_MOBILE_TOP10 = {
  M1: { id: 'M1', title: 'Improper Credential Usage', description: 'Hardcoded credentials, insecure credential storage, weak password policies' },
  M2: { id: 'M2', title: 'Inadequate Supply Chain Security', description: 'Vulnerable third-party libraries, tampered dependencies, build pipeline risks' },
  M3: { id: 'M3', title: 'Insecure Authentication/Authorization', description: 'Broken auth, missing authorization checks, insecure session management' },
  M4: { id: 'M4', title: 'Insufficient Input/Output Validation', description: 'SQLi, XSS, path traversal, intent injection, format string vulnerabilities' },
  M5: { id: 'M5', title: 'Insecure Communication', description: 'Cleartext traffic, weak TLS config, missing certificate validation, SSL pinning bypass' },
  M6: { id: 'M6', title: 'Inadequate Privacy Controls', description: 'PII exposure, excessive permissions, data leakage to logs/clipboard/third-parties' },
  M7: { id: 'M7', title: 'Insufficient Binary Protections', description: 'Missing obfuscation, debuggable build, anti-tamper absent, reverse engineering trivial' },
  M8: { id: 'M8', title: 'Security Misconfiguration', description: 'Exported components, backup enabled, debug flags, insecure IPC, world-readable files' },
  M9: { id: 'M9', title: 'Insecure Data Storage', description: 'Unencrypted SQLite, world-readable files, sensitive data in SharedPreferences, external storage' },
  M10: { id: 'M10', title: 'Insufficient Cryptography', description: 'Weak algorithms (MD5/SHA1/DES), static keys, ECB mode, poor key management' },
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'

export interface MobileFinding {
  id: string
  owaspCategory: keyof typeof OWASP_MOBILE_TOP10
  title: string
  severity: Severity
  description: string
  evidence?: string
  cveIds?: string[]
  recommendation: string
  references?: string[]
}

export interface ParsedMobileReport {
  appName: string
  packageName: string
  version: string
  platform: 'ANDROID' | 'IOS'
  securityScore: number
  grade: string
  findings: MobileFinding[]
  findingsByCategory: Record<keyof typeof OWASP_MOBILE_TOP10, MobileFinding[]>
  summary: {
    critical: number
    high: number
    medium: number
    low: number
    info: number
    total: number
  }
  permissions: {
    dangerous: string[]
    normal: string[]
    signature: string[]
  }
  networkSecurity: {
    clearTextTraffic: boolean
    certificatePinning: boolean
    customTrustManager: boolean
    weakTlsConfig: boolean
  }
  binaryProtections: {
    obfuscated: boolean
    rootDetection: boolean
    emulatorDetection: boolean
    antiTamper: boolean
    debuggable: boolean
    backupEnabled: boolean
  }
  hardcodedSecrets: Array<{ type: string; value: string; location: string }>
  vulnerableLibraries: Array<{ name: string; version: string; cveIds: string[]; severity: Severity }>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let _findingCounter = 0
function nextId(prefix: string): string {
  return `${prefix}-${++_findingCounter}`
}

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  if (score >= 30) return 'D'
  return 'F'
}

function mobsfSeverityToEnum(s: string): Severity {
  const upper = (s ?? '').toUpperCase()
  if (upper === 'CRITICAL') return 'CRITICAL'
  if (upper === 'HIGH') return 'HIGH'
  if (upper === 'MEDIUM' || upper === 'WARNING') return 'MEDIUM'
  if (upper === 'LOW' || upper === 'INFO') return 'LOW'
  return 'INFO'
}

function recommendationFor(category: keyof typeof OWASP_MOBILE_TOP10, title: string): string {
  const base: Record<keyof typeof OWASP_MOBILE_TOP10, string> = {
    M1: 'Remove hardcoded credentials. Use secure key stores (Android Keystore / iOS Keychain) and externalize secrets via environment variables or secrets management services.',
    M2: 'Upgrade vulnerable third-party libraries to patched versions. Integrate SCA tooling (e.g., Dependabot, OWASP Dependency-Check) into the CI/CD pipeline.',
    M3: 'Implement strong multi-factor authentication, proper session token expiry, and server-side authorization checks on every protected endpoint.',
    M4: 'Sanitize and validate all user-supplied input. Use parameterized queries for SQLite, disable WebView JavaScript unless required, and restrict deep link parameters.',
    M5: 'Enforce TLS 1.2+ with valid certificate chains. Implement certificate pinning and remove any custom TrustManager that accepts all certificates.',
    M6: 'Request only permissions essential to app functionality. Avoid logging sensitive data and ensure analytics SDKs are configured to exclude PII.',
    M7: 'Enable ProGuard/R8 obfuscation, add root and emulator detection, implement anti-tamper checks, and set debuggable=false in production builds.',
    M8: 'Review exported Android components — add permissions to all exported Activities, Services, and Receivers. Set allowBackup=false and remove debug flags.',
    M9: 'Encrypt SQLite databases with SQLCipher. Avoid storing sensitive data in SharedPreferences without encryption or on external storage.',
    M10: 'Replace deprecated algorithms (MD5/SHA1/DES/ECB) with AES-256-GCM or ChaCha20-Poly1305. Use PBKDF2/Argon2 for key derivation with random salts.',
  }
  return base[category] ?? 'Review and remediate the identified security issue following OWASP Mobile Security Testing Guide (MSTG).'
}

// ─── Findings extractors ────────────────────────────────────────────────────

function detectSecretTypeFromString(s: string): string {
  const lower = s.toLowerCase()
  if (lower.includes('firebase')) return 'FIREBASE'
  if (lower.includes('api_key') || lower.includes('apikey')) return 'API KEY'
  if (lower.includes('google_crash') || lower.includes('crashlytics')) return 'CRASHLYTICS'
  if (lower.includes('password') || lower.includes('passwd')) return 'PASSWORD'
  if (lower.includes('token')) return 'TOKEN'
  if (lower.includes('secret')) return 'SECRET KEY'
  if (lower.includes('aws')) return 'AWS'
  if (lower.includes('private_key') || lower.includes('privatekey')) return 'PRIVATE KEY'
  if (lower.includes('url') || lower.includes('endpoint') || lower.includes('database_url')) return 'ENDPOINT'
  return 'SECRET'
}

function extractSecretsFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []
  const secrets: any[] = raw.secrets ?? []
  for (const s of secrets) {
    const isStrSecret = typeof s === 'string'
    const severity: Severity = s.severity ? mobsfSeverityToEnum(s.severity) : 'HIGH'
    const secretVal: string = isStrSecret ? s : (typeof s.match === 'string' ? s.match : (s.value ?? s.secret ?? ''))
    const secretType: string = isStrSecret ? detectSecretTypeFromString(s) : (s.type ?? s.name ?? 'Unknown')
    const secretFile: string = isStrSecret ? '' : (s.file ?? s.filename ?? '')
    const secretLine: string = isStrSecret ? '' : (s.line ? String(s.line) : '')
    findings.push({
      id: nextId('M1'),
      owaspCategory: 'M1',
      title: `Hardcoded Secret: ${secretType}`,
      severity,
      description: `Hardcoded secret detected in source code: ${secretType}.`,
      evidence: secretFile
        ? `${secretFile}:${secretLine} — ${secretVal.substring(0, 200)}`
        : secretVal.substring(0, 200),
      recommendation: recommendationFor('M1', secretType),
      references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m1-improper-credential-usage.html'],
    })
  }
  return findings
}

function extractPermissionFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []
  const dangerous = raw.permissions?.dangerous_permissions ?? {}
  for (const [perm, detail] of Object.entries(dangerous)) {
    const d = detail as any
    findings.push({
      id: nextId('M6'),
      owaspCategory: 'M6',
      title: `Dangerous Permission: ${perm}`,
      severity: 'MEDIUM',
      description: `The app requests dangerous permission ${perm}. ${d.description ?? ''}`,
      evidence: perm,
      recommendation: recommendationFor('M6', perm),
      references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m6-inadequate-privacy-controls.html'],
    })
  }
  return findings
}

function extractNetworkFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []

  // Manifest cleartext
  const manifestFindings: any = raw.manifest_analysis?.findings ?? {}
  for (const [key, val] of Object.entries(manifestFindings)) {
    const v = val as any
    const title = v.title ?? key
    const desc = String(v.description ?? v.stat ?? key)
    if (/usesCleartextTraffic/i.test(desc) || /cleartext/i.test(desc)) {
      findings.push({
        id: nextId('M5'),
        owaspCategory: 'M5',
        title: 'Cleartext Traffic Allowed',
        severity: 'HIGH',
        description: 'The app permits cleartext (unencrypted) HTTP traffic. Sensitive data may be intercepted.',
        evidence: desc.substring(0, 300),
        recommendation: recommendationFor('M5', 'cleartext'),
        references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m5-insecure-communication.html'],
      })
    }
  }

  // network_security findings
  const netFindings: any[] = raw.network_security?.network_findings ?? []
  for (const nf of netFindings) {
    const title = nf.issue ?? nf.title ?? 'Network Security Issue'
    const desc = nf.description ?? nf.stat ?? title
    const isHigh = /cert|trust|hostname|pin/i.test(title)
    findings.push({
      id: nextId('M5'),
      owaspCategory: 'M5',
      title,
      severity: isHigh ? 'HIGH' : 'MEDIUM',
      description: String(desc).substring(0, 500),
      evidence: nf.file ?? nf.location,
      recommendation: recommendationFor('M5', title),
      references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m5-insecure-communication.html'],
    })
  }

  return findings
}

function codeAnalysisCategory(key: string): keyof typeof OWASP_MOBILE_TOP10 | null {
  const k = key.toLowerCase()
  if (/sql|inject/.test(k)) return 'M4'
  if (/crypto|cipher|des\b|md5|sha1|sha-1|ecb/.test(k)) return 'M10'
  if (/webview|javascript|xss/.test(k)) return 'M4'
  if (/storage|external|sharedpref/.test(k)) return 'M9'
  if (/\blog\b|logcat/.test(k)) return 'M6'
  return null
}

function extractCodeAnalysisFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []
  const codeFindings: any = raw.code_analysis?.findings ?? {}
  for (const [key, val] of Object.entries(codeFindings)) {
    const category = codeAnalysisCategory(key)
    if (!category) continue
    const v = val as any
    const severity = mobsfSeverityToEnum(v.level ?? v.severity ?? 'medium')
    findings.push({
      id: nextId(category),
      owaspCategory: category,
      title: v.metadata?.description ?? v.description ?? key,
      severity,
      description: v.metadata?.description ?? v.description ?? key,
      evidence: Array.isArray(v.files)
        ? v.files.slice(0, 3).map((f: any) => `${f.file_path}:${f.match_lines?.[0] ?? ''}`).join(', ')
        : undefined,
      recommendation: recommendationFor(category, key),
      references: v.metadata?.owasp_mobile ? [v.metadata.owasp_mobile] : undefined,
    })
  }
  return findings
}

function extractManifestFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []
  const manifestFindings: any = raw.manifest_analysis?.findings ?? {}

  for (const [key, val] of Object.entries(manifestFindings)) {
    const v = val as any
    const desc = String(v.description ?? v.stat ?? key)
    const title = v.title ?? key

    if (/debuggable.*true/i.test(desc) || /android:debuggable/i.test(desc)) {
      findings.push({
        id: nextId('M7'),
        owaspCategory: 'M7',
        title: 'Debuggable Build',
        severity: 'HIGH',
        description: 'The application is built with android:debuggable=true, exposing it to runtime debugging and reverse engineering.',
        evidence: desc.substring(0, 300),
        recommendation: recommendationFor('M7', 'debuggable'),
        references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m7-insufficient-binary-protections.html'],
      })
    } else if (/allowBackup.*true/i.test(desc) || /android:allowBackup/i.test(desc)) {
      findings.push({
        id: nextId('M8'),
        owaspCategory: 'M8',
        title: 'Backup Enabled',
        severity: 'MEDIUM',
        description: 'android:allowBackup=true enables ADB backup of application data without root access.',
        evidence: desc.substring(0, 300),
        recommendation: recommendationFor('M8', 'backup'),
        references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m8-security-misconfiguration.html'],
      })
    } else if (/exported.*true/i.test(desc) || /exported component/i.test(title)) {
      findings.push({
        id: nextId('M8'),
        owaspCategory: 'M8',
        title: `Exported Component: ${title}`,
        severity: 'HIGH',
        description: `An Android component is exported without requiring permissions: ${desc.substring(0, 200)}`,
        evidence: desc.substring(0, 300),
        recommendation: recommendationFor('M8', 'exported'),
        references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m8-security-misconfiguration.html'],
      })
    }
  }
  return findings
}

function extractBinaryFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []
  const props: any = raw.binary_analysis?.properties ?? {}

  const noObfuscation = /false|no|absent/i.test(String(props['Obfuscation'] ?? props['obfuscation'] ?? 'false'))
  if (noObfuscation) {
    findings.push({
      id: nextId('M7'),
      owaspCategory: 'M7',
      title: 'Missing Code Obfuscation',
      severity: 'MEDIUM',
      description: 'The binary was built without obfuscation (ProGuard/R8 not enabled), making reverse engineering trivial.',
      recommendation: recommendationFor('M7', 'obfuscation'),
      references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m7-insufficient-binary-protections.html'],
    })
  }

  const noRootDetect = /false|no|absent/i.test(String(props['Root Detection'] ?? props['root_detection'] ?? 'false'))
  if (noRootDetect) {
    findings.push({
      id: nextId('M7'),
      owaspCategory: 'M7',
      title: 'No Root Detection',
      severity: 'LOW',
      description: 'The app does not implement root detection, allowing execution on compromised devices.',
      recommendation: recommendationFor('M7', 'root'),
      references: ['https://owasp.org/www-project-mobile-top-10/2024-risks/m7-insufficient-binary-protections.html'],
    })
  }

  return findings
}

function extractLibraryFindings(raw: any): MobileFinding[] {
  const findings: MobileFinding[] = []
  const libs: any[] = raw.libraries ?? raw.sbom ?? []

  for (const lib of libs) {
    const cves: string[] = lib.cve_ids ?? lib.cves ?? []
    if (cves.length === 0) continue
    const severity = mobsfSeverityToEnum(lib.severity ?? 'medium')
    findings.push({
      id: nextId('M2'),
      owaspCategory: 'M2',
      title: `Vulnerable Library: ${lib.name ?? lib.library}@${lib.version ?? 'unknown'}`,
      severity,
      description: `Third-party library ${lib.name ?? lib.library} version ${lib.version ?? 'unknown'} has known CVEs: ${cves.join(', ')}.`,
      evidence: `${lib.name ?? lib.library}:${lib.version ?? 'unknown'}`,
      cveIds: cves,
      recommendation: recommendationFor('M2', lib.name ?? ''),
      references: cves.map((c: string) => `https://nvd.nist.gov/vuln/detail/${c}`),
    })
  }
  return findings
}

// ─── Binary protections reader ──────────────────────────────────────────────

function parseBinaryProtections(raw: any, manifestFindings: any): ParsedMobileReport['binaryProtections'] {
  const props: any = raw.binary_analysis?.properties ?? {}

  const hasFlag = (keys: string[]): boolean =>
    keys.some(k => /true|yes|present/i.test(String(props[k] ?? '')))

  const isDebuggable = Object.values(manifestFindings as any).some((v: any) =>
    /debuggable.*true/i.test(String(v?.description ?? v?.stat ?? ''))
  )
  const backupEnabled = Object.values(manifestFindings as any).some((v: any) =>
    /allowBackup.*true/i.test(String(v?.description ?? v?.stat ?? ''))
  )

  return {
    obfuscated: hasFlag(['Obfuscation', 'obfuscation']),
    rootDetection: hasFlag(['Root Detection', 'root_detection']),
    emulatorDetection: hasFlag(['Anti Emulator', 'anti_emulator', 'Emulator Detection']),
    antiTamper: hasFlag(['Anti Tamper', 'anti_tamper', 'Tamper Detection']),
    debuggable: isDebuggable,
    backupEnabled,
  }
}

function parseNetworkSecurity(raw: any, findings: MobileFinding[]): ParsedMobileReport['networkSecurity'] {
  const hasCleartext = findings.some(f => f.owaspCategory === 'M5' && /cleartext/i.test(f.title))
  const hasCustomTrustManager = !!raw.code_analysis?.findings &&
    Object.keys(raw.code_analysis.findings).some(k => /TrustAllManager|AllowAllHostnames/i.test(k))
  const certPinning = !!raw.binary_analysis?.properties?.['Certificate Pinning'] ||
    /true|yes|present/i.test(String(raw.binary_analysis?.properties?.['Certificate Pinning'] ?? ''))
  const weakTls = findings.some(f => f.owaspCategory === 'M5' && /tls|ssl|protocol/i.test(f.title))

  return {
    clearTextTraffic: hasCleartext,
    certificatePinning: certPinning,
    customTrustManager: hasCustomTrustManager,
    weakTlsConfig: weakTls,
  }
}

function parsePermissions(raw: any): ParsedMobileReport['permissions'] {
  const dangerous = Object.keys(raw.permissions?.dangerous_permissions ?? {})
  const normal = Object.keys(raw.permissions?.normal_permissions ?? {})
  const signature = Object.keys(raw.permissions?.signature_permissions ?? {})
  return { dangerous, normal, signature }
}

function parseHardcodedSecrets(raw: any): ParsedMobileReport['hardcodedSecrets'] {
  return (raw.secrets ?? []).map((s: any) => {
    const isStr = typeof s === 'string'
    const val = isStr ? s : (typeof s.match === 'string' ? s.match : (s.value ?? s.secret ?? ''))
    return {
      type: isStr ? detectSecretTypeFromString(s) : (s.type ?? s.name ?? 'Unknown'),
      value: String(val).substring(0, 100),
      location: isStr ? '' : (s.file ?? s.filename ?? 'Unknown'),
    }
  })
}

function parseVulnerableLibraries(raw: any): ParsedMobileReport['vulnerableLibraries'] {
  return (raw.libraries ?? raw.sbom ?? [])
    .filter((l: any) => (l.cve_ids ?? l.cves ?? []).length > 0)
    .map((l: any) => ({
      name: l.name ?? l.library ?? 'Unknown',
      version: l.version ?? 'unknown',
      cveIds: l.cve_ids ?? l.cves ?? [],
      severity: mobsfSeverityToEnum(l.severity ?? 'medium'),
    }))
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseMobSFReport(raw: any, platform: 'ANDROID' | 'IOS' = 'ANDROID'): ParsedMobileReport {
  _findingCounter = 0 // reset per parse

  // Collect all findings
  const allFindings: MobileFinding[] = [
    ...extractSecretsFindings(raw),
    ...extractPermissionFindings(raw),
    ...extractNetworkFindings(raw),
    ...extractCodeAnalysisFindings(raw),
    ...extractManifestFindings(raw),
    ...extractBinaryFindings(raw),
    ...extractLibraryFindings(raw),
  ]

  // Build summary counts
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: allFindings.length }
  for (const f of allFindings) {
    switch (f.severity) {
      case 'CRITICAL': summary.critical++; break
      case 'HIGH':     summary.high++;     break
      case 'MEDIUM':   summary.medium++;   break
      case 'LOW':      summary.low++;      break
      case 'INFO':     summary.info++;     break
    }
  }

  // Score calculation
  let securityScore: number
  const rawScore = raw.appsec?.security_score ?? null
  if (rawScore !== null && typeof rawScore === 'number') {
    securityScore = Math.max(0, Math.min(100, rawScore))
  } else {
    securityScore = Math.max(0, 100 - (summary.critical * 20 + summary.high * 10 + summary.medium * 5 + summary.low * 1))
  }

  const grade = raw.appsec?.grade ?? scoreToGrade(securityScore)

  // Findings by category
  const findingsByCategory = {} as Record<keyof typeof OWASP_MOBILE_TOP10, MobileFinding[]>
  for (const cat of Object.keys(OWASP_MOBILE_TOP10) as Array<keyof typeof OWASP_MOBILE_TOP10>) {
    findingsByCategory[cat] = allFindings.filter(f => f.owaspCategory === cat)
  }

  const manifestFindings = raw.manifest_analysis?.findings ?? {}

  return {
    appName:     raw.app_name     ?? raw.title ?? 'Unknown App',
    packageName: raw.package_name ?? raw.identifier ?? '',
    version:     raw.version_name ?? raw.version ?? '',
    platform,
    securityScore,
    grade,
    findings: allFindings,
    findingsByCategory,
    summary,
    permissions:       parsePermissions(raw),
    networkSecurity:   parseNetworkSecurity(raw, allFindings),
    binaryProtections: parseBinaryProtections(raw, manifestFindings),
    hardcodedSecrets:  parseHardcodedSecrets(raw),
    vulnerableLibraries: parseVulnerableLibraries(raw),
  }
}

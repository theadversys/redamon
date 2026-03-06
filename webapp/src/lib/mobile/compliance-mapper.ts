import type { ParsedMobileReport, MobileFinding, Severity } from './report-parser'

export type ComplianceFramework = 'OWASP_MOBILE' | 'GDPR' | 'PCI_DSS' | 'HIPAA' | 'SOC2'

export interface ControlResult {
  controlId: string
  controlName: string
  status: 'PASS' | 'FAIL' | 'PARTIAL' | 'N/A'
  findingIds: string[]
  evidence: string
}

export interface FrameworkResult {
  framework: ComplianceFramework
  score: number           // 0-100 % of controls passed
  status: 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL'
  controls: ControlResult[]
  summary: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isHighPlus(severity: Severity): boolean {
  return severity === 'CRITICAL' || severity === 'HIGH'
}

function findingsFor(report: ParsedMobileReport, category: keyof ParsedMobileReport['findingsByCategory']): MobileFinding[] {
  return report.findingsByCategory[category] ?? []
}

function anyHighPlus(findings: MobileFinding[]): boolean {
  return findings.some(f => isHighPlus(f.severity))
}

function scoreFramework(controls: ControlResult[]): number {
  const applicable = controls.filter(c => c.status !== 'N/A')
  if (applicable.length === 0) return 100
  const passed = applicable.filter(c => c.status === 'PASS').length
  const partial = applicable.filter(c => c.status === 'PARTIAL').length
  return Math.round(((passed + partial * 0.5) / applicable.length) * 100)
}

function frameworkStatus(score: number): 'COMPLIANT' | 'NON_COMPLIANT' | 'PARTIAL' {
  if (score >= 70) return 'COMPLIANT'
  if (score >= 40) return 'PARTIAL'
  return 'NON_COMPLIANT'
}

function ids(findings: MobileFinding[]): string[] {
  return findings.map(f => f.id)
}

// ─── GDPR ────────────────────────────────────────────────────────────────────

function gdprControls(report: ParsedMobileReport): ControlResult[] {
  const m9 = findingsFor(report, 'M9')
  const m10 = findingsFor(report, 'M10')
  const m5 = findingsFor(report, 'M5')
  const m1 = findingsFor(report, 'M1')
  const m6 = findingsFor(report, 'M6')
  const m8 = findingsFor(report, 'M8')

  const gdpr32aFail = (m9.length > 0 && anyHighPlus(m9)) || (m10.length > 0 && anyHighPlus(m10))
  const gdpr32bFail = report.networkSecurity.clearTextTraffic || m1.some(f => isHighPlus(f.severity))
  const gdpr32cFail = report.binaryProtections.backupEnabled && m9.length > 0
  const gdpr6Fail   = m6.filter(f => /permission/i.test(f.title)).length > 2
  const gdpr25Fail  = m6.length > 0 || m9.length > 0

  return [
    {
      controlId: 'GDPR-32a',
      controlName: 'Pseudonymisation & Encryption',
      status: gdpr32aFail ? 'FAIL' : 'PASS',
      findingIds: [...ids(m9), ...ids(m10)],
      evidence: gdpr32aFail
        ? `${m9.length} insecure storage + ${m10.length} cryptography finding(s) at HIGH+ severity`
        : 'No high-severity storage or cryptography issues detected',
    },
    {
      controlId: 'GDPR-32b',
      controlName: 'Confidentiality & Integrity',
      status: gdpr32bFail ? 'FAIL' : 'PASS',
      findingIds: [...ids(m5), ...ids(m1)],
      evidence: gdpr32bFail
        ? `Cleartext traffic: ${report.networkSecurity.clearTextTraffic}, hardcoded credentials: ${m1.length}`
        : 'Communication appears encrypted and no hardcoded credentials found',
    },
    {
      controlId: 'GDPR-32c',
      controlName: 'Availability & Resilience',
      status: gdpr32cFail ? 'FAIL' : report.binaryProtections.backupEnabled ? 'PARTIAL' : 'PASS',
      findingIds: ids(m8.filter(f => /backup/i.test(f.title))),
      evidence: `Backup enabled: ${report.binaryProtections.backupEnabled}`,
    },
    {
      controlId: 'GDPR-32d',
      controlName: 'Regular Testing',
      status: report.securityScore < 70 ? 'FAIL' : 'PASS',
      findingIds: [],
      evidence: `Security score ${report.securityScore}/100 — ${report.securityScore >= 70 ? 'adequate' : 'inadequate security testing coverage'}`,
    },
    {
      controlId: 'GDPR-6',
      controlName: 'Data Minimisation',
      status: gdpr6Fail ? 'FAIL' : report.permissions.dangerous.length > 0 ? 'PARTIAL' : 'PASS',
      findingIds: ids(m6),
      evidence: `${report.permissions.dangerous.length} dangerous permission(s) requested`,
    },
    {
      controlId: 'GDPR-25',
      controlName: 'Privacy by Design',
      status: gdpr25Fail ? 'FAIL' : 'PASS',
      findingIds: [...ids(m6), ...ids(m9)],
      evidence: gdpr25Fail
        ? `${m6.length} privacy findings + ${m9.length} insecure storage findings`
        : 'No privacy-related issues detected',
    },
  ]
}

// ─── PCI-DSS ─────────────────────────────────────────────────────────────────

function pciControls(report: ParsedMobileReport): ControlResult[] {
  const m1 = findingsFor(report, 'M1')
  const m3 = findingsFor(report, 'M3')
  const m4 = findingsFor(report, 'M4')
  const m5 = findingsFor(report, 'M5')
  const m9 = findingsFor(report, 'M9')
  const hasCriticalOrHigh = report.findings.some(f => isHighPlus(f.severity))

  return [
    {
      controlId: 'PCI-6.3',
      controlName: 'Identify Security Vulnerabilities',
      status: hasCriticalOrHigh ? 'FAIL' : 'PASS',
      findingIds: ids(report.findings.filter(f => isHighPlus(f.severity))),
      evidence: `${report.summary.critical} critical + ${report.summary.high} high severity findings`,
    },
    {
      controlId: 'PCI-6.4',
      controlName: 'Public-facing Web/Mobile Security',
      status: m4.length > 0 ? 'FAIL' : 'PASS',
      findingIds: ids(m4),
      evidence: m4.length > 0
        ? `${m4.length} injection/input validation finding(s) detected`
        : 'No injection vulnerabilities detected',
    },
    {
      controlId: 'PCI-8.2',
      controlName: 'User Authentication',
      status: m3.length > 0 ? (anyHighPlus(m3) ? 'FAIL' : 'PARTIAL') : 'PASS',
      findingIds: ids(m3),
      evidence: `${m3.length} authentication/authorization finding(s)`,
    },
    {
      controlId: 'PCI-8.3',
      controlName: 'Strong Authentication',
      status: m1.some(f => isHighPlus(f.severity)) ? 'FAIL' : m1.length > 0 ? 'PARTIAL' : 'PASS',
      findingIds: ids(m1),
      evidence: `${m1.length} hardcoded credential finding(s)`,
    },
    {
      controlId: 'PCI-4.2',
      controlName: 'Encrypt Transmission',
      status: report.networkSecurity.clearTextTraffic ? 'FAIL' : 'PASS',
      findingIds: ids(m5),
      evidence: `Cleartext traffic: ${report.networkSecurity.clearTextTraffic}`,
    },
    {
      controlId: 'PCI-3.5',
      controlName: 'Protect Stored Data',
      status: m9.length > 0 ? (anyHighPlus(m9) ? 'FAIL' : 'PARTIAL') : 'PASS',
      findingIds: ids(m9),
      evidence: `${m9.length} insecure data storage finding(s)`,
    },
    {
      controlId: 'PCI-11.3',
      controlName: 'Penetration Testing',
      status: report.securityScore < 60 ? 'FAIL' : 'PASS',
      findingIds: [],
      evidence: `Security score ${report.securityScore}/100`,
    },
  ]
}

// ─── HIPAA ────────────────────────────────────────────────────────────────────

function hipaaControls(report: ParsedMobileReport): ControlResult[] {
  const m1 = findingsFor(report, 'M1')
  const m3 = findingsFor(report, 'M3')
  const m5 = findingsFor(report, 'M5')
  const m6 = findingsFor(report, 'M6')
  const m10 = findingsFor(report, 'M10')

  return [
    {
      controlId: 'HIPAA-312a1',
      controlName: 'Access Control',
      status: m3.filter(f => isHighPlus(f.severity)).length > 0 ? 'FAIL' : m3.length > 0 ? 'PARTIAL' : 'PASS',
      findingIds: ids(m3),
      evidence: `${m3.length} authentication/authorization finding(s)`,
    },
    {
      controlId: 'HIPAA-312a2',
      controlName: 'Emergency Access',
      status: 'N/A',
      findingIds: [],
      evidence: 'Not applicable to mobile app static analysis',
    },
    {
      controlId: 'HIPAA-312b',
      controlName: 'Audit Controls',
      status: m6.some(f => /log/i.test(f.title)) ? 'FAIL' : 'PASS',
      findingIds: ids(m6.filter(f => /log/i.test(f.title))),
      evidence: `Sensitive data detected in logs: ${m6.filter(f => /log/i.test(f.title)).length} finding(s)`,
    },
    {
      controlId: 'HIPAA-312c',
      controlName: 'Integrity',
      status: m10.length > 0 ? (anyHighPlus(m10) ? 'FAIL' : 'PARTIAL') : 'PASS',
      findingIds: ids(m10),
      evidence: `${m10.length} cryptography finding(s)`,
    },
    {
      controlId: 'HIPAA-312d',
      controlName: 'Authentication',
      status: m1.some(f => isHighPlus(f.severity)) ? 'FAIL' : m1.length > 0 ? 'PARTIAL' : 'PASS',
      findingIds: ids(m1),
      evidence: `${m1.length} credential management finding(s)`,
    },
    {
      controlId: 'HIPAA-312e1',
      controlName: 'Transmission Security',
      status: report.networkSecurity.clearTextTraffic || anyHighPlus(m5) ? 'FAIL' : m5.length > 0 ? 'PARTIAL' : 'PASS',
      findingIds: ids(m5),
      evidence: `${m5.length} insecure communication finding(s), cleartext: ${report.networkSecurity.clearTextTraffic}`,
    },
  ]
}

// ─── SOC 2 ────────────────────────────────────────────────────────────────────

function soc2Controls(report: ParsedMobileReport): ControlResult[] {
  const m2 = findingsFor(report, 'M2')
  const m3 = findingsFor(report, 'M3')
  const m5 = findingsFor(report, 'M5')
  const m7 = findingsFor(report, 'M7')
  const m8 = findingsFor(report, 'M8')
  const criticalLibs = m2.filter(f => f.severity === 'CRITICAL')

  return [
    {
      controlId: 'CC6.1',
      controlName: 'Logical Access Controls',
      status: m3.length > 0 ? (anyHighPlus(m3) ? 'FAIL' : 'PARTIAL') : 'PASS',
      findingIds: ids(m3),
      evidence: `${m3.length} logical access/authentication finding(s)`,
    },
    {
      controlId: 'CC6.3',
      controlName: 'Access Revocation',
      status: m3.some(f => /session/i.test(f.title)) ? 'FAIL' : 'PASS',
      findingIds: ids(m3.filter(f => /session/i.test(f.title))),
      evidence: `${m3.filter(f => /session/i.test(f.title)).length} session management issue(s)`,
    },
    {
      controlId: 'CC6.6',
      controlName: 'Logical Access Boundaries',
      status: m8.some(f => /export/i.test(f.title)) ? (anyHighPlus(m8.filter(f => /export/i.test(f.title))) ? 'FAIL' : 'PARTIAL') : 'PASS',
      findingIds: ids(m8.filter(f => /export/i.test(f.title))),
      evidence: `${m8.filter(f => /export/i.test(f.title)).length} exported component issue(s)`,
    },
    {
      controlId: 'CC6.7',
      controlName: 'Transmission Integrity',
      status: m5.length > 0 ? (anyHighPlus(m5) ? 'FAIL' : 'PARTIAL') : 'PASS',
      findingIds: ids(m5),
      evidence: `${m5.length} insecure communication finding(s)`,
    },
    {
      controlId: 'CC6.8',
      controlName: 'Malicious Software Prevention',
      status: criticalLibs.length > 0 ? 'FAIL' : m2.length > 0 ? 'PARTIAL' : 'PASS',
      findingIds: ids(m2),
      evidence: `${m2.length} vulnerable library finding(s), ${criticalLibs.length} critical CVEs`,
    },
    {
      controlId: 'CC7.1',
      controlName: 'Detect Anomalies',
      status: (!report.binaryProtections.antiTamper && !report.binaryProtections.rootDetection)
        ? 'FAIL'
        : (!report.binaryProtections.antiTamper || !report.binaryProtections.rootDetection) ? 'PARTIAL' : 'PASS',
      findingIds: ids(m7),
      evidence: `Anti-tamper: ${report.binaryProtections.antiTamper}, root detection: ${report.binaryProtections.rootDetection}`,
    },
    {
      controlId: 'CC9.1',
      controlName: 'Risk Mitigation',
      status: report.securityScore < 70 ? 'FAIL' : 'PASS',
      findingIds: [],
      evidence: `Overall security score: ${report.securityScore}/100`,
    },
  ]
}

// ─── OWASP Mobile framework result ───────────────────────────────────────────

function owaspMobileResult(report: ParsedMobileReport): FrameworkResult {
  const categories = Object.keys(report.findingsByCategory) as Array<keyof typeof report.findingsByCategory>
  const controls: ControlResult[] = categories.map(cat => {
    const findings = report.findingsByCategory[cat]
    return {
      controlId: cat,
      controlName: cat,
      status: findings.length === 0 ? 'PASS' : anyHighPlus(findings) ? 'FAIL' : 'PARTIAL',
      findingIds: ids(findings),
      evidence: `${findings.length} finding(s)`,
    }
  })
  const score = scoreFramework(controls)
  return {
    framework: 'OWASP_MOBILE',
    score,
    status: frameworkStatus(score),
    controls,
    summary: `OWASP Mobile Top 10 (2024): Security score ${report.securityScore}/100 (${report.grade}). ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium findings across ${report.summary.total} total.`,
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateComplianceReport(parsedReport: ParsedMobileReport): Record<ComplianceFramework, FrameworkResult> {
  const gdpr    = gdprControls(parsedReport)
  const pci     = pciControls(parsedReport)
  const hipaa   = hipaaControls(parsedReport)
  const soc2    = soc2Controls(parsedReport)

  const gdprScore  = scoreFramework(gdpr)
  const pciScore   = scoreFramework(pci)
  const hipaaScore = scoreFramework(hipaa)
  const soc2Score  = scoreFramework(soc2)

  return {
    OWASP_MOBILE: owaspMobileResult(parsedReport),

    GDPR: {
      framework: 'GDPR',
      score: gdprScore,
      status: frameworkStatus(gdprScore),
      controls: gdpr,
      summary: `GDPR Article 32 assessment: ${gdprScore}% controls passing. ${
        gdprScore >= 70
          ? 'App demonstrates adequate technical security measures under GDPR Art.32.'
          : 'Critical improvements needed for GDPR compliance — insecure data handling detected.'
      }`,
    },

    PCI_DSS: {
      framework: 'PCI_DSS',
      score: pciScore,
      status: frameworkStatus(pciScore),
      controls: pci,
      summary: `PCI-DSS v4.0 assessment: ${pciScore}% controls passing. ${
        pciScore >= 70
          ? 'Cardholder data security requirements mostly met.'
          : 'PCI-DSS non-compliant — insecure data transmission or storage detected.'
      }`,
    },

    HIPAA: {
      framework: 'HIPAA',
      score: hipaaScore,
      status: frameworkStatus(hipaaScore),
      controls: hipaa,
      summary: `HIPAA §164.312 assessment: ${hipaaScore}% controls passing. ${
        hipaaScore >= 70
          ? 'ePHI security safeguards appear adequate.'
          : 'HIPAA non-compliant — ePHI may be at risk due to insecure storage or transmission.'
      }`,
    },

    SOC2: {
      framework: 'SOC2',
      score: soc2Score,
      status: frameworkStatus(soc2Score),
      controls: soc2,
      summary: `SOC 2 CC6-CC9 assessment: ${soc2Score}% controls passing. ${
        soc2Score >= 70
          ? 'System security controls largely adequate.'
          : 'SOC 2 gaps identified — logical access and transmission controls need improvement.'
      }`,
    },
  }
}

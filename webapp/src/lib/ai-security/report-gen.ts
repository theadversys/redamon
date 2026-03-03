/**
 * Report generation for AI security scans.
 * Produces JSON, HTML, and downloadable reports for auditors.
 */

import { riskLabel, remediationSla } from './risk-scoring'
import {
  generateScorecard,
  type ComplianceFramework,
  type ComplianceScorecard,
} from './compliance-mapper'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReportScan {
  id: string
  name: string
  targetUrl: string
  targetType: string
  profile: string
  purpose?: string | null
  status: string
  totalTests: number | null
  passedTests: number | null
  failedTests: number | null
  systemRiskScore: number | null
  riskBreakdown: unknown
  plugins: unknown
  strategies: unknown
  createdAt: Date | string
  completedAt: Date | string | null
}

export interface ReportFinding {
  id: string
  plugin: string
  strategy: string | null
  severity: string
  category: string
  prompt: string
  response: string
  assertion: string | null
  riskScore: number | null
}

export interface FullReport {
  meta: {
    generatedAt: string
    scanId: string
    scanName: string
    targetUrl: string
    profile: string
    format: string
  }
  executive: {
    systemRiskScore: number
    riskLabel: string
    remediationSla: string
    totalTests: number
    passedTests: number
    failedTests: number
    passRate: number
    findingsCount: number
    severityBreakdown: Record<string, number>
  }
  compliance: ComplianceScorecard[]
  findings: ReportFinding[]
  topVulnerabilities: Array<{
    plugin: string
    count: number
    severity: string
    riskScore: number
  }>
  recommendations: string[]
}

// ── Report Builder ──────────────────────────────────────────────────────────

export function buildReport(
  scan: ReportScan,
  findings: ReportFinding[],
  frameworks: ComplianceFramework[] = ['owasp', 'nist', 'eu-ai-act'],
): FullReport {
  const totalTests = scan.totalTests ?? 0
  const passedTests = scan.passedTests ?? 0
  const failedTests = scan.failedTests ?? 0
  const systemScore = scan.systemRiskScore ?? 0
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0

  const severityBreakdown: Record<string, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  }
  for (const f of findings) {
    const sev = f.severity in severityBreakdown ? f.severity : 'info'
    severityBreakdown[sev]++
  }

  const pluginsUsed = Array.isArray(scan.plugins) ? (scan.plugins as string[]) : []
  const stats = { totalTests, passedTests, failedTests }
  const findingInputs = findings.map(f => ({
    plugin: f.plugin, severity: f.severity, strategy: f.strategy,
  }))

  const compliance = frameworks.map(fw =>
    generateScorecard(fw, findingInputs, stats, pluginsUsed)
  )

  const pluginCounts = new Map<string, { count: number; severity: string; riskScore: number }>()
  for (const f of findings) {
    const existing = pluginCounts.get(f.plugin)
    if (existing) {
      existing.count++
    } else {
      pluginCounts.set(f.plugin, { count: 1, severity: f.severity, riskScore: f.riskScore ?? 0 })
    }
  }
  const topVulnerabilities = Array.from(pluginCounts.entries())
    .map(([plugin, data]) => ({ plugin, ...data }))
    .sort((a, b) => b.riskScore - a.riskScore || b.count - a.count)
    .slice(0, 10)

  const recommendations = generateRecommendations(severityBreakdown, systemScore, compliance, topVulnerabilities)

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      scanId: scan.id,
      scanName: scan.name,
      targetUrl: scan.targetUrl,
      profile: scan.profile,
      format: 'json',
    },
    executive: {
      systemRiskScore: systemScore,
      riskLabel: riskLabel(systemScore),
      remediationSla: remediationSla(systemScore),
      totalTests,
      passedTests,
      failedTests,
      passRate,
      findingsCount: findings.length,
      severityBreakdown,
    },
    compliance,
    findings,
    topVulnerabilities,
    recommendations,
  }
}

// ── Recommendations Engine ──────────────────────────────────────────────────

function generateRecommendations(
  severities: Record<string, number>,
  systemScore: number,
  compliance: ComplianceScorecard[],
  topVulns: Array<{ plugin: string; severity: string }>,
): string[] {
  const recs: string[] = []

  if (systemScore >= 9.0) {
    recs.push('CRITICAL: System risk score is 9.0+. Immediate remediation required within 24-48 hours. Consider taking the target offline until vulnerabilities are addressed.')
  } else if (systemScore >= 7.0) {
    recs.push('HIGH: System risk score is 7.0+. Prioritize remediation within 1-2 weeks. Establish an incident response plan.')
  }

  if (severities.critical > 0) {
    recs.push(`Found ${severities.critical} critical vulnerabilities. These require immediate attention and should be the top priority for your security team.`)
  }

  const injectionPlugins = ['system-prompt-override', 'indirect-prompt-injection', 'sql-injection', 'shell-injection']
  const hasInjection = topVulns.some(v => injectionPlugins.includes(v.plugin))
  if (hasInjection) {
    recs.push('Prompt injection vulnerabilities detected. Implement input validation, output filtering, and consider using a guardrail layer between user input and the LLM.')
  }

  const piiPlugins = ['pii:direct', 'pii:api-db', 'pii:session', 'pii:social']
  const hasPii = topVulns.some(v => piiPlugins.includes(v.plugin))
  if (hasPii) {
    recs.push('PII disclosure risks found. Review system prompts for inadvertent data exposure, implement output scanning for PII patterns, and verify data access controls.')
  }

  const hasExcessiveAgency = topVulns.some(v => v.plugin === 'excessive-agency')
  if (hasExcessiveAgency) {
    recs.push('Excessive agency detected. Restrict the LLM\'s tool access, implement confirmation steps for sensitive actions, and establish clear boundaries in the system prompt.')
  }

  for (const scorecard of compliance) {
    if (scorecard.failedControls > 0) {
      recs.push(`${scorecard.frameworkLabel}: ${scorecard.failedControls} control(s) failed. Review the compliance scorecard for specific gaps and remediation guidance.`)
    }
    if (scorecard.notTestedControls > 0) {
      recs.push(`${scorecard.frameworkLabel}: ${scorecard.notTestedControls} control(s) not tested. Consider expanding your scan to cover all framework requirements.`)
    }
  }

  if (recs.length === 0) {
    recs.push('No significant vulnerabilities detected in this scan. Continue regular scanning to maintain security posture.')
  }

  return recs
}

// ── HTML Report Generation ──────────────────────────────────────────────────

export function buildHtmlReport(report: FullReport): string {
  const scoreColor = report.executive.systemRiskScore >= 9.0 ? '#dc2626'
    : report.executive.systemRiskScore >= 7.0 ? '#ea580c'
    : report.executive.systemRiskScore >= 4.0 ? '#d97706'
    : '#16a34a'

  const controlsHtml = report.compliance.map(sc => {
    const rows = sc.controls.map(c => {
      const statusColor = c.status === 'pass' ? '#16a34a'
        : c.status === 'fail' ? '#dc2626'
        : c.status === 'partial' ? '#d97706'
        : '#6b7280'
      return `<tr>
        <td>${c.control.id}</td>
        <td>${c.control.name}</td>
        <td style="color:${statusColor};font-weight:600">${c.status.toUpperCase()}</td>
        <td>${c.findingCount}</td>
      </tr>`
    }).join('')

    return `<div class="section">
      <h2>${sc.frameworkLabel}</h2>
      <p>Overall Compliance: <strong>${sc.overallScore}%</strong> | Passed: ${sc.passedControls} | Failed: ${sc.failedControls} | Not Tested: ${sc.notTestedControls}</p>
      <table><thead><tr><th>Control</th><th>Name</th><th>Status</th><th>Findings</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`
  }).join('')

  const findingsRows = report.findings.slice(0, 100).map(f => {
    const sevColor = f.severity === 'critical' ? '#dc2626'
      : f.severity === 'high' ? '#ea580c'
      : f.severity === 'medium' ? '#d97706'
      : '#16a34a'
    return `<tr>
      <td style="color:${sevColor};font-weight:600">${f.severity.toUpperCase()}</td>
      <td>${f.plugin}</td>
      <td>${f.strategy || '—'}</td>
      <td>${f.riskScore?.toFixed(1) ?? '—'}</td>
      <td><details><summary>View</summary><pre>${escapeHtml(f.prompt.slice(0, 500))}</pre></details></td>
    </tr>`
  }).join('')

  const recsHtml = report.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Security Report — ${escapeHtml(report.meta.scanName)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0a;color:#e5e5e5;padding:2rem}
  .container{max-width:1100px;margin:0 auto}
  h1{font-size:1.75rem;margin-bottom:.5rem;color:#fff}
  h2{font-size:1.25rem;margin-bottom:.75rem;color:#a3e635;border-bottom:1px solid #333;padding-bottom:.5rem}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:2px solid #333}
  .score-badge{font-size:2.5rem;font-weight:800;padding:.5rem 1.5rem;border-radius:.5rem;border:2px solid}
  .meta{color:#888;font-size:.85rem;margin-top:.5rem}
  .section{background:#111;border:1px solid #222;border-radius:.5rem;padding:1.25rem;margin-bottom:1.5rem}
  table{width:100%;border-collapse:collapse;margin-top:.75rem}
  th,td{padding:.5rem .75rem;text-align:left;border-bottom:1px solid #222;font-size:.85rem}
  th{color:#a3e635;font-weight:600}
  .exec-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin:1rem 0}
  .exec-card{background:#1a1a1a;padding:1rem;border-radius:.375rem;text-align:center}
  .exec-card .value{font-size:1.5rem;font-weight:700;color:#fff}
  .exec-card .label{font-size:.75rem;color:#888;margin-top:.25rem}
  pre{background:#1a1a1a;padding:.75rem;border-radius:.25rem;overflow-x:auto;font-size:.75rem;max-height:200px}
  details summary{cursor:pointer;color:#60a5fa;font-size:.8rem}
  ul{padding-left:1.5rem}li{margin-bottom:.5rem;font-size:.9rem}
  .footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #333;color:#666;font-size:.75rem;text-align:center}
  @media print{
    body{background:#fff;color:#111;padding:0}
    .section{break-inside:avoid;page-break-inside:avoid}
    .exec-grid{break-inside:avoid}
    table{break-inside:auto}
    tr{break-inside:avoid;page-break-inside:avoid}
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>AI Security Assessment Report</h1>
      <div class="meta">Scan: ${escapeHtml(report.meta.scanName)} | Target: ${escapeHtml(report.meta.targetUrl)} | Profile: ${report.meta.profile}</div>
      <div class="meta">Generated: ${report.meta.generatedAt}</div>
    </div>
    <div class="score-badge" style="color:${scoreColor};border-color:${scoreColor}">
      ${report.executive.systemRiskScore.toFixed(1)}
    </div>
  </div>

  <div class="section">
    <h2>Executive Summary</h2>
    <div class="exec-grid">
      <div class="exec-card"><div class="value" style="color:${scoreColor}">${report.executive.riskLabel}</div><div class="label">Risk Level</div></div>
      <div class="exec-card"><div class="value">${report.executive.totalTests}</div><div class="label">Total Tests</div></div>
      <div class="exec-card"><div class="value">${report.executive.passRate}%</div><div class="label">Pass Rate</div></div>
      <div class="exec-card"><div class="value">${report.executive.findingsCount}</div><div class="label">Findings</div></div>
      <div class="exec-card"><div class="value" style="color:#dc2626">${report.executive.severityBreakdown.critical}</div><div class="label">Critical</div></div>
      <div class="exec-card"><div class="value" style="color:#ea580c">${report.executive.severityBreakdown.high}</div><div class="label">High</div></div>
      <div class="exec-card"><div class="value" style="color:#d97706">${report.executive.severityBreakdown.medium}</div><div class="label">Medium</div></div>
      <div class="exec-card"><div class="value" style="color:#16a34a">${report.executive.severityBreakdown.low}</div><div class="label">Low</div></div>
    </div>
    <p style="margin-top:1rem;font-size:.9rem">Remediation SLA: <strong>${report.executive.remediationSla}</strong></p>
  </div>

  ${controlsHtml}

  <div class="section">
    <h2>Recommendations</h2>
    <ul>${recsHtml}</ul>
  </div>

  <div class="section">
    <h2>Findings (${report.findings.length})</h2>
    <table>
      <thead><tr><th>Severity</th><th>Plugin</th><th>Strategy</th><th>Risk</th><th>Prompt</th></tr></thead>
      <tbody>${findingsRows}</tbody>
    </table>
    ${report.findings.length > 100 ? `<p style="color:#888;margin-top:.5rem;font-size:.8rem">${report.findings.length - 100} additional findings omitted. See JSON export for full data.</p>` : ''}
  </div>

  <div class="footer">
    <p>Generated by PandaExploit AI Security Platform &bull; Powered by Promptfoo</p>
  </div>
</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

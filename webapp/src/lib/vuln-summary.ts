/**
 * Synthesize a human-readable AI summary for vulnerability ticket creation.
 */

export interface VulnForSummary {
  name: string
  description?: string
  category?: string
  severity?: string
  solution?: string
  attackTechniques?: Array<{ id: string; name: string; tactic: string }>
}

export function synthesizeAISummary(
  vuln: VulnForSummary,
  evidenceHighlights: string[],
  instanceCount: number
): { what: string; why: string; fix: string; howExploited?: string; howToVerify?: string } {
  const category = vuln.category || ''
  const cwe = category.includes('cwe') ? category : ''
  const owasp = category.includes('a') ? `OWASP A03:2021` : ''
  const mitre = vuln.attackTechniques?.[0]?.name || ''
  const desc = vuln.description || vuln.name
  const severity = vuln.severity?.toLowerCase() || 'info'

  const parts: string[] = []
  if (desc) parts.push(desc.slice(0, 150))
  if (cwe) parts.push(`CWE: ${cwe}`)
  if (owasp) parts.push(owasp)
  if (mitre) parts.push(`MITRE: ${mitre}`)
  const what = parts.length ? parts.join('. ') : vuln.name
  const truncated = what.length > 220 ? what.slice(0, 220) + '…' : what

  const preconditions =
    instanceCount > 1 ? `Affects ${instanceCount} endpoint(s). ` : ''
  const impactMap: Record<string, string> = {
    critical: 'Worst-case: full system compromise, data exfiltration, or RCE.',
    high: 'Worst-case: significant data exposure or privilege escalation.',
    medium: 'Worst-case: limited data exposure or denial of service.',
    low: 'Worst-case: information disclosure or minor misconfiguration.',
    info: 'Informational finding; may aid reconnaissance.',
  }
  const why = preconditions + (impactMap[severity] || impactMap.info)

  const sol = vuln.solution || ''
  const fix = sol
    ? sol.slice(0, 280) + (sol.length > 280 ? '…' : '')
    : 'Apply secure coding practices: validate input, use parameterized queries, and follow least-privilege. Implement WAF rules if immediate code fix is unavailable.'

  const howExploited =
    evidenceHighlights.length > 0
      ? evidenceHighlights.slice(0, 2).join(' | ')
      : category.includes('sqli')
        ? 'Send crafted payload to vulnerable parameter; observe response for SQL injection indicators.'
        : category.includes('xss')
          ? 'Inject script payload in user-controlled input; verify execution in browser.'
          : category.includes('rce')
            ? 'Send malicious payload to vulnerable endpoint; observe command execution.'
            : 'Reproduce using scanner payload or manual request to affected endpoint.'

  const howToVerify =
    'Apply the fix, retest the affected endpoint(s) with the same payload, and confirm the vulnerability no longer reproduces. Run a full regression scan if applicable.'

  return { what: truncated, why, fix, howExploited, howToVerify }
}

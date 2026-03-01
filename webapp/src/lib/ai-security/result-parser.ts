/**
 * Parses PromptFoo redteam output.json and classifies findings by severity.
 */
import fs from 'fs/promises'
import { getSeverityForPlugin } from './catalog'

export interface ParsedFinding {
  plugin: string
  strategy: string | null
  severity: string
  category: string
  prompt: string
  response: string
  assertion: string | null
  rawResult: Record<string, unknown>
}

export interface ParsedOutput {
  totalTests: number
  passedTests: number
  failedTests: number
  findings: ParsedFinding[]
}

export async function parseOutput(outputPath: string): Promise<ParsedOutput> {
  const raw = await fs.readFile(outputPath, 'utf-8')
  const data = JSON.parse(raw)

  const results = data.results?.results || data.results || []
  let passed = 0
  let failed = 0
  const findings: ParsedFinding[] = []

  for (const r of results) {
    const success = r.success ?? (r.score === 1)
    if (success) {
      passed++
      continue
    }
    failed++

    const pluginId = extractPluginId(r)
    const strategyId = extractStrategyId(r)

    findings.push({
      plugin: pluginId,
      strategy: strategyId,
      severity: getSeverityForPlugin(pluginId),
      category: mapToOwasp(pluginId),
      prompt: r.vars?.prompt || r.prompt?.raw || r.prompt || '',
      response: typeof r.response === 'string'
        ? r.response
        : r.response?.output || JSON.stringify(r.response || ''),
      assertion: extractFailedAssertion(r),
      rawResult: r,
    })
  }

  return {
    totalTests: results.length,
    passedTests: passed,
    failedTests: failed,
    findings,
  }
}

function extractPluginId(result: Record<string, unknown>): string {
  const metadata = result.metadata as Record<string, unknown> | undefined
  if (metadata?.pluginId) return String(metadata.pluginId)

  const gradingResult = result.gradingResult as Record<string, unknown> | undefined
  const components = gradingResult?.componentResults as Array<Record<string, unknown>> | undefined
  if (components?.length) {
    for (const c of components) {
      if (c.assertion && typeof c.assertion === 'object') {
        const a = c.assertion as Record<string, unknown>
        if (a.metric) return String(a.metric)
      }
    }
  }

  const vars = result.vars as Record<string, unknown> | undefined
  if (vars?.prompt && typeof vars.prompt === 'string') {
    const match = vars.prompt.match(/Execute plugin: (.+)/)
    if (match) return match[1]
  }

  return 'unknown'
}

function extractStrategyId(result: Record<string, unknown>): string | null {
  const metadata = result.metadata as Record<string, unknown> | undefined
  if (metadata?.strategyId) return String(metadata.strategyId)
  return null
}

function extractFailedAssertion(result: Record<string, unknown>): string | null {
  const gradingResult = result.gradingResult as Record<string, unknown> | undefined
  if (!gradingResult) return null

  const components = gradingResult.componentResults as Array<Record<string, unknown>> | undefined
  if (!components) return gradingResult.reason ? String(gradingResult.reason) : null

  const failed = components.filter(c => !c.pass)
  if (failed.length === 0) return null

  return failed.map(c => {
    const assertion = c.assertion as Record<string, unknown> | undefined
    return assertion?.value || c.reason || 'assertion failed'
  }).join('; ')
}

const OWASP_MAP: Record<string, string> = {
  'prompt-injection': 'LLM01: Prompt Injection',
  'indirect-prompt-injection': 'LLM01: Prompt Injection',
  'system-prompt-override': 'LLM01: Prompt Injection',
  'data-exfil': 'LLM01: Prompt Injection',
  'pii:direct': 'LLM06: Sensitive Information Disclosure',
  'pii:api-db': 'LLM06: Sensitive Information Disclosure',
  'pii:session': 'LLM06: Sensitive Information Disclosure',
  'pii:social': 'LLM06: Sensitive Information Disclosure',
  'prompt-extraction': 'LLM06: Sensitive Information Disclosure',
  'cross-session-leak': 'LLM06: Sensitive Information Disclosure',
  'bola': 'LLM02: Insecure Output Handling',
  'bfla': 'LLM02: Insecure Output Handling',
  'rbac': 'LLM02: Insecure Output Handling',
  'ssrf': 'LLM02: Insecure Output Handling',
  'sql-injection': 'LLM02: Insecure Output Handling',
  'shell-injection': 'LLM02: Insecure Output Handling',
  'hallucination': 'LLM03: Training Data Poisoning',
  'overreliance': 'LLM09: Overreliance',
  'excessive-agency': 'LLM08: Excessive Agency',
  'hijacking': 'LLM08: Excessive Agency',
  'tool-discovery': 'LLM08: Excessive Agency',
  'mcp': 'LLM08: Excessive Agency',
  'rag-poisoning': 'LLM03: Training Data Poisoning',
  'rag-document-exfiltration': 'LLM06: Sensitive Information Disclosure',
  'harmful:cybercrime': 'LLM05: Supply Chain Vulnerabilities',
  'debug-access': 'LLM07: Insecure Plugin Design',
}

function mapToOwasp(pluginId: string): string {
  return OWASP_MAP[pluginId] || 'LLM10: Model Denial of Service'
}

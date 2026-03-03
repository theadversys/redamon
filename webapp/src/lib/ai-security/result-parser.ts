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

// ---------------------------------------------------------------------------
// OWASP LLM Top 10 Mapping — comprehensive coverage of all Promptfoo plugins
// Reference: https://owasp.org/www-project-top-10-for-large-language-model-applications/
// ---------------------------------------------------------------------------

const OWASP_MAP: Record<string, string> = {
  // LLM01: Prompt Injection
  'prompt-injection': 'LLM01: Prompt Injection',
  'indirect-prompt-injection': 'LLM01: Prompt Injection',
  'system-prompt-override': 'LLM01: Prompt Injection',
  'data-exfil': 'LLM01: Prompt Injection',
  'ascii-smuggling': 'LLM01: Prompt Injection',
  'special-token-injection': 'LLM01: Prompt Injection',
  'cca': 'LLM01: Prompt Injection',
  'agentic:memory-poisoning': 'LLM01: Prompt Injection',

  // LLM02: Insecure Output Handling
  'bola': 'LLM02: Insecure Output Handling',
  'bfla': 'LLM02: Insecure Output Handling',
  'rbac': 'LLM02: Insecure Output Handling',
  'ssrf': 'LLM02: Insecure Output Handling',
  'sql-injection': 'LLM02: Insecure Output Handling',
  'shell-injection': 'LLM02: Insecure Output Handling',
  'harmful:cybercrime:malicious-code': 'LLM02: Insecure Output Handling',

  // LLM03: Training Data Poisoning
  'hallucination': 'LLM03: Training Data Poisoning',
  'rag-poisoning': 'LLM03: Training Data Poisoning',
  'harmful:misinformation-disinformation': 'LLM03: Training Data Poisoning',
  'unverifiable-claims': 'LLM03: Training Data Poisoning',

  // LLM04: Model Denial of Service
  'reasoning-dos': 'LLM04: Model Denial of Service',

  // LLM05: Supply Chain Vulnerabilities
  'harmful:cybercrime': 'LLM05: Supply Chain Vulnerabilities',
  'harmful:copyright-violations': 'LLM05: Supply Chain Vulnerabilities',
  'harmful:intellectual-property': 'LLM05: Supply Chain Vulnerabilities',

  // LLM06: Sensitive Information Disclosure
  'pii:direct': 'LLM06: Sensitive Information Disclosure',
  'pii:api-db': 'LLM06: Sensitive Information Disclosure',
  'pii:session': 'LLM06: Sensitive Information Disclosure',
  'pii:social': 'LLM06: Sensitive Information Disclosure',
  'prompt-extraction': 'LLM06: Sensitive Information Disclosure',
  'cross-session-leak': 'LLM06: Sensitive Information Disclosure',
  'rag-document-exfiltration': 'LLM06: Sensitive Information Disclosure',
  'model-identification': 'LLM06: Sensitive Information Disclosure',
  'divergent-repetition': 'LLM06: Sensitive Information Disclosure',
  'rag-source-attribution': 'LLM06: Sensitive Information Disclosure',
  'harmful:privacy': 'LLM06: Sensitive Information Disclosure',
  'coppa': 'LLM06: Sensitive Information Disclosure',
  'ferpa': 'LLM06: Sensitive Information Disclosure',
  'financial:confidential-disclosure': 'LLM06: Sensitive Information Disclosure',
  'financial:data-leakage': 'LLM06: Sensitive Information Disclosure',
  'insurance:phi-disclosure': 'LLM06: Sensitive Information Disclosure',
  'telecom:cpni-disclosure': 'LLM06: Sensitive Information Disclosure',
  'telecom:location-disclosure': 'LLM06: Sensitive Information Disclosure',

  // LLM07: Insecure Plugin Design
  'debug-access': 'LLM07: Insecure Plugin Design',
  'mcp': 'LLM07: Insecure Plugin Design',

  // LLM08: Excessive Agency
  'excessive-agency': 'LLM08: Excessive Agency',
  'hijacking': 'LLM08: Excessive Agency',
  'tool-discovery': 'LLM08: Excessive Agency',
  'contracts': 'LLM08: Excessive Agency',
  'goal-misalignment': 'LLM08: Excessive Agency',
  'off-topic': 'LLM08: Excessive Agency',

  // LLM09: Overreliance
  'overreliance': 'LLM09: Overreliance',
  'imitation': 'LLM09: Overreliance',
  'politics': 'LLM09: Overreliance',
  'competitors': 'LLM09: Overreliance',

  // LLM10: Model Theft (used as catch-all for harmful content)

  // --- Criminal Activity ---
  'harmful:violent-crime': 'Criminal: Violent Crime',
  'harmful:illegal-activities': 'Criminal: Illegal Activities',
  'harmful:illegal-drugs': 'Criminal: Illegal Drugs',
  'harmful:illegal-drugs:meth': 'Criminal: Illegal Drugs',
  'harmful:child-exploitation': 'Criminal: Child Exploitation',
  'harmful:sex-crime': 'Criminal: Sex Crimes',
  'harmful:non-violent-crime': 'Criminal: Non-Violent Crime',
  'harmful:chemical-biological-weapons': 'Criminal: WMD',
  'harmful:indiscriminate-weapons': 'Criminal: Weapons',
  'harmful:weapons:ied': 'Criminal: Weapons',

  // --- Harmful Content ---
  'harmful:hate': 'Harmful: Hate Speech',
  'harmful:self-harm': 'Harmful: Self Harm',
  'harmful:sexual-content': 'Harmful: Sexual Content',
  'harmful:graphic-content': 'Harmful: Graphic Content',
  'harmful:harassment-bullying': 'Harmful: Harassment',
  'harmful:insults': 'Harmful: Insults',
  'harmful:profanity': 'Harmful: Profanity',
  'harmful:radicalization': 'Harmful: Radicalization',
  'harmful:unsafe-practices': 'Harmful: Unsafe Practices',
  'harmful:specialized-advice': 'Harmful: Specialized Advice',
  'wordplay': 'Harmful: Profanity',

  // --- Bias ---
  'bias:age': 'Bias: Age Discrimination',
  'bias:gender': 'Bias: Gender Discrimination',
  'bias:race': 'Bias: Racial Discrimination',
  'bias:disability': 'Bias: Disability Discrimination',
  'religion': 'Bias: Religious Sensitivity',

  // --- Financial Services ---
  'financial:counterfactual': 'Financial: Misinformation',
  'financial:defamation': 'Financial: Defamation',
  'financial:hallucination': 'Financial: Hallucination',
  'financial:sycophancy': 'Financial: Sycophancy',
  'financial:calculation-error': 'Financial: Calculation Error',
  'financial:compliance-violation': 'Financial: Compliance Violation',
  'financial:impartiality': 'Financial: Impartiality',
  'financial:misconduct': 'Financial: Misconduct',
  'financial:sox-compliance': 'Financial: SOX Compliance',

  // --- Medical ---
  'medical:anchoring-bias': 'Medical: Anchoring Bias',
  'medical:hallucination': 'Medical: Hallucination',
  'medical:incorrect-knowledge': 'Medical: Incorrect Knowledge',
  'medical:off-label-use': 'Medical: Off-Label Use',
  'medical:prioritization-error': 'Medical: Prioritization Error',
  'medical:sycophancy': 'Medical: Sycophancy',

  // --- Pharmacy ---
  'pharmacy:controlled-substance-compliance': 'Pharmacy: Controlled Substance',
  'pharmacy:dosage-calculation': 'Pharmacy: Dosage Calculation',
  'pharmacy:drug-interaction': 'Pharmacy: Drug Interaction',

  // --- Insurance ---
  'insurance:coverage-discrimination': 'Insurance: Coverage Discrimination',
  'insurance:network-misinformation': 'Insurance: Network Misinformation',

  // --- Telecommunications ---
  'telecom:tcpa-violation': 'Telecom: TCPA Violation',
  'telecom:billing-misinformation': 'Telecom: Billing Misinformation',
  'telecom:coverage-misinformation': 'Telecom: Coverage Misinformation',
  'telecom:unauthorized-changes': 'Telecom: Unauthorized Changes',
  'telecom:porting-misinformation': 'Telecom: Porting Misinformation',
  'telecom:law-enforcement-request-handling': 'Telecom: Law Enforcement',
  'telecom:accessibility-violation': 'Telecom: Accessibility Violation',
  'telecom:account-takeover': 'Telecom: Account Takeover',
  'telecom:fraud-enablement': 'Telecom: Fraud Enablement',
  'telecom:e911-misinformation': 'Telecom: E911 Misinformation',

  // --- Real Estate ---
  'realestate:fair-housing-discrimination': 'Real Estate: Fair Housing',
  'realestate:steering': 'Real Estate: Steering',
  'realestate:lending-discrimination': 'Real Estate: Lending Discrimination',
  'realestate:discriminatory-listings': 'Real Estate: Discriminatory Listings',
  'realestate:advertising-discrimination': 'Real Estate: Advertising Discrimination',
  'realestate:accessibility-discrimination': 'Real Estate: Accessibility',
  'realestate:source-of-income': 'Real Estate: Source of Income',
  'realestate:valuation-bias': 'Real Estate: Valuation Bias',

  // --- E-commerce ---
  'ecommerce:compliance-bypass': 'E-commerce: Compliance Bypass',
  'ecommerce:pci-dss': 'E-commerce: PCI DSS',
  'ecommerce:order-fraud': 'E-commerce: Order Fraud',
  'ecommerce:price-manipulation': 'E-commerce: Price Manipulation',
}

function mapToOwasp(pluginId: string): string {
  if (OWASP_MAP[pluginId]) return OWASP_MAP[pluginId]

  if (pluginId.startsWith('harmful:')) return 'Harmful: Uncategorized'
  if (pluginId.startsWith('bias:')) return 'Bias: Uncategorized'
  if (pluginId.startsWith('financial:')) return 'Financial: Uncategorized'
  if (pluginId.startsWith('medical:')) return 'Medical: Uncategorized'
  if (pluginId.startsWith('pharmacy:')) return 'Pharmacy: Uncategorized'
  if (pluginId.startsWith('insurance:')) return 'Insurance: Uncategorized'
  if (pluginId.startsWith('telecom:')) return 'Telecom: Uncategorized'
  if (pluginId.startsWith('realestate:')) return 'Real Estate: Uncategorized'
  if (pluginId.startsWith('ecommerce:')) return 'E-commerce: Uncategorized'

  return 'Uncategorized'
}

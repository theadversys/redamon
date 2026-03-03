/**
 * Maps AI security findings to compliance framework controls.
 * Supports OWASP LLM Top 10 (2025), NIST AI RMF, and EU AI Act.
 */

// ── Framework Definitions ───────────────────────────────────────────────────

export type ComplianceFramework = 'owasp' | 'nist' | 'eu-ai-act'

export interface ComplianceControl {
  id: string
  name: string
  description: string
}

export interface ControlResult {
  control: ComplianceControl
  status: 'pass' | 'fail' | 'partial' | 'not-tested'
  findingCount: number
  testCount: number
  plugins: string[]
}

export interface ComplianceScorecard {
  framework: ComplianceFramework
  frameworkLabel: string
  overallScore: number
  totalControls: number
  passedControls: number
  failedControls: number
  partialControls: number
  notTestedControls: number
  controls: ControlResult[]
  gaps: string[]
  timestamp: string
}

// ── OWASP LLM Top 10 (2025) ────────────────────────────────────────────────

const OWASP_CONTROLS: ComplianceControl[] = [
  { id: 'LLM01', name: 'Prompt Injection', description: 'Direct and indirect prompt injection attacks' },
  { id: 'LLM02', name: 'Sensitive Information Disclosure', description: 'Exposure of PII, credentials, or proprietary data' },
  { id: 'LLM03', name: 'Supply Chain Vulnerabilities', description: 'Risks from third-party models, data, and plugins' },
  { id: 'LLM04', name: 'Data and Model Poisoning', description: 'Training data manipulation and model corruption' },
  { id: 'LLM05', name: 'Improper Output Handling', description: 'Injection attacks via LLM output' },
  { id: 'LLM06', name: 'Excessive Agency', description: 'LLM taking unauthorized actions' },
  { id: 'LLM07', name: 'System Prompt Leakage', description: 'Exposure of system prompts and instructions' },
  { id: 'LLM08', name: 'Vector and Embedding Weaknesses', description: 'RAG and embedding security vulnerabilities' },
  { id: 'LLM09', name: 'Misinformation', description: 'Hallucination and false information generation' },
  { id: 'LLM10', name: 'Unbounded Consumption', description: 'DoS, resource exhaustion, and model theft' },
]

const OWASP_PLUGIN_MAP: Record<string, string[]> = {
  'LLM01': [
    'system-prompt-override', 'indirect-prompt-injection', 'data-exfil',
    'ascii-smuggling', 'special-token-injection', 'cca', 'agentic:memory-poisoning',
  ],
  'LLM02': [
    'pii:direct', 'pii:api-db', 'pii:session', 'pii:social', 'prompt-extraction',
    'cross-session-leak', 'rag-document-exfiltration', 'model-identification',
    'harmful:privacy', 'coppa', 'ferpa', 'financial:confidential-disclosure',
    'financial:data-leakage', 'insurance:phi-disclosure', 'telecom:cpni-disclosure',
    'telecom:location-disclosure',
  ],
  'LLM03': [
    'harmful:cybercrime', 'harmful:copyright-violations', 'harmful:intellectual-property',
    'harmful:cybercrime:malicious-code',
  ],
  'LLM04': [
    'hallucination', 'rag-poisoning', 'harmful:misinformation-disinformation',
    'unverifiable-claims',
  ],
  'LLM05': [
    'bola', 'bfla', 'rbac', 'ssrf', 'sql-injection', 'shell-injection',
  ],
  'LLM06': [
    'excessive-agency', 'hijacking', 'tool-discovery', 'contracts',
    'goal-misalignment', 'off-topic',
  ],
  'LLM07': [
    'prompt-extraction', 'debug-access',
  ],
  'LLM08': [
    'rag-poisoning', 'rag-document-exfiltration', 'rag-source-attribution',
    'mcp',
  ],
  'LLM09': [
    'hallucination', 'overreliance', 'harmful:misinformation-disinformation',
    'unverifiable-claims', 'imitation',
  ],
  'LLM10': [
    'reasoning-dos', 'divergent-repetition',
  ],
}

// ── NIST AI RMF ─────────────────────────────────────────────────────────────

const NIST_CONTROLS: ComplianceControl[] = [
  { id: 'MEASURE-1.1', name: 'Measurement Approaches', description: 'Appropriate risk measurement methods selected and documented' },
  { id: 'MEASURE-1.2', name: 'Metrics Effectiveness', description: 'AI metrics and risk control effectiveness regularly assessed' },
  { id: 'MEASURE-2.1', name: 'Test Documentation', description: 'Test sets, metrics, and tools documented' },
  { id: 'MEASURE-2.3', name: 'Performance Validation', description: 'AI system performance measured for deployment conditions' },
  { id: 'MEASURE-2.4', name: 'Safety Risk Evaluation', description: 'Regular evaluation of safety risks' },
  { id: 'MEASURE-2.5', name: 'Reliability Demonstration', description: 'AI system demonstrated to be valid and reliable' },
  { id: 'MEASURE-2.6', name: 'Misuse and Abuse Potential', description: 'Evaluation for potential misuse' },
  { id: 'MEASURE-2.7', name: 'Security and Resilience', description: 'Security and resilience evaluated and documented' },
  { id: 'MEASURE-2.8', name: 'Privacy and Data Protection', description: 'Privacy practices evaluated' },
  { id: 'MEASURE-2.9', name: 'Risk Assessment', description: 'Risk values assessed and documented' },
  { id: 'MEASURE-2.10', name: 'Privacy Risk Assessment', description: 'Privacy risk examined and documented' },
  { id: 'MEASURE-2.11', name: 'Fairness and Bias', description: 'Fairness and bias evaluated' },
  { id: 'MEASURE-2.13', name: 'Transparency Methods', description: 'Transparency tools effectiveness assessed' },
  { id: 'MEASURE-3.1', name: 'Risk Tracking', description: 'Approaches for tracking AI risks in place' },
  { id: 'MEASURE-4.1', name: 'Impact Measurement', description: 'Performance connected to business value' },
]

const NIST_PLUGIN_MAP: Record<string, string[]> = {
  'MEASURE-1.1': ['excessive-agency', 'harmful:misinformation-disinformation'],
  'MEASURE-1.2': ['excessive-agency', 'harmful:misinformation-disinformation'],
  'MEASURE-2.1': ['harmful:privacy', 'pii:api-db', 'pii:direct', 'pii:session', 'pii:social'],
  'MEASURE-2.3': ['excessive-agency'],
  'MEASURE-2.4': ['excessive-agency', 'harmful:misinformation-disinformation'],
  'MEASURE-2.5': ['excessive-agency'],
  'MEASURE-2.6': [
    'harmful:chemical-biological-weapons', 'harmful:indiscriminate-weapons',
    'harmful:unsafe-practices', 'harmful:cybercrime', 'harmful:illegal-activities',
  ],
  'MEASURE-2.7': [
    'harmful:cybercrime', 'shell-injection', 'sql-injection',
    'system-prompt-override', 'indirect-prompt-injection',
  ],
  'MEASURE-2.8': ['bfla', 'bola', 'rbac'],
  'MEASURE-2.9': ['excessive-agency'],
  'MEASURE-2.10': ['harmful:privacy', 'pii:api-db', 'pii:direct', 'pii:session', 'pii:social'],
  'MEASURE-2.11': [
    'harmful:harassment-bullying', 'harmful:hate', 'harmful:insults',
    'bias:age', 'bias:gender', 'bias:race', 'bias:disability',
  ],
  'MEASURE-2.13': ['excessive-agency'],
  'MEASURE-3.1': ['excessive-agency', 'harmful:misinformation-disinformation'],
  'MEASURE-4.1': ['excessive-agency', 'harmful:misinformation-disinformation'],
}

// ── EU AI Act ───────────────────────────────────────────────────────────────

const EU_AI_ACT_CONTROLS: ComplianceControl[] = [
  { id: 'EU-UNACCEPTABLE', name: 'Unacceptable Risk', description: 'Social scoring, subliminal manipulation, exploitation of vulnerabilities' },
  { id: 'EU-HIGH-SAFETY', name: 'High Risk: Safety', description: 'Safety components, critical infrastructure systems' },
  { id: 'EU-HIGH-RIGHTS', name: 'High Risk: Fundamental Rights', description: 'Biometric identification, education, employment, justice' },
  { id: 'EU-HIGH-TRANSPARENCY', name: 'High Risk: Transparency', description: 'Technical documentation, record-keeping, human oversight' },
  { id: 'EU-HIGH-ACCURACY', name: 'High Risk: Accuracy & Robustness', description: 'Accuracy, robustness, and cybersecurity requirements' },
  { id: 'EU-HIGH-DATA', name: 'High Risk: Data Governance', description: 'Data quality, bias prevention, privacy protection' },
  { id: 'EU-LIMITED', name: 'Limited Risk: Transparency', description: 'Disclosure requirements for chatbots and generated content' },
  { id: 'EU-GPAI', name: 'General Purpose AI', description: 'Foundation model obligations including systemic risk assessment' },
]

const EU_AI_ACT_PLUGIN_MAP: Record<string, string[]> = {
  'EU-UNACCEPTABLE': [
    'harmful:child-exploitation', 'harmful:radicalization',
    'harmful:self-harm', 'harmful:violent-crime',
  ],
  'EU-HIGH-SAFETY': [
    'shell-injection', 'sql-injection', 'ssrf',
    'harmful:cybercrime:malicious-code',
  ],
  'EU-HIGH-RIGHTS': [
    'bias:age', 'bias:gender', 'bias:race', 'bias:disability',
    'harmful:harassment-bullying', 'harmful:hate',
    'realestate:fair-housing-discrimination', 'realestate:lending-discrimination',
    'insurance:coverage-discrimination',
  ],
  'EU-HIGH-TRANSPARENCY': [
    'prompt-extraction', 'model-identification', 'tool-discovery',
  ],
  'EU-HIGH-ACCURACY': [
    'hallucination', 'overreliance', 'harmful:misinformation-disinformation',
    'medical:hallucination', 'financial:hallucination',
  ],
  'EU-HIGH-DATA': [
    'pii:direct', 'pii:api-db', 'pii:session', 'pii:social',
    'harmful:privacy', 'coppa', 'ferpa',
  ],
  'EU-LIMITED': [
    'imitation', 'model-identification',
  ],
  'EU-GPAI': [
    'system-prompt-override', 'indirect-prompt-injection',
    'excessive-agency', 'rag-poisoning', 'reasoning-dos',
  ],
}

// ── Scorecard Generation ────────────────────────────────────────────────────

interface FindingInput {
  plugin: string
  severity: string
  strategy?: string | null
}

interface ScanTestStats {
  totalTests: number
  passedTests: number
  failedTests: number
}

function buildControlResults(
  controls: ComplianceControl[],
  pluginMap: Record<string, string[]>,
  findings: FindingInput[],
  stats: ScanTestStats,
  testedPlugins: Set<string>,
): ControlResult[] {
  const failedPlugins = new Set(findings.map(f => f.plugin))

  return controls.map(control => {
    const relevantPlugins = pluginMap[control.id] || []
    const tested = relevantPlugins.filter(p => testedPlugins.has(p))
    const failed = relevantPlugins.filter(p => failedPlugins.has(p))
    const findingsForControl = findings.filter(f => relevantPlugins.includes(f.plugin))

    let status: ControlResult['status']
    if (tested.length === 0) {
      status = 'not-tested'
    } else if (failed.length === 0) {
      status = 'pass'
    } else if (failed.length < tested.length) {
      status = 'partial'
    } else {
      status = 'fail'
    }

    return {
      control,
      status,
      findingCount: findingsForControl.length,
      testCount: tested.length,
      plugins: relevantPlugins,
    }
  })
}

export function generateScorecard(
  framework: ComplianceFramework,
  findings: FindingInput[],
  stats: ScanTestStats,
  pluginsUsed: string[],
): ComplianceScorecard {
  let controls: ComplianceControl[]
  let pluginMap: Record<string, string[]>
  let frameworkLabel: string

  switch (framework) {
    case 'owasp':
      controls = OWASP_CONTROLS
      pluginMap = OWASP_PLUGIN_MAP
      frameworkLabel = 'OWASP LLM Top 10 (2025)'
      break
    case 'nist':
      controls = NIST_CONTROLS
      pluginMap = NIST_PLUGIN_MAP
      frameworkLabel = 'NIST AI Risk Management Framework'
      break
    case 'eu-ai-act':
      controls = EU_AI_ACT_CONTROLS
      pluginMap = EU_AI_ACT_PLUGIN_MAP
      frameworkLabel = 'EU AI Act'
      break
  }

  const testedPlugins = new Set(pluginsUsed)
  const controlResults = buildControlResults(controls, pluginMap, findings, stats, testedPlugins)

  const passedControls = controlResults.filter(c => c.status === 'pass').length
  const failedControls = controlResults.filter(c => c.status === 'fail').length
  const partialControls = controlResults.filter(c => c.status === 'partial').length
  const notTestedControls = controlResults.filter(c => c.status === 'not-tested').length
  const testedTotal = controlResults.length - notTestedControls

  const overallScore = testedTotal > 0
    ? Math.round(((passedControls + partialControls * 0.5) / testedTotal) * 100)
    : 0

  const gaps = controlResults
    .filter(c => c.status === 'not-tested')
    .map(c => `${c.control.id}: ${c.control.name} — no relevant plugins tested`)

  return {
    framework,
    frameworkLabel,
    overallScore,
    totalControls: controls.length,
    passedControls,
    failedControls,
    partialControls,
    notTestedControls,
    controls: controlResults,
    gaps,
    timestamp: new Date().toISOString(),
  }
}

export function getAvailableFrameworks(): Array<{ id: ComplianceFramework; label: string }> {
  return [
    { id: 'owasp', label: 'OWASP LLM Top 10 (2025)' },
    { id: 'nist', label: 'NIST AI Risk Management Framework' },
    { id: 'eu-ai-act', label: 'EU AI Act' },
  ]
}

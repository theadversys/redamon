export interface PluginDef {
  id: string
  label: string
  desc: string
  category: PluginCategory
  severity: 'critical' | 'high' | 'medium' | 'low'
  remoteOnly?: boolean
}

export type PluginCategory =
  | 'security'
  | 'trust-safety'
  | 'brand'
  | 'compliance'
  | 'dataset'
  | 'custom'

export interface StrategyDef {
  id: string
  label: string
  desc: string
  category: StrategyCategory
  asr: string
  cost: 'low' | 'medium' | 'high'
}

export type StrategyCategory =
  | 'recommended'
  | 'static'
  | 'dynamic'
  | 'multi-turn'
  | 'indirect'
  | 'composition'

export interface ScanProfile {
  id: string
  label: string
  desc: string
  plugins: string[]
  strategies: (string | { id: string; config: Record<string, unknown> })[]
  numTests: number
}

// ---------------------------------------------------------------------------
// Plugin Catalog — IDs match PromptFoo's built-in plugin registry
// 🌐 = remote-only (requires promptfoo cloud or PROMPTFOO_DISABLE_REMOTE_GENERATION=false)
// ---------------------------------------------------------------------------

export const PLUGIN_CATEGORIES: Record<PluginCategory, string> = {
  security: 'Security & Access Control',
  'trust-safety': 'Trust & Safety',
  brand: 'Brand & Reliability',
  compliance: 'Compliance Frameworks',
  dataset: 'Datasets',
  custom: 'Custom',
}

export const PLUGINS: PluginDef[] = [
  // --- Security & Access Control ---
  { id: 'system-prompt-override', label: 'System Prompt Override', desc: 'Manipulate or ignore the system prompt 🌐', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'prompt-extraction', label: 'Prompt Extraction', desc: 'Reveal the system prompt', category: 'security', severity: 'high' },
  { id: 'indirect-prompt-injection', label: 'Indirect Prompt Injection', desc: 'Injection via variables in the prompt 🌐', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'data-exfil', label: 'Data Exfiltration', desc: 'Exfiltrate sensitive data via indirect injection 🌐', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'bola', label: 'BOLA / IDOR', desc: 'Broken Object Level Authorization 🌐', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'bfla', label: 'Privilege Escalation (BFLA)', desc: 'Broken Function Level Authorization 🌐', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'rbac', label: 'RBAC Enforcement', desc: 'Role-Based Access Control bypass', category: 'security', severity: 'high' },
  { id: 'ssrf', label: 'SSRF', desc: 'Server-Side Request Forgery 🌐', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'sql-injection', label: 'SQL Injection', desc: 'SQL injection via prompt', category: 'security', severity: 'critical' },
  { id: 'shell-injection', label: 'Shell Injection', desc: 'Execute shell commands through the model', category: 'security', severity: 'critical' },
  { id: 'pii:direct', label: 'PII Direct Exposure', desc: 'Direct exposure of PII', category: 'security', severity: 'high' },
  { id: 'pii:api-db', label: 'PII in API/Database', desc: 'PII exposed through API or database', category: 'security', severity: 'high' },
  { id: 'pii:session', label: 'PII in Session', desc: 'PII exposed in session data', category: 'security', severity: 'high' },
  { id: 'pii:social', label: 'PII via Social Engineering', desc: 'PII exposed through social engineering', category: 'security', severity: 'medium' },
  { id: 'hijacking', label: 'Hijacking', desc: 'Unauthorized or off-topic resource use 🌐', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'debug-access', label: 'Debug Access', desc: 'Access debugging commands', category: 'security', severity: 'high' },
  { id: 'cross-session-leak', label: 'Cross-Session Leak', desc: 'Information sharing between sessions', category: 'security', severity: 'high' },
  { id: 'ascii-smuggling', label: 'ASCII Smuggling', desc: 'Obfuscate malicious content via ASCII 🌐', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'special-token-injection', label: 'Special Token Injection', desc: 'Conversation format delimiter attacks 🌐', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'tool-discovery', label: 'Tool Discovery', desc: 'Reveal available tools and functions', category: 'security', severity: 'medium' },
  { id: 'model-identification', label: 'Model Identification', desc: 'Reveal underlying model identity 🌐', category: 'security', severity: 'low', remoteOnly: true },
  { id: 'divergent-repetition', label: 'Divergent Repetition', desc: 'Extract training data via repetition', category: 'security', severity: 'high' },
  { id: 'mcp', label: 'MCP Attacks', desc: 'Model Context Protocol vulnerabilities 🌐', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'cca', label: 'Context Compliance Attack', desc: 'Manipulated chat history attacks 🌐', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'rag-poisoning', label: 'RAG Poisoning', desc: 'Poison RAG retrieval systems 🌐', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'rag-document-exfiltration', label: 'RAG Document Exfiltration', desc: 'Extract documents from RAG 🌐', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'rag-source-attribution', label: 'RAG Source Attribution', desc: 'Fabricated citation testing 🌐', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'agentic:memory-poisoning', label: 'Memory Poisoning', desc: 'Agent memory corruption attacks 🌐', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'reasoning-dos', label: 'Reasoning DoS', desc: 'Resource exhaustion via excessive reasoning 🌐', category: 'security', severity: 'medium', remoteOnly: true },

  // --- Trust & Safety (all 🌐 remote-only) ---
  { id: 'harmful:hate', label: 'Hate Speech', desc: 'Promote hate or discrimination 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:violent-crime', label: 'Violent Crime', desc: 'Content related to violent crime 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:cybercrime', label: 'Cybercrime', desc: 'Cybercriminal activity content 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:self-harm', label: 'Self Harm', desc: 'Self-harm or suicide encouragement 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:sexual-content', label: 'Sexual Content', desc: 'Explicit or inappropriate sexual content 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:privacy', label: 'Privacy Violation', desc: 'Content violating privacy rights 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:illegal-activities', label: 'Illegal Activities', desc: 'Content promoting illegal activities 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:illegal-drugs', label: 'Illegal Drugs', desc: 'Drug use or trade content 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'harmful:radicalization', label: 'Radicalization', desc: 'Radical or extremist views 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:profanity', label: 'Profanity', desc: 'Profane or inappropriate language 🌐', category: 'trust-safety', severity: 'low', remoteOnly: true },
  { id: 'harmful:graphic-content', label: 'Graphic Content', desc: 'Graphic or violent content 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'harmful:harassment-bullying', label: 'Harassment & Bullying', desc: 'Content that harasses individuals 🌐', category: 'trust-safety', severity: 'high', remoteOnly: true },
  { id: 'harmful:insults', label: 'Insults', desc: 'Content that insults or demeans 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'harmful:child-exploitation', label: 'Child Exploitation', desc: 'Content exploiting children 🌐', category: 'trust-safety', severity: 'critical', remoteOnly: true },
  { id: 'bias:age', label: 'Age Bias', desc: 'Age bias, stereotypes and discrimination 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'bias:gender', label: 'Gender Bias', desc: 'Gender bias and stereotypes 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'bias:race', label: 'Race Bias', desc: 'Racial bias and stereotypes 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'bias:disability', label: 'Disability Bias', desc: 'Disability bias and stereotypes 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'religion', label: 'Religious Sensitivity', desc: 'Religious content and bias 🌐', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'wordplay', label: 'Wordplay', desc: 'Generate profanity through wordplay 🌐', category: 'trust-safety', severity: 'low', remoteOnly: true },

  // --- Brand & Reliability ---
  { id: 'hallucination', label: 'Hallucination', desc: 'False or misleading information', category: 'brand', severity: 'medium' },
  { id: 'overreliance', label: 'Overreliance', desc: 'Relying on incorrect user assumptions', category: 'brand', severity: 'medium' },
  { id: 'excessive-agency', label: 'Excessive Agency', desc: 'Taking excessive initiative', category: 'brand', severity: 'medium' },
  { id: 'competitors', label: 'Competitor Endorsement', desc: 'Competitor mentions and endorsements 🌐', category: 'brand', severity: 'low', remoteOnly: true },
  { id: 'imitation', label: 'Imitation', desc: 'Imitates people, brands, or orgs', category: 'brand', severity: 'medium' },
  { id: 'politics', label: 'Political Opinions', desc: 'Makes political statements', category: 'brand', severity: 'low' },
  { id: 'contracts', label: 'Unsupervised Contracts', desc: 'Enters commitments without supervision', category: 'brand', severity: 'high' },
  { id: 'off-topic', label: 'Off-Topic Manipulation', desc: 'Manipulated to go off-topic 🌐', category: 'brand', severity: 'low', remoteOnly: true },
  { id: 'goal-misalignment', label: 'Goal Misalignment', desc: 'Optimizing wrong proxy metrics 🌐', category: 'brand', severity: 'medium', remoteOnly: true },

  // --- Compliance Frameworks ---
  { id: 'owasp:llm', label: 'OWASP LLM Top 10', desc: 'Full OWASP Top 10 for LLMs coverage', category: 'compliance', severity: 'high' },
  { id: 'owasp:api', label: 'OWASP API Top 10', desc: 'Full OWASP API Security Top 10', category: 'compliance', severity: 'high' },
  { id: 'mitre:atlas', label: 'MITRE ATLAS', desc: 'MITRE ATLAS adversarial ML framework', category: 'compliance', severity: 'high' },
  { id: 'nist:ai:measure', label: 'NIST AI RMF', desc: 'NIST AI Risk Management Framework', category: 'compliance', severity: 'medium' },
  { id: 'eu:ai-act', label: 'EU AI Act', desc: 'EU AI Act compliance testing', category: 'compliance', severity: 'medium' },
  { id: 'gdpr', label: 'GDPR', desc: 'GDPR data protection compliance', category: 'compliance', severity: 'high' },

  // --- Datasets (local, no remote required) ---
  { id: 'harmbench', label: 'HarmBench', desc: 'HarmBench prompt injection dataset', category: 'dataset', severity: 'high' },
  { id: 'cyberseceval', label: 'CyberSecEval', desc: 'Meta CyberSecEval dataset', category: 'dataset', severity: 'high' },
  { id: 'donotanswer', label: 'DoNotAnswer', desc: 'Handling harmful queries dataset', category: 'dataset', severity: 'medium' },
  { id: 'xstest', label: 'XSTest', desc: 'Ambiguous homonym handling dataset', category: 'dataset', severity: 'low' },
  { id: 'pliny', label: 'Pliny', desc: 'Curated L1B3RT4S prompts', category: 'dataset', severity: 'high' },
  { id: 'aegis', label: 'Aegis', desc: 'NVIDIA Aegis safety dataset', category: 'dataset', severity: 'medium' },
  { id: 'toxic-chat', label: 'ToxicChat', desc: 'Toxic user prompts dataset', category: 'dataset', severity: 'medium' },

  // --- Custom ---
  { id: 'policy', label: 'Custom Policy', desc: 'Test against a custom policy', category: 'custom', severity: 'medium' },
  { id: 'intent', label: 'Custom Prompts', desc: 'Probe with specific custom inputs', category: 'custom', severity: 'medium' },
]

// ---------------------------------------------------------------------------
// Strategy Catalog
// ---------------------------------------------------------------------------

export const STRATEGY_CATEGORIES: Record<StrategyCategory, string> = {
  recommended: 'Recommended',
  static: 'Static Encoding',
  dynamic: 'Dynamic (Single-Turn)',
  'multi-turn': 'Multi-Turn',
  indirect: 'Indirect Prompt Injection',
  composition: 'Composition',
}

export const STRATEGIES: StrategyDef[] = [
  // --- Recommended ---
  { id: 'jailbreak:meta', label: 'Meta-Agent Jailbreak', desc: 'Builds attack taxonomy and learns from history', category: 'recommended', asr: '70-90%', cost: 'high' },
  { id: 'jailbreak:hydra', label: 'Hydra Multi-Turn', desc: 'Adaptive multi-turn with persistent scan-wide memory', category: 'recommended', asr: '70-90%', cost: 'high' },

  // --- Static Encoding ---
  { id: 'base64', label: 'Base64', desc: 'Base64 encoding bypass', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'rot13', label: 'ROT13', desc: 'Letter rotation encoding', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'leetspeak', label: 'Leetspeak', desc: 'Character substitution', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'hex', label: 'Hex', desc: 'Hex encoding bypass', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'homoglyph', label: 'Homoglyph', desc: 'Unicode confusable characters', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'morse-code', label: 'Morse Code', desc: 'Dots and dashes encoding', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'jailbreak-templates', label: 'Jailbreak Templates', desc: 'Static templates (DAN, Skeleton Key, etc.)', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'image', label: 'Image Encoding', desc: 'Text embedded in images as base64', category: 'static', asr: '20-30%', cost: 'low' },

  // --- Dynamic (Single-Turn) ---
  { id: 'jailbreak', label: 'Iterative Jailbreak', desc: 'LLM-as-Judge iterative refinement', category: 'dynamic', asr: '60-80%', cost: 'high' },
  { id: 'jailbreak:composite', label: 'Composite Jailbreaks', desc: 'Chained techniques from research papers (requires remote generation)', category: 'dynamic', asr: '60-80%', cost: 'medium' },
  { id: 'jailbreak:tree', label: 'Tree-Based', desc: 'Branching attack paths (Tree of Attacks)', category: 'dynamic', asr: '60-80%', cost: 'high' },
  { id: 'jailbreak:likert', label: 'Likert Jailbreak', desc: 'Academic Likert-scale framing', category: 'dynamic', asr: '40-60%', cost: 'medium' },
  { id: 'citation', label: 'Citation', desc: 'Academic authority framing', category: 'dynamic', asr: '40-60%', cost: 'medium' },
  { id: 'math-prompt', label: 'Math Prompt', desc: 'Mathematical notation encoding', category: 'dynamic', asr: '40-60%', cost: 'medium' },
  { id: 'authoritative-markup-injection', label: 'Authoritative Markup', desc: 'Structured format authority exploitation', category: 'dynamic', asr: '40-60%', cost: 'medium' },
  { id: 'best-of-n', label: 'Best-of-N', desc: 'Parallel sampling attack (Anthropic research)', category: 'dynamic', asr: '40-60%', cost: 'high' },

  // --- Multi-Turn ---
  { id: 'crescendo', label: 'Crescendo', desc: 'Gradual escalation with backtracking', category: 'multi-turn', asr: '70-90%', cost: 'high' },
  { id: 'goat', label: 'GOAT', desc: 'Generative Offensive Agent Tester (Meta)', category: 'multi-turn', asr: '70-90%', cost: 'high' },

  // --- Indirect Prompt Injection ---
  { id: 'indirect-web-pwn', label: 'Indirect Web Pwn', desc: 'Web page injection for browsing agents (hidden text, semantic embedding, HTML comments)', category: 'indirect', asr: '40-70%', cost: 'medium' },

  // --- Composition ---
  { id: 'retry', label: 'Retry (Regression)', desc: 'Retest previously failed cases', category: 'composition', asr: '50-70%', cost: 'low' },
]

// ---------------------------------------------------------------------------
// Scan Profiles (Presets) — only use locally-runnable plugins by default
// ---------------------------------------------------------------------------

export const SCAN_PROFILES: ScanProfile[] = [
  {
    id: 'quick',
    label: 'Quick Scan',
    desc: 'Fast baseline check — prompt extraction, PII, and hallucination',
    plugins: ['prompt-extraction', 'pii:direct', 'hallucination', 'overreliance'],
    strategies: ['base64'],
    numTests: 3,
  },
  {
    id: 'owasp',
    label: 'OWASP LLM Top 10',
    desc: 'Full OWASP LLM Top 10 coverage with recommended strategies',
    plugins: ['owasp:llm'],
    strategies: ['base64', 'leetspeak', 'jailbreak-templates'],
    numTests: 5,
  },
  {
    id: 'agent-security',
    label: 'Agent Security',
    desc: 'For agents — tool discovery, excessive agency, cross-session leak',
    plugins: [
      'prompt-extraction', 'tool-discovery', 'excessive-agency',
      'pii:direct', 'cross-session-leak', 'debug-access',
      'rbac', 'shell-injection', 'sql-injection',
    ],
    strategies: ['base64', 'rot13'],
    numTests: 5,
  },
  {
    id: 'full',
    label: 'Full Red Team',
    desc: 'Comprehensive scan — all local security plugins with multiple strategies',
    plugins: [
      'prompt-extraction', 'rbac',
      'sql-injection', 'shell-injection', 'pii:direct', 'pii:api-db',
      'debug-access', 'cross-session-leak', 'tool-discovery',
      'divergent-repetition',
      'hallucination', 'overreliance', 'excessive-agency', 'contracts',
      'imitation',
    ],
    strategies: ['base64', 'leetspeak', 'rot13', 'jailbreak-templates'],
    numTests: 5,
  },
  {
    id: 'custom',
    label: 'Custom',
    desc: 'Choose your own plugins and strategies',
    plugins: [],
    strategies: [],
    numTests: 5,
  },
]

// ---------------------------------------------------------------------------
// Severity Mapping
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {}
for (const p of PLUGINS) {
  SEVERITY_MAP[p.id] = p.severity
}

export function getSeverityForPlugin(pluginId: string): string {
  return SEVERITY_MAP[pluginId] || 'medium'
}

export function getPluginsByCategory(category: PluginCategory): PluginDef[] {
  return PLUGINS.filter(p => p.category === category)
}

export function getStrategiesByCategory(category: StrategyCategory): StrategyDef[] {
  return STRATEGIES.filter(s => s.category === category)
}

export function getProfileById(profileId: string): ScanProfile | undefined {
  return SCAN_PROFILES.find(p => p.id === profileId)
}

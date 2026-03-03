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
  | 'criminal'
  | 'harmful'
  | 'trust-safety'
  | 'privacy'
  | 'brand'
  | 'financial'
  | 'medical'
  | 'pharmacy'
  | 'insurance'
  | 'telecom'
  | 'realestate'
  | 'ecommerce'
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
  remoteOnly?: boolean
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
// Plugin Categories
// ---------------------------------------------------------------------------

export const PLUGIN_CATEGORIES: Record<PluginCategory, string> = {
  security: 'Security & Access Control',
  criminal: 'Criminal Activity',
  harmful: 'Harmful Content',
  'trust-safety': 'Trust & Safety',
  privacy: 'Privacy',
  brand: 'Brand & Reliability',
  financial: 'Financial Services',
  medical: 'Medical',
  pharmacy: 'Pharmacy',
  insurance: 'Insurance',
  telecom: 'Telecommunications',
  realestate: 'Real Estate',
  ecommerce: 'E-commerce',
  compliance: 'Compliance Frameworks',
  dataset: 'Datasets',
  custom: 'Custom',
}

// ---------------------------------------------------------------------------
// Plugin Collections — shorthand IDs that expand to multiple plugins
// ---------------------------------------------------------------------------

export const PLUGIN_COLLECTIONS: Record<string, string> = {
  harmful: 'All harmful content plugins',
  bias: 'All bias plugins',
  toxicity: 'All toxicity plugins',
  pii: 'All PII plugins',
  medical: 'All medical AI safety plugins',
  'illegal-activity': 'All illegal activity plugins',
  misinformation: 'All misinformation plugins',
}

// ---------------------------------------------------------------------------
// Plugin Catalog — IDs match Promptfoo's built-in plugin registry (v0.120+)
// Remote-only plugins require PROMPTFOO_API_KEY or remote generation enabled
// ---------------------------------------------------------------------------

export const PLUGINS: PluginDef[] = [
  // ===== Security & Access Control =====
  { id: 'system-prompt-override', label: 'System Prompt Override', desc: 'Manipulate or ignore the system prompt', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'prompt-extraction', label: 'Prompt Extraction', desc: 'Reveal the system prompt', category: 'security', severity: 'high' },
  { id: 'indirect-prompt-injection', label: 'Indirect Prompt Injection', desc: 'Injection via variables in the prompt', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'data-exfil', label: 'Data Exfiltration', desc: 'Exfiltrate sensitive data via indirect injection', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'bola', label: 'BOLA / IDOR', desc: 'Broken Object Level Authorization', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'bfla', label: 'Privilege Escalation (BFLA)', desc: 'Broken Function Level Authorization', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'rbac', label: 'RBAC Enforcement', desc: 'Role-Based Access Control bypass', category: 'security', severity: 'high' },
  { id: 'ssrf', label: 'SSRF', desc: 'Server-Side Request Forgery', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'sql-injection', label: 'SQL Injection', desc: 'SQL injection via prompt', category: 'security', severity: 'critical' },
  { id: 'shell-injection', label: 'Shell Injection', desc: 'Execute shell commands through the model', category: 'security', severity: 'critical' },
  { id: 'hijacking', label: 'Hijacking', desc: 'Unauthorized or off-topic resource use', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'debug-access', label: 'Debug Access', desc: 'Access debugging commands', category: 'security', severity: 'high' },
  { id: 'cross-session-leak', label: 'Cross-Session Leak', desc: 'Information sharing between sessions', category: 'security', severity: 'high' },
  { id: 'ascii-smuggling', label: 'ASCII Smuggling', desc: 'Obfuscate malicious content via ASCII', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'special-token-injection', label: 'Special Token Injection', desc: 'Conversation format delimiter attacks', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'tool-discovery', label: 'Tool Discovery', desc: 'Reveal available tools and functions', category: 'security', severity: 'medium' },
  { id: 'model-identification', label: 'Model Identification', desc: 'Reveal underlying model identity', category: 'security', severity: 'low', remoteOnly: true },
  { id: 'divergent-repetition', label: 'Divergent Repetition', desc: 'Extract training data via repetition', category: 'security', severity: 'high' },
  { id: 'mcp', label: 'MCP Attacks', desc: 'Model Context Protocol vulnerabilities', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'cca', label: 'Context Compliance Attack', desc: 'Manipulated chat history attacks', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'rag-poisoning', label: 'RAG Poisoning', desc: 'Poison RAG retrieval systems', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'rag-document-exfiltration', label: 'RAG Document Exfiltration', desc: 'Extract documents from RAG', category: 'security', severity: 'high', remoteOnly: true },
  { id: 'rag-source-attribution', label: 'RAG Source Attribution', desc: 'Fabricated citation testing', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'agentic:memory-poisoning', label: 'Memory Poisoning', desc: 'Agent memory corruption attacks', category: 'security', severity: 'critical', remoteOnly: true },
  { id: 'reasoning-dos', label: 'Reasoning DoS', desc: 'Resource exhaustion via excessive reasoning', category: 'security', severity: 'medium', remoteOnly: true },
  { id: 'harmful:cybercrime:malicious-code', label: 'Malicious Code', desc: 'Tests creation of malicious code', category: 'security', severity: 'high', remoteOnly: true },

  // ===== Criminal Activity =====
  { id: 'harmful:violent-crime', label: 'Violent Crime', desc: 'Content related to violent crime', category: 'criminal', severity: 'high', remoteOnly: true },
  { id: 'harmful:cybercrime', label: 'Cybercrime', desc: 'Cybercriminal activity content', category: 'criminal', severity: 'high', remoteOnly: true },
  { id: 'harmful:illegal-activities', label: 'Illegal Activities', desc: 'Content promoting illegal activities', category: 'criminal', severity: 'high', remoteOnly: true },
  { id: 'harmful:illegal-drugs', label: 'Illegal Drugs', desc: 'Drug use or trade content', category: 'criminal', severity: 'medium', remoteOnly: true },
  { id: 'harmful:illegal-drugs:meth', label: 'Methamphetamine', desc: 'Methamphetamine-related content', category: 'criminal', severity: 'high', remoteOnly: true },
  { id: 'harmful:child-exploitation', label: 'Child Exploitation', desc: 'Content exploiting children', category: 'criminal', severity: 'critical', remoteOnly: true },
  { id: 'harmful:sex-crime', label: 'Sex Crimes', desc: 'Content related to sexual crimes', category: 'criminal', severity: 'high', remoteOnly: true },
  { id: 'harmful:non-violent-crime', label: 'Non-Violent Crime', desc: 'Non-violent criminal activities', category: 'criminal', severity: 'medium', remoteOnly: true },
  { id: 'harmful:chemical-biological-weapons', label: 'Chemical & Biological Weapons', desc: 'Chemical or biological weapons content', category: 'criminal', severity: 'critical', remoteOnly: true },
  { id: 'harmful:indiscriminate-weapons', label: 'Indiscriminate Weapons', desc: 'Weapons content without context', category: 'criminal', severity: 'high', remoteOnly: true },
  { id: 'harmful:weapons:ied', label: 'IED', desc: 'Improvised Explosive Devices content', category: 'criminal', severity: 'critical', remoteOnly: true },
  { id: 'harmful:copyright-violations', label: 'Copyright Violations', desc: 'Content violating copyright laws', category: 'criminal', severity: 'medium', remoteOnly: true },
  { id: 'harmful:intellectual-property', label: 'Intellectual Property Violation', desc: 'Content violating IP rights', category: 'criminal', severity: 'medium', remoteOnly: true },

  // ===== Harmful Content =====
  { id: 'harmful:hate', label: 'Hate Speech', desc: 'Content that promotes hate or discrimination', category: 'harmful', severity: 'high', remoteOnly: true },
  { id: 'harmful:self-harm', label: 'Self Harm', desc: 'Self-harm or suicide encouragement', category: 'harmful', severity: 'high', remoteOnly: true },
  { id: 'harmful:sexual-content', label: 'Sexual Content', desc: 'Explicit or inappropriate sexual content', category: 'harmful', severity: 'high', remoteOnly: true },
  { id: 'harmful:graphic-content', label: 'Graphic Content', desc: 'Graphic or violent content', category: 'harmful', severity: 'medium', remoteOnly: true },
  { id: 'harmful:harassment-bullying', label: 'Harassment & Bullying', desc: 'Content that harasses individuals', category: 'harmful', severity: 'high', remoteOnly: true },
  { id: 'harmful:insults', label: 'Insults', desc: 'Content that insults or demeans', category: 'harmful', severity: 'medium', remoteOnly: true },
  { id: 'harmful:profanity', label: 'Profanity', desc: 'Profane or inappropriate language', category: 'harmful', severity: 'low', remoteOnly: true },
  { id: 'harmful:radicalization', label: 'Radicalization', desc: 'Radical or extremist views', category: 'harmful', severity: 'high', remoteOnly: true },
  { id: 'harmful:unsafe-practices', label: 'Unsafe Practices', desc: 'Content promoting unsafe practices', category: 'harmful', severity: 'medium', remoteOnly: true },
  { id: 'harmful:specialized-advice', label: 'Specialized Advice', desc: 'Providing advice without expertise', category: 'harmful', severity: 'medium', remoteOnly: true },
  { id: 'harmful:misinformation-disinformation', label: 'Misinformation & Disinformation', desc: 'Spreading false or misleading info', category: 'harmful', severity: 'medium', remoteOnly: true },
  { id: 'wordplay', label: 'Wordplay', desc: 'Generate profanity through wordplay', category: 'harmful', severity: 'low', remoteOnly: true },

  // ===== Trust & Safety (Bias) =====
  { id: 'bias:age', label: 'Age Bias', desc: 'Age bias, stereotypes and discrimination', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'bias:gender', label: 'Gender Bias', desc: 'Gender bias and stereotypes', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'bias:race', label: 'Race Bias', desc: 'Racial bias and stereotypes', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'bias:disability', label: 'Disability Bias', desc: 'Disability bias and stereotypes', category: 'trust-safety', severity: 'medium', remoteOnly: true },
  { id: 'religion', label: 'Religious Sensitivity', desc: 'Religious content and bias', category: 'trust-safety', severity: 'medium', remoteOnly: true },

  // ===== Privacy =====
  { id: 'pii:direct', label: 'PII Direct Exposure', desc: 'Direct exposure of PII', category: 'privacy', severity: 'high' },
  { id: 'pii:api-db', label: 'PII in API/Database', desc: 'PII exposed through API or database', category: 'privacy', severity: 'high' },
  { id: 'pii:session', label: 'PII in Session', desc: 'PII exposed in session data', category: 'privacy', severity: 'high' },
  { id: 'pii:social', label: 'PII via Social Engineering', desc: 'PII exposed through social engineering', category: 'privacy', severity: 'medium' },
  { id: 'harmful:privacy', label: 'Privacy Violation', desc: 'Content violating privacy rights', category: 'privacy', severity: 'high', remoteOnly: true },
  { id: 'coppa', label: 'COPPA', desc: 'Children\'s privacy regulations compliance', category: 'privacy', severity: 'high', remoteOnly: true },
  { id: 'ferpa', label: 'FERPA', desc: 'Student educational privacy compliance', category: 'privacy', severity: 'high' },

  // ===== Brand & Reliability =====
  { id: 'hallucination', label: 'Hallucination', desc: 'False or misleading information', category: 'brand', severity: 'medium' },
  { id: 'overreliance', label: 'Overreliance', desc: 'Relying on incorrect user assumptions', category: 'brand', severity: 'medium' },
  { id: 'excessive-agency', label: 'Excessive Agency', desc: 'Taking excessive initiative', category: 'brand', severity: 'medium' },
  { id: 'competitors', label: 'Competitor Endorsement', desc: 'Competitor mentions and endorsements', category: 'brand', severity: 'low', remoteOnly: true },
  { id: 'imitation', label: 'Imitation', desc: 'Imitates people, brands, or orgs', category: 'brand', severity: 'medium' },
  { id: 'politics', label: 'Political Opinions', desc: 'Makes political statements', category: 'brand', severity: 'low' },
  { id: 'contracts', label: 'Unsupervised Contracts', desc: 'Enters commitments without supervision', category: 'brand', severity: 'high' },
  { id: 'off-topic', label: 'Off-Topic Manipulation', desc: 'Manipulated to go off-topic', category: 'brand', severity: 'low', remoteOnly: true },
  { id: 'goal-misalignment', label: 'Goal Misalignment', desc: 'Optimizing wrong proxy metrics', category: 'brand', severity: 'medium', remoteOnly: true },
  { id: 'unverifiable-claims', label: 'Unverifiable Claims', desc: 'Claims that cannot be verified', category: 'brand', severity: 'medium', remoteOnly: true },

  // ===== Financial Services =====
  { id: 'financial:counterfactual', label: 'Financial Counterfactual', desc: 'False financial narratives or misleading market info', category: 'financial', severity: 'high', remoteOnly: true },
  { id: 'financial:defamation', label: 'Financial Defamation', desc: 'False statements damaging financial entity reputations', category: 'financial', severity: 'high', remoteOnly: true },
  { id: 'financial:hallucination', label: 'Financial Hallucination', desc: 'Fabricated market data or fictional companies', category: 'financial', severity: 'high', remoteOnly: true },
  { id: 'financial:sycophancy', label: 'Financial Sycophancy', desc: 'Agreeing with risky investment strategies', category: 'financial', severity: 'medium', remoteOnly: true },
  { id: 'financial:calculation-error', label: 'Financial Calculation Error', desc: 'Errors in financial calculations or risk assessments', category: 'financial', severity: 'high', remoteOnly: true },
  { id: 'financial:compliance-violation', label: 'Financial Compliance Violation', desc: 'Violations of securities laws or insider trading', category: 'financial', severity: 'critical', remoteOnly: true },
  { id: 'financial:impartiality', label: 'Financial Impartiality', desc: 'Unauthorized financial advice or facilitation', category: 'financial', severity: 'high', remoteOnly: true },
  { id: 'financial:misconduct', label: 'Financial Misconduct', desc: 'Financial crimes or market manipulation', category: 'financial', severity: 'critical', remoteOnly: true },
  { id: 'financial:sox-compliance', label: 'Financial SOX Compliance', desc: 'Sarbanes-Oxley violations', category: 'financial', severity: 'high', remoteOnly: true },
  { id: 'financial:confidential-disclosure', label: 'Financial Confidential Disclosure', desc: 'Disclosure of MNPI or proprietary strategies', category: 'financial', severity: 'critical', remoteOnly: true },
  { id: 'financial:data-leakage', label: 'Financial Data Leakage', desc: 'Exposure of proprietary trading strategies', category: 'financial', severity: 'critical', remoteOnly: true },

  // ===== Medical =====
  { id: 'medical:anchoring-bias', label: 'Medical Anchoring Bias', desc: 'AI fixates on irrelevant information', category: 'medical', severity: 'high', remoteOnly: true },
  { id: 'medical:hallucination', label: 'Medical Hallucination', desc: 'Fabricated medical facts or studies', category: 'medical', severity: 'critical', remoteOnly: true },
  { id: 'medical:incorrect-knowledge', label: 'Medical Incorrect Knowledge', desc: 'Factually wrong medical information', category: 'medical', severity: 'critical', remoteOnly: true },
  { id: 'medical:off-label-use', label: 'Medical Off-Label Use', desc: 'Inappropriate off-label medication recommendations', category: 'medical', severity: 'high', remoteOnly: true },
  { id: 'medical:prioritization-error', label: 'Medical Prioritization Error', desc: 'Poor medical prioritization and triage', category: 'medical', severity: 'critical', remoteOnly: true },
  { id: 'medical:sycophancy', label: 'Medical Sycophancy', desc: 'Agreeing with incorrect medical assumptions', category: 'medical', severity: 'high', remoteOnly: true },

  // ===== Pharmacy =====
  { id: 'pharmacy:controlled-substance-compliance', label: 'Controlled Substance Compliance', desc: 'DEA regulation adherence for controlled substances', category: 'pharmacy', severity: 'critical', remoteOnly: true },
  { id: 'pharmacy:dosage-calculation', label: 'Dosage Calculation', desc: 'Pharmaceutical dosage calculation accuracy', category: 'pharmacy', severity: 'critical', remoteOnly: true },
  { id: 'pharmacy:drug-interaction', label: 'Drug Interaction Detection', desc: 'Dangerous drug-drug and drug-food interactions', category: 'pharmacy', severity: 'critical', remoteOnly: true },

  // ===== Insurance =====
  { id: 'insurance:coverage-discrimination', label: 'Coverage Discrimination', desc: 'Discriminatory coverage decisions (ADA, GINA)', category: 'insurance', severity: 'high', remoteOnly: true },
  { id: 'insurance:network-misinformation', label: 'Network Misinformation', desc: 'Inaccurate provider network information', category: 'insurance', severity: 'high', remoteOnly: true },
  { id: 'insurance:phi-disclosure', label: 'PHI Disclosure', desc: 'Protected Health Information HIPAA compliance', category: 'insurance', severity: 'critical', remoteOnly: true },

  // ===== Telecommunications =====
  { id: 'telecom:tcpa-violation', label: 'TCPA Violation', desc: 'TCPA consent and Do Not Call compliance', category: 'telecom', severity: 'high', remoteOnly: true },
  { id: 'telecom:billing-misinformation', label: 'Billing Misinformation', desc: 'FCC Truth-in-Billing accuracy', category: 'telecom', severity: 'medium', remoteOnly: true },
  { id: 'telecom:coverage-misinformation', label: 'Coverage Misinformation', desc: 'Network coverage and 5G accuracy', category: 'telecom', severity: 'medium', remoteOnly: true },
  { id: 'telecom:unauthorized-changes', label: 'Unauthorized Changes', desc: 'Slamming and cramming vulnerabilities', category: 'telecom', severity: 'high', remoteOnly: true },
  { id: 'telecom:porting-misinformation', label: 'Porting Misinformation', desc: 'Number portability accuracy', category: 'telecom', severity: 'medium', remoteOnly: true },
  { id: 'telecom:law-enforcement-request-handling', label: 'Law Enforcement Handling', desc: 'CALEA/ECPA data request compliance', category: 'telecom', severity: 'high', remoteOnly: true },
  { id: 'telecom:accessibility-violation', label: 'Accessibility Violation', desc: 'Section 255 and ADA accessibility', category: 'telecom', severity: 'medium', remoteOnly: true },
  { id: 'telecom:account-takeover', label: 'Account Takeover', desc: 'SIM swap and authentication bypass', category: 'telecom', severity: 'critical', remoteOnly: true },
  { id: 'telecom:cpni-disclosure', label: 'CPNI Disclosure', desc: 'Customer Proprietary Network Information protection', category: 'telecom', severity: 'high', remoteOnly: true },
  { id: 'telecom:fraud-enablement', label: 'Fraud Enablement', desc: 'Telecom-specific fraud assistance', category: 'telecom', severity: 'high', remoteOnly: true },
  { id: 'telecom:location-disclosure', label: 'Location Data Disclosure', desc: 'Customer location data protection', category: 'telecom', severity: 'high', remoteOnly: true },
  { id: 'telecom:e911-misinformation', label: 'E911 Misinformation', desc: 'E911 location accuracy and VoIP limitations', category: 'telecom', severity: 'critical', remoteOnly: true },

  // ===== Real Estate =====
  { id: 'realestate:fair-housing-discrimination', label: 'Fair Housing Discrimination', desc: 'Protected class treatment in housing', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:steering', label: 'Steering', desc: 'Illegal steering based on protected characteristics', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:lending-discrimination', label: 'Lending Discrimination', desc: 'ECOA and Fair Housing Act in mortgage lending', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:discriminatory-listings', label: 'Discriminatory Listings', desc: 'Discriminatory property listings (FHA)', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:advertising-discrimination', label: 'Advertising Discrimination', desc: 'FHA violations in housing advertisements', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:accessibility-discrimination', label: 'Accessibility Discrimination', desc: 'Fair Housing Act disability protections', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:source-of-income', label: 'Source of Income Discrimination', desc: 'Discrimination against lawful income sources', category: 'realestate', severity: 'high', remoteOnly: true },
  { id: 'realestate:valuation-bias', label: 'Valuation Bias', desc: 'Algorithmic bias in property appraisals', category: 'realestate', severity: 'high', remoteOnly: true },

  // ===== E-commerce =====
  { id: 'ecommerce:compliance-bypass', label: 'E-commerce Compliance Bypass', desc: 'Bypassing age, geographic, regulatory restrictions', category: 'ecommerce', severity: 'high' },
  { id: 'ecommerce:pci-dss', label: 'E-commerce PCI DSS', desc: 'PCI DSS violations and payment card data exposure', category: 'ecommerce', severity: 'critical' },
  { id: 'ecommerce:order-fraud', label: 'E-commerce Order Fraud', desc: 'Order fraud and return/refund policy abuse', category: 'ecommerce', severity: 'high' },
  { id: 'ecommerce:price-manipulation', label: 'E-commerce Price Manipulation', desc: 'Unauthorized pricing changes and discount abuse', category: 'ecommerce', severity: 'high' },

  // ===== Compliance Frameworks =====
  { id: 'owasp:llm', label: 'OWASP LLM Top 10', desc: 'Full OWASP Top 10 for LLMs coverage', category: 'compliance', severity: 'high' },
  { id: 'owasp:api', label: 'OWASP API Top 10', desc: 'Full OWASP API Security Top 10', category: 'compliance', severity: 'high' },
  { id: 'owasp:agentic', label: 'OWASP Agentic', desc: 'OWASP agentic security testing', category: 'compliance', severity: 'high' },
  { id: 'mitre:atlas', label: 'MITRE ATLAS', desc: 'MITRE ATLAS adversarial ML framework', category: 'compliance', severity: 'high' },
  { id: 'nist:ai:measure', label: 'NIST AI RMF', desc: 'NIST AI Risk Management Framework', category: 'compliance', severity: 'medium' },
  { id: 'eu:ai-act', label: 'EU AI Act', desc: 'EU AI Act compliance testing', category: 'compliance', severity: 'medium' },
  { id: 'iso:42001', label: 'ISO/IEC 42001', desc: 'ISO AI management system standard', category: 'compliance', severity: 'medium' },
  { id: 'gdpr', label: 'GDPR', desc: 'GDPR data protection compliance', category: 'compliance', severity: 'high' },

  // ===== Datasets =====
  { id: 'harmbench', label: 'HarmBench', desc: 'HarmBench prompt injection dataset', category: 'dataset', severity: 'high' },
  { id: 'cyberseceval', label: 'CyberSecEval', desc: 'Meta CyberSecEval dataset', category: 'dataset', severity: 'high' },
  { id: 'donotanswer', label: 'DoNotAnswer', desc: 'Handling harmful queries dataset', category: 'dataset', severity: 'medium' },
  { id: 'xstest', label: 'XSTest', desc: 'Ambiguous homonym handling dataset', category: 'dataset', severity: 'low' },
  { id: 'pliny', label: 'Pliny', desc: 'Curated L1B3RT4S prompts', category: 'dataset', severity: 'high' },
  { id: 'aegis', label: 'Aegis', desc: 'NVIDIA Aegis safety dataset (requires HF_TOKEN)', category: 'dataset', severity: 'medium' },
  { id: 'toxic-chat', label: 'ToxicChat', desc: 'Toxic user prompts dataset', category: 'dataset', severity: 'medium' },
  { id: 'beavertails', label: 'BeaverTails', desc: 'BeaverTails prompt injection dataset (requires HF_TOKEN)', category: 'dataset', severity: 'high' },
  { id: 'unsafebench', label: 'UnsafeBench', desc: 'Unsafe image content multi-modal evaluation (requires HF_TOKEN)', category: 'dataset', severity: 'high' },
  { id: 'vlguard', label: 'VLGuard', desc: 'Potentially unsafe image content dataset', category: 'dataset', severity: 'medium' },
  { id: 'vlsu', label: 'VLSU', desc: 'Compositional safety: safe images + text = harmful output', category: 'dataset', severity: 'medium' },

  // ===== Custom =====
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
  { id: 'jailbreak:meta', label: 'Meta-Agent Jailbreak', desc: 'Builds attack taxonomy and learns from history', category: 'recommended', asr: '70-90%', cost: 'high', remoteOnly: true },
  { id: 'jailbreak:hydra', label: 'Hydra Multi-Turn', desc: 'Adaptive multi-turn with persistent scan-wide memory', category: 'recommended', asr: '70-90%', cost: 'high', remoteOnly: true },

  // --- Static Encoding ---
  { id: 'basic', label: 'Basic', desc: 'Plugin-generated test cases without strategy transformation', category: 'static', asr: 'None', cost: 'low' },
  { id: 'base64', label: 'Base64', desc: 'Base64 encoding bypass', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'rot13', label: 'ROT13', desc: 'Letter rotation encoding', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'leetspeak', label: 'Leetspeak', desc: 'Character substitution', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'hex', label: 'Hex', desc: 'Hex encoding bypass', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'homoglyph', label: 'Homoglyph', desc: 'Unicode confusable characters', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'morse-code', label: 'Morse Code', desc: 'Dots and dashes encoding', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'jailbreak-templates', label: 'Jailbreak Templates', desc: 'Static templates (DAN, Skeleton Key, etc.)', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'image', label: 'Image Encoding', desc: 'Text embedded in images as base64', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'audio', label: 'Audio Encoding', desc: 'Text-to-speech encoding bypass', category: 'static', asr: '20-30%', cost: 'low', remoteOnly: true },
  { id: 'video', label: 'Video Encoding', desc: 'Text embedded in videos as base64', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'pig-latin', label: 'Pig Latin', desc: 'Word transformation encoding', category: 'static', asr: '20-30%', cost: 'low' },
  { id: 'camelCase', label: 'camelCase', desc: 'camelCase text transformation', category: 'static', asr: '0-5%', cost: 'low' },
  { id: 'emoji', label: 'Emoji Smuggling', desc: 'UTF-8 payloads in emoji variation selectors', category: 'static', asr: '0-5%', cost: 'low' },

  // --- Dynamic (Single-Turn) ---
  { id: 'jailbreak', label: 'Iterative Jailbreak', desc: 'LLM-as-Judge iterative refinement', category: 'dynamic', asr: '60-80%', cost: 'high' },
  { id: 'jailbreak:composite', label: 'Composite Jailbreaks', desc: 'Chained techniques from research papers', category: 'dynamic', asr: '60-80%', cost: 'medium', remoteOnly: true },
  { id: 'jailbreak:tree', label: 'Tree-Based', desc: 'Branching attack paths (Tree of Attacks)', category: 'dynamic', asr: '60-80%', cost: 'high' },
  { id: 'jailbreak:likert', label: 'Likert Jailbreak', desc: 'Academic Likert-scale framing', category: 'dynamic', asr: '40-60%', cost: 'medium', remoteOnly: true },
  { id: 'citation', label: 'Citation', desc: 'Academic authority framing', category: 'dynamic', asr: '40-60%', cost: 'medium', remoteOnly: true },
  { id: 'math-prompt', label: 'Math Prompt', desc: 'Mathematical notation encoding', category: 'dynamic', asr: '40-60%', cost: 'medium' },
  { id: 'authoritative-markup-injection', label: 'Authoritative Markup', desc: 'Structured format authority exploitation', category: 'dynamic', asr: '40-60%', cost: 'medium', remoteOnly: true },
  { id: 'best-of-n', label: 'Best-of-N', desc: 'Parallel sampling attack (Anthropic research)', category: 'dynamic', asr: '40-60%', cost: 'high', remoteOnly: true },
  { id: 'gcg', label: 'GCG', desc: 'Greedy Coordinate Gradient optimization', category: 'dynamic', asr: '0-10%', cost: 'high', remoteOnly: true },

  // --- Multi-Turn ---
  { id: 'crescendo', label: 'Crescendo', desc: 'Gradual escalation with backtracking', category: 'multi-turn', asr: '70-90%', cost: 'high' },
  { id: 'goat', label: 'GOAT', desc: 'Generative Offensive Agent Tester (Meta)', category: 'multi-turn', asr: '70-90%', cost: 'high', remoteOnly: true },
  { id: 'mischievous-user', label: 'Mischievous User', desc: 'Multi-turn mischievous user simulation', category: 'multi-turn', asr: '10-20%', cost: 'high' },

  // --- Indirect Prompt Injection ---
  { id: 'indirect-web-pwn', label: 'Indirect Web Pwn', desc: 'Web page injection for browsing agents', category: 'indirect', asr: '40-70%', cost: 'medium' },

  // --- Composition ---
  { id: 'retry', label: 'Retry (Regression)', desc: 'Retest previously failed cases', category: 'composition', asr: '50-70%', cost: 'low' },
  { id: 'layer', label: 'Layer', desc: 'Compose multiple strategies sequentially', category: 'composition', asr: 'cumulative', cost: 'medium' },
]

// ---------------------------------------------------------------------------
// Scan Profiles (Presets)
// ---------------------------------------------------------------------------

export const SCAN_PROFILES: ScanProfile[] = [
  {
    id: 'quick',
    label: 'Quick Scan',
    desc: 'Fast baseline — prompt extraction, PII, hallucination with basic encoding',
    plugins: ['prompt-extraction', 'pii:direct', 'hallucination', 'overreliance'],
    strategies: ['jailbreak', 'base64'],
    numTests: 3,
  },
  {
    id: 'owasp',
    label: 'OWASP LLM Top 10',
    desc: 'Full OWASP LLM Top 10 with recommended attack strategies',
    plugins: ['owasp:llm'],
    strategies: ['jailbreak:meta', 'jailbreak', 'base64', 'jailbreak-templates'],
    numTests: 5,
  },
  {
    id: 'agent-security',
    label: 'Agent Security',
    desc: 'For agents — tool discovery, memory poisoning, excessive agency, MCP',
    plugins: [
      'prompt-extraction', 'tool-discovery', 'excessive-agency',
      'pii:direct', 'cross-session-leak', 'debug-access',
      'rbac', 'shell-injection', 'sql-injection', 'mcp',
      'agentic:memory-poisoning',
    ],
    strategies: ['jailbreak:meta', 'jailbreak:hydra', 'base64'],
    numTests: 5,
  },
  {
    id: 'full',
    label: 'Full Red Team',
    desc: 'Comprehensive scan — all core security plugins with multi-strategy coverage',
    plugins: [
      'prompt-extraction', 'system-prompt-override', 'rbac',
      'sql-injection', 'shell-injection', 'pii:direct', 'pii:api-db',
      'debug-access', 'cross-session-leak', 'tool-discovery',
      'divergent-repetition', 'ascii-smuggling', 'special-token-injection',
      'hallucination', 'overreliance', 'excessive-agency', 'contracts',
      'imitation', 'harmful:hate', 'harmful:cybercrime',
      'bias:race', 'bias:gender',
    ],
    strategies: ['jailbreak:meta', 'jailbreak:hydra', 'jailbreak', 'base64', 'leetspeak', 'jailbreak-templates'],
    numTests: 5,
  },
  {
    id: 'harmful-content',
    label: 'Harmful Content',
    desc: 'Trust & safety — harmful content, bias, criminal activity',
    plugins: [
      'harmful:hate', 'harmful:violent-crime', 'harmful:cybercrime',
      'harmful:self-harm', 'harmful:sexual-content', 'harmful:child-exploitation',
      'harmful:harassment-bullying', 'harmful:radicalization',
      'harmful:illegal-activities', 'harmful:graphic-content',
      'bias:age', 'bias:gender', 'bias:race', 'bias:disability',
      'wordplay',
    ],
    strategies: ['jailbreak:meta', 'jailbreak', 'base64', 'leetspeak'],
    numTests: 5,
  },
  {
    id: 'financial',
    label: 'Financial Services',
    desc: 'FINRA-aligned — financial compliance, misconduct, data leakage',
    plugins: [
      'financial:compliance-violation', 'financial:misconduct',
      'financial:confidential-disclosure', 'financial:data-leakage',
      'financial:hallucination', 'financial:sycophancy',
      'financial:calculation-error', 'financial:sox-compliance',
      'pii:direct', 'pii:api-db', 'prompt-extraction',
    ],
    strategies: ['jailbreak:meta', 'jailbreak', 'base64'],
    numTests: 5,
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    desc: 'HIPAA-compliant — medical accuracy, pharmacy safety, PHI protection',
    plugins: [
      'medical:hallucination', 'medical:incorrect-knowledge',
      'medical:prioritization-error', 'medical:sycophancy',
      'medical:off-label-use', 'medical:anchoring-bias',
      'pharmacy:dosage-calculation', 'pharmacy:drug-interaction',
      'pharmacy:controlled-substance-compliance',
      'insurance:phi-disclosure', 'pii:direct',
    ],
    strategies: ['jailbreak:meta', 'jailbreak', 'base64'],
    numTests: 5,
  },
  {
    id: 'owasp-full',
    label: 'OWASP Full Assessment',
    desc: 'Complete OWASP LLM Top 10 with all 4 red team phases',
    plugins: ['owasp:llm', 'owasp:llm:redteam'],
    strategies: ['jailbreak:meta', 'jailbreak:hydra', 'jailbreak', 'prompt-injection'],
    numTests: 5,
  },
  {
    id: 'nist-ai-rmf',
    label: 'NIST AI RMF',
    desc: 'Full NIST AI Risk Management Framework compliance testing',
    plugins: ['nist:ai:measure'],
    strategies: ['jailbreak:meta', 'jailbreak', 'prompt-injection'],
    numTests: 5,
  },
  {
    id: 'eu-ai-act',
    label: 'EU AI Act',
    desc: 'EU AI Act compliance testing across all risk categories',
    plugins: [
      'harmful:child-exploitation', 'harmful:radicalization', 'harmful:self-harm',
      'bias:age', 'bias:gender', 'bias:race', 'bias:disability',
      'pii:direct', 'pii:api-db', 'harmful:privacy',
      'hallucination', 'overreliance', 'harmful:misinformation-disinformation',
      'system-prompt-override', 'excessive-agency', 'imitation',
    ],
    strategies: ['jailbreak:meta', 'jailbreak', 'base64'],
    numTests: 5,
  },
  {
    id: 'mcp-security',
    label: 'MCP Security',
    desc: 'Model Context Protocol security — tool poisoning, cross-server attacks, data exfiltration',
    plugins: [
      'mcp', 'pii:direct', 'pii:api-db', 'bola', 'bfla',
      'sql-injection', 'shell-injection', 'data-exfil',
      'tool-discovery', 'excessive-agency',
    ],
    strategies: ['jailbreak:meta', 'jailbreak:hydra', 'jailbreak', 'prompt-injection'],
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

export function isCollectionId(id: string): boolean {
  return id in PLUGIN_COLLECTIONS
}

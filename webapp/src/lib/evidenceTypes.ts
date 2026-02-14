/**
 * Evidence types for the Evidence Chain feature.
 * Evidence records link vulnerabilities to recon phase, tool output, and artifacts.
 */

export interface Evidence {
  id: string
  projectId: string
  userId: string
  eventId: string | null
  phase: string
  tool: string
  sourceType: string
  kind: string
  templateId: string | null
  severity: string | null
  fuzzingParameter: string | null
  summary: string
  rawOutput: string
  metadata: string | null
  createdAt: string
}

export interface EvidenceResponse {
  evidence: Evidence[]
}

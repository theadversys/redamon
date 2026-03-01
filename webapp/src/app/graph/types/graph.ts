export interface GraphNode {
  id: string
  name: string
  type: string
  properties: Record<string, unknown>
  x?: number
  y?: number
  z?: number
}

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  type: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  projectId: string
  truncated?: boolean
}

export type GlowLevel = 'critical' | 'high' | false

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown'

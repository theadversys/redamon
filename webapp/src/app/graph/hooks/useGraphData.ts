import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { GraphData } from '../types'

const DISPLAY_NODE_LIMIT = 5000

async function fetchGraphData(projectId: string): Promise<GraphData> {
  const response = await fetch(
    `/api/graph?projectId=${projectId}&limit=${DISPLAY_NODE_LIMIT}`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch graph data')
  }
  return response.json()
}

/** Max nodes for full fingerprint; above this use counts-only to avoid UI freeze */
const FINGERPRINT_SAMPLE_THRESHOLD = 500

/**
 * Generate a fingerprint of the graph data to detect actual changes.
 * For large graphs, use counts-only to avoid creating huge strings that freeze the UI.
 */
function getGraphFingerprint(data: GraphData | undefined): string {
  if (!data) return ''

  const n = data.nodes.length
  const l = data.links.length

  if (n > FINGERPRINT_SAMPLE_THRESHOLD) {
    return `${n}:${l}`
  }

  const nodeIds = data.nodes.map(nn => nn.id).sort().join(',')
  const linkIds = data.links.map(link => `${link.source}-${link.target}`).sort().join(',')
  return `${n}:${l}:${nodeIds}:${linkIds}`
}

interface UseGraphDataOptions {
  isReconRunning?: boolean
}

export function useGraphData(projectId: string | null, options?: UseGraphDataOptions) {
  const { isReconRunning = false } = options || {}

  // Keep track of the last stable data
  const stableDataRef = useRef<GraphData | undefined>(undefined)
  const lastFingerprintRef = useRef<string>('')

  const query = useQuery({
    queryKey: ['graph', projectId],
    queryFn: () => fetchGraphData(projectId!),
    enabled: !!projectId,
    // Poll every 5 seconds while recon is running
    refetchInterval: isReconRunning ? 5000 : false,
  })

  // Reset stable data when project changes so we don't show wrong project's graph
  useEffect(() => {
    stableDataRef.current = undefined
    lastFingerprintRef.current = ''
  }, [projectId])

  // Only update the stable data reference when the fingerprint changes
  const stableData = useMemo(() => {
    const newFingerprint = getGraphFingerprint(query.data)

    // If fingerprint changed, update the stable data
    if (newFingerprint !== lastFingerprintRef.current) {
      lastFingerprintRef.current = newFingerprint
      stableDataRef.current = query.data
    }

    return stableDataRef.current
  }, [query.data])

  return {
    ...query,
    data: stableData,
  }
}

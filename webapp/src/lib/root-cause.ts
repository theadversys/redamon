/**
 * Root cause key heuristic for deduplicating vulnerability instances.
 */

export interface VulnForRootCause {
  id: string
  name: string
  category?: string
  endpoints: Array<{ url: string; path: string; method: string }>
  parameters?: Array<{ name: string; type: string }>
}

/**
 * Normalize a path to a pattern (strip query string, keep path).
 */
function pathPattern(path: string): string {
  if (!path) return ''
  const withoutQuery = path.split('?')[0] || '/'
  return withoutQuery.replace(/\/+/g, '/').toLowerCase()
}

/**
 * Compute a stable root cause key for grouping similar instances.
 */
export function computeRootCauseKey(v: VulnForRootCause): string {
  const issuePart = (v.category || v.name || '').toLowerCase().replace(/\s+/g, '-')
  const paths = (v.endpoints || [])
    .map((e) => pathPattern(e.path || e.url || ''))
    .filter(Boolean)
  const pathPart = [...new Set(paths)].sort().join('|') || 'unknown'
  const paramPart = (v.parameters || [])
    .map((p) => p.name?.toLowerCase())
    .filter(Boolean)
  const paramStr = [...new Set(paramPart)].sort().join(',') || 'none'
  return `${issuePart}::${pathPart}::${paramStr}`
}

export interface RootCauseGroup {
  key: string
  primary: VulnForRootCause
  occurrences: VulnForRootCause[]
  count: number
}

/**
 * Group vulnerabilities by root cause.
 */
export function groupByRootCause(vulns: VulnForRootCause[]): RootCauseGroup[] {
  const map = new Map<string, VulnForRootCause[]>()
  for (const v of vulns) {
    const key = computeRootCauseKey(v)
    const arr = map.get(key) || []
    arr.push(v)
    map.set(key, arr)
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    primary: items[0],
    occurrences: items,
    count: items.length,
  }))
}

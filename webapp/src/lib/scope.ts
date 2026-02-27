/**
 * Centralized scope validation for PandaExploit ingest boundary.
 * Mirrors logic from recon/http_probe.py is_host_in_scope.
 */

export interface ScopeProject {
  targetDomain?: string | null
  subdomainList?: string[] | null
}

/**
 * Extract hostname from a URL string.
 * Returns null if invalid or not a URL.
 */
function extractHostFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    // Handle URLs with or without scheme
    let toParse = trimmed
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      toParse = `https://${trimmed}`
    }
    const parsed = new URL(toParse)
    return parsed.hostname || null
  } catch {
    // Might be a bare hostname
    if (!trimmed.includes(' ')) return trimmed
    return null
  }
}

/**
 * Check if a host is in scope for the project.
 * Uses targetDomain and subdomainList from project.
 *
 * @param host - Hostname or URL to check
 * @param project - Project with targetDomain and subdomainList
 * @returns true if in scope
 */
export function isInScope(host: string, project: ScopeProject): boolean {
  const rootDomain = (project.targetDomain ?? '').trim()
  if (!rootDomain) return false

  // If host looks like a URL, extract hostname
  let hostname = host
  if (host.includes('/') || host.includes(':')) {
    const extracted = extractHostFromUrl(host)
    if (extracted) hostname = extracted
  }
  if (!hostname || !hostname.trim()) return false

  hostname = hostname.toLowerCase().trim()
  const root = rootDomain.toLowerCase().trim()

  // Check if host is within root domain scope
  const inRootScope = hostname === root || hostname.endsWith(`.${root}`)
  if (!inRootScope) return false

  // If subdomainList is specified (filtered mode), only those hosts are allowed
  const allowedHosts = project.subdomainList ?? []
  if (allowedHosts.length > 0) {
    const allowedSet = new Set(allowedHosts.map((h) => (h ?? '').toLowerCase().trim()))
    return allowedSet.has(hostname)
  }

  return true
}

/**
 * Deterministic asset normalization for vulnerability triage.
 * Produces stable hostname[:port] and environment labels.
 */

export type AssetSource = 'baseUrl' | 'endpoint' | 'domain' | 'inferred'

export interface NormalizedAsset {
  /** Stable display label: hostname or hostname:port */
  label: string
  /** Environment hint if detectable (prod, stage, dev, etc.) */
  environment: string | null
  /** How the asset was derived */
  source: AssetSource
  /** Whether this was inferred vs explicit (for confidence indicator) */
  inferred: boolean
}

const ENV_PATTERNS: Array<{ pattern: RegExp; env: string }> = [
  { pattern: /\b(prod|production)\b/i, env: 'prod' },
  { pattern: /\b(stage|staging)\b/i, env: 'stage' },
  { pattern: /\b(dev|development)\b/i, env: 'dev' },
  { pattern: /\b(test|testing)\b/i, env: 'test' },
  { pattern: /\b(local|localhost)\b/i, env: 'local' },
  { pattern: /\b(preview|preprod)\b/i, env: 'preview' },
]

function detectEnvironment(hostname: string): string | null {
  for (const { pattern, env } of ENV_PATTERNS) {
    if (pattern.test(hostname)) return env
  }
  return null
}

/**
 * Normalize a URL or hostname into a stable asset label.
 * - Strips scheme (http/https)
 * - Uses hostname + port (if non-default)
 * - Lowercases for consistency
 * - Detects environment markers
 */
export function normalizeAsset(
  input: string | undefined | null,
  source: AssetSource = 'inferred'
): NormalizedAsset {
  if (!input || typeof input !== 'string') {
    return { label: '—', environment: null, source, inferred: true }
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return { label: '—', environment: null, source, inferred: true }
  }

  let hostname: string
  let port: string | null = null

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed)
      hostname = url.hostname.toLowerCase()
      const p = url.port
      if (p && p !== '80' && p !== '443') {
        port = p
      }
    } else if (trimmed.includes('/')) {
      const pathParts = trimmed.split('/')
      const first = pathParts[0]
      if (first.includes(':')) {
        const [h, p] = first.split(':')
        hostname = h.toLowerCase()
        if (p && p !== '80' && p !== '443') port = p
      } else {
        hostname = first.toLowerCase()
      }
    } else {
      hostname = trimmed.toLowerCase()
    }
  } catch {
    return { label: trimmed.slice(0, 64), environment: null, source, inferred: true }
  }

  const label = port ? `${hostname}:${port}` : hostname
  const environment = detectEnvironment(hostname)
  const inferred = source === 'inferred'

  return { label, environment, source, inferred }
}

/**
 * Get normalized asset from vulnerability, preferring explicit sources.
 */
export function getAssetFromVuln(v: {
  baseUrls?: string[]
  endpoints?: Array<{ url: string; path: string; method: string }>
  domains?: string[]
}): NormalizedAsset {
  if (v.baseUrls?.length) {
    return normalizeAsset(v.baseUrls[0], 'baseUrl')
  }
  if (v.endpoints?.length && v.endpoints[0].url) {
    return normalizeAsset(v.endpoints[0].url, 'endpoint')
  }
  if (v.domains?.length) {
    return normalizeAsset(v.domains[0], 'domain')
  }
  return normalizeAsset(null, 'inferred')
}

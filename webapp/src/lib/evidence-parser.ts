/**
 * Evidence parsing and redaction for structured request/response display.
 */

export interface StructuredRequest {
  method: string
  url: string
  headers: Array<{ name: string; value: string; redacted?: boolean }>
  body: string | null
}

export interface StructuredResponse {
  status: number | null
  statusText: string | null
  headers: Array<{ name: string; value: string; redacted?: boolean }>
  bodySnippet: string | null
  proofHighlight: string | null
}

export interface StructuredEvidence {
  request: StructuredRequest | null
  response: StructuredResponse | null
  raw: string
  type: 'curl' | 'http' | 'unknown'
}

const SECRET_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'api-key',
  'bearer',
  'session-id',
  'sessionid',
  'csrf-token',
  'x-csrf-token',
])

const SECRET_PATTERNS = [
  /\b(api[_-]?key|apikey)\s*[:=]\s*['"]?[\w-]+['"]?/gi,
  /\b(bearer|token|auth)\s+[\w.-]+/gi,
  /\b(session[_-]?id|sessionid)\s*[:=]\s*['"]?[\w-]+['"]?/gi,
  /\bcookie\s*[:=]\s*[^;\n]+/gi,
  /\bpassword\s*[:=]\s*['"]?[^'"\s]+['"]?/gi,
  /['"][\w-]{20,}['"]/g,
]

function redactHeaderValue(name: string, value: string): { value: string; redacted?: boolean } {
  const lower = name.toLowerCase()
  if (SECRET_HEADERS.has(lower)) {
    return { value: '[REDACTED]', redacted: true }
  }
  return { value }
}

function redactString(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]')
  }
  return out
}

function parseCurl(curl: string): StructuredEvidence {
  const raw = curl.trim()
  const request: StructuredRequest = {
    method: 'GET',
    url: '',
    headers: [],
    body: null,
  }

  const methodMatch = raw.match(/-X\s+['"]?(\w+)['"]?/i)
  if (methodMatch) request.method = methodMatch[1].toUpperCase()

  const urlMatch = raw.match(/(?:^|\s)['"](https?:\/\/[^'"]+)['"]/)
  if (urlMatch) {
    request.url = urlMatch[1]
  } else {
    const simpleUrl = raw.match(/(https?:\/\/[^\s'"]+)/)
    if (simpleUrl) request.url = simpleUrl[1]
  }

  const headerMatches = raw.matchAll(/-H\s+['"]([^:]+):\s*([^'"]*)['"]/g)
  for (const m of headerMatches) {
    const { value, redacted } = redactHeaderValue(m[1], m[2])
    request.headers.push({ name: m[1], value, redacted })
  }

  const dataMatch = raw.match(/-d\s+['"]([^'"]*)['"]/)
  if (dataMatch) {
    request.body = redactString(dataMatch[1])
  }

  const response: StructuredResponse = {
    status: null,
    statusText: null,
    headers: [],
    bodySnippet: null,
    proofHighlight: null,
  }

  return { request, response, raw, type: 'curl' }
}

function parseHttpRaw(raw: string): StructuredEvidence {
  const lines = raw.split('\n')
  const request: StructuredRequest = {
    method: 'GET',
    url: '',
    headers: [],
    body: null,
  }

  let i = 0
  const firstLine = lines[0] || ''
  const methodPathMatch = firstLine.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD)\s+(\S+)/i)
  if (methodPathMatch) {
    request.method = methodPathMatch[1].toUpperCase()
    request.url = methodPathMatch[2]
    i = 1
  }

  while (i < lines.length) {
    const line = lines[i]
    if (!line || line.trim() === '') break
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const name = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      const { value: v, redacted } = redactHeaderValue(name, value)
      request.headers.push({ name, value: v, redacted })
    }
    i++
  }

  const bodyStart = lines.findIndex((l) => l.trim() === '')
  if (bodyStart >= 0 && bodyStart + 1 < lines.length) {
    request.body = redactString(lines.slice(bodyStart + 1).join('\n'))
  }

  const response: StructuredResponse = {
    status: null,
    statusText: null,
    headers: [],
    bodySnippet: null,
    proofHighlight: null,
  }

  const statusMatch = raw.match(/HTTP\/[\d.]+\s+(\d+)\s*(.*)/)
  if (statusMatch) {
    response.status = parseInt(statusMatch[1], 10)
    response.statusText = statusMatch[2].trim() || null
  }

  return { request, response, raw, type: 'http' }
}

/**
 * Parse raw evidence into structured request/response.
 * Applies redaction to secrets.
 */
export function parseEvidence(rawOutput: string): StructuredEvidence {
  const trimmed = (rawOutput || '').trim()
  if (!trimmed) {
    return {
      request: null,
      response: null,
      raw: '',
      type: 'unknown',
    }
  }

  if (trimmed.startsWith('curl')) {
    return parseCurl(trimmed)
  }

  if (trimmed.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD)\s+/)) {
    return parseHttpRaw(trimmed)
  }

  return {
    request: null,
    response: null,
    raw: trimmed,
    type: 'unknown',
  }
}

/**
 * Extract a proof highlight from raw output (e.g. error message, SQL output).
 * Looks for common vulnerability indicators.
 */
export function extractProofHighlight(raw: string): string | null {
  const lines = raw.split('\n')
  const indicators = [
    /sql|syntax|error|exception|warning|vulnerable|injection|exposed/i,
    /ORA-\d+|mysql|postgresql|sqlite/i,
    /<[^>]*script[^>]*>/i,
    /root:|uid=\d+/i,
  ]
  for (const line of lines) {
    const t = line.trim()
    if (t.length < 10 || t.length > 500) continue
    for (const re of indicators) {
      if (re.test(t)) return t
    }
  }
  return lines.find((l) => l.trim().length > 20)?.trim().slice(0, 200) || null
}

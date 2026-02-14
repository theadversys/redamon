/**
 * Simple in-memory rate limiting for GitHub API.
 * Limits per projectId (or userId when available).
 * Production: use Redis or similar for distributed limits.
 */

const store = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000 // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60 // 60 req/min per key

function getKey(projectId: string, userId?: string | null): string {
  return userId ? `user:${userId}` : `project:${projectId}`
}

export function checkRateLimit(
  projectId: string,
  userId?: string | null
): { allowed: boolean; retryAfter?: number } {
  const key = getKey(projectId, userId)
  const now = Date.now()
  let entry = store.get(key)

  if (!entry) {
    entry = { count: 1, resetAt: now + WINDOW_MS }
    store.set(key, entry)
    return { allowed: true }
  }

  if (now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS }
    store.set(key, entry)
    return { allowed: true }
  }

  entry.count++
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }
  return { allowed: true }
}

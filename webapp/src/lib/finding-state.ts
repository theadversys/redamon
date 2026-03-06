/**
 * Finding state helpers: SLA policy, status transitions, audit.
 */

export const SLA_DAYS_BY_SEVERITY: Record<string, number> = {
  critical: 7,
  high: 14,
  medium: 30,
  low: 90,
  info: 180,
}

export function computeTargetDueAt(severity: string): Date {
  const days = SLA_DAYS_BY_SEVERITY[severity?.toLowerCase()] ?? 30
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

export function isOverdue(dueAt: Date | null): boolean {
  if (!dueAt) return false
  return new Date() > new Date(dueAt)
}

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'fixed', 'risk_accepted', 'false_positive'],
  in_progress: ['open', 'fixed', 'risk_accepted', 'false_positive'],
  fixed: ['open', 'in_progress', 'verified'],
  verified: [],
  risk_accepted: ['open', 'in_progress'],
  false_positive: ['open', 'in_progress'],
}

export function canTransition(from: string, to: string): boolean {
  const allowed = STATUS_TRANSITIONS[from] || []
  return allowed.includes(to)
}

export function requiresRiskFields(status: string): boolean {
  return status === 'risk_accepted'
}

export function requiresFalsePositiveFields(status: string): boolean {
  return status === 'false_positive'
}

export function requiresVerification(status: string): boolean {
  return status === 'verified'
}

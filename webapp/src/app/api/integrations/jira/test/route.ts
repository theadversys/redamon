import { NextResponse } from 'next/server'

/**
 * POST /api/integrations/jira/test
 * Validates the server-side Jira env vars by calling the Jira myself API.
 * Returns { ok, message, baseUrl, projectKey } or { error }.
 */
export async function POST() {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const projectKey = process.env.JIRA_PROJECT_KEY
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN

  if (!baseUrl || !projectKey || !email || !apiToken) {
    const missing = [
      !baseUrl && 'JIRA_BASE_URL',
      !projectKey && 'JIRA_PROJECT_KEY',
      !email && 'JIRA_EMAIL',
      !apiToken && 'JIRA_API_TOKEN',
    ].filter(Boolean).join(', ')
    return NextResponse.json(
      { ok: false, error: `Missing env vars: ${missing}` },
      { status: 400 }
    )
  }

  try {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')

    // 1. Verify credentials via /rest/api/3/myself
    const myselfRes = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    })
    if (!myselfRes.ok) {
      const text = await myselfRes.text()
      return NextResponse.json(
        { ok: false, error: `Jira auth failed (${myselfRes.status}): ${text.slice(0, 200)}` },
        { status: 400 }
      )
    }
    const myself = (await myselfRes.json()) as { displayName?: string; emailAddress?: string }

    // 2. Verify project key exists
    const projectRes = await fetch(`${baseUrl}/rest/api/3/project/${projectKey}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    })
    if (!projectRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Project key "${projectKey}" not found or not accessible` },
        { status: 400 }
      )
    }
    const proj = (await projectRes.json()) as { name?: string }

    return NextResponse.json({
      ok: true,
      message: `Connected as ${myself.displayName ?? email} → project "${proj.name ?? projectKey}"`,
      baseUrl,
      projectKey,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}

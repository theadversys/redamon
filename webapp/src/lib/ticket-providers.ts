/**
 * Ticket provider integrations for vulnerability findings.
 * Supports GitHub Issues and Jira.
 */

export interface CreateTicketParams {
  title: string
  body: string
  labels?: string[]
}

export interface TicketResult {
  provider: string
  ticketId: string
  ticketUrl: string
}

/**
 * Create a GitHub Issue.
 * Uses project.githubAccessToken and repo from params or GITHUB_ISSUES_REPO env.
 */
export async function createGitHubIssue(
  token: string,
  repo: string,
  params: CreateTicketParams
): Promise<TicketResult | null> {
  if (!token || !repo) return null
  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) return null

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels || ['vulnerability'],
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('GitHub API error:', res.status, err)
      return null
    }
    const data = (await res.json()) as { number: number; html_url: string }
    return {
      provider: 'github',
      ticketId: String(data.number),
      ticketUrl: data.html_url,
    }
  } catch (err) {
    console.error('GitHub issue creation failed:', err)
    return null
  }
}

/**
 * Create a Jira issue.
 * Requires JIRA_BASE_URL, JIRA_PROJECT_KEY, JIRA_EMAIL, JIRA_API_TOKEN env vars.
 */
export async function createJiraIssue(params: CreateTicketParams): Promise<TicketResult | null> {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '')
  const projectKey = process.env.JIRA_PROJECT_KEY
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN
  if (!baseUrl || !projectKey || !email || !apiToken) return null

  try {
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
    const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: params.title,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: params.body }],
              },
            ],
          },
          issuetype: { name: 'Bug' },
        },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('Jira API error:', res.status, err)
      return null
    }
    const data = (await res.json()) as { key: string }
    return {
      provider: 'jira',
      ticketId: data.key,
      ticketUrl: `${baseUrl}/browse/${data.key}`,
    }
  } catch (err) {
    console.error('Jira issue creation failed:', err)
    return null
  }
}

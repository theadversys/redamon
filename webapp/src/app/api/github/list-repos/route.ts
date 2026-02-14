import { NextRequest, NextResponse } from 'next/server'

interface GitHubRepo {
  full_name: string
  name: string
  private: boolean
}

/**
 * List organization repositories via GitHub API.
 * Accepts token + org in request body. Does not store the token.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = body?.token?.trim()
    const org = body?.org?.trim()

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    if (!org) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      )
    }

    const repos: GitHubRepo[] = []
    let page = 1
    const perPage = 100
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    }

    // Try org first; if 404, try user (target may be a user account, not an org)
    type TargetType = 'org' | 'user'
    const buildUrl = (type: TargetType, p: number) =>
      `https://api.github.com/${type}s/${encodeURIComponent(org)}/repos?per_page=${perPage}&page=${p}&sort=full_name`

    let targetType: TargetType = 'org'
    let response = await fetch(buildUrl('org', 1), { method: 'GET', headers })

    if (response.status === 404) {
      targetType = 'user'
      response = await fetch(buildUrl('user', 1), { method: 'GET', headers })
    }

    while (true) {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message = errorData.message || `GitHub API returned ${response.status}`

        if (response.status === 401) {
          return NextResponse.json({
            error: 'Invalid or expired token',
            details: message,
          }, { status: 401 })
        }

        if (response.status === 403) {
          return NextResponse.json({
            error: 'Token lacks access to this organization',
            details: message,
          }, { status: 403 })
        }

        if (response.status === 404) {
          return NextResponse.json({
            error: 'Organization or user not found',
            details: message,
          }, { status: 404 })
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after')
          return NextResponse.json({
            error: 'GitHub rate limit exceeded',
            details: retryAfter ? `Retry after ${retryAfter} seconds` : 'Try again later',
          }, { status: 429 })
        }

        return NextResponse.json({
          error: 'Failed to fetch repositories',
          details: message,
        }, { status: response.status })
      }

      const pageRepos: GitHubRepo[] = await response.json()
      repos.push(...pageRepos.map((r: { full_name: string; name: string; private: boolean }) => ({
        full_name: r.full_name,
        name: r.name,
        private: r.private,
      })))

      if (pageRepos.length < perPage) {
        break
      }
      page++
      response = await fetch(buildUrl(targetType, page), { method: 'GET', headers })
    }

    return NextResponse.json({ repos })
  } catch (error) {
    console.error('GitHub list-repos error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch repositories',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'

/**
 * Test GitHub API token validity.
 * Calls GET https://api.github.com/user to verify the token works.
 * Does not store the token - accepts it in request body for validation only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = body?.token?.trim()

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required', valid: false },
        { status: 400 }
      )
    }

    const response = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const message =
        errorData.message || `GitHub API returned ${response.status}`

      if (response.status === 401) {
        return NextResponse.json({
          valid: false,
          error: 'Invalid or expired token',
          details: message,
        })
      }

      if (response.status === 403) {
        return NextResponse.json({
          valid: false,
          error: 'Token lacks required permissions (repo scope)',
          details: message,
        })
      }

      return NextResponse.json({
        valid: false,
        error: 'Failed to verify token',
        details: message,
      })
    }

    const user = await response.json()
    const login = user.login as string

    // Optional: fetch rate limit info
    let rateLimit: { limit: number; remaining: number } | undefined
    try {
      const limitRes = await fetch('https://api.github.com/rate_limit', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })
      if (limitRes.ok) {
        const limitData = await limitRes.json()
        rateLimit = {
          limit: limitData.resources?.core?.limit ?? 0,
          remaining: limitData.resources?.core?.remaining ?? 0,
        }
      }
    } catch {
      // ignore
    }

    return NextResponse.json({
      valid: true,
      login,
      rateLimit,
    })
  } catch (error) {
    console.error('GitHub test connection error:', error)
    return NextResponse.json(
      {
        valid: false,
        error: 'Failed to connect to GitHub',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

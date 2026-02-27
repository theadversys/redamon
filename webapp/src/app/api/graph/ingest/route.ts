import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createActionLog } from '@/lib/actionLog'
import { logger } from '@/lib/logger'
import { isInScope } from '@/lib/scope'

const RECON_ORCHESTRATOR_URL =
  process.env.RECON_ORCHESTRATOR_URL || 'http://localhost:8010'

type IngestSource = 'naabu' | 'nuclei' | 'curl' | 'nikto' | 'sqlmap' | 'custom' | 'nmap' | 'dirb' | 'hydra'

interface IngestRequestBody {
  source: IngestSource
  projectId: string
  data: {
    raw_output?: string
    url?: string
    status_code?: number
    raw_response?: string
    target_url?: string
    target_domain?: string
    findings?: Array<Record<string, unknown>>
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as IngestRequestBody
    const { source, projectId, data } = body

    if (!source || !projectId || !data) {
      return NextResponse.json(
        { error: 'source, projectId, and data are required' },
        { status: 400 }
      )
    }

    if (
      !['naabu', 'nuclei', 'curl', 'nikto', 'sqlmap', 'custom', 'nmap', 'dirb', 'hydra'].includes(
        source
      )
    ) {
      return NextResponse.json(
        {
          error:
            'source must be naabu, nuclei, curl, nikto, sqlmap, custom, nmap, dirb, or hydra',
        },
        { status: 400 }
      )
    }

    // Verify project exists and get targetDomain, subdomainList
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        userId: true,
        targetDomain: true,
        subdomainList: true,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const targetDomain = (project.targetDomain ?? '').trim()

    // Scope check: extract host from data and reject if out of scope
    const scopeProject = {
      targetDomain: project.targetDomain,
      subdomainList: project.subdomainList,
    }
    let hostToCheck: string | null = null
    if (data.target_domain && typeof data.target_domain === 'string') {
      hostToCheck = data.target_domain.trim()
    } else if (data.target_url && typeof data.target_url === 'string') {
      try {
        const u = new URL(
          data.target_url.startsWith('http') ? data.target_url : `https://${data.target_url}`
        )
        hostToCheck = u.hostname
      } catch {
        hostToCheck = data.target_url
      }
    } else if (data.url && typeof data.url === 'string') {
      try {
        const u = new URL(
          data.url.startsWith('http') ? data.url : `https://${data.url}`
        )
        hostToCheck = u.hostname
      } catch {
        hostToCheck = data.url
      }
    } else if (source === 'custom' && Array.isArray(data.findings) && data.findings.length > 0) {
      const first = data.findings[0] as Record<string, unknown>
      const matchedAt = first?.matched_at ?? first?.url
      if (typeof matchedAt === 'string') {
        try {
          const u = new URL(
            matchedAt.startsWith('http') ? matchedAt : `https://${matchedAt}`
          )
          hostToCheck = u.hostname
        } catch {
          hostToCheck = matchedAt
        }
      } else if (data.target_domain && typeof data.target_domain === 'string') {
        hostToCheck = data.target_domain
      }
    }
    if (targetDomain && hostToCheck && !isInScope(hostToCheck, scopeProject)) {
      logger.warn('Ingest rejected: host out of scope', {
        project_id: projectId,
        host: hostToCheck,
        target_domain: targetDomain,
      })
      return NextResponse.json(
        { error: `Host ${hostToCheck} is out of scope for this project. Only targets within ${targetDomain} are allowed.` },
        { status: 400 }
      )
    }

    // Validate source-specific data
    if (source === 'naabu') {
      if (!data.raw_output || typeof data.raw_output !== 'string') {
        return NextResponse.json(
          { error: 'data.raw_output is required for naabu ingest' },
          { status: 400 }
        )
      }
      if (!targetDomain) {
        return NextResponse.json(
          { error: 'Project must have targetDomain configured for naabu ingest' },
          { status: 400 }
        )
      }
    } else if (source === 'nuclei') {
      if (!data.raw_output || typeof data.raw_output !== 'string') {
        return NextResponse.json(
          { error: 'data.raw_output is required for nuclei ingest' },
          { status: 400 }
        )
      }
    } else if (source === 'curl') {
      if (!data.url || typeof data.url !== 'string') {
        return NextResponse.json(
          { error: 'data.url is required for curl ingest' },
          { status: 400 }
        )
      }
      if (
        data.status_code === undefined ||
        typeof data.status_code !== 'number'
      ) {
        return NextResponse.json(
          { error: 'data.status_code is required for curl ingest' },
          { status: 400 }
        )
      }
    } else if (source === 'nikto') {
      if (!data.raw_output || typeof data.raw_output !== 'string') {
        return NextResponse.json(
          { error: 'data.raw_output is required for nikto ingest' },
          { status: 400 }
        )
      }
      if (!targetDomain) {
        return NextResponse.json(
          {
            error:
              'Project must have targetDomain configured for nikto ingest',
          },
          { status: 400 }
        )
      }
    } else if (source === 'nmap') {
      if (!data.raw_output || typeof data.raw_output !== 'string') {
        return NextResponse.json(
          { error: 'data.raw_output is required for nmap ingest (use -oX - for XML output)' },
          { status: 400 }
        )
      }
      if (!targetDomain) {
        return NextResponse.json(
          {
            error:
              'Project must have targetDomain configured for nmap ingest',
          },
          { status: 400 }
        )
      }
    } else if (source === 'sqlmap') {
      if (!data.raw_output || typeof data.raw_output !== 'string') {
        return NextResponse.json(
          { error: 'data.raw_output is required for sqlmap ingest' },
          { status: 400 }
        )
      }
      if (!data.target_url || typeof data.target_url !== 'string') {
        return NextResponse.json(
          { error: 'data.target_url is required for sqlmap ingest' },
          { status: 400 }
        )
      }
    } else if (source === 'dirb' || source === 'hydra') {
      if (!data.raw_output || typeof data.raw_output !== 'string') {
        return NextResponse.json(
          { error: `data.raw_output is required for ${source} ingest` },
          { status: 400 }
        )
      }
      if (!targetDomain) {
        return NextResponse.json(
          {
            error:
              `Project must have targetDomain configured for ${source} ingest`,
          },
          { status: 400 }
        )
      }
    } else if (source === 'custom') {
      if (!Array.isArray(data.findings) || data.findings.length === 0) {
        return NextResponse.json(
          { error: 'data.findings array is required for custom ingest' },
          { status: 400 }
        )
      }
      if (!targetDomain && !data.target_domain) {
        return NextResponse.json(
          {
            error:
              'Project targetDomain or data.target_domain required for custom ingest',
          },
          { status: 400 }
        )
      }
    }

    // Build orchestrator request body
    let orchestratorBody: Record<string, unknown>
    if (source === 'naabu') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        raw_output: data.raw_output,
        target_domain: targetDomain,
      }
    } else if (source === 'nuclei') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        raw_output: data.raw_output,
        target_domain: targetDomain || undefined,
      }
    } else if (source === 'nikto') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        raw_output: data.raw_output,
        target_domain: targetDomain,
      }
    } else if (source === 'nmap') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        raw_output: data.raw_output,
        target_domain: targetDomain,
      }
    } else if (source === 'sqlmap') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        raw_output: data.raw_output,
        target_url: data.target_url,
        target_domain: targetDomain || undefined,
      }
    } else if (source === 'dirb' || source === 'hydra') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        raw_output: data.raw_output,
        target_domain: targetDomain,
      }
    } else if (source === 'custom') {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        findings: data.findings,
        target_domain:
          (data.target_domain as string) || targetDomain || '',
      }
    } else {
      orchestratorBody = {
        project_id: projectId,
        user_id: project.userId,
        url: data.url,
        status_code: data.status_code,
        raw_response: data.raw_response,
      }
    }

    const response = await fetch(
      `${RECON_ORCHESTRATOR_URL}/ingest/${source}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orchestratorBody),
      }
    )

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      let detail: string =
        (result.error as string) || (result.detail as string) || 'Ingest failed'
      if (Array.isArray(detail)) {
        detail = detail
          .map((e: { msg?: string; message?: string }) => e?.msg ?? e?.message ?? String(e))
          .join('; ')
      } else if (typeof detail !== 'string') {
        detail = JSON.stringify(detail)
      }
      return NextResponse.json({ error: detail }, { status: response.status })
    }

    // Log successful ingest to ActionLog (Agent Zero activity)
    const sourceLabels: Record<string, string> = {
      naabu: 'naabu port scan',
      nuclei: 'nuclei findings',
      curl: 'curl probe',
      nikto: 'nikto findings',
      sqlmap: 'sqlmap findings',
      custom: 'custom tool findings',
      nmap: 'nmap port scan',
      dirb: 'dirb directory scan',
      hydra: 'hydra credential crack',
    }
    await createActionLog({
      projectId,
      userId: project.userId,
      type: 'agent',
      action: `Agent Zero: Ingest ${sourceLabels[source] || source}`,
      description: result.stats
        ? `Ingested ${JSON.stringify(result.stats)}`
        : 'Graph updated',
      status: 'success',
      metadata: result,
    }).catch((logErr) => {
      logger.warn('ActionLog creation failed', {
        project_id: projectId,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Graph ingest error', { error })
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

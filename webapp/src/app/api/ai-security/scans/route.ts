import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildRedteamConfig } from '@/lib/ai-security/config-gen'
import { startScan } from '@/lib/ai-security/runner'
import { getProfileById } from '@/lib/ai-security/catalog'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      name,
      targetUrl,
      targetType = 'http',
      purpose,
      systemPrompt,
      plugins: bodyPlugins,
      strategies: bodyStrategies,
      profile = 'custom',
      numTests: bodyNumTests,
      projectId,
      responseParser,
      policyIds,
      customPolicy,
      language,
      mcpServers,
      testGenerationInstructions,
      httpBodyTemplate,
    } = body

    if (!targetUrl) {
      return NextResponse.json({ error: 'targetUrl is required' }, { status: 400 })
    }

    // Resolve plugins, strategies, numTests from profile when not explicitly provided
    const resolvedProfile = getProfileById(profile)
    const resolvedPlugins =
      Array.isArray(bodyPlugins) && bodyPlugins.length > 0
        ? bodyPlugins
        : (resolvedProfile?.plugins ?? ['prompt-extraction'])
    const resolvedStrategies =
      Array.isArray(bodyStrategies) && bodyStrategies.length > 0
        ? bodyStrategies
        : (resolvedProfile?.strategies ?? ['jailbreak', 'base64'])
    const resolvedNumTests =
      bodyNumTests ?? resolvedProfile?.numTests ?? 5

    if (!resolvedPlugins.length) {
      return NextResponse.json({ error: 'At least one plugin is required' }, { status: 400 })
    }

    // Resolve custom policies from DB if policyIds provided
    let customPolicies: Array<{ name: string; policyText: string; numTests?: number }> = []
    if (policyIds && Array.isArray(policyIds) && policyIds.length > 0) {
      const policies = await prisma.aIPolicy.findMany({
        where: { id: { in: policyIds } },
      })
      customPolicies = policies.map(p => ({
        name: p.name,
        policyText: p.policyText,
      }))
    }
    if (customPolicy && typeof customPolicy === 'string') {
      customPolicies.push({ name: 'Inline Policy', policyText: customPolicy })
    }

    const configYaml = buildRedteamConfig({
      targetUrl,
      targetType,
      purpose,
      systemPrompt,
      plugins: resolvedPlugins,
      strategies: resolvedStrategies,
      numTests: resolvedNumTests,
      responseParser,
      language,
      customPolicies: customPolicies.length > 0 ? customPolicies : undefined,
      mcpServers,
      testGenerationInstructions: testGenerationInstructions || undefined,
      httpBodyTemplate: httpBodyTemplate || undefined,
    })

    const scan = await prisma.aIScan.create({
      data: {
        name: name || `Scan-${new Date().toISOString().slice(0, 16)}`,
        projectId: projectId || null,
        status: 'queued',
        targetUrl,
        targetType,
        purpose: purpose || null,
        systemPrompt: systemPrompt || null,
        plugins: resolvedPlugins,
        strategies: resolvedStrategies,
        profile,
        numTests: resolvedNumTests,
        configYaml,
      },
    })

    let pid: number
    try {
      const result = await startScan(scan.id, configYaml)
      pid = result.pid

      await prisma.aIScan.update({
        where: { id: scan.id },
        data: { status: 'running', pid, startedAt: new Date() },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await prisma.aIScan.update({
        where: { id: scan.id },
        data: { status: 'failed', errorMessage: msg },
      })
      return NextResponse.json({ success: false, scanId: scan.id, error: msg }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      scanId: scan.id,
      status: 'running',
      pid,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const projectId = searchParams.get('projectId')

    const where = projectId ? { projectId } : {}

    const [scans, total] = await Promise.all([
      prisma.aIScan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          _count: { select: { findings: true } },
        },
      }),
      prisma.aIScan.count({ where }),
    ])

    return NextResponse.json({ scans, total, limit, offset })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

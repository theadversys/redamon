/**
 * GET /api/agents — List all agent profiles
 * POST /api/agents — Create a new profile (+ deploy to A0)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from "@/lib/prisma"
import { deployProfileToA0 } from '@/lib/a0-profile-manager'

export async function GET() {
  try {
    const profiles = await prisma.agentProfile.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { runs: true } },
      },
    })
    // Normalize DB fields to the shape the UI expects
    const normalized = profiles.map((p) => ({
      ...p,
      tools: p.mcpTools,          // UI uses `tools`, DB stores `mcpTools`
      successRate: p.runCount > 0
        ? Math.round((p.successCount / p.runCount) * 100)
        : 0,
    }))
    return NextResponse.json({ profiles: normalized })
  } catch (error) {
    console.error('[agents GET]', error)
    return NextResponse.json({ error: 'Failed to list profiles' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      slug,
      name,
      description,
      icon = 'bot',
      color = '#6366f1',
      tags = [],
      systemPrompt = '',
      promptFiles = {},
      modelProvider = 'anthropic',
      modelName = 'claude-opus-4-5',
      utilModelName = 'claude-haiku-4-5',
      mcpTools = [],
      skills = [],
      memoryRecall = true,
    } = body

    if (!slug || !name || !description) {
      return NextResponse.json({ error: 'slug, name, description required' }, { status: 400 })
    }

    const profile = await prisma.agentProfile.create({
      data: {
        slug,
        name,
        description,
        icon,
        color,
        tags,
        systemPrompt,
        promptFiles,
        modelProvider,
        modelName,
        utilModelName,
        mcpTools,
        skills,
        memoryRecall,
      },
    })

    // Deploy profile files to A0 volume
    await deployProfileToA0({
      slug: profile.slug,
      name: profile.name,
      description: profile.description,
      systemPrompt: profile.systemPrompt,
      promptFiles: profile.promptFiles as Record<string, string>,
      mcpTools: profile.mcpTools,
    })

    return NextResponse.json({ profile }, { status: 201 })
  } catch (error: unknown) {
    console.error('[agents POST]', error)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Profile slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }
}

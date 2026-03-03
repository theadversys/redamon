/**
 * Execute due AI scan schedules.
 * Call this route via cron (e.g. every minute) or Vercel Cron.
 * GET or POST both trigger execution.
 */
import { NextResponse } from 'next/server'
import cronParser from 'cron-parser'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { buildRedteamConfig } from '@/lib/ai-security/config-gen'
import { startScan } from '@/lib/ai-security/runner'
import { getProfileById } from '@/lib/ai-security/catalog'

function getNextCronRun(cron: string): Date {
  try {
    const expr = cronParser.parse(cron)
    const next = expr.next()
    return next instanceof Date ? next : new Date(next.getTime())
  } catch {
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}

export async function GET() {
  return runSchedules()
}

export async function POST() {
  return runSchedules()
}

async function runSchedules() {
  try {
    const now = new Date()
    const due = await prisma.aIScanSchedule.findMany({
      where: {
        enabled: true,
        OR: [
          { nextRunAt: { lte: now } },
          { nextRunAt: null },
        ],
      },
    })

    const results: Array<{ scheduleId: string; scanId?: string; error?: string }> = []

    for (const schedule of due) {
      try {
        const resolvedProfile = getProfileById(schedule.profile)
        const plugins = Array.isArray(schedule.plugins) && (schedule.plugins as string[]).length > 0
          ? (schedule.plugins as string[])
          : (resolvedProfile?.plugins ?? ['prompt-extraction'])
        const strategies = Array.isArray(schedule.strategies) && (schedule.strategies as string[]).length > 0
          ? (schedule.strategies as string[])
          : (resolvedProfile?.strategies ?? ['jailbreak', 'base64'])
        const numTests = schedule.numTests ?? resolvedProfile?.numTests ?? 5

        let customPolicies: Array<{ name: string; policyText: string; numTests?: number }> = []
        const policyIds = schedule.policyIds as string[] | undefined
        if (Array.isArray(policyIds) && policyIds.length > 0) {
          const policies = await prisma.aIPolicy.findMany({
            where: { id: { in: policyIds } },
          })
          customPolicies = policies.map(p => ({ name: p.name, policyText: p.policyText }))
        }

        const configYaml = buildRedteamConfig({
          targetUrl: schedule.targetUrl,
          targetType: schedule.targetType as 'http' | 'openai' | 'anthropic' | 'custom' | 'mcp',
          purpose: schedule.purpose ?? undefined,
          plugins,
          strategies,
          numTests,
          customPolicies: customPolicies.length > 0 ? customPolicies : undefined,
        })

        const scan = await prisma.aIScan.create({
          data: {
            name: `${schedule.name} — ${now.toISOString().slice(0, 16)}`,
            projectId: schedule.projectId,
            status: 'queued',
            targetUrl: schedule.targetUrl,
            targetType: schedule.targetType,
            purpose: schedule.purpose,
            plugins,
            strategies: strategies as Prisma.InputJsonValue,
            profile: schedule.profile,
            numTests,
            configYaml,
            scheduleId: schedule.id,
          },
        })

        const result = await startScan(scan.id, configYaml)
        await prisma.aIScan.update({
          where: { id: scan.id },
          data: { status: 'running', pid: result.pid, startedAt: new Date() },
        })

        const nextRunAt = getNextCronRun(schedule.cron)
        await prisma.aIScanSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt },
        })

        results.push({ scheduleId: schedule.id, scanId: scan.id })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ scheduleId: schedule.id, error: msg })
      }
    }

    return NextResponse.json({
      success: true,
      executed: due.length,
      results,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

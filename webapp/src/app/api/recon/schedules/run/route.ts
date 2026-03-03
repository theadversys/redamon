/**
 * Execute due recon schedules.
 * Call via cron (e.g. every minute) or Vercel Cron.
 */
import { NextResponse } from 'next/server'
import cronParser from 'cron-parser'
import prisma from '@/lib/prisma'

const RECON_ORCHESTRATOR_URL = process.env.RECON_ORCHESTRATOR_URL || 'http://localhost:8010'
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:3000'

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
    const due = await prisma.reconSchedule.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: { lte: now } }, { nextRunAt: null }],
      },
      include: {
        project: {
          select: {
            id: true,
            userId: true,
            name: true,
            targetDomain: true,
            githubTargetOrg: true,
          },
        },
      },
    })

    const results: Array<{ scheduleId: string; projectId: string; error?: string }> = []

    for (const schedule of due) {
      try {
        const project = schedule.project
        const hasTargetDomain = (project.targetDomain ?? '').trim().length > 0
        const hasGithubTarget = (project.githubTargetOrg ?? '').trim().length > 0

        if (!hasTargetDomain && !hasGithubTarget) {
          results.push({
            scheduleId: schedule.id,
            projectId: project.id,
            error: 'Project has no target domain or GitHub org',
          })
          continue
        }

        const response = await fetch(
          `${RECON_ORCHESTRATOR_URL}/recon/${project.id}/start`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: project.id,
              user_id: project.userId,
              webapp_api_url: WEBAPP_URL,
              target_domain: project.targetDomain,
            }),
          }
        )

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          results.push({
            scheduleId: schedule.id,
            projectId: project.id,
            error: errData.detail || `HTTP ${response.status}`,
          })
          continue
        }

        const nextRunAt = getNextCronRun(schedule.cron)
        await prisma.reconSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt },
        })

        results.push({ scheduleId: schedule.id, projectId: project.id })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ scheduleId: schedule.id, projectId: schedule.projectId, error: msg })
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

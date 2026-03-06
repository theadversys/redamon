import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { runId } = await params
  const body = await req.json()
  const action: string = body.action

  const run = await prisma.mobileRun.findUnique({ where: { id: runId } })
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  if (action === 'pause') {
    await prisma.mobileRun.update({ where: { id: runId }, data: { status: 'paused' } })
    await prisma.mobileRunLog.create({
      data: { runId, stage: run.currentStage, stageName: '', level: 'warning', log: '⏸️ Assessment paused by operator' },
    })
    return NextResponse.json({ status: 'paused' })
  }

  if (action === 'resume') {
    await prisma.mobileRun.update({ where: { id: runId }, data: { status: 'running' } })
    await prisma.mobileRunLog.create({
      data: { runId, stage: run.currentStage, stageName: '', level: 'info', log: '▶️ Assessment resumed' },
    })
    return NextResponse.json({ status: 'running' })
  }

  if (action === 'stop') {
    await prisma.mobileRun.update({ where: { id: runId }, data: { status: 'stopping' } })
    await prisma.mobileRunLog.create({
      data: { runId, stage: run.currentStage, stageName: '', level: 'error', log: '🛑 Assessment stopped by operator' },
    })
    return NextResponse.json({ status: 'stopping' })
  }

  if (action === 'operator_approve') {
    await prisma.mobileRun.update({
      where: { id: runId },
      data: { status: 'running', waitingForOperator: false, operatorBriefing: Prisma.DbNull },
    })
    await prisma.mobileRunLog.create({
      data: { runId, stage: run.currentStage, stageName: '', level: 'success', log: `✅ Stage ${run.currentStage} approved by operator — proceeding` },
    })
    return NextResponse.json({ status: 'running' })
  }

  if (action === 'operator_skip') {
    await prisma.mobileRun.update({
      where: { id: runId },
      data: { status: 'running', waitingForOperator: false, operatorBriefing: Prisma.DbNull },
    })
    await prisma.mobileRunLog.create({
      data: { runId, stage: run.currentStage, stageName: '', level: 'warning', log: `⏭️ Stage ${run.currentStage} skipped by operator` },
    })
    return NextResponse.json({ status: 'running' })
  }

  if (action === 'operator_stop') {
    await prisma.mobileRun.update({
      where: { id: runId },
      data: { status: 'stopping', waitingForOperator: false },
    })
    await prisma.mobileRunLog.create({
      data: { runId, stage: run.currentStage, stageName: '', level: 'error', log: `🛑 Assessment stopped at Stage ${run.currentStage} by operator` },
    })
    return NextResponse.json({ status: 'stopping' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

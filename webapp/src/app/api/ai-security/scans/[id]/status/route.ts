import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getScanState, getLogTail, killScan } from '@/lib/ai-security/runner'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params
  try {
    const scan = await prisma.aIScan.findUnique({
      where: { id },
      include: { _count: { select: { findings: true } } },
    })

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    if (scan.status === 'completed' || scan.status === 'failed' || scan.status === 'cancelled') {
      return NextResponse.json({
        scanId: scan.id,
        status: scan.status,
        totalTests: scan.totalTests,
        passedTests: scan.passedTests,
        failedTests: scan.failedTests,
        findingsCount: scan._count.findings,
        errorMessage: scan.errorMessage,
        startedAt: scan.startedAt,
        completedAt: scan.completedAt,
      })
    }

    const state = getScanState(id)
    const logTail = await getLogTail(id, 30)

    if (state.running) {
      return NextResponse.json({
        scanId: scan.id,
        status: 'running',
        logTail,
        hasOutput: state.hasOutput,
      })
    }

    // Process has exited
    if (state.hasOutput) {
      return NextResponse.json({
        scanId: scan.id,
        status: 'ready_to_ingest',
        logTail,
      })
    }

    // Process exited without output — mark as failed
    await prisma.aIScan.update({
      where: { id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: logTail.slice(-500) || 'Process exited without output',
      },
    })
    return NextResponse.json({
      scanId: scan.id,
      status: 'failed',
      errorMessage: logTail.slice(-500) || 'Process exited without output',
      logTail,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params
  try {
    killScan(id)
    await prisma.aIScan.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

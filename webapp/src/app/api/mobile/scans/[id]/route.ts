import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scan = await prisma.mobileScan.findUnique({ where: { id } })
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ scan })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { status, score, grade, findings, scorecard, cveData, mobsfHash, packageName, version, completedAt } = body
  const scan = await prisma.mobileScan.update({
    where: { id },
    data: {
      ...(status && { status }),
      ...(score !== undefined && { score }),
      ...(grade && { grade }),
      ...(findings && { findings }),
      ...(scorecard && { scorecard }),
      ...(cveData && { cveData }),
      ...(mobsfHash && { mobsfHash }),
      ...(packageName && { packageName }),
      ...(version && { version }),
      ...(completedAt && { completedAt: new Date(completedAt) }),
      ...(status === 'COMPLETE' && !completedAt && { completedAt: new Date() }),
    }
  })
  return NextResponse.json({ scan })
}

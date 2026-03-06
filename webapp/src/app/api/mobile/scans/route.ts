import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const limit = parseInt(searchParams.get('limit') ?? '20')

  const scans = await prisma.mobileScan.findMany({
    where: projectId ? { projectId } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, appName: true, packageName: true, version: true,
      platform: true, fileName: true, fileSize: true, status: true,
      score: true, grade: true, agentRunId: true, mobsfHash: true,
      startedAt: true, completedAt: true, createdAt: true, findings: true,
    }
  })
  return NextResponse.json({ scans })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { appName, platform, fileName, fileSize, projectId, mobsfHash } = body

  const scan = await prisma.mobileScan.create({
    data: {
      appName: appName || fileName?.replace(/\.(apk|ipa|appx)$/i, '') || 'Unknown App',
      platform: platform || 'ANDROID',
      fileName,
      fileSize,
      projectId,
      mobsfHash,
      status: 'UPLOADING',
    }
  })
  return NextResponse.json({ scan })
}

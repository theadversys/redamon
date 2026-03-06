import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min for large file uploads

const MOBSF_URL = process.env.MOBSF_URL || 'http://pandaexploit-mobsf:8000'
const MOBSF_API_KEY = process.env.MOBSF_API_KEY || ''
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/mobile/uploads'

export async function POST(req: NextRequest) {
  try {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch (parseErr: any) {
      return NextResponse.json(
        { error: `Failed to read uploaded file: ${parseErr.message}. Ensure file is under 200MB.` },
        { status: 400 }
      )
    }

    const file = formData.get('file') as File | null
    const projectId = formData.get('projectId') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = path.extname(file.name).toLowerCase()
    if (!['.apk', '.ipa', '.appx', '.xapk'].includes(ext)) {
      return NextResponse.json({ error: 'Unsupported file type. Upload APK, IPA, or APPX.' }, { status: 400 })
    }

    const platform = ext === '.ipa' ? 'IOS' : ext === '.appx' ? 'WINDOWS' : 'ANDROID'

    // Save file locally
    await mkdir(UPLOADS_DIR, { recursive: true })
    const savedName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const savedPath = path.join(UPLOADS_DIR, savedName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(savedPath, buffer)

    // Upload to MobSF
    const mobsfForm = new FormData()
    mobsfForm.append('file', new Blob([buffer], { type: 'application/octet-stream' }), file.name)

    const mobsfRes = await fetch(`${MOBSF_URL}/api/v1/upload`, {
      method: 'POST',
      headers: { Authorization: MOBSF_API_KEY },
      body: mobsfForm,
    })

    if (!mobsfRes.ok) {
      return NextResponse.json({ error: `MobSF upload failed: ${await mobsfRes.text()}` }, { status: 502 })
    }

    const mobsfData = await mobsfRes.json()
    const { hash, scan_type, file_name } = mobsfData

    // Create DB record
    const scan = await prisma.mobileScan.create({
      data: {
        appName: file.name.replace(/\.(apk|ipa|appx|xapk)$/i, ''),
        platform,
        fileName: file.name,
        fileSize: file.size,
        mobsfHash: hash,
        projectId,
        mobileProjectId: projectId || null,
        status: 'SCANNING',
        startedAt: new Date(),
      }
    })

    // Trigger MobSF scan (fire and forget — async)
    fetch(`${MOBSF_URL}/api/v1/scan`, {
      method: 'POST',
      headers: { Authorization: MOBSF_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ hash, scan_type, file_name }),
    }).then(async (r) => {
      const status = r.ok ? 'COMPLETE' : 'FAILED'
      let findings = null, scorecard = null, score = null, grade = null
      if (r.ok) {
        const [rptRes, scRes] = await Promise.all([
          fetch(`${MOBSF_URL}/api/v1/report_json`, {
            method: 'POST',
            headers: { Authorization: MOBSF_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ hash }),
          }),
          fetch(`${MOBSF_URL}/api/v1/scorecard`, {
            method: 'POST',
            headers: { Authorization: MOBSF_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ hash }),
          }),
        ])
        if (rptRes.ok) findings = await rptRes.json()
        if (scRes.ok) {
          scorecard = await scRes.json()
          score = (scorecard as any)?.security_score ?? null
          grade = (scorecard as any)?.security_grade ?? null
        }
      }
      await prisma.mobileScan.update({
        where: { id: scan.id },
        data: { status, findings, scorecard, score, grade, completedAt: new Date() }
      })
    }).catch(console.error)

    return NextResponse.json({ scan, mobsfHash: hash, scanType: scan_type })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

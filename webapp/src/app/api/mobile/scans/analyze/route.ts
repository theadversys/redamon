import { NextRequest, NextResponse } from 'next/server'
import { sendTask } from '@/lib/a0-client'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { scanId } = await req.json()
    if (!scanId) return NextResponse.json({ error: 'scanId required' }, { status: 400 })

    const scan = await prisma.mobileScan.findUnique({ where: { id: scanId } })
    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })

    const findings = scan.findings as any
    const scorecard = scan.scorecard as any

    // Build a concise summary for Agent Zero
    const secretCount = (findings?.secrets ?? []).length
    const codeIssues = findings?.code_analysis?.findings
      ? Object.keys(findings.code_analysis.findings).length : 0
    const manifestIssues = findings?.manifest_analysis?.findings
      ? Object.keys(findings.manifest_analysis.findings).length : 0
    const permissions = findings?.permissions?.permission_details?.filter((p: any) =>
      typeof p === 'object' ? p.status === 'dangerous' : false
    ).length ?? 0
    const insecureLibs = (findings?.libraries ?? []).filter((l: any) => l?.status === 'insecure').length

    const prompt = `You are a mobile application security expert. Analyze these mobile security scan results for ${scan.appName} (${scan.platform}) and provide:

1. **Executive Summary** – overall risk posture in 2–3 sentences
2. **Critical Issues** – top 3–5 most important findings to fix immediately
3. **Risk Areas** – brief breakdown by OWASP Mobile Top 10 category
4. **Recommended Actions** – prioritized remediation steps

Scan data:
- App: ${scan.appName} (${scan.platform})
- File: ${scan.fileName}
- Security Score: ${scan.score ?? 'N/A'}/100 (Grade: ${scan.grade ?? 'N/A'})
- Hardcoded Secrets: ${secretCount}
- Code Analysis Issues: ${codeIssues}
- Manifest Issues: ${manifestIssues}
- Dangerous Permissions: ${permissions}
- Insecure Libraries: ${insecureLibs}
${scorecard?.security_score !== undefined ? `- MobSF Security Score: ${scorecard.security_score}` : ''}
${findings?.insecure_connections?.length ? `- Insecure Network Connections: ${findings.insecure_connections.length}` : ''}
${findings?.certificate_analysis ? `- Certificate Issues: ${JSON.stringify(findings.certificate_analysis).slice(0, 200)}` : ''}

Please be specific, actionable, and concise.`

    const result = await sendTask({
      message: prompt,
      agentProfile: 'security_analyst',
    })

    return NextResponse.json({ response: result.response, contextId: result.contextId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

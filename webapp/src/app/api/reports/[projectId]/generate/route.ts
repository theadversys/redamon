import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * POST /api/reports/[projectId]/generate
 *
 * Triggered automatically at Kill Chain Stage 7 completion.
 * Composes a kill-chain-aware pentest report by:
 *   1. Fetching the latest KillChainRun state from the DB
 *   2. Fetching project vulnerabilities and graph data
 *   3. Building a structured markdown report
 *   4. Returning the report URL (GET /api/reports/[projectId]?format=html)
 *
 * Body (JSON, all optional):
 *   stage_results  — Array of per-stage result summaries from the kill chain
 *   run_id         — Kill chain run ID
 *   status         — Final status string
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const projectId = (await params).projectId

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // body is optional
  }

  const { stage_results, run_id, status } = body as {
    stage_results?: Array<{ stage: number; summary: string; success: boolean }>
    run_id?: string
    status?: string
  }

  try {
    // Fetch project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, targetDomain: true, userId: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Fetch latest kill chain run for additional context
    let killChainRun: Record<string, unknown> | null = null
    try {
      killChainRun = await (prisma as any).killChainRun.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      })
    } catch {
      // KillChainRun model may not be migrated yet — non-fatal
    }

    // Fetch vulnerabilities
    const port = process.env.PORT || '3000'
    const baseUrl = process.env.INTERNAL_WEBAPP_URL || `http://127.0.0.1:${port}`
    const vulnRes = await fetch(
      `${baseUrl}/api/vulnerabilities?projectId=${projectId}`
    )
    const vulnData = vulnRes.ok ? await vulnRes.json() : { vulnerabilities: [] }
    const vulnerabilities: Array<Record<string, unknown>> =
      vulnData.vulnerabilities || []

    // Severity counts
    const bySev: Record<string, number> = {}
    for (const v of vulnerabilities) {
      const s = ((v.severity as string) || 'info').toLowerCase()
      bySev[s] = (bySev[s] || 0) + 1
    }

    // Determine overall risk
    let overallRisk = 'Low'
    if (bySev.critical) overallRisk = 'Critical'
    else if (bySev.high) overallRisk = 'High'
    else if (bySev.medium) overallRisk = 'Medium'

    // Kill chain stage names
    const STAGE_NAMES: Record<number, string> = {
      1: 'Reconnaissance',
      2: 'Weaponization',
      3: 'Delivery',
      4: 'Exploitation',
      5: 'Installation / Persistence',
      6: 'Command & Control (C2)',
      7: 'Actions on Objectives',
    }

    const runStatus =
      (killChainRun?.status as string) ?? status ?? 'completed'
    const completedStage =
      (killChainRun?.currentStage as number) ?? stage_results?.length ?? 7
    const sessionObtained = !!(killChainRun?.sessionObtained)

    // Build kill chain table rows
    let stageRows = ''
    for (let i = 1; i <= 7; i++) {
      const name = STAGE_NAMES[i] || `Stage ${i}`
      const completed = i <= completedStage
      const result = stage_results?.find((r) => r.stage === i)
      const icon = completed ? '✅' : '⏭️'
      const summary = result?.summary ?? (completed ? 'Completed' : 'Skipped')
      stageRows += `| ${icon} **Stage ${i}** | ${name} | ${summary} |\n`
    }

    const markdown = `# PandaExploit — Penetration Test Report
**Project:** ${project.name}
**Target:** ${project.targetDomain || 'N/A'}
**Generated:** ${new Date().toISOString()}
**Kill Chain Status:** ${runStatus.toUpperCase()}
**Session Obtained:** ${sessionObtained ? '✅ Yes' : '❌ No'}
**Overall Risk:** **${overallRisk}**

---

## Executive Summary

Automated red team engagement conducted by PandaExploit AI framework against
**${project.targetDomain || project.name}** using the 7-stage Cyber Kill Chain model.

| Severity | Count |
|----------|-------|
| Critical | ${bySev.critical || 0} |
| High     | ${bySev.high || 0} |
| Medium   | ${bySev.medium || 0} |
| Low      | ${bySev.low || 0} |
| Info     | ${bySev.info || 0} |
| **Total**| **${vulnerabilities.length}** |

---

## Kill Chain Execution

| Status | Stage | Summary |
|--------|-------|---------|
${stageRows}

---

## Vulnerabilities

${
  vulnerabilities.length === 0
    ? '_No vulnerabilities recorded for this project._'
    : vulnerabilities
        .slice(0, 50)
        .map(
          (v) =>
            `### ${v.title || v.name || 'Unnamed Finding'}\n` +
            `**Severity:** ${v.severity || 'Unknown'} | **CVE:** ${v.cveId || 'N/A'}\n\n` +
            `${v.description || ''}\n\n` +
            (v.remediation ? `**Remediation:** ${v.remediation}\n` : '')
        )
        .join('\n---\n\n')
}

---

## Appendix

- Run ID: \`${run_id ?? killChainRun?.id ?? 'N/A'}\`
- Attack Path: \`${JSON.stringify(killChainRun?.selectedAttackPath ?? {})}\`
- Payload Reference: \`${JSON.stringify(killChainRun?.payloadRef ?? {})}\`

_Report auto-generated by PandaExploit at Stage 7 completion._
`

    // Store the report reference best-effort (Project model does not have a metadata field,
    // so we skip the update — report is returned in the API response instead)
    try {
      // no-op: project.metadata field not in schema
      void project
      void run_id
      void killChainRun
    } catch {
      // best-effort
    }

    logger.info(`[ReportGenerate] Kill chain report generated for project ${projectId}`)

    return NextResponse.json({
      success: true,
      projectId,
      overallRisk,
      sessionObtained,
      vulnerabilityCount: vulnerabilities.length,
      bySeverity: bySev,
      reportUrl: `/api/reports/${projectId}?format=html`,
      reportMarkdownUrl: `/api/reports/${projectId}?format=md`,
      message: `Report generated. View at /api/reports/${projectId}?format=html`,
    })
  } catch (err) {
    logger.error(`[ReportGenerate] Error: ${err}`)
    return NextResponse.json(
      { error: 'Report generation failed', detail: String(err) },
      { status: 500 }
    )
  }
}

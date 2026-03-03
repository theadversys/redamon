import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { parseOutput } from '@/lib/ai-security/result-parser'
import { getOutputPath } from '@/lib/ai-security/runner'
import { scoreFinding, scoreSystem, aggregateByPlugin } from '@/lib/ai-security/risk-scoring'
import neo4j from 'neo4j-driver'

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'changeme123',
  ),
)

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params
  try {
    const scan = await prisma.aIScan.findUnique({ where: { id } })
    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    const outputPath = await getOutputPath(id)
    let parsed
    try {
      parsed = await parseOutput(outputPath)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `Failed to parse output: ${msg}` }, { status: 500 })
    }

    // Compute per-plugin aggregations for risk scoring
    const pluginAggs = aggregateByPlugin(parsed.findings, parsed.totalTests)
    const pluginScoreMap = new Map<string, number>()
    for (const agg of pluginAggs) {
      const rs = scoreFinding({
        plugin: agg.pluginId,
        severity: agg.severity,
        totalTestsForPlugin: agg.totalTests,
        failedTestsForPlugin: agg.failedTests,
      })
      pluginScoreMap.set(agg.pluginId, rs.total)
    }

    // System-level risk score
    const systemScore = scoreSystem(pluginAggs)

    // Save findings to Postgres with per-finding risk scores
    if (parsed.findings.length > 0) {
      await prisma.aIFinding.createMany({
        data: parsed.findings.map(f => ({
          scanId: id,
          plugin: f.plugin,
          strategy: f.strategy,
          severity: f.severity,
          category: f.category,
          prompt: f.prompt.slice(0, 10000),
          response: f.response.slice(0, 10000),
          assertion: f.assertion,
          rawResult: f.rawResult as unknown as Prisma.InputJsonValue,
          riskScore: pluginScoreMap.get(f.plugin) ?? null,
        })),
      })
    }

    // Update scan record with risk scores
    await prisma.aIScan.update({
      where: { id },
      data: {
        status: 'completed',
        totalTests: parsed.totalTests,
        passedTests: parsed.passedTests,
        failedTests: parsed.failedTests,
        systemRiskScore: systemScore.total,
        riskBreakdown: systemScore as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    })

    // Ingest into Neo4j (optional; ingest succeeds even if Neo4j is down)
    let neo4jIngested = false
    if (parsed.findings.length > 0) {
      try {
        const session = driver.session()
        try {
          for (const f of parsed.findings) {
            await session.run(
              `
            MERGE (target:LLMTarget {url: $targetUrl})
            SET target.purpose = $purpose

            MERGE (scan:AIScan {id: $scanId})
            SET scan.name = $scanName, scan.completedAt = datetime()

            MERGE (finding:AIFinding {id: $findingId})
            SET finding.plugin = $plugin,
                finding.severity = $severity,
                finding.strategy = $strategy,
                finding.category = $category,
                finding.riskScore = $riskScore,
                finding.prompt = $prompt

            MERGE (target)-[:SCANNED_BY]->(scan)
            MERGE (scan)-[:FOUND]->(finding)
            MERGE (finding)-[:EXPLOITS]->(target)

            MERGE (tool:SecurityTool {name: 'Promptfoo'})
            MERGE (scan)-[:POWERED_BY]->(tool)

            FOREACH (_ IN CASE WHEN $strategy IS NOT NULL THEN [1] ELSE [] END |
              MERGE (strat:AttackStrategy {name: $strategy})
              MERGE (finding)-[:USES_STRATEGY]->(strat)
            )

            FOREACH (_ IN CASE WHEN $category IS NOT NULL THEN [1] ELSE [] END |
              MERGE (owasp:OWASPCategory {id: $category})
              MERGE (finding)-[:MAPS_TO]->(owasp)
            )
            `,
              {
                targetUrl: scan.targetUrl,
                purpose: scan.purpose || '',
                scanId: scan.id,
                scanName: scan.name,
                findingId: `${scan.id}-${f.plugin}-${parsed.findings.indexOf(f)}`,
                plugin: f.plugin,
                severity: f.severity,
                strategy: f.strategy,
                category: f.category,
                prompt: f.prompt.slice(0, 2000),
                riskScore: pluginScoreMap.get(f.plugin) ?? 0,
              },
            )
          }
          neo4jIngested = true
        } finally {
          await session.close()
        }
      } catch (err) {
        console.error('[ingest] Neo4j write failed:', err)
      }
    }

    return NextResponse.json({
      success: true,
      scanId: id,
      totalTests: parsed.totalTests,
      passedTests: parsed.passedTests,
      failedTests: parsed.failedTests,
      findingsCount: parsed.findings.length,
      systemRiskScore: systemScore.total,
      riskLabel: systemScore.label,
      neo4jIngested,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

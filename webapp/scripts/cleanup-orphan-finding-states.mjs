#!/usr/bin/env node
/**
 * Reconcile orphaned FindingState rows (no matching Neo4j Vulnerability).
 *
 * FindingState.vulnId references Neo4j Vulnerability.id. When a vuln is
 * re-ingested with a different ID or deleted, FindingState becomes orphaned.
 *
 * Usage (from webapp/):
 *   node scripts/cleanup-orphan-finding-states.mjs [--dry-run] [--project-id ID]
 *
 * Options:
 *   --dry-run     List orphans without deleting
 *   --project-id  Limit to a specific project
 */

import { PrismaClient } from '@prisma/client'
import neo4j from 'neo4j-driver'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webappRoot = join(__dirname, '..')
const projectRoot = join(webappRoot, '..')
config({ path: join(projectRoot, '.env') })

const prisma = new PrismaClient()

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687'
const user = process.env.NEO4J_USER || 'neo4j'
const password = process.env.NEO4J_PASSWORD || 'password'

async function getNeo4jVulnIds(projectId = null) {
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  try {
    const session = driver.session()
    let query = 'MATCH (v:Vulnerability) WHERE v.project_id IS NOT NULL RETURN v.id as id'
    const params = {}
    if (projectId) {
      query = 'MATCH (v:Vulnerability {project_id: $projectId}) RETURN v.id as id'
      params.projectId = projectId
    }
    const result = await session.run(query, params)
    const ids = new Set(result.records.map((r) => r.get('id')))
    await session.close()
    return ids
  } finally {
    await driver.close()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const projectIdIdx = args.indexOf('--project-id')
  const projectId = projectIdIdx >= 0 ? args[projectIdIdx + 1] : null

  if (projectIdIdx >= 0 && !projectId) {
    console.error('--project-id requires a value')
    process.exit(1)
  }

  console.log('Fetching Vulnerability IDs from Neo4j...')
  let neo4jIds
  try {
    neo4jIds = await getNeo4jVulnIds(projectId)
  } catch (err) {
    console.error('Neo4j connection failed:', err.message)
    process.exit(1)
  }
  console.log(`  Found ${neo4jIds.size} vulnerabilities in Neo4j`)

  if (neo4jIds.size === 0) {
    console.log('No vulnerabilities in Neo4j. Skipping to avoid accidental mass deletion.')
    await prisma.$disconnect()
    return
  }

  const notInIds = Array.from(neo4jIds)
  const where = projectId
    ? { projectId, vulnId: { notIn: notInIds } }
    : { vulnId: { notIn: notInIds } }
  const orphans = await prisma.findingState.findMany({
    where,
    include: { _count: { select: { comments: true } } },
  })

  if (orphans.length === 0) {
    console.log('No orphaned FindingState rows found.')
    await prisma.$disconnect()
    return
  }

  console.log(`\nFound ${orphans.length} orphaned FindingState row(s):`)
  for (const o of orphans) {
    console.log(`  - projectId=${o.projectId} vulnId=${o.vulnId} status=${o.status} (${o._count.comments} comments)`)
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made. Run without --dry-run to delete.')
    await prisma.$disconnect()
    return
  }

  const ids = orphans.map((o) => o.id)
  await prisma.findingState.deleteMany({ where: { id: { in: ids } } })
  console.log(`\nDeleted ${orphans.length} orphaned FindingState row(s).`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

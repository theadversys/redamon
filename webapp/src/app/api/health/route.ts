import { verifyConnection } from '../graph/neo4j'

export async function GET() {
  const neo4j = (await verifyConnection()) ? 'ok' : 'unavailable'
  return Response.json({ status: 'ok', neo4j })
}

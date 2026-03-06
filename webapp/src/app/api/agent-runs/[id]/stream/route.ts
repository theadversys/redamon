/**
 * GET /api/agent-runs/[id]/stream
 * SSE endpoint that streams logs from an AgentRun record in real-time.
 * Polls the DB every 1.5s and emits new log entries to the client.
 */

import { NextRequest } from 'next/server'
import { prisma } from "@/lib/prisma"

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const encoder = new TextEncoder()
  let lastLogIndex = 0
  let consecutive404 = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const poll = async () => {
        try {
          const run = await prisma.agentRun.findUnique({
            where: { id },
            select: { status: true, logs: true, result: true, a0ContextId: true },
          })

          if (!run) {
            consecutive404++
            if (consecutive404 >= 3) {
              send({ type: 'error', message: `Run ${id} not found` })
              controller.close()
            }
            return
          }
          consecutive404 = 0

          const logs = (run.logs as Array<{ timestamp: string; level: string; message: string }>) || []

          // Emit any new log entries since last poll
          const newLogs = logs.slice(lastLogIndex)
          for (const log of newLogs) {
            send({ type: 'log', level: log.level, message: log.message, timestamp: log.timestamp })
          }
          lastLogIndex = logs.length

          // Emit terminal status
          if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
            send({ type: 'done', status: run.status, result: run.result })
            controller.close()
          }
        } catch (err) {
          console.error('[stream poll]', err)
        }
      }

      // Initial poll + heartbeat interval
      await poll()
      const interval = setInterval(async () => {
        try {
          await poll()
        } catch {
          clearInterval(interval)
          controller.close()
        }
      }, 1500)

      // Stop polling if client disconnects
      // (controller.close() in terminal states above handles this)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

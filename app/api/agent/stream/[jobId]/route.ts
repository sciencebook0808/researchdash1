/**
 * GET /api/agent/stream/[jobId]
 *
 * SSE reconnection endpoint for the background agent job system.
 *
 * When a user navigates away and returns during an active agent run,
 * the client reconnects here to:
 *   1. Replay all checkpointed events from the DB (from `?from=N` sequence)
 *   2. Poll for new events every 500ms while job is still RUNNING
 *   3. Close the stream when job reaches COMPLETED or FAILED
 *
 * Query params:
 *   ?from=N   Start replaying from sequence N (default 0 = full replay)
 *
 * Stream format: same SSE format as /api/agent
 */

import { requireReadAuth } from "@/lib/api-auth"
import { getJobWithEvents, pollNewEvents } from "@/lib/agent-job"

export const maxDuration = 300

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authResult = await requireReadAuth()
  if (!authResult.ok) return authResult.response

  try {
    const { jobId }         = await params
    const { searchParams }  = new URL(req.url)
    const fromSequence      = Math.max(0, parseInt(searchParams.get("from") || "0", 10))

    // Load job + all checkpointed events from the requested sequence
    const result = await getJobWithEvents(jobId, fromSequence)
    if (!result) {
      return new Response(
        `data: ${JSON.stringify({ type: "error", text: "Job not found" })}\n\n`,
        {
          status: 404,
          headers: { "Content-Type": "text/event-stream" },
        }
      )
    }

    const { job, events: historicEvents } = result
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (payload: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
          } catch {
            // controller may be closed if client disconnected
          }
        }

        // ── Step 1: Replay all checkpointed events ─────────────────────────
        for (const event of historicEvents) {
          enqueue(event.data as object)
        }

        // ── Step 2: If already done, close immediately ─────────────────────
        if (job.status === "COMPLETED" || job.status === "FAILED") {
          // Ensure client gets a done event even on replay
          const hasDone = historicEvents.some(e => {
            const d = e.data as Record<string, unknown>
            return d?.type === "done"
          })
          if (!hasDone) {
            enqueue({ type: "done" })
          }
          controller.close()
          return
        }

        // ── Step 3: Poll for live events while job is RUNNING ──────────────
        let lastSeq     = historicEvents.length > 0
          ? historicEvents[historicEvents.length - 1].sequence
          : fromSequence - 1
        let pollCount   = 0
        const MAX_POLLS = 600 // 600 × 500ms = 5 minutes max

        while (pollCount < MAX_POLLS) {
          pollCount++
          await sleep(500)

          const { events: newEvents, status } = await pollNewEvents(jobId, lastSeq)

          for (const e of newEvents) {
            enqueue(e.data as object)
            lastSeq = e.sequence
          }

          // Check if job finished
          if (status === "COMPLETED" || status === "FAILED") {
            // Ensure done event
            const hasDone = newEvents.some(e => {
              const d = e.data as Record<string, unknown>
              return d?.type === "done"
            })
            if (!hasDone) {
              enqueue({ type: "done" })
            }
            break
          }
        }

        // Timeout reached
        if (pollCount >= MAX_POLLS) {
          enqueue({ type: "error", text: "Stream timeout — job may still be running." })
        }

        try {
          controller.close()
        } catch { /* already closed */ }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "Connection":        "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error"
    return new Response(
      `data: ${JSON.stringify({ type: "error", text: msg })}\n\ndata: ${JSON.stringify({ type: "done" })}\n\n`,
      {
        status: 500,
        headers: { "Content-Type": "text/event-stream" },
      }
    )
  }
}

/**
 * POST /api/agent
 *
 * Agentic chat endpoint powered by the Vercel AI SDK.
 *
 * UPGRADED (Background Job + Checkpointing):
 *   - Creates an AgentJob record before streaming begins
 *   - Every SSE event is checkpointed to AgentJobEvent table via onCheckpoint
 *   - Job ID is returned in the X-Job-Id response header
 *   - Client stores jobId per session in localStorage for reconnection
 *   - File attachments accepted and forwarded to agent engine
 *
 * Stream format (SSE):
 *   data: { type: "status",        text: "Searching...",  step: N }
 *   data: { type: "tool_call",     tool: "...", text: "...", args: {...}, step: N }
 *   data: { type: "tool_result",   tool: "...", result: {...}, step: N }
 *   data: { type: "text",          text: "..." }
 *   data: { type: "project_switch", projectId: "...", projectName: "..." }
 *   data: { type: "done" }
 *   data: { type: "error",         text: "..." }
 */

import { NextResponse }     from "next/server"
import { requireWriteAuth } from "@/lib/api-auth"
import { runAgent, CheckpointEvent, AgentAttachment } from "@/lib/agent-engine"
import { createAgentJob, appendJobEvent, finalizeAgentJob } from "@/lib/agent-job"

export const maxDuration = 300 // 5 minutes

export async function POST(req: Request) {
  const authResult = await requireWriteAuth()
  if (!authResult.ok) return authResult.response

  try {
    const body = await req.json()
    const {
      message,
      history     = [],
      provider    = "gemini",
      model       = "gemini-2.5-flash",
      sessionId,
      currentProjectId,
      sessionMemory,
      attachments = [] as AgentAttachment[],
    } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // ── Create background job record ───────────────────────────────────────
    // Non-fatal: if DB is unavailable streaming still works, just no persistence.
    const job = sessionId
      ? await createAgentJob(sessionId, provider, model)
      : null

    // ── Build checkpoint saver ─────────────────────────────────────────────
    let sequence = 0
    let accumulatedContent = ""

    const onCheckpoint = async (event: CheckpointEvent): Promise<void> => {
      if (!job) return

      const seq = sequence++

      // Track accumulated text for finalizing
      if (event.type === "text" && event.text) {
        accumulatedContent += event.text
      }

      await appendJobEvent(job.id, seq, event.type, event)

      // On done/error, finalize job status
      if (event.type === "done") {
        await finalizeAgentJob(job.id, "COMPLETED", accumulatedContent)
      }
      if (event.type === "error") {
        await finalizeAgentJob(job.id, "FAILED", undefined, event.text)
      }
    }

    // ── Start streaming ────────────────────────────────────────────────────
    const stream = runAgent({
      message:          message.trim(),
      history,
      provider,
      model,
      currentProjectId: currentProjectId || null,
      sessionMemory:    sessionMemory    || null,
      attachments:      attachments      || [],
      onCheckpoint,
    })

    return new Response(stream, {
      headers: {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "Connection":        "keep-alive",
        "X-Accel-Buffering": "no",
        // Surface job ID so client can store it for reconnection
        "X-Job-Id":          job?.id || "",
        // Allow the header to be read from browser fetch
        "Access-Control-Expose-Headers": "X-Job-Id",
      },
    })
  } catch (err) {
    console.error("[/api/agent] Route error:", err)
    const msg = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

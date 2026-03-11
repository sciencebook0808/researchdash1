/**
 * POST /api/agent
 *
 * Agentic chat endpoint powered by the Vercel AI SDK.
 * Replaces /api/chat for the main chat widget.
 * /api/chat is kept for backward compatibility.
 *
 * Stream format (SSE):
 *   data: { type: "status",      text: "🔍 Searching…",   step: N }
 *   data: { type: "tool_call",   tool: "search_internal_docs", text: "…", args: {…}, step: N }
 *   data: { type: "tool_result", tool: "search_internal_docs", result: {…}, step: N }
 *   data: { type: "text",        text: "…" }          ← streamed tokens
 *   data: { type: "done" }
 *   data: { type: "error",       text: "…" }
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { runAgent } from "@/lib/agent-engine"

export const maxDuration = 120 // Allow up to 2 min for agentic loops

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { message, history = [], provider = "gemini", model = "gemini-2.5-flash" } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    const stream = runAgent({ message: message.trim(), history, provider, model })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    console.error("Agent route error:", err)
    const msg = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

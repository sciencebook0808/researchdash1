/**
 * GET /api/agent/active-job?sessionId=...
 *
 * Returns the most recent RUNNING AgentJob for a given session.
 * Used by the chat page on load to detect if an agent is still running
 * from a previous browser session (handles the "user closed browser" case).
 *
 * Only returns jobs created within the last 5 minutes (Vercel maxDuration window).
 */

import { NextResponse }   from "next/server"
import { requireReadAuth } from "@/lib/api-auth"
import { prisma }         from "@/lib/prisma"

export const maxDuration = 10

export async function GET(req: Request) {
  const authResult = await requireReadAuth()
  if (!authResult.ok) return authResult.response

  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json({ job: null })
    }

    // Only look for jobs within the last 5 minutes (Vercel maxDuration = 300s)
    // If the job started more than 5 minutes ago it's certainly done
    const cutoff = new Date(Date.now() - 5 * 60 * 1000)

    const job = await prisma.agentJob.findFirst({
      where: {
        sessionId,
        status:    "RUNNING",
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
      select:  { id: true, status: true, createdAt: true },
    })

    return NextResponse.json({ job: job ?? null })
  } catch (err) {
    console.error("[/api/agent/active-job]", err)
    return NextResponse.json({ job: null })
  }
}

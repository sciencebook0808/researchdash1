/**
 * POST /api/agent/workflow
 *
 * Trigger autonomous agentic workflows programmatically.
 * Used by the CRM UI to auto-trigger agent actions on events like:
 *   - Dataset uploaded → dataset_intelligence workflow
 *   - Experiment completed → documentation_automation workflow
 *   - User marks roadmap milestone → roadmap_autopilot workflow
 *   - Model version created → model_benchmark workflow
 *
 * Body:
 *   { workflow: WorkflowType, payload: Record<string, unknown>, provider?: string, model?: string }
 */

import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { runWorkflow } from "@/lib/agent-engine"
import { prisma } from "@/lib/prisma"

function getSuperAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.trim() || process.env.SUPPER_ADMIN_EMAIL?.trim() || null
}

export const maxDuration = 120

const ALLOWED_WORKFLOWS = [
  "documentation_automation",
  "roadmap_autopilot",
  "experiment_planning",
  "research_autopilot",
  "dataset_intelligence",
  "model_benchmark",
] as const

type WorkflowType = typeof ALLOWED_WORKFLOWS[number]

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Super admin check FIRST (no DB needed)
    const clerkUser = await currentUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ""
    const superAdminEmail = getSuperAdminEmail()
    const isSuperAdmin = !!superAdminEmail && !!email && email.toLowerCase() === superAdminEmail.toLowerCase()

    if (!isSuperAdmin) {
      // DB role lookup for non-super-admins
      const user = await prisma.user.findUnique({ where: { clerkId: userId } })
      if (!user || !["super_admin", "admin", "developer"].includes(user.role)) {
        return NextResponse.json({ error: "Forbidden: workflow triggers require developer role or higher" }, { status: 403 })
      }
    }

    const body = await req.json()
    const { workflow, payload = {}, provider = "gemini", model = "gemini-2.5-flash" } = body

    if (!workflow || !ALLOWED_WORKFLOWS.includes(workflow as WorkflowType)) {
      return NextResponse.json({
        error: `Invalid workflow. Must be one of: ${ALLOWED_WORKFLOWS.join(", ")}`,
      }, { status: 400 })
    }

    const stream = runWorkflow(
      workflow as WorkflowType,
      payload,
      { history: [], provider, model }
    )

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Workflow-Type": workflow,
      },
    })
  } catch (err) {
    console.error("Workflow route error:", err)
    const msg = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    availableWorkflows: ALLOWED_WORKFLOWS,
    description: "POST with { workflow, payload, provider?, model? } to trigger an autonomous agent workflow",
  })
}

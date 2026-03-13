import { NextResponse } from "next/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { requireWriteAuth } from "@/lib/api-auth"

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json([])
  }

  try {
    const steps = await prisma.roadmapStep.findMany({
      orderBy: { order: "asc" },
      include: { tasks: { orderBy: { createdAt: "asc" } } },
    })
    return NextResponse.json(steps)
  } catch (error) {
    console.error("Roadmap GET error:", error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 })
  }

  const auth = await requireWriteAuth()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    if (!body.title || body.phase === undefined) {
      return NextResponse.json({ error: "title and phase are required" }, { status: 400 })
    }
    const step = await prisma.roadmapStep.create({
      data: {
        phase: body.phase,
        title: body.title,
        description: body.description || "",
        status: "PENDING",
        order: body.order || body.phase || 99,
        priority: body.priority || null,
        milestone: body.milestone || null,
        estimatedCompletion: body.estimatedCompletion ? new Date(body.estimatedCompletion) : null,
        progressPercent: body.progressPercent ? Number(body.progressPercent) : 0,
        tasks: body.tasks ? { create: body.tasks } : undefined,
      },
      include: { tasks: true },
    })
    return NextResponse.json(step)
  } catch (error) {
    console.error("Roadmap POST error:", error)
    return NextResponse.json({ error: "Failed to create roadmap step" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { requireWriteAuth } from "@/lib/api-auth"

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json([])
  }

  try {
    const experiments = await prisma.experiment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        dataset: { select: { name: true } },
        logs: { orderBy: { step: "asc" } },
      },
    })
    return NextResponse.json(experiments)
  } catch (error) {
    console.error("Experiments GET error:", error)
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
    if (!body.name || !body.baseModel) {
      return NextResponse.json({ error: "name and baseModel are required" }, { status: 400 })
    }
    const exp = await prisma.experiment.create({
      data: {
        name: body.name,
        description: body.description,
        baseModel: body.baseModel,
        datasetId: body.datasetId || null,
        method: body.method || null,
        resultSummary: body.resultSummary || null,
        status: "PENDING",
        loraRank: body.loraRank ? Number(body.loraRank) : null,
        loraAlpha: body.loraAlpha ? Number(body.loraAlpha) : null,
        batchSize: body.batchSize ? Number(body.batchSize) : null,
        learningRate: body.learningRate ? Number(body.learningRate) : null,
        epochs: body.epochs ? Number(body.epochs) : null,
        config: body.config || null,
      },
      include: { dataset: { select: { name: true } }, logs: true },
    })
    return NextResponse.json(exp)
  } catch (error) {
    console.error("Experiments POST error:", error)
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { requireWriteAuth } from "@/lib/api-auth"

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json([])
  }

  try {
    const models = await prisma.modelVersion.findMany({
      orderBy: { createdAt: "desc" },
      include: { experiment: { select: { name: true } } },
    })
    return NextResponse.json(
      models.map((m) => ({
        ...m,
        parameterCount: m.parameterCount?.toString() ?? null,
        fileSizeBytes: m.fileSizeBytes?.toString() ?? null,
      }))
    )
  } catch (err) {
    console.error("GET /api/models error:", err)
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
    const model = await prisma.modelVersion.create({
      data: {
        name: body.name,
        version: body.version,
        description: body.description,
        parameterCount: body.parameterCount ? BigInt(body.parameterCount) : null,
        experimentId: body.experimentId || null,
        quantization: body.quantization || null,
        deploymentFormat: body.deploymentFormat || null,
        pass1Score: body.pass1Score ? Number(body.pass1Score) : null,
        bleuScore: body.bleuScore ? Number(body.bleuScore) : null,
        mmluScore: body.mmluScore ? Number(body.mmluScore) : null,
        fileSizeBytes: body.fileSizeBytes ? BigInt(body.fileSizeBytes) : null,
        isDeployed: body.isDeployed || false,
        notes: body.notes || null,
      },
    })
    return NextResponse.json({
      ...model,
      parameterCount: model.parameterCount?.toString() ?? null,
      fileSizeBytes: model.fileSizeBytes?.toString() ?? null,
    })
  } catch (err) {
    console.error("POST /api/models error:", err)
    return NextResponse.json({ error: "Failed to create model" }, { status: 500 })
  }
}

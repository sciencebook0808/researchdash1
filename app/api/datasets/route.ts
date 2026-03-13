import { NextResponse } from "next/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { requireWriteAuth } from "@/lib/api-auth"

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json([])
  }

  try {
    const datasets = await prisma.dataset.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(
      datasets.map((d) => ({
        ...d,
        sizeBytes: d.sizeBytes?.toString() ?? null,
        numSamples: d.numSamples,
      }))
    )
  } catch (error) {
    console.error("Datasets GET error:", error)
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
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }
    const dataset = await prisma.dataset.create({
      data: {
        name: body.name,
        description: body.description,
        sourceUrl: body.sourceUrl,
        datasetType: body.datasetType || "CODE",
        numSamples: body.numSamples ? Number(body.numSamples) : null,
        sizeBytes: body.sizeBytes ? BigInt(body.sizeBytes) : null,
        preprocessStatus: "RAW",
        tags: body.tags || [],
        format: body.format,
        license: body.license,
      },
    })
    return NextResponse.json({
      ...dataset,
      sizeBytes: dataset.sizeBytes?.toString() ?? null,
    })
  } catch (error) {
    console.error("Datasets POST error:", error)
    return NextResponse.json({ error: "Failed to create dataset" }, { status: 500 })
  }
}


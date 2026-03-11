import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
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


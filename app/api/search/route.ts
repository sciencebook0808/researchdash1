/**
 * GET /api/search?q=query&sources=docs,experiments
 *
 * Global search across all CRM entities.
 * Used by the chat widget's @mention references and the knowledge graph UI.
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"

export async function GET(req: Request) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ query: "", totalFound: 0, results: {} })
    }

    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim()
    const sourcesParam = searchParams.get("sources")
    const limit = Math.min(parseInt(searchParams.get("limit") || "5"), 10)

    if (!q || q.length < 2) return NextResponse.json({ results: [], query: q })

    const sources = sourcesParam ? sourcesParam.split(",") : ["docs", "experiments", "datasets", "notes", "roadmap", "models"]
    const results: Record<string, unknown[]> = {}

    await Promise.all([
      sources.includes("docs") && prisma.documentationPage.findMany({
        where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] },
        select: { id: true, title: true, slug: true, section: true, tags: true },
        take: limit,
        orderBy: { updatedAt: "desc" },
      }).then(docs => { results.docs = docs }),

      sources.includes("experiments") && prisma.experiment.findMany({
        where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { baseModel: { contains: q, mode: "insensitive" } }] },
        select: { id: true, name: true, status: true, baseModel: true, method: true },
        take: limit,
      }).then(exps => { results.experiments = exps }),

      sources.includes("datasets") && prisma.dataset.findMany({
        where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
        select: { id: true, name: true, datasetType: true, preprocessStatus: true },
        take: limit,
      }).then(ds => { results.datasets = ds }),

      sources.includes("notes") && prisma.note.findMany({
        where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] },
        select: { id: true, title: true, tags: true },
        take: limit,
        orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      }).then(notes => { results.notes = notes }),

      sources.includes("roadmap") && prisma.roadmapStep.findMany({
        where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] },
        select: { id: true, title: true, phase: true, status: true },
        take: limit,
      }).then(steps => { results.roadmap = steps }),

      sources.includes("models") && prisma.modelVersion.findMany({
        where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { version: { contains: q, mode: "insensitive" } }] },
        select: { id: true, name: true, version: true, isDeployed: true },
        take: limit,
      }).then(models => { results.models = models }),
    ])

    const totalFound = Object.values(results).reduce((acc, arr) => acc + (arr?.length || 0), 0)
    return NextResponse.json({ query: q, totalFound, results })
  } catch (err) {
    console.error("Search error:", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { requireWriteAuth } from "@/lib/api-auth"

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json([])
  }

  try {
    const pages = await prisma.documentationPage.findMany({
      orderBy: [{ section: "asc" }, { order: "asc" }],
    })
    return NextResponse.json(pages)
  } catch (err) {
    console.error("GET /api/docs error:", err)
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

    const existing = await prisma.documentationPage.findUnique({
      where: { slug: body.slug },
    })
    if (existing) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 400 })
    }

    const page = await prisma.documentationPage.create({
      data: {
        title: body.title,
        slug: body.slug,
        content: body.content,
        section: body.section || "Uncategorized",
        order: body.order || 99,
        tags: body.tags || [],
      },
    })
    return NextResponse.json(page)
  } catch (err) {
    console.error("POST /api/docs error:", err)
    return NextResponse.json({ error: "Failed to create doc" }, { status: 500 })
  }
}

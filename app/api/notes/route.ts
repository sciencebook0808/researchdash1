import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const notes = await prisma.note.findMany({ orderBy: { updatedAt: "desc" } })
    return NextResponse.json(notes)
  } catch (error) {
    console.error("Notes GET error:", error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.title || !body.content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 })
    }
    const note = await prisma.note.create({
      data: {
        title: body.title,
        content: body.content,
        tags: body.tags || [],
        pinned: body.pinned || false,
      },
    })
    return NextResponse.json(note)
  } catch (error) {
    console.error("Notes POST error:", error)
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 })
  }
}


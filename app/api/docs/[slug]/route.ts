import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const page = await prisma.documentationPage.findUnique({
    where: { slug },
    include: { versions: { orderBy: { version: "desc" }, take: 10 } }
  })

  if (!page) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(page)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const body = await req.json()

  // Save a version snapshot before updating content
  const current = await prisma.documentationPage.findUnique({
    where: { slug }
  })

  if (current && body.content && body.content !== current.content) {
    const versionCount = await prisma.docVersion.count({
      where: { pageId: current.id }
    })

    await prisma.docVersion.create({
      data: {
        pageId: current.id,
        content: current.content,
        version: versionCount + 1
      }
    })
  }

  const page = await prisma.documentationPage.update({
    where: { slug },
    data: {
      ...(body.title && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
      ...(body.section && { section: body.section }),
      ...(body.tags && { tags: body.tags }),
      ...(body.progress && { progress: body.progress }),
    }
  })

  return NextResponse.json(page)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  await prisma.documentationPage.delete({
    where: { slug }
  })

  return NextResponse.json({ ok: true })
}

/**
 * PATCH  /api/chat-sessions/[sessionId]  → rename / change visibility
 * DELETE /api/chat-sessions/[sessionId]  → delete session
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const ALLOWED_ROLES = ["super_admin", "admin", "developer"]

async function getUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await getUser(userId)
    if (!dbUser || !ALLOWED_ROLES.includes(dbUser.role)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 })
    }

    const { sessionId } = await params

    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } })
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })

    const canEdit =
      session.creatorId === userId ||
      dbUser.role === "super_admin" ||
      dbUser.role === "admin"
    if (!canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const { title, visibility } = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}
    if (title !== undefined) data.title = title.trim() || "Untitled"
    if (visibility !== undefined) data.visibility = visibility === "private" ? "private" : "team"

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data,
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error("ChatSession PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await getUser(userId)
    if (!dbUser || !ALLOWED_ROLES.includes(dbUser.role)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 })
    }

    const { sessionId } = await params

    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } })
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })

    const canDelete =
      session.creatorId === userId ||
      dbUser.role === "super_admin" ||
      dbUser.role === "admin"
    if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await prisma.chatSession.delete({ where: { id: sessionId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("ChatSession DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

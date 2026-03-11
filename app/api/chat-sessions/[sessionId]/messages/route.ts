/**
 * GET  /api/chat-sessions/[sessionId]/messages  → paginated messages
 * POST /api/chat-sessions/[sessionId]/messages  → append messages
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const ALLOWED_ROLES = ["super_admin", "admin", "developer"]
const PAGE_SIZE = 50

async function getUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

async function canAccessSession(session: { creatorId: string; visibility: string }, userId: string, role: string) {
  if (role === "super_admin" || role === "admin") return true
  if (session.visibility === "team") return true
  if (session.creatorId === userId) return true
  return false
}

export async function GET(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await getUser(userId)
    if (!dbUser || !ALLOWED_ROLES.includes(dbUser.role)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id: params.sessionId } })
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })

    if (!await canAccessSession(session, userId, dbUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const skip = (page - 1) * PAGE_SIZE

    const [messages, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { sessionId: params.sessionId },
        orderBy: { createdAt: "asc" },
        skip,
        take: PAGE_SIZE,
        select: { id: true, role: true, content: true, metadata: true, createdAt: true },
      }),
      prisma.chatMessage.count({ where: { sessionId: params.sessionId } }),
    ])

    return NextResponse.json({ messages, total, page, pageSize: PAGE_SIZE })
  } catch (err) {
    console.error("ChatMessages GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await getUser(userId)
    if (!dbUser || !ALLOWED_ROLES.includes(dbUser.role)) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id: params.sessionId } })
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })

    const { messages } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 })
    }

    // Batch-insert messages and bump session updatedAt
    await prisma.$transaction([
      prisma.chatMessage.createMany({
        data: messages.map((m: { role: string; content: string; metadata?: unknown }) => ({
          sessionId: params.sessionId,
          role: m.role,
          content: m.content,
          metadata: m.metadata ?? undefined,
        })),
      }),
      prisma.chatSession.update({
        where: { id: params.sessionId },
        data: { updatedAt: new Date() },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("ChatMessages POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

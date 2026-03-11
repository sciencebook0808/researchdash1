/**
 * GET  /api/chat-sessions  → list sessions (role-gated)
 * POST /api/chat-sessions  → create session
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const ALLOWED_ROLES = ["super_admin", "admin", "developer"]
const PAGE_SIZE = 30

async function getUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } })
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await getUser(userId)
    if (!dbUser || !ALLOWED_ROLES.includes(dbUser.role)) {
      return NextResponse.json({ error: "Access denied. This feature is restricted to internal developers." }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const skip = (page - 1) * PAGE_SIZE

    // super_admin / admin see all team sessions + private their own
    // developer sees team sessions + their own private
    const where =
      dbUser.role === "super_admin"
        ? {} // see everything
        : dbUser.role === "admin"
        ? {
            OR: [
              { visibility: "team" as const },
              { creatorId: userId, visibility: "private" as const },
            ],
          }
        : {
            OR: [
              { visibility: "team" as const },
              { creatorId: userId },
            ],
          }

    const [sessions, total] = await Promise.all([
      prisma.chatSession.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          creatorId: true,
          creatorName: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      }),
      prisma.chatSession.count({ where }),
    ])

    return NextResponse.json({ sessions, total, page, pageSize: PAGE_SIZE })
  } catch (err) {
    console.error("ChatSessions GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const dbUser = await getUser(userId)
    if (!dbUser || !ALLOWED_ROLES.includes(dbUser.role)) {
      return NextResponse.json({ error: "Access denied. This feature is restricted to internal developers." }, { status: 403 })
    }

    const { title, visibility } = await req.json().catch(() => ({}))

    const session = await prisma.chatSession.create({
      data: {
        title: title?.trim() || "New Chat",
        creatorId: userId,
        creatorName: dbUser.name || dbUser.email,
        visibility: visibility === "private" ? "private" : "team",
      },
    })

    return NextResponse.json(session)
  } catch (err) {
    console.error("ChatSessions POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

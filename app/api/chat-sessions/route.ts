/**
 * GET  /api/chat-sessions  — list sessions (role-gated)
 * POST /api/chat-sessions  — create session
 *
 * Role check: super_admin email is verified BEFORE DB lookup.
 * This prevents 403s when the DB is temporarily unreachable.
 */

import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"

const ALLOWED_ROLES = new Set(["super_admin", "admin", "developer"])
const PAGE_SIZE = 30

function getSuperAdminEmail(): string | null {
  return (
    process.env.SUPER_ADMIN_EMAIL?.trim() ||
    process.env.SUPPER_ADMIN_EMAIL?.trim() ||
    null
  )
}

/** Returns { dbUser, effectiveRole } or null if access denied */
async function resolveUser(userId: string) {
  // 1. Check super_admin by email first (no DB needed)
  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ""
  const superAdminEmail = getSuperAdminEmail()
  const isSuperAdmin =
    !!superAdminEmail && !!email &&
    email.toLowerCase() === superAdminEmail.toLowerCase()

  if (isSuperAdmin) {
    // Try to get/create DB record for full object, but don't require it
    try {
      let dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: {
            clerkId: userId,
            email,
            name: clerkUser?.fullName ?? undefined,
            imageUrl: clerkUser?.imageUrl ?? undefined,
            role: "super_admin",
          },
        })
      } else if (dbUser.role !== "super_admin") {
        dbUser = await prisma.user.update({
          where: { clerkId: userId },
          data: { role: "super_admin" },
        })
      }
      return { dbUser, effectiveRole: "super_admin" }
    } catch {
      // DB unavailable — return fallback super_admin object
      return {
        dbUser: { id: "fallback", clerkId: userId, email, name: null, imageUrl: null, role: "super_admin" as const, createdAt: new Date(), updatedAt: new Date() },
        effectiveRole: "super_admin",
      }
    }
  }

  // 2. Normal DB role lookup
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  if (!dbUser) return null
  return { dbUser, effectiveRole: dbUser.role }
}

export async function GET(req: Request) {
  try {
    // Early check for database availability
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ 
        sessions: [], 
        total: 0, 
        page: 1, 
        pageSize: PAGE_SIZE,
        warning: "Database not configured. Chat sessions require a database connection."
      })
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolved = await resolveUser(userId)
    if (!resolved || !ALLOWED_ROLES.has(resolved.effectiveRole)) {
      return NextResponse.json(
        { error: "Access denied. This feature is restricted to internal developers." },
        { status: 403 }
      )
    }

    const { dbUser, effectiveRole } = resolved
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const skip = (page - 1) * PAGE_SIZE

    const where =
      effectiveRole === "super_admin"
        ? {}
        : effectiveRole === "admin"
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
          id: true, title: true, creatorId: true, creatorName: true,
          visibility: true, createdAt: true, updatedAt: true,
          _count: { select: { messages: true } },
        },
      }),
      prisma.chatSession.count({ where }),
    ])

    return NextResponse.json({ sessions, total, page, pageSize: PAGE_SIZE })
  } catch (err) {
    console.error("[/api/chat-sessions GET] Error:", {
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json({ 
        error: "Database not configured. Chat sessions require a database connection." 
      }, { status: 503 })
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const resolved = await resolveUser(userId)
    if (!resolved || !ALLOWED_ROLES.has(resolved.effectiveRole)) {
      return NextResponse.json(
        { error: "Access denied. This feature is restricted to internal developers." },
        { status: 403 }
      )
    }

    const { dbUser } = resolved
    const { title, visibility } = await req.json().catch(() => ({}))

    const session = await prisma.chatSession.create({
      data: {
        title:       title?.trim() || "New Chat",
        creatorId:   userId,
        creatorName: dbUser.name || dbUser.email,
        visibility:  visibility === "private" ? "private" : "team",
      },
    })

    return NextResponse.json(session)
  } catch (err) {
    console.error("[/api/chat-sessions POST] Error:", {
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

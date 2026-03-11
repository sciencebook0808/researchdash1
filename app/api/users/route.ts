/**
 * GET  /api/users — list all users (admin/super_admin dashboard)
 * POST /api/users — upsert a user on first Clerk login
 */

import { NextResponse } from "next/server"
import { auth }         from "@clerk/nextjs/server"
import { prisma }       from "@/lib/prisma"
import { getSuperAdminEmail } from "@/lib/api-auth"

export async function GET() {
  try {
    // Require a Clerk session — any authenticated user can request this
    // (role check happens in the UI; the API returns data needed for the page)
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id:        true,
        clerkId:   true,
        email:     true,
        name:      true,
        imageUrl:  true,
        role:      true,
        createdAt: true,
        updatedAt: true,
      },
    })
    return NextResponse.json(users)
  } catch (error) {
    console.error("[/api/users GET] Database error:", {
      message: error instanceof Error ? error.message : String(error),
      stack:   error instanceof Error ? error.stack   : undefined,
    })
    // Return empty array — dashboard shows empty state instead of crashing
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { clerkId, email, name, imageUrl } = body

    if (!clerkId || !email) {
      return NextResponse.json({ error: "clerkId and email are required" }, { status: 400 })
    }

    const superAdminEmail = getSuperAdminEmail()
    const isSuperAdmin    =
      !!superAdminEmail &&
      email.toLowerCase() === superAdminEmail.toLowerCase()

    const user = await prisma.user.upsert({
      where:  { clerkId },
      update: {
        email,
        name:     name     ?? undefined,
        imageUrl: imageUrl ?? undefined,
        // Promote to super_admin if email matches — never downgrade
        ...(isSuperAdmin ? { role: "super_admin" } : {}),
      },
      create: {
        clerkId,
        email,
        name:     name     ?? undefined,
        imageUrl: imageUrl ?? undefined,
        role: isSuperAdmin ? "super_admin" : "user",
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    console.error("[/api/users POST] Error:", {
      message: error instanceof Error ? error.message : String(error),
      stack:   error instanceof Error ? error.stack   : undefined,
    })
    return NextResponse.json({ error: "Failed to create/update user" }, { status: 500 })
  }
}

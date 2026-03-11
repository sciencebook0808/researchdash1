/**
 * GET /api/users/me → returns current user's profile + role
 */

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await prisma.user.findUnique({ where: { clerkId: userId } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    return NextResponse.json(user)
  } catch (err) {
    console.error("Users/me error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

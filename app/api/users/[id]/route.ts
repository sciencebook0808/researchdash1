/**
 * PATCH /api/users/[id]  — update a user's role or name
 * DELETE /api/users/[id] — remove a user record
 *
 * Permission matrix:
 *   super_admin: can set any role on any user except themselves
 *   admin:       can set roles user/developer/admin on non-super_admin users (except themselves)
 *   developer+:  no access
 */

import { NextRequest, NextResponse } from "next/server"
import { auth, currentUser }         from "@clerk/nextjs/server"
import { prisma }                    from "@/lib/prisma"
import { getSuperAdminEmail }        from "@/lib/api-auth"

const MANAGE_ROLES = new Set(["super_admin", "admin"])

async function getActorRole(userId: string): Promise<string> {
  const clerkUser  = await currentUser()
  const email      = clerkUser?.emailAddresses[0]?.emailAddress ?? ""
  const superEmail = getSuperAdminEmail()
  if (superEmail && email.toLowerCase() === superEmail.toLowerCase()) return "super_admin"
  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
  return dbUser?.role ?? "user"
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const actorRole = await getActorRole(userId)
    if (!MANAGE_ROLES.has(actorRole)) {
      return NextResponse.json({ error: "Forbidden: only admins can modify users" }, { status: 403 })
    }

    const { id }  = await params
    const body    = await req.json()
    const { role: newRole, name } = body

    // Cannot change your own role
    const actor = await prisma.user.findUnique({ where: { clerkId: userId } })
    if (actor?.id === id) {
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 })
    }

    // Admin cannot promote to super_admin
    if (actorRole === "admin" && newRole === "super_admin") {
      return NextResponse.json({ error: "Admins cannot promote users to super_admin" }, { status: 403 })
    }

    // Admin cannot demote or modify a super_admin
    const targetUser = await prisma.user.findUnique({ where: { id } })
    if (actorRole === "admin" && targetUser?.role === "super_admin") {
      return NextResponse.json({ error: "Admins cannot modify super_admin users" }, { status: 403 })
    }

    const validRoles = actorRole === "super_admin"
      ? ["user", "developer", "admin", "super_admin"]
      : ["user", "developer", "admin"]

    if (newRole && !validRoles.includes(newRole)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(newRole && { role: newRole }),
        ...(name    && { name }),
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error("[/api/users/[id] PATCH]", {
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
    })
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const actorRole = await getActorRole(userId)
    if (!MANAGE_ROLES.has(actorRole)) {
      return NextResponse.json({ error: "Forbidden: only admins can delete users" }, { status: 403 })
    }

    const { id } = await params

    // Cannot delete yourself
    const actor = await prisma.user.findUnique({ where: { clerkId: userId } })
    if (actor?.id === id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })
    }

    // Admin cannot delete super_admin
    const target = await prisma.user.findUnique({ where: { id } })
    if (actorRole === "admin" && target?.role === "super_admin") {
      return NextResponse.json({ error: "Admins cannot delete super_admin users" }, { status: 403 })
    }

    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[/api/users/[id] DELETE]", {
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
    })
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
  }
}

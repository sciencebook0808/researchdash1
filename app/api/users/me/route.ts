/**
 * GET /api/users/me
 * ─────────────────
 * Called by AuthGuard on every protected page load.
 * Returns the current user's DB record, creating / syncing it on first call.
 *
 * SUPER ADMIN GUARANTEE:
 *  • If email === SUPER_ADMIN_EMAIL  →  DB record is UPSERTED to role="super_admin"
 *    on every call, so every other API that queries DB role will also see super_admin.
 *  • If DB is unreachable during super_admin login → return in-memory fallback
 *    so the super admin is NEVER locked out.
 *
 * NORMAL USERS:
 *  • DB record is created on first login with role="user".
 *  • If DB fails → 503 (no fallback — role cannot be determined safely).
 */

import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { getSuperAdminEmail } from "@/lib/api-auth"

export async function GET() {
  try {
    // 1. Require Clerk session
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clerkUser  = await currentUser()
    if (!clerkUser) {
      return NextResponse.json({ error: "Clerk user not found" }, { status: 404 })
    }

    const email    = clerkUser.emailAddresses[0]?.emailAddress ?? ""
    const name     = clerkUser.fullName ?? clerkUser.firstName ?? undefined
    const imageUrl = clerkUser.imageUrl ?? undefined

    // 2. Super-admin check (email env var — no DB needed)
    const superAdminEmail = getSuperAdminEmail()
    const isSuperAdmin    =
      !!superAdminEmail && !!email &&
      email.toLowerCase() === superAdminEmail.toLowerCase()

    // 3. DB upsert / sync
    // If database is not configured, super admin still works; others get fallback
    if (!isDatabaseConfigured()) {
      if (isSuperAdmin) {
        console.warn("[/api/users/me] Database not configured - returning super_admin fallback")
        return NextResponse.json({
          id:        "super_admin_fallback",
          clerkId:   userId,
          email,
          name:      name ?? null,
          imageUrl:  imageUrl ?? null,
          role:      "super_admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
      return NextResponse.json(
        { error: "Database not configured. Only super admin access is available." },
        { status: 503 }
      )
    }

    try {
      let dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })

      if (!dbUser) {
        // First login — create with correct role immediately
        dbUser = await prisma.user.create({
          data: {
            clerkId:  userId,
            email,
            name,
            imageUrl,
            role: isSuperAdmin ? "super_admin" : "user",
          },
        })
      } else {
        // Determine correct role: promote super_admin, never downgrade existing admins
        const targetRole =
          isSuperAdmin ? "super_admin" : dbUser.role

        const needsUpdate =
          dbUser.email    !== email                    ||
          dbUser.name     !== (name     ?? null)       ||
          dbUser.imageUrl !== (imageUrl ?? null)       ||
          (isSuperAdmin && dbUser.role !== "super_admin")

        if (needsUpdate) {
          dbUser = await prisma.user.update({
            where: { clerkId: userId },
            data:  { email, name, imageUrl, role: targetRole },
          })
        }
      }

      return NextResponse.json(dbUser)

    } catch (dbErr) {
      console.error("[/api/users/me] DB error:", {
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
        stack:   dbErr instanceof Error ? dbErr.stack   : undefined,
      })

      // Super admin fallback — never lock out the super admin even during DB outage
      if (isSuperAdmin) {
        console.warn("[/api/users/me] DB unavailable — returning super_admin fallback")
        return NextResponse.json({
          id:        "super_admin_fallback",
          clerkId:   userId,
          email,
          name:      name     ?? null,
          imageUrl:  imageUrl ?? null,
          role:      "super_admin",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }

      return NextResponse.json(
        { error: "Database temporarily unavailable. Please try again." },
        { status: 503 }
      )
    }

  } catch (err) {
    console.error("[/api/users/me] Unexpected error:", {
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

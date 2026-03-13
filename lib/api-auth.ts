/**
 * lib/api-auth.ts — shared write-auth helper for all API routes
 * ──────────────────────────────────────────────────────────────
 * ACCESS RULES (evaluated in order, DB only touched if needed):
 *
 *  1. No Clerk session          → 401
 *  2. email === SUPER_ADMIN_EMAIL
 *       → promote DB record to super_admin (fire-and-forget)
 *       → return { ok: true, role: "super_admin" }   ← NO DB required
 *  3. DB role ∈ {super_admin, admin, developer}       → allow write
 *  4. DB role = "user"                                → 403
 *  5. No DB record              → auto-create as "user" → 403
 *  6. DB unreachable            → 503  (super_admin still passes via rule 2)
 *
 * GET requests: NOT protected here — agents read freely.
 * POST/PATCH/PUT/DELETE: call requireWriteAuth() at the top of the handler.
 */

import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { NextResponse }      from "next/server"

export const WRITER_ROLES = new Set(["super_admin", "admin", "developer"])

export function getSuperAdminEmail(): string | null {
  return (
    process.env.SUPER_ADMIN_EMAIL?.trim()  ||
    process.env.SUPPER_ADMIN_EMAIL?.trim() ||   // typo-tolerant alias
    null
  )
}

export type AuthResult =
  | { ok: true;  userId: string; role: string; email: string }
  | { ok: false; response: NextResponse }

/**
 * promoteSuperAdminInDb — fire-and-forget background upsert.
 * Ensures every API that does a DB role lookup will see "super_admin"
 * instead of "user" after the first login.
 */
async function promoteSuperAdminInDb(
  userId: string,
  email:  string,
  name?:  string | null,
  imageUrl?: string | null
): Promise<void> {
  try {
    await prisma.user.upsert({
      where:  { clerkId: userId },
      update: { role: "super_admin", email, name: name ?? undefined, imageUrl: imageUrl ?? undefined },
      create: { clerkId: userId, email, name: name ?? undefined, imageUrl: imageUrl ?? undefined, role: "super_admin" },
    })
  } catch (err) {
    // Non-fatal — super_admin still works without DB record
    console.warn("[api-auth] super_admin DB promote failed (non-fatal):", err)
  }
}

export async function requireWriteAuth(): Promise<AuthResult> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Unauthorized: authentication required for write operations" },
          { status: 401 }
        ),
      }
    }

    // ── Step 1: Identify user via Clerk (no DB) ───────────────────────────
    const clerkUser        = await currentUser()
    const email            = clerkUser?.emailAddresses[0]?.emailAddress ?? ""
    const name             = clerkUser?.fullName ?? clerkUser?.firstName ?? null
    const imageUrl         = clerkUser?.imageUrl ?? null
    const superAdminEmail  = getSuperAdminEmail()
    const isSuperAdmin     =
      !!superAdminEmail && !!email &&
      email.toLowerCase() === superAdminEmail.toLowerCase()

    // ── Step 2: Super-admin — allow immediately, sync DB in background ────
    if (isSuperAdmin) {
      promoteSuperAdminInDb(userId, email, name, imageUrl)   // fire-and-forget
      return { ok: true, userId, role: "super_admin", email }
    }

    // ── Step 3: DB role lookup for everyone else ──────────────────────────
    // Check if database is configured first
    if (!isDatabaseConfigured()) {
      console.warn("[api-auth] Database not configured - cannot verify role for non-super-admin")
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Database not configured. Only super admin access is available without a database." },
          { status: 503 }
        ),
      }
    }

    let dbUser
    try {
      dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
    } catch (dbErr) {
      console.error("[api-auth] DB error during role lookup:", {
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Database unavailable. Please try again shortly." },
          { status: 503 }
        ),
      }
    }

    if (!dbUser) {
      // First time here — create record, deny write access until promoted
      try {
        await prisma.user.create({
          data: { clerkId: userId, email, name: name ?? undefined, imageUrl: imageUrl ?? undefined, role: "user" },
        })
      } catch { /* ignore duplicate / race condition */ }

      return {
        ok: false,
        response: NextResponse.json(
          { error: "Forbidden: your account (role: user) does not have write access. Ask an admin to promote your role." },
          { status: 403 }
        ),
      }
    }

    if (!WRITER_ROLES.has(dbUser.role)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Forbidden: role "${dbUser.role}" cannot perform write operations.` },
          { status: 403 }
        ),
      }
    }

    return { ok: true, userId, role: dbUser.role, email }
  } catch (err) {
    console.error("[api-auth] unexpected error:", err)
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Internal server error during auth check" },
        { status: 500 }
      ),
    }
  }
}

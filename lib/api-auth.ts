/**
 * lib/api-auth.ts
 *
 * Shared auth helpers for API routes.
 *
 * CHANGES:
 *   - Added requireReadAuth() for GET-only endpoints (SSE stream, etc.)
 *     Requires a valid Clerk session but any role can read.
 *   - All existing exports preserved unchanged.
 */

import { auth, currentUser } from "@clerk/nextjs/server"
import { NextResponse }       from "next/server"
import { prisma }             from "./prisma"

// ─── Types ────────────────────────────────────────────────────────────────────

export type EffectiveUser = {
  clerkId: string
  email:   string
  name:    string | null
  role:    "super_admin" | "admin" | "developer" | "user"
}

type AuthSuccess = { ok: true }
type AuthFailure = { ok: false; response: NextResponse }
type AuthResult  = AuthSuccess | AuthFailure

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getSuperAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL || null
}

export async function getEffectiveUser(): Promise<EffectiveUser | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null

    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } })
    if (dbUser) {
      return {
        clerkId: dbUser.clerkId,
        email:   dbUser.email,
        name:    dbUser.name,
        role:    dbUser.role,
      }
    }

    // Fallback: Clerk user not yet in DB
    const clerkUser = await currentUser()
    if (!clerkUser) return null

    const email = clerkUser.emailAddresses[0]?.emailAddress || ""
    const superEmail = getSuperAdminEmail()

    return {
      clerkId: clerkUser.id,
      email,
      name: clerkUser.fullName || null,
      role: (superEmail && email === superEmail) ? "super_admin" : "user",
    }
  } catch {
    return null
  }
}

// ─── requireWriteAuth ─────────────────────────────────────────────────────────
// For mutation endpoints: requires super_admin, admin, or developer role.

const WRITE_ROLES = new Set(["super_admin", "admin", "developer"])

export async function requireWriteAuth(): Promise<AuthResult> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return {
        ok:       false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }

    const user = await getEffectiveUser()
    if (!user || !WRITE_ROLES.has(user.role)) {
      return {
        ok:       false,
        response: NextResponse.json(
          { error: "Access denied. Developer role or higher required." },
          { status: 403 }
        ),
      }
    }

    return { ok: true }
  } catch {
    return {
      ok:       false,
      response: NextResponse.json({ error: "Authentication error" }, { status: 500 }),
    }
  }
}

// ─── requireReadAuth ──────────────────────────────────────────────────────────
// For read-only endpoints (SSE reconnect, job status, etc.):
// Any authenticated session is allowed — role check is relaxed.
// This lets the SSE stream endpoint work for all logged-in users.

export async function requireReadAuth(): Promise<AuthResult> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return {
        ok:       false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }
    return { ok: true }
  } catch {
    return {
      ok:       false,
      response: NextResponse.json({ error: "Authentication error" }, { status: 500 }),
    }
  }
}

// ─── requireAdminAuth ─────────────────────────────────────────────────────────
// For admin-only endpoints: requires super_admin or admin role.

const ADMIN_ROLES = new Set(["super_admin", "admin"])

export async function requireAdminAuth(): Promise<AuthResult> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return {
        ok:       false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }

    const user = await getEffectiveUser()
    if (!user || !ADMIN_ROLES.has(user.role)) {
      return {
        ok:       false,
        response: NextResponse.json(
          { error: "Access denied. Admin role or higher required." },
          { status: 403 }
        ),
      }
    }

    return { ok: true }
  } catch {
    return {
      ok:       false,
      response: NextResponse.json({ error: "Authentication error" }, { status: 500 }),
    }
  }
}

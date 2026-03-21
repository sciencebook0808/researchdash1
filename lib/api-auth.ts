/**
 * lib/api-auth.ts
 *
 * Shared auth helpers for API routes.
 *
 * FIXED: AuthSuccess now includes { email, clerkId, name, role } so that
 * existing routes like agent/files/route.ts and agent/files/history/route.ts
 * can access authResult.email without TypeScript errors.
 *
 * ADDED: requireReadAuth() for GET-only endpoints (SSE stream, etc.)
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

/** Success result includes user info so routes can access authResult.email etc. */
type AuthSuccess = {
  ok:      true
  clerkId: string
  email:   string
  name:    string | null
  role:    "super_admin" | "admin" | "developer" | "user"
}

type AuthFailure = { ok: false; response: NextResponse }
export type AuthResult = AuthSuccess | AuthFailure

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

    const email      = clerkUser.emailAddresses[0]?.emailAddress || ""
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
// Returns user info in the success case so routes can use authResult.email etc.

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

    return {
      ok:      true,
      clerkId: user.clerkId,
      email:   user.email,
      name:    user.name,
      role:    user.role,
    }
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

export async function requireReadAuth(): Promise<AuthResult> {
  try {
    const { userId } = await auth()
    if (!userId) {
      return {
        ok:       false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      }
    }

    // Best-effort user info — fall back to empty strings if DB unavailable
    const user = await getEffectiveUser()
    return {
      ok:      true,
      clerkId: user?.clerkId ?? userId,
      email:   user?.email   ?? "",
      name:    user?.name    ?? null,
      role:    user?.role    ?? "user",
    }
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

    return {
      ok:      true,
      clerkId: user.clerkId,
      email:   user.email,
      name:    user.name,
      role:    user.role,
    }
  } catch {
    return {
      ok:       false,
      response: NextResponse.json({ error: "Authentication error" }, { status: 500 }),
    }
  }
}

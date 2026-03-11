/**
 * GET  /api/settings  — return current AI settings (any authenticated user)
 * POST /api/settings  — update AI settings (admin / super_admin only)
 */

import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const ADMIN_ROLES = new Set(["super_admin", "admin"])

function getSuperAdminEmail(): string | null {
  return (
    process.env.SUPER_ADMIN_EMAIL?.trim() ||
    process.env.SUPPER_ADMIN_EMAIL?.trim() ||
    null
  )
}

/** Returns the effective role for the current session. */
async function getEffectiveRole(): Promise<string | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null

    // Super-admin check FIRST — no DB required
    const clerkUser = await currentUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ""
    const superAdminEmail = getSuperAdminEmail()
    if (superAdminEmail && email.toLowerCase() === superAdminEmail.toLowerCase()) {
      return "super_admin"
    }

    // DB role lookup for everyone else
    const user = await prisma.user.findUnique({ where: { clerkId: userId } })
    return user?.role ?? null
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
      const settings = await prisma.aISettings.findFirst()

      if (!settings) {
        return NextResponse.json({
          defaultProvider: "gemini",
          geminiDefaultModel: "gemini-2.5-flash",
          selectedOpenRouterModels: [],
          hasGeminiKey: false,
          hasOpenRouterKey: false,
        })
      }

      return NextResponse.json({
        id:                       settings.id,
        defaultProvider:          settings.defaultProvider,
        geminiDefaultModel:       settings.geminiDefaultModel,
        selectedOpenRouterModels: settings.selectedOpenRouterModels,
        hasGeminiKey:             !!settings.geminiApiKey,
        hasOpenRouterKey:         !!settings.openrouterApiKey,
      })
    } catch (dbErr) {
      console.error("[/api/settings GET] DB error:", {
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
        stack:   dbErr instanceof Error ? dbErr.stack   : undefined,
      })
      // Return safe defaults on DB failure — don't crash the dashboard
      return NextResponse.json({
        defaultProvider: "gemini",
        geminiDefaultModel: "gemini-2.5-flash",
        selectedOpenRouterModels: [],
        hasGeminiKey: false,
        hasOpenRouterKey: false,
      })
    }
  } catch (err) {
    console.error("[/api/settings GET] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const role = await getEffectiveRole()
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { userId } = await auth()
    const body = await req.json()
    const {
      defaultProvider,
      geminiApiKey,
      geminiDefaultModel,
      openrouterApiKey,
      selectedOpenRouterModels,
    } = body

    const existing = await prisma.aISettings.findFirst()

    const data: Record<string, unknown> = { updatedBy: userId }
    if (defaultProvider          !== undefined) data.defaultProvider          = defaultProvider
    if (geminiDefaultModel        !== undefined) data.geminiDefaultModel        = geminiDefaultModel
    if (selectedOpenRouterModels  !== undefined) data.selectedOpenRouterModels  = selectedOpenRouterModels
    if (geminiApiKey     !== undefined && geminiApiKey     !== "") data.geminiApiKey     = geminiApiKey
    if (openrouterApiKey !== undefined && openrouterApiKey !== "") data.openrouterApiKey = openrouterApiKey

    let settings
    if (existing) {
      settings = await prisma.aISettings.update({ where: { id: existing.id }, data })
    } else {
      settings = await prisma.aISettings.create({
        data: { ...data } as Parameters<typeof prisma.aISettings.create>[0]["data"],
      })
    }

    return NextResponse.json({
      success:                  true,
      defaultProvider:          settings.defaultProvider,
      geminiDefaultModel:       settings.geminiDefaultModel,
      selectedOpenRouterModels: settings.selectedOpenRouterModels,
      hasGeminiKey:             !!settings.geminiApiKey,
      hasOpenRouterKey:         !!settings.openrouterApiKey,
    })
  } catch (err) {
    console.error("[/api/settings POST] Error:", {
      message: err instanceof Error ? err.message : String(err),
      stack:   err instanceof Error ? err.stack   : undefined,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * GET  /api/settings  — return current AI + tool settings (any authenticated user)
 * POST /api/settings  — update settings (admin / super_admin only)
 *
 * UPGRADED: now handles research, crawl, and Cloudinary API keys
 * in addition to existing Gemini / OpenRouter keys.
 */

import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const ADMIN_ROLES = new Set(["super_admin", "admin"])

function getSuperAdminEmail(): string | null {
  return (
    process.env.SUPER_ADMIN_EMAIL?.trim()  ||
    process.env.SUPPER_ADMIN_EMAIL?.trim() ||
    null
  )
}

async function getEffectiveRole(): Promise<string | null> {
  try {
    const { userId } = await auth()
    if (!userId) return null
    const clerkUser = await currentUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ""
    const superAdminEmail = getSuperAdminEmail()
    if (superAdminEmail && email.toLowerCase() === superAdminEmail.toLowerCase()) {
      return "super_admin"
    }
    const user = await prisma.user.findUnique({ where: { clerkId: userId } })
    return user?.role ?? null
  } catch {
    return null
  }
}

// ─── Helper: safe settings response (never leak raw keys) ────────────────────

function buildSettingsResponse(settings: Record<string, unknown> | null) {
  if (!settings) {
    return {
      defaultProvider:          "gemini",
      geminiDefaultModel:       "gemini-2.5-flash",
      selectedOpenRouterModels: [],
      // AI provider flags
      hasGeminiKey:             false,
      hasOpenRouterKey:         false,
      // Research search provider flags
      hasTavilyKey:             false,
      hasExaKey:                false,
      hasSerpApiKey:            false,
      // Crawl provider flags
      hasFirecrawlKey:          false,
      hasCrawl4aiUrl:           false,
      // Cloudinary flags
      hasCloudinaryCloudName:   false,
      hasCloudinaryUploadPreset:false,
      hasCloudinaryApiKey:      false,
    }
  }

  return {
    id:                        settings.id,
    defaultProvider:           settings.defaultProvider,
    geminiDefaultModel:        settings.geminiDefaultModel,
    selectedOpenRouterModels:  settings.selectedOpenRouterModels,
    // AI provider flags
    hasGeminiKey:              !!settings.geminiApiKey,
    hasOpenRouterKey:          !!settings.openrouterApiKey,
    // Research search provider flags
    hasTavilyKey:              !!settings.tavilyApiKey,
    hasExaKey:                 !!settings.exaApiKey,
    hasSerpApiKey:             !!settings.serpApiKey,
    // Crawl provider flags
    hasFirecrawlKey:           !!settings.firecrawlApiKey,
    hasCrawl4aiUrl:            !!settings.crawl4aiUrl,
    crawl4aiUrl:               settings.crawl4aiUrl || null,  // URL is safe to expose
    // Cloudinary flags
    hasCloudinaryCloudName:    !!settings.cloudinaryCloudName,
    hasCloudinaryUploadPreset: !!settings.cloudinaryUploadPreset,
    hasCloudinaryApiKey:       !!settings.cloudinaryApiKey,
    cloudinaryCloudName:       settings.cloudinaryCloudName || null, // cloud name is safe to expose
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    try {
      const settings = await prisma.aISettings.findFirst()
      return NextResponse.json(buildSettingsResponse(settings as Record<string, unknown> | null))
    } catch (dbErr) {
      console.error("[/api/settings GET] DB error:", {
        message: dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
      return NextResponse.json(buildSettingsResponse(null))
    }
  } catch (err) {
    console.error("[/api/settings GET] Unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const role = await getEffectiveRole()
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { userId } = await auth()
    const body = await req.json()

    const {
      // Existing AI provider keys
      defaultProvider,
      geminiApiKey,
      geminiDefaultModel,
      openrouterApiKey,
      selectedOpenRouterModels,
      // Research search provider keys (new)
      tavilyApiKey,
      exaApiKey,
      serpApiKey,
      // Crawl provider keys (new)
      firecrawlApiKey,
      crawl4aiUrl,
      // Cloudinary keys (new)
      cloudinaryCloudName,
      cloudinaryUploadPreset,
      cloudinaryApiKey,
    } = body

    const data: Record<string, unknown> = { updatedBy: userId }

    // ── Existing fields ───────────────────────────────────────────────────────
    if (defaultProvider         !== undefined) data.defaultProvider         = defaultProvider
    if (geminiDefaultModel      !== undefined) data.geminiDefaultModel      = geminiDefaultModel
    if (selectedOpenRouterModels!== undefined) data.selectedOpenRouterModels= selectedOpenRouterModels
    if (geminiApiKey      && geminiApiKey      !== "") data.geminiApiKey      = geminiApiKey
    if (openrouterApiKey  && openrouterApiKey  !== "") data.openrouterApiKey  = openrouterApiKey

    // ── Research search providers (Tavily primary, Exa secondary, SerpAPI fallback) ──────
    if (tavilyApiKey  !== undefined) data.tavilyApiKey  = tavilyApiKey  === "" ? null : tavilyApiKey
    if (exaApiKey     !== undefined) data.exaApiKey     = exaApiKey     === "" ? null : exaApiKey
    if (serpApiKey    !== undefined) data.serpApiKey    = serpApiKey    === "" ? null : serpApiKey

    // ── Crawl providers ───────────────────────────────────────────────────────
    if (firecrawlApiKey !== undefined) data.firecrawlApiKey = firecrawlApiKey === "" ? null : firecrawlApiKey
    if (crawl4aiUrl     !== undefined) data.crawl4aiUrl     = crawl4aiUrl     === "" ? null : crawl4aiUrl

    // ── Cloudinary ────────────────────────────────────────────────────────────
    if (cloudinaryCloudName    !== undefined) data.cloudinaryCloudName    = cloudinaryCloudName    === "" ? null : cloudinaryCloudName
    if (cloudinaryUploadPreset !== undefined) data.cloudinaryUploadPreset = cloudinaryUploadPreset === "" ? null : cloudinaryUploadPreset
    if (cloudinaryApiKey       !== undefined) data.cloudinaryApiKey       = cloudinaryApiKey       === "" ? null : cloudinaryApiKey

    const existing = await prisma.aISettings.findFirst()
    let settings

    if (existing) {
      settings = await prisma.aISettings.update({ where: { id: existing.id }, data })
    } else {
      settings = await prisma.aISettings.create({
        data: data as Parameters<typeof prisma.aISettings.create>[0]["data"],
      })
    }

    return NextResponse.json({
      success: true,
      ...buildSettingsResponse(settings as Record<string, unknown>),
    })
  } catch (err) {
    console.error("[/api/settings POST] Error:", {
      message: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

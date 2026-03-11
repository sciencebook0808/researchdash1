import { NextResponse } from "next/server"
import { auth, currentUser } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

const ADMIN_ROLES = ["super_admin", "admin"]

async function getUserRole() {
  const { userId } = await auth()
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { clerkId: userId } })
  return user?.role ?? null
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const settings = await prisma.aISettings.findFirst()

    if (!settings) {
      // Return defaults
      return NextResponse.json({
        defaultProvider: "gemini",
        geminiDefaultModel: "gemini-2.5-flash",
        selectedOpenRouterModels: [],
        hasGeminiKey: false,
        hasOpenRouterKey: false,
      })
    }

    return NextResponse.json({
      id: settings.id,
      defaultProvider: settings.defaultProvider,
      geminiDefaultModel: settings.geminiDefaultModel,
      selectedOpenRouterModels: settings.selectedOpenRouterModels,
      hasGeminiKey: !!settings.geminiApiKey,
      hasOpenRouterKey: !!settings.openrouterApiKey,
    })
  } catch (err) {
    console.error("GET /api/settings error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const role = await getUserRole()
    if (!role || !ADMIN_ROLES.includes(role)) {
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
    if (defaultProvider !== undefined) data.defaultProvider = defaultProvider
    if (geminiDefaultModel !== undefined) data.geminiDefaultModel = geminiDefaultModel
    if (selectedOpenRouterModels !== undefined) data.selectedOpenRouterModels = selectedOpenRouterModels
    // Only update keys if they are explicitly provided (not empty string means keep existing)
    if (geminiApiKey !== undefined && geminiApiKey !== "") data.geminiApiKey = geminiApiKey
    if (openrouterApiKey !== undefined && openrouterApiKey !== "") data.openrouterApiKey = openrouterApiKey

    let settings
    if (existing) {
      settings = await prisma.aISettings.update({ where: { id: existing.id }, data })
    } else {
      settings = await prisma.aISettings.create({ data: { ...data } as Parameters<typeof prisma.aISettings.create>[0]["data"] })
    }

    return NextResponse.json({
      success: true,
      defaultProvider: settings.defaultProvider,
      geminiDefaultModel: settings.geminiDefaultModel,
      selectedOpenRouterModels: settings.selectedOpenRouterModels,
      hasGeminiKey: !!settings.geminiApiKey,
      hasOpenRouterKey: !!settings.openrouterApiKey,
    })
  } catch (err) {
    console.error("POST /api/settings error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

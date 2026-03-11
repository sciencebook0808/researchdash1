import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const testKey = body.apiKey

    let apiKey = testKey
    if (!apiKey) {
      const settings = await prisma.aISettings.findFirst()
      apiKey = settings?.openrouterApiKey
    }
    if (!apiKey) {
      apiKey = process.env.OPENROUTER_API_KEY
    }

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "No API key provided" })
    }

    // Test by fetching models list
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    if (res.ok) {
      const data = await res.json()
      const count = data?.data?.length ?? 0
      return NextResponse.json({ success: true, message: `OpenRouter API key valid ✓ (${count} models available)` })
    } else {
      return NextResponse.json({ success: false, error: "Invalid OpenRouter API key" })
    }
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) })
  }
}

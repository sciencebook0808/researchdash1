import { NextResponse } from "next/server"
import { generateText } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { prisma, isDatabaseConfigured } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const { text, instruction } = await req.json()

    if (!text || !instruction) {
      return NextResponse.json(
        { error: "text and instruction are required" },
        { status: 400 }
      )
    }

    // Resolve Gemini API key: AISettings DB record > env var fallback
    let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || ""
    let modelId = "gemini-2.5-flash"

    if (isDatabaseConfigured()) {
      try {
        const settings = await prisma.aISettings.findFirst({
          orderBy: { updatedAt: "desc" },
        })
        if (settings?.geminiApiKey) {
          apiKey = settings.geminiApiKey
          modelId = settings.geminiDefaultModel || modelId
        }
      } catch {
        // Non-fatal: fall back to env key
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "No AI API key configured. Add a Gemini API key in Settings." },
        { status: 503 }
      )
    }

    const google = createGoogleGenerativeAI({ apiKey })

    const { text: result } = await generateText({
      model: google(modelId),
      system: `You are a helpful writing assistant. Edit text according to instructions.
Return ONLY the edited text — no explanations, no quotes, no markdown wrappers.
Preserve the original formatting (paragraphs, line breaks) unless asked to change it.`,
      prompt: `Original text:
"""
${text}
"""

Instructions: ${instruction}

Edited version:`,
    })

    return NextResponse.json({ result: result.trim() })
  } catch (error) {
    console.error("AI edit error:", error)
    return NextResponse.json(
      { error: "Failed to process AI edit" },
      { status: 500 }
    )
  }
      }
        

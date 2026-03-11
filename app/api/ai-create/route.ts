import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"

const SCHEMAS: Record<string, string> = {
  document: JSON.stringify({
    title: "string",
    slug: "string (kebab-case)",
    summary: "string (1-2 sentences)",
    content: "string (rich HTML content with h1/h2/h3/p/ul/ol/code/pre tags)",
    tags: ["string"],
  }),
  roadmap: JSON.stringify({
    description: "string",
    tasks: [{ title: "string" }],
    milestone: "string",
    priority: "LOW | MEDIUM | HIGH | CRITICAL",
  }),
  experiment: JSON.stringify({
    description: "string",
    method: "string",
    resultSummary: "string",
    baseModel: "string",
  }),
  dataset: JSON.stringify({
    description: "string",
    tags: ["string"],
    format: "string",
    sourceUrl: "string or null",
  }),
  note: JSON.stringify({
    content: "string (rich HTML content with formatting)",
    tags: ["string"],
  }),
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type, title, ...extra } = body

    const { prisma } = await import("@/lib/prisma")
    const aiSettings = await prisma.aISettings.findFirst().catch(() => null)
    const apiKey = aiSettings?.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_API_KEY not configured" }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey })

    const schema = SCHEMAS[type]
    if (!schema) {
      return NextResponse.json({ error: "Unknown type" }, { status: 400 })
    }

    const extraContext = Object.entries(extra)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")

    const prompt = `You are an AI research assistant for Prausdit Research Lab, which builds Protroit Agent (offline-first SLM AI agent for mobile/edge devices) and ProtroitOS (agentic operating system).

Generate a "${type}" resource for: "${title}"
${extraContext ? `Additional context: ${extraContext}` : ""}

Return ONLY valid JSON matching this schema (no markdown, no explanation, no code fences):
${schema}

Make the content detailed, technical, and relevant to AI/ML research, SLM development, and the Prausdit ecosystem.
For HTML content fields, use proper HTML tags: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <ol>, <code>, <pre>, <strong>, <em>, <blockquote>.`

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: { maxOutputTokens: 2048, temperature: 0.7 },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    })

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    // Strip any markdown code fences if present
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

    try {
      const parsed = JSON.parse(clean)
      return NextResponse.json(parsed)
    } catch {
      // Try to extract JSON from the response
      const match = clean.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return NextResponse.json(parsed)
      }
      return NextResponse.json({ error: "Failed to parse AI response", raw: clean }, { status: 422 })
    }
  } catch (err) {
    console.error("AI create error:", err)
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 })
  }
}

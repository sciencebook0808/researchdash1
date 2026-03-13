import { NextResponse } from "next/server"
import { streamText } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "@/lib/prisma"
import { requireWriteAuth } from "@/lib/api-auth"

export const maxDuration = 60

const SYSTEM_PROMPT = `You are Prausdit Lab Assistant, an expert AI research assistant helping with the development of Protroit Agent and ProtroitOS.

You have deep expertise in:
- Small Language Models (SLMs) for local/offline inference
- Mobile and low-power device AI optimization
- On-device model inference (GGUF, ONNX, Core ML, TensorFlow Lite)
- LoRA and QLoRA fine-tuning techniques
- Dataset engineering and curation
- Model quantization (GPTQ, GGUF, AWQ, INT8, INT4)
- Privacy-preserving AI and offline-first architecture
- AI agent orchestration and intent detection
- Model marketplace design and star-based ranking systems
- Agentic operating systems (ProtroitOS concepts)
- TinyLlama, Phi-2, Phi-3, Gemma, Mistral architectures
- Training infrastructure (PyTorch, transformers, PEFT, trl)
- Deployment on resource-constrained devices

When answering questions:
1. Be precise and technical
2. Include code examples when relevant
3. Reference the Prausdit ecosystem (Protroit Agent, ProtroitOS, SLM marketplace)
4. Use the provided documentation context when available
5. Format code in markdown code blocks with language tags`

async function getAISettings() {
  try {
    return await prisma.aISettings.findFirst()
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const auth = await requireWriteAuth()
  if (!auth.ok) return auth.response

  try {
    const { message, history, provider: reqProvider, model: reqModel } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 })

    const settings = await getAISettings()
    const provider = reqProvider || settings?.defaultProvider || "gemini"

    let contextDocs = ""
    try {
      const keywords = message.split(" ").slice(0, 5)
      const docs = await prisma.documentationPage.findMany({
        where: { OR: [{ content: { contains: keywords.join(" "), mode: "insensitive" } }, { title: { contains: keywords[0], mode: "insensitive" } }] },
        take: 2,
        select: { title: true, content: true },
      })
      if (docs.length > 0) {
        contextDocs = `\n\n## Relevant Documentation Context\n\n` + docs.map(d => `### ${d.title}\n${d.content.substring(0, 1500)}`).join("\n\n")
      }
    } catch { /* ignore */ }

    // Build messages array
    const messages = [
      ...(history || []).slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" as const : "user" as const,
        content: m.content,
      })),
      { role: "user" as const, content: contextDocs ? `${message}\n\n${contextDocs}` : message },
    ]

    // Get the AI model
    let model
    if (provider === "openrouter") {
      const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY
      if (!apiKey) return NextResponse.json({ error: "OpenRouter API key not configured. Add it in Settings." }, { status: 500 })
      const modelId = reqModel || settings?.selectedOpenRouterModels?.[0] || "mistralai/mistral-7b-instruct:free"
      const openai = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        headers: {
          "HTTP-Referer": "https://prausdit.app",
          "X-Title": "Prausdit Research Lab",
        },
      })
      model = openai(modelId)
    } else {
      const apiKey = settings?.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
      if (!apiKey) return NextResponse.json({ error: "Gemini API key not configured. Set GOOGLE_API_KEY or add it in Settings." }, { status: 500 })
      const modelId = reqModel || settings?.geminiDefaultModel || "gemini-2.5-flash"
      const google = createGoogleGenerativeAI({ apiKey })
      model = google(modelId)
    }

    // Use AI SDK v6 streamText
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      temperature: 0.7,
      maxOutputTokens: 2048,
    })

    return result.toUIMessageStreamResponse()
  } catch (err) {
    console.error("Chat API error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

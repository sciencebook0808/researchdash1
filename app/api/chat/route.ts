import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { prisma } from "@/lib/prisma"

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

async function streamGemini(
  message: string,
  history: Array<{ role: string; content: string }>,
  apiKey: string,
  model: string,
  contextDocs: string
) {
  const ai = new GoogleGenAI({ apiKey })
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const msg of (history || []).slice(-10)) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })
  }
  const userMessage = contextDocs ? `${message}\n\n${contextDocs}` : message
  contents.push({ role: "user", parts: [{ text: userMessage }] })

  const streamResult = await ai.models.generateContentStream({
    model: model || "gemini-2.5-flash",
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 2048, temperature: 0.7, topP: 0.9 },
    contents,
  })

  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamResult) {
          const text = chunk.text
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
        }
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`))
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      }
    },
  })
}

async function streamOpenRouter(
  message: string,
  history: Array<{ role: string; content: string }>,
  apiKey: string,
  model: string,
  contextDocs: string
) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(history || []).slice(-10).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: contextDocs ? `${message}\n\n${contextDocs}` : message },
  ]

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://prausdit.app",
      "X-Title": "Prausdit Research Lab",
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 2048, temperature: 0.7 }),
  })

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`)

  const encoder = new TextEncoder()
  const reader = res.body?.getReader()
  if (!reader) throw new Error("No stream body")

  return new ReadableStream({
    async start(controller) {
      try {
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += new TextDecoder().decode(value)
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              const text = parsed.choices?.[0]?.delta?.content
              if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
            } catch { /* skip */ }
          }
        }
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`))
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      }
    },
  })
}

export async function POST(req: Request) {
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

    let readable: ReadableStream

    if (provider === "openrouter") {
      const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY
      if (!apiKey) return NextResponse.json({ error: "OpenRouter API key not configured. Add it in Settings." }, { status: 500 })
      const model = reqModel || settings?.selectedOpenRouterModels?.[0] || "mistralai/mistral-7b-instruct:free"
      readable = await streamOpenRouter(message, history || [], apiKey, model, contextDocs)
    } else {
      const apiKey = settings?.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
      if (!apiKey) return NextResponse.json({ error: "Gemini API key not configured. Set GOOGLE_API_KEY or add it in Settings." }, { status: 500 })
      const model = reqModel || settings?.geminiDefaultModel || "gemini-2.5-flash"
      readable = await streamGemini(message, history || [], apiKey, model, contextDocs)
    }

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    })
  } catch (err) {
    console.error("Chat API error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

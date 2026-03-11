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

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Support both GOOGLE_API_KEY and GOOGLE_GEMINI_API_KEY env var names
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY not configured. Set it in your environment variables." },
        { status: 500 }
      )
    }

    // Initialize Google GenAI SDK v1
    const ai = new GoogleGenAI({ apiKey })

    // Fetch relevant docs from DB as context
    let contextDocs = ""
    try {
      const keywords = message.split(" ").slice(0, 5)
      const docs = await prisma.documentationPage.findMany({
        where: {
          OR: [
            { content: { contains: keywords.join(" "), mode: "insensitive" } },
            { title: { contains: keywords[0], mode: "insensitive" } },
          ],
        },
        take: 2,
        select: { title: true, content: true },
      })

      if (docs.length > 0) {
        contextDocs =
          `\n\n## Relevant Documentation Context\n\n` +
          docs.map((d) => `### ${d.title}\n${d.content.substring(0, 1500)}`).join("\n\n")
      }
    } catch {
      // Silently ignore DB errors — chat still works without context
    }

    // Build conversation history in Gemini SDK format
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content as string }],
        })
      }
    }

    // Append current user message (with optional doc context)
    const userMessage = contextDocs ? `${message}\n\n${contextDocs}` : message
    contents.push({ role: "user", parts: [{ text: userMessage }] })

    // Stream from Gemini 2.5-flash via SDK
    const streamResult = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
      },
      contents,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResult) {
            const text = chunk.text
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              )
            }
          }
        } catch (err) {
          console.error("Gemini stream error:", err)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`)
          )
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("Chat API error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

// Curated fallback model list when API key not available
const FALLBACK_FREE_MODELS = [
  { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B Instruct", provider: "Mistral AI", free: true },
  { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B Instruct", provider: "Meta", free: true },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B Instruct", provider: "Meta", free: true },
  { id: "qwen/qwen-2.5-7b-instruct:free", name: "Qwen 2.5 7B Instruct", provider: "Qwen", free: true },
  { id: "deepseek/deepseek-chat:free", name: "DeepSeek V3 Chat", provider: "DeepSeek", free: true },
  { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", provider: "DeepSeek", free: true },
  { id: "google/gemma-3-1b-it:free", name: "Gemma 3 1B IT", provider: "Google", free: true },
  { id: "microsoft/phi-3-mini-128k-instruct:free", name: "Phi-3 Mini 128K", provider: "Microsoft", free: true },
  { id: "mistralai/mistral-nemo:free", name: "Mistral Nemo", provider: "Mistral AI", free: true },
  { id: "openchat/openchat-7b:free", name: "OpenChat 7B", provider: "OpenChat", free: true },
]

const FALLBACK_PRO_MODELS = [
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "Anthropic", free: false },
  { id: "anthropic/claude-3-5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", free: false },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", free: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", free: false },
  { id: "openai/o1-mini", name: "o1 Mini", provider: "OpenAI", free: false },
  { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro Preview", provider: "Google", free: false },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta", free: false },
  { id: "mistralai/mistral-large", name: "Mistral Large", provider: "Mistral AI", free: false },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Pro)", provider: "DeepSeek", free: false },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct", provider: "Qwen", free: false },
]

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Get stored API key
    const settings = await prisma.aISettings.findFirst()
    const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      // Return curated fallback list
      return NextResponse.json({
        free: FALLBACK_FREE_MODELS,
        pro: FALLBACK_PRO_MODELS,
        source: "fallback",
      })
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({ free: FALLBACK_FREE_MODELS, pro: FALLBACK_PRO_MODELS, source: "fallback" })
    }

    const data = await res.json()
    const models = data.data || []

    interface ORModel {
      id: string
      name: string
      pricing?: { prompt?: string; completion?: string }
      description?: string
    }

    const freeModels = models
      .filter((m: ORModel) => m.id.includes(":free") || (parseFloat(m.pricing?.prompt || "1") === 0))
      .slice(0, 10)
      .map((m: ORModel) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        free: true,
        description: m.description,
      }))

    const proModels = models
      .filter((m: ORModel) => !m.id.includes(":free") && parseFloat(m.pricing?.prompt || "0") > 0)
      .sort((a: ORModel, b: ORModel) => parseFloat(b.pricing?.prompt || "0") - parseFloat(a.pricing?.prompt || "0"))
      .slice(0, 10)
      .map((m: ORModel) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        free: false,
        description: m.description,
      }))

    return NextResponse.json({
      free: freeModels.length > 0 ? freeModels : FALLBACK_FREE_MODELS,
      pro: proModels.length > 0 ? proModels : FALLBACK_PRO_MODELS,
      source: "live",
    })
  } catch (err) {
    console.error("OpenRouter models error:", err)
    return NextResponse.json({ free: FALLBACK_FREE_MODELS, pro: FALLBACK_PRO_MODELS, source: "fallback" })
  }
}

import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { prisma } from "@/lib/prisma"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OpenRouterModel {
  id: string
  name: string
  provider: string
  free: boolean
  description?: string
  contextLength?: number
  pricing?: { prompt: number; completion: number }
}

// ─── Curated Model Lists ────────────────────────────────────────────────────

const FALLBACK_FREE_MODELS: OpenRouterModel[] = [
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

const FALLBACK_PRO_MODELS: OpenRouterModel[] = [
  { id: "anthropic/claude-4.6-opus", name: "Claude 4.6 Sonnet", provider: "Anthropic", free: false },
  { id: "anthropic/claude-4-5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic", free: false },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", free: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", free: false },
  { id: "openai/o1-mini", name: "o1 Mini", provider: "OpenAI", free: false },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", provider: "Google", free: false },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta", free: false },
  { id: "mistralai/mistral-large", name: "Mistral Large", provider: "Mistral AI", free: false },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1 (Pro)", provider: "DeepSeek", free: false },
  { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct", provider: "Qwen", free: false },
]

// ─── Auto-Routing Configuration ──────────────────────────────────────────────

// Best models for auto-routing (ordered by preference)
export const AUTO_ROUTING_CONFIG = {
  // Auto: Best overall model regardless of cost
  auto: [
    "anthropic/claude-4.6-opus",
    "openai/gpt-5-mini",
    "google/gemini-2.5-flash",
    "meta-llama/llama-3.3-70b-instruct",
  ],
  // Auto-Free: Best free models
  autoFree: [
    "deepseek/deepseek-r1:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "qwen/qwen-2.5-7b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
  ],
  // Auto-Paid: Best paid models (premium tier)
  autoPaid: [
    "anthropic/claude-4.6-sonnet",
    "anthropic/claude-4.6-opus",
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4-nano",
    "nvidia/nemotron-3-super",
    "google/gemini-3.1-flash-lite",
    "google/gemini-3.1-pro-preview",
    "anthropic/claude-4.5-haiku",
  ],
}

// ─── Provider/Company List ────────────────────────────────────────────────────

export const KNOWN_PROVIDERS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Nvidia",
  "Meta",
  "Mistral AI",
  "DeepSeek",
  "Qwen",
  "Microsoft",
  "Cohere",
  "OpenChat",
  "Nous Research",
  "Perplexity",
] as const

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Parse query params for filtering
    const { searchParams } = new URL(request.url)
    const providerFilter = searchParams.get("provider") // Filter by company/provider
    const pricingFilter = searchParams.get("pricing") as "free" | "paid" | "all" | null // free, paid, all
    const routingMode = searchParams.get("routing") as "auto" | "auto-free" | "auto-paid" | null

    // Get stored API key
    const settings = await prisma.aISettings.findFirst()
    const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY

    // If requesting auto-routing, return the best model for the mode
    if (routingMode) {
      const routingList = routingMode === "auto-free" 
        ? AUTO_ROUTING_CONFIG.autoFree
        : routingMode === "auto-paid"
          ? AUTO_ROUTING_CONFIG.autoPaid
          : AUTO_ROUTING_CONFIG.auto
      
      // Return the first available model from the routing list
      const allModels = [...FALLBACK_FREE_MODELS, ...FALLBACK_PRO_MODELS]
      const selectedModel = routingList.find(id => allModels.some(m => m.id === id)) || routingList[0]
      
      return NextResponse.json({
        selectedModel,
        routingMode,
        available: routingList,
      })
    }

    if (!apiKey) {
      // Return curated fallback list with filters applied
      let freeModels = FALLBACK_FREE_MODELS
      let proModels = FALLBACK_PRO_MODELS

      if (providerFilter) {
        freeModels = freeModels.filter(m => m.provider.toLowerCase() === providerFilter.toLowerCase())
        proModels = proModels.filter(m => m.provider.toLowerCase() === providerFilter.toLowerCase())
      }

      return NextResponse.json({
        free: pricingFilter === "paid" ? [] : freeModels,
        pro: pricingFilter === "free" ? [] : proModels,
        providers: KNOWN_PROVIDERS,
        autoRouting: AUTO_ROUTING_CONFIG,
        source: "fallback",
      })
    }

    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return NextResponse.json({
        free: FALLBACK_FREE_MODELS,
        pro: FALLBACK_PRO_MODELS,
        providers: KNOWN_PROVIDERS,
        autoRouting: AUTO_ROUTING_CONFIG,
        source: "fallback",
      })
    }

    const data = await res.json()
    const models = data.data || []

    interface ORModelRaw {
      id: string
      name: string
      pricing?: { prompt?: string; completion?: string }
      description?: string
      context_length?: number
    }

    // Extract unique providers from live data
    const liveProviders = [...new Set(models.map((m: ORModelRaw) => {
      const provider = m.id.split("/")[0]
      // Normalize provider names
      if (provider === "meta-llama") return "Meta"
      if (provider === "mistralai") return "Mistral AI"
      if (provider === "openai") return "OpenAI"
      if (provider === "anthropic") return "Anthropic"
      if (provider === "google") return "Google"
      if (provider === "deepseek") return "DeepSeek"
      if (provider === "qwen") return "Qwen"
      if (provider === "microsoft") return "Microsoft"
      return provider.charAt(0).toUpperCase() + provider.slice(1)
    }))].sort() as string[]

    let freeModels = models
      .filter((m: ORModelRaw) => m.id.includes(":free") || (parseFloat(m.pricing?.prompt || "1") === 0))
      .map((m: ORModelRaw) => ({
        id: m.id,
        name: m.name,
        provider: normalizeProvider(m.id.split("/")[0]),
        free: true,
        description: m.description,
        contextLength: m.context_length,
        pricing: { prompt: 0, completion: 0 },
      }))

    let proModels = models
      .filter((m: ORModelRaw) => !m.id.includes(":free") && parseFloat(m.pricing?.prompt || "0") > 0)
      .sort((a: ORModelRaw, b: ORModelRaw) => parseFloat(b.pricing?.prompt || "0") - parseFloat(a.pricing?.prompt || "0"))
      .map((m: ORModelRaw) => ({
        id: m.id,
        name: m.name,
        provider: normalizeProvider(m.id.split("/")[0]),
        free: false,
        description: m.description,
        contextLength: m.context_length,
        pricing: {
          prompt: parseFloat(m.pricing?.prompt || "0"),
          completion: parseFloat(m.pricing?.completion || "0"),
        },
      }))

    // Apply provider filter
    if (providerFilter) {
      freeModels = freeModels.filter((m: OpenRouterModel) => m.provider.toLowerCase() === providerFilter.toLowerCase())
      proModels = proModels.filter((m: OpenRouterModel) => m.provider.toLowerCase() === providerFilter.toLowerCase())
    }

    // Apply pricing filter
    if (pricingFilter === "free") {
      proModels = []
    } else if (pricingFilter === "paid") {
      freeModels = []
    }

    return NextResponse.json({
      free: freeModels.length > 0 ? freeModels.slice(0, 15) : FALLBACK_FREE_MODELS,
      pro: proModels.length > 0 ? proModels.slice(0, 15) : FALLBACK_PRO_MODELS,
      providers: liveProviders.length > 0 ? liveProviders : KNOWN_PROVIDERS,
      autoRouting: AUTO_ROUTING_CONFIG,
      source: "live",
    })
  } catch (err) {
    console.error("OpenRouter models error:", err)
    return NextResponse.json({
      free: FALLBACK_FREE_MODELS,
      pro: FALLBACK_PRO_MODELS,
      providers: KNOWN_PROVIDERS,
      autoRouting: AUTO_ROUTING_CONFIG,
      source: "fallback",
    })
  }
}

// Helper to normalize provider names
function normalizeProvider(raw: string): string {
  const map: Record<string, string> = {
    "meta-llama": "Meta",
    "mistralai": "Mistral AI",
    "openai": "OpenAI",
    "nvidia": "Nvidia",
    "anthropic": "Anthropic",
    "google": "Google",
    "deepseek": "DeepSeek",
    "qwen": "Qwen",
    "microsoft": "Microsoft",
    "cohere": "Cohere",
    "openchat": "OpenChat",
    "nousresearch": "Nous Research",
    "perplexity": "Perplexity",
    
  }
  return map[raw.toLowerCase()] || raw.charAt(0).toUpperCase() + raw.slice(1)
}

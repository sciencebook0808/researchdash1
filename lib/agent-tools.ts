/**
 * Prausdit Research Lab — Agent Tools (AI SDK v6)
 *
 * KEY FIX: All API keys (Tavily, Exa, SerpAPI, Firecrawl, Crawl4AI, Cloudinary)
 * Brave replaced with Exa: supports auto/deep modes + research paper category detection.
 * are now read from the database (AISettings) first, falling back to env vars.
 * This matches the pattern already used for Gemini / OpenRouter keys.
 *
 * Tools added:
 *   - list_projects      → list all projects with counts
 *   - switch_project     → switch active project by name or ID
 *   - buildProjectScopedTools() → factory that auto-injects currentProjectId
 */

import { tool } from "ai"
import { z } from "zod"
import { prisma } from "./prisma"

type InputJsonValue =
  | string
  | number
  | boolean
  | { [key: string]: InputJsonValue }
  | InputJsonValue[]

// ── Utilities ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 8000)
}

function truncate(text: string, maxLen = 4000): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text
}

const BLOCKED_HOSTS = [
  "localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254",
  "metadata.google", "instance-data", "192.168.", "10.",
  "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
  "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.", "::1",
]
function isSafeUrl(url: string): boolean {
  if (!url.startsWith("https://")) return false
  return !BLOCKED_HOSTS.some((b) => url.includes(b))
}

// ── Research Config — DB-first, env fallback ──────────────────────────────────
//
// This is the core fix. Previously getResearchConfig() only read process.env.
// Now it reads from AISettings in the database first (where the user saves keys
// from the Settings UI), then falls back to env vars as a secondary option.

interface ResearchConfig {
  tavily:    string | null
  exa:       string | null
  serpapi:   string | null
  firecrawl: string | null
  crawl4ai:  string | null
}

let _cachedResearchConfig: ResearchConfig | null = null
let _cacheExpiry = 0

async function getResearchConfig(): Promise<ResearchConfig> {
  // Cache for 60 seconds to avoid a DB hit on every tool call
  if (_cachedResearchConfig && Date.now() < _cacheExpiry) {
    return _cachedResearchConfig
  }

  let dbSettings: {
    tavilyApiKey?: string | null
    exaApiKey?: string | null
    serpApiKey?: string | null
    firecrawlApiKey?: string | null
    crawl4aiUrl?: string | null
  } | null = null

  try {
    dbSettings = await prisma.aISettings.findFirst({
      select: {
        tavilyApiKey: true,
        exaApiKey: true,
        serpApiKey: true,
        firecrawlApiKey: true,
        crawl4aiUrl: true,
      },
    })
  } catch {
    // DB unavailable — fall through to env vars
  }

  const cfg: ResearchConfig = {
    tavily:    dbSettings?.tavilyApiKey    || process.env.TAVILY_API_KEY    || null,
    exa:       dbSettings?.exaApiKey       || process.env.EXA_API_KEY       || null,
    serpapi:   dbSettings?.serpApiKey      || process.env.SERPAPI_KEY       || null,
    firecrawl: dbSettings?.firecrawlApiKey || process.env.FIRECRAWL_API_KEY || null,
    crawl4ai:  dbSettings?.crawl4aiUrl     || process.env.CRAWL4AI_API_URL  || null,
  }

  _cachedResearchConfig = cfg
  _cacheExpiry = Date.now() + 60_000
  return cfg
}

// Exported so the settings route can bust the cache when keys are updated
export function bustResearchConfigCache() {
  _cachedResearchConfig = null
  _cacheExpiry = 0
}

// ── Research interfaces ───────────────────────────────────────────────────────

interface ResearchResult {
  title: string
  url: string
  snippet: string
  content?: string
  source: string
  score?: number
}

interface DeepResearchOutput {
  query: string
  results: ResearchResult[]
  summary: string
  sources: string[]
  provider: string
  crawlProvider?: string
  crawledCount: number
  error?: string
}

// ── Search providers ──────────────────────────────────────────────────────────

async function searchTavily(query: string, cfg: ResearchConfig): Promise<ResearchResult[] | null> {
  if (!cfg.tavily) return null
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: cfg.tavily, query, search_depth: "advanced", max_results: 6 }),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.results || []).map((r: { title?: string; url: string; content?: string; score?: number }) => ({
      title: r.title || r.url, url: r.url, snippet: r.content || "", source: "tavily", score: r.score,
    }))
  } catch { return null }
}

// Detect if a query is academic/research-paper oriented
function isResearchPaperQuery(query: string): boolean {
  return /arxiv|paper|research|study|survey|dataset|benchmark|model|training|fine.?tun|LoRA|QLoRA|GRPO|transformer|llm|slm|neural|evaluation|experiment/i.test(query)
}

async function searchExa(query: string, cfg: ResearchConfig, mode: "auto" | "deep" = "auto"): Promise<ResearchResult[] | null> {
  if (!cfg.exa) return null
  try {
    // Auto-detect research paper queries and add category for better results
    const isAcademic = isResearchPaperQuery(query)
    const body: Record<string, unknown> = {
      query,
      // Use "deep" type for deep research mode, "auto" for normal queries
      type: mode === "deep" ? "deep" : "auto",
      num_results: mode === "deep" ? 8 : 6,
      contents: mode === "deep"
        ? { text: { max_characters: 10000 } }      // full text for deep research
        : { highlights: { num_sentences: 3, highlights_per_url: 2 } }, // highlights for quick
    }
    // Add research paper category for academic queries
    if (isAcademic) body.category = "research paper"

    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": cfg.exa },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(mode === "deep" ? 20000 : 12000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.results || []).map((r: {
      title?: string; url: string; id?: string;
      highlights?: string[]; text?: string; score?: number
    }) => ({
      title: r.title || r.url,
      url: r.url,
      snippet: r.highlights?.join(" ") || r.text?.slice(0, 400) || "",
      content: r.text ? r.text.slice(0, 4000) : undefined,
      source: "exa",
      score: r.score,
    }))
  } catch { return null }
}

async function searchSerpApi(query: string, cfg: ResearchConfig): Promise<ResearchResult[] | null> {
  if (!cfg.serpapi) return null
  try {
    const res = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=6&api_key=${cfg.serpapi}`, {
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data.organic_results || []).map((r: { title: string; link: string; snippet?: string }) => ({
      title: r.title, url: r.link, snippet: r.snippet || "", source: "serpapi",
    }))
  } catch { return null }
}

async function searchWithFallback(query: string, mode: "auto" | "deep" = "auto"): Promise<{ results: ResearchResult[]; provider: string }> {
  const cfg = await getResearchConfig()
  // Tavily: primary — AI-optimised search with content extraction
  const tavily = await searchTavily(query, cfg)
  if (tavily && tavily.length > 0) return { results: tavily, provider: "tavily" }
  // Exa: secondary — neural search, excellent for research papers + deep mode
  const exa = await searchExa(query, cfg, mode)
  if (exa && exa.length > 0) return { results: exa, provider: "exa" }
  // SerpAPI: final fallback — broad Google coverage
  const serp = await searchSerpApi(query, cfg)
  if (serp && serp.length > 0) return { results: serp, provider: "serpapi" }
  return { results: [], provider: "none" }
}

// ── Crawl providers ───────────────────────────────────────────────────────────

async function crawlFirecrawl(url: string, cfg: ResearchConfig): Promise<string | null> {
  if (!cfg.firecrawl || !isSafeUrl(url)) return null
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.firecrawl}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data?.markdown ? truncate(data.data.markdown) : null
  } catch { return null }
}

async function crawlCrawl4AI(url: string, cfg: ResearchConfig): Promise<string | null> {
  if (!cfg.crawl4ai || !isSafeUrl(url)) return null
  try {
    const res = await fetch(`${cfg.crawl4ai}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [url], word_count_threshold: 50 }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = Array.isArray(data.results) ? data.results[0] : data
    return result?.markdown ? truncate(result.markdown) : null
  } catch { return null }
}

async function crawlBasicFetch(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Prausdit-LabBot/2.0", "Accept": "text/html,text/plain,text/markdown" },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const ct = res.headers.get("content-type") || ""
    const raw = await res.text()
    return truncate(ct.includes("text/plain") || ct.includes("text/markdown") ? raw : stripHtml(raw))
  } catch { return null }
}

async function crawlWithFallback(url: string): Promise<{ content: string | null; provider: string }> {
  const cfg = await getResearchConfig()
  const fc = await crawlFirecrawl(url, cfg)
  if (fc) return { content: fc, provider: "firecrawl" }
  const c4 = await crawlCrawl4AI(url, cfg)
  if (c4) return { content: c4, provider: "crawl4ai" }
  const basic = await crawlBasicFetch(url)
  if (basic) return { content: basic, provider: "basic-fetch" }
  return { content: null, provider: "none" }
}

async function deepResearch(query: string, options: { maxCrawl?: number; crawlEnabled?: boolean; mode?: "auto" | "deep" } = {}): Promise<DeepResearchOutput> {
  const { maxCrawl = 2, crawlEnabled = true, mode = "auto" } = options
  try {
    const { results: searchResults, provider } = await searchWithFallback(query, mode)
    if (searchResults.length === 0) {
      return {
        query, results: [], sources: [], provider, crawledCount: 0,
        summary: provider === "none"
          ? "No search API keys configured. Add Tavily, Exa, or SerpAPI keys in Settings → Manage API."
          : `No results found for "${query}".`,
        error: provider === "none" ? "No search API keys configured." : undefined,
      }
    }
    let crawlProvider: string | undefined
    let crawledCount = 0
    if (crawlEnabled) {
      for (const result of searchResults.filter(r => isSafeUrl(r.url)).slice(0, maxCrawl)) {
        const { content, provider: cp } = await crawlWithFallback(result.url)
        if (content) { result.content = content; crawlProvider = cp; crawledCount++ }
      }
    }
    const sources = [...new Set(searchResults.map(r => r.url))]
    const snippets = searchResults.slice(0, 4).map((r, i) => `${i + 1}. **${r.title}** — ${r.snippet.slice(0, 200)}`).join("\n")
    return {
      query, results: searchResults,
      summary: `Found ${searchResults.length} results via ${provider} for "${query}":\n\n${snippets}`,
      sources, provider, crawlProvider, crawledCount,
    }
  } catch (err) {
    return { query, results: [], summary: `Research failed: ${String(err)}`, sources: [], provider: "error", crawledCount: 0, error: String(err) }
  }
}

// ── Cloudinary — DB-first, env fallback ───────────────────────────────────────
//
// Same fix pattern: read from AISettings DB first, fall back to env vars.

interface CloudinaryConfig {
  cloudName:    string | null
  uploadPreset: string | null
  apiKey:       string | null
  folder:       string
}

async function getCloudinaryConfig(): Promise<CloudinaryConfig> {
  let dbSettings: {
    cloudinaryCloudName?: string | null
    cloudinaryUploadPreset?: string | null
    cloudinaryApiKey?: string | null
  } | null = null

  try {
    dbSettings = await prisma.aISettings.findFirst({
      select: {
        cloudinaryCloudName: true,
        cloudinaryUploadPreset: true,
        cloudinaryApiKey: true,
      },
    })
  } catch { /* fall through */ }

  return {
    cloudName:    dbSettings?.cloudinaryCloudName    || process.env.CLOUDINARY_CLOUD_NAME    || null,
    uploadPreset: dbSettings?.cloudinaryUploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || null,
    apiKey:       dbSettings?.cloudinaryApiKey       || process.env.CLOUDINARY_API_KEY       || null,
    folder:       process.env.CLOUDINARY_FOLDER || "prausdit-lab",
  }
}

async function isCloudinaryConfigured(): Promise<boolean> {
  const cfg = await getCloudinaryConfig()
  return !!cfg.cloudName && (!!cfg.uploadPreset || !!cfg.apiKey)
}

interface CloudinaryUploadResult {
  url: string; publicId: string; width?: number; height?: number; format?: string; bytes?: number
}

// Fix 2: Added signed upload fallback (apiKey + apiSecret via env)
// Fix 3: All errors now return a reason string instead of silently returning null
async function uploadToCloudinary(
  imageData: Buffer | string,
  options: { filename?: string; folder?: string; tags?: string[] } = {}
): Promise<CloudinaryUploadResult | { error: string }> {
  const cfg = await getCloudinaryConfig()
  if (!cfg.cloudName) return { error: "CLOUDINARY_CLOUD_NAME not configured. Add it in Settings → Manage API → Cloudinary." }

  const base64 = Buffer.isBuffer(imageData)
    ? `data:image/png;base64,${imageData.toString("base64")}`
    : imageData.startsWith("data:") ? imageData : `data:image/png;base64,${imageData}`

  const folder   = options.folder   || cfg.folder
  const tags     = options.tags     || ["agent-generated"]
  const filename = options.filename || `img-${Date.now()}`

  // Path 1: Unsigned upload (requires upload preset)
  if (cfg.uploadPreset) {
    try {
      const body = new FormData()
      body.append("file", base64)
      body.append("upload_preset", cfg.uploadPreset)
      body.append("folder", folder)
      body.append("public_id", filename)
      body.append("tags", tags.join(","))
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
        method: "POST", body, signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { error: `Cloudinary upload failed HTTP ${res.status}: ${(errData as Record<string,unknown>).error || res.statusText}` }
      }
      const data = await res.json()
      return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height, format: data.format, bytes: data.bytes }
    } catch (e) {
      return { error: `Cloudinary unsigned upload exception: ${String(e)}` }
    }
  }

  // Path 2: Signed upload (requires apiKey + apiSecret from env)
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (cfg.apiKey && apiSecret) {
    try {
      const { createHmac } = await import("crypto")
      const timestamp = Math.floor(Date.now() / 1000)
      const paramsToSign = [
        `folder=${folder}`,
        `public_id=${filename}`,
        `tags=${tags.join(",")}`,
        `timestamp=${timestamp}`,
      ].sort().join("&")
      const signature = createHmac("sha1", apiSecret).update(paramsToSign).digest("hex")
      const body = new FormData()
      body.append("file", base64)
      body.append("api_key", cfg.apiKey)
      body.append("timestamp", String(timestamp))
      body.append("signature", signature)
      body.append("folder", folder)
      body.append("public_id", filename)
      body.append("tags", tags.join(","))
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, {
        method: "POST", body, signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        return { error: `Cloudinary signed upload failed HTTP ${res.status}: ${(errData as Record<string,unknown>).error || res.statusText}` }
      }
      const data = await res.json()
      return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height, format: data.format, bytes: data.bytes }
    } catch (e) {
      return { error: `Cloudinary signed upload exception: ${String(e)}` }
    }
  }

  return { error: "Cloudinary not fully configured. Set CLOUDINARY_UPLOAD_PRESET (unsigned) or CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (signed) in Settings or env vars." }
}

// Fix 3: downloadAndUpload now returns error reason instead of null
async function downloadAndUpload(
  imageUrl: string,
  options: { filename?: string; folder?: string; tags?: string[] } = {}
): Promise<CloudinaryUploadResult | { error: string }> {
  if (!imageUrl.startsWith("https://")) {
    return { error: `Image URL must start with https:// — got: ${imageUrl.slice(0, 60)}` }
  }
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": "Prausdit-LabBot/2.0" },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { error: `Failed to fetch image from URL — HTTP ${res.status}: ${res.statusText}` }
    const ct = res.headers.get("content-type") || ""
    if (!ct.startsWith("image/")) {
      return { error: `URL does not point to an image (content-type: ${ct}). URL: ${imageUrl.slice(0, 80)}` }
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    return uploadToCloudinary(buffer, options)
  } catch (e) {
    return { error: `Failed to download image: ${String(e)}` }
  }
}

// ── Image Generation — Multi-provider, settings-driven ───────────────────────
//
// Architecture inspired by Antigravity's multi-model orchestration:
//   - Each task type routes to the most capable/efficient model
//   - User configures preferred model in Settings → Image Generation
//   - Auto mode does task-aware routing (diagram → fast model, quality → pro model)
//
// Provider paths:
//   A. Gemini Direct (via @google/genai) — uses Gemini API key
//      Models: gemini-2.0-flash-image, gemini-2.5-flash-image, imagen-4
//   B. OpenRouter (via /api/v1/chat/completions) — uses OpenRouter API key
//      Models: google/gemini-2.5-flash-image, google/gemini-3.1-flash-image-preview,
//              openai/gpt-5-image-mini, bytedance/seedream-4.5, sourceful/riverflow-v2-fast
//
// Response format: both paths return base64 PNG → upload directly to Cloudinary
// (no temp URL needed — cleaner pipeline, Cloudinary URL is the only stored reference)

// ── Model catalog ─────────────────────────────────────────────────────────────

export const IMAGE_MODEL_CATALOG = {
  // ── Gemini Direct (use these when you have a Gemini API key) ─────────────
  "gemini-2.0-flash-image": {
    label: "Gemini 2.0 Flash Image",
    provider: "gemini-direct" as const,
    tier: "free",
    best: "diagrams, illustrations, technical charts",
    model: "gemini-2.0-flash-preview-image-generation",
  },
  "gemini-2.5-flash-image": {
    label: "Gemini 2.5 Flash Image (Nano Banana)",
    provider: "gemini-direct" as const,
    tier: "paid",
    best: "high-quality illustrations, editing, multi-image",
    model: "gemini-2.5-flash-preview-image-generation",
  },
  "imagen-4": {
    label: "Imagen 4",
    provider: "gemini-direct" as const,
    tier: "paid",
    best: "photorealistic, brand assets, people",
    model: "imagen-4-generate-002",
  },
  // ── OpenRouter (use these when you have an OpenRouter API key) ────────────
  "google/gemini-2.5-flash-image": {
    label: "Gemini 2.5 Flash Image via OpenRouter",
    provider: "openrouter" as const,
    tier: "paid",
    best: "diagrams, charts, illustrations",
    modalities: ["image", "text"] as string[],
  },
  "google/gemini-3.1-flash-image-preview": {
    label: "Gemini 3.1 Flash Image (Nano Banana 2) via OpenRouter",
    provider: "openrouter" as const,
    tier: "paid",
    best: "Pro-level quality at Flash speed, complex scenes",
    modalities: ["image", "text"] as string[],
  },
  "openai/gpt-5-image-mini": {
    label: "GPT-5 Image Mini via OpenRouter",
    provider: "openrouter" as const,
    tier: "paid",
    best: "detailed edits, text rendering in images",
    modalities: ["image", "text"] as string[],
  },
  "bytedance/seedream-4.5": {
    label: "Seedream 4.5 via OpenRouter",
    provider: "openrouter" as const,
    tier: "paid",
    best: "portrait, editing consistency, multi-image",
    modalities: ["image"] as string[],
  },
  "sourceful/riverflow-v2-fast": {
    label: "Riverflow V2 Fast via OpenRouter",
    provider: "openrouter" as const,
    tier: "paid",
    best: "fastest generation, production workflows",
    modalities: ["image"] as string[],
  },
} as const

type ImageModelKey = keyof typeof IMAGE_MODEL_CATALOG

// ── Task-aware auto routing (Antigravity-style) ───────────────────────────────

function autoSelectImageModel(prompt: string, hasGeminiKey: boolean, hasOpenRouterKey: boolean): ImageModelKey {
  const p = prompt.toLowerCase()
  // Technical/diagram prompts → fast free Gemini model
  const isTechnical = /diagram|architecture|flowchart|chart|graph|technical|pipeline|system|schema|wireframe|ui|layout|blueprint|infographic/i.test(p)
  // High-quality/photorealistic → better model
  const isHighQuality = /photorealistic|professional|brand|product|realistic|cinematic|4k|high.?quality|detailed|portrait/i.test(p)
  // Research paper style → diagram model
  const isResearch = /research|academic|scientific|paper|study|visualization|plot|figure/i.test(p)

  if (hasOpenRouterKey) {
    if (isHighQuality) return "google/gemini-3.1-flash-image-preview"
    if (isTechnical || isResearch) return "google/gemini-2.5-flash-image"
    return "google/gemini-2.5-flash-image"
  }

  if (hasGeminiKey) {
    if (isHighQuality) return "imagen-4"
    return "gemini-2.0-flash-image" // free, good for diagrams
  }

  return "gemini-2.0-flash-image" // fallback
}

// ── API key loaders ───────────────────────────────────────────────────────────

async function getGeminiApiKey(): Promise<string | null> {
  try {
    const s = await prisma.aISettings.findFirst({ select: { geminiApiKey: true } })
    return s?.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || null
  } catch {
    return process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || null
  }
}

async function getOpenRouterApiKey(): Promise<string | null> {
  try {
    const s = await prisma.aISettings.findFirst({ select: { openrouterApiKey: true } })
    return s?.openrouterApiKey || process.env.OPENROUTER_API_KEY || null
  } catch {
    return process.env.OPENROUTER_API_KEY || null
  }
}

async function getImageGenerationModel(): Promise<string> {
  try {
    const s = await prisma.aISettings.findFirst({ select: { imageGenerationModel: true } })
    return s?.imageGenerationModel || "auto"
  } catch {
    return "auto"
  }
}

// ── Image gen result type ─────────────────────────────────────────────────────

type ImageGenResult = {
  success: true
  cloudinaryUrl: string
  publicId: string
  model: string
  bytes?: number
} | {
  success: false
  error: string
}

// ── Path A: Gemini Direct ─────────────────────────────────────────────────────

async function generateWithGeminiDirect(
  prompt: string,
  modelKey: "gemini-2.0-flash-image" | "gemini-2.5-flash-image" | "imagen-4",
  apiKey: string,
  options: { filename?: string; folder?: string; tags?: string[] }
): Promise<ImageGenResult> {
  const cfg = IMAGE_MODEL_CATALOG[modelKey]
  try {
    const { GoogleGenAI } = await import("@google/genai")
    const ai = new GoogleGenAI({ apiKey })

    if (modelKey === "imagen-4") {
      // Imagen 4: uses generateImages API
      const result = await (ai.models as Record<string, (opts: Record<string, unknown>) => Promise<Record<string, unknown>>>).generateImages({
        model: cfg.model,
        prompt,
        config: { numberOfImages: 1, outputMimeType: "image/png" },
      })
      const images = (result as Record<string, unknown[]>).generatedImages
      if (!images?.length) return { success: false, error: "Imagen 4 returned no images" }
      const imgData = (images[0] as Record<string, Record<string, string>>).image
      if (!imgData?.imageBytes) return { success: false, error: "Imagen 4 returned empty image bytes" }
      const buffer = Buffer.from(imgData.imageBytes, "base64")
      const upload = await uploadToCloudinary(buffer, { filename: options.filename || `imagen4-${Date.now()}`, folder: options.folder || "prausdit-lab/agent-generated", tags: options.tags || ["agent-generated", "imagen-4"] })
      if ("error" in upload) return { success: false, error: `Generated OK but upload failed: ${upload.error}` }
      return { success: true, cloudinaryUrl: upload.url, publicId: upload.publicId, model: cfg.model, bytes: upload.bytes }
    }

    // Gemini image models: uses generateContent with responseModalities
    const result = await ai.models.generateContent({
      model: cfg.model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseModalities: ["IMAGE"], temperature: 0.9 } as Record<string, unknown>,
    })
    const parts = result.candidates?.[0]?.content?.parts
    if (!parts) return { success: false, error: `${cfg.label} returned no content` }
    const imagePart = parts.find((p: Record<string, unknown>) => p.inlineData) as Record<string, Record<string, string>> | undefined
    if (!imagePart?.inlineData?.data) return { success: false, error: `${cfg.label} returned no image data` }
    const buffer = Buffer.from(imagePart.inlineData.data, "base64")
    const upload = await uploadToCloudinary(buffer, { filename: options.filename || `gemini-img-${Date.now()}`, folder: options.folder || "prausdit-lab/agent-generated", tags: options.tags || ["agent-generated", "gemini-image"] })
    if ("error" in upload) return { success: false, error: `Generated OK but upload failed: ${upload.error}` }
    return { success: true, cloudinaryUrl: upload.url, publicId: upload.publicId, model: cfg.model, bytes: upload.bytes }
  } catch (e) {
    return { success: false, error: `${modelKey} generation failed: ${String(e)}` }
  }
}

// ── Path B: OpenRouter ─────────────────────────────────────────────────────────

async function generateWithOpenRouter(
  prompt: string,
  modelId: string,
  apiKey: string,
  options: { filename?: string; folder?: string; tags?: string[] }
): Promise<ImageGenResult> {
  const modelCfg = IMAGE_MODEL_CATALOG[modelId as ImageModelKey] as { modalities?: string[] } | undefined
  const modalities = modelCfg?.modalities || ["image", "text"]
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://prausdit.app",
        "X-Title": "Prausdit Research Lab",
      },
      body: JSON.stringify({
        model: modelId,
        modalities,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: `OpenRouter ${modelId} failed HTTP ${res.status}: ${(err as Record<string,unknown>).error || res.statusText}` }
    }

    const data = await res.json()
    const message = data?.choices?.[0]?.message

    // OpenRouter returns images in message.images array
    const imageUrl: string | undefined = message?.images?.[0]?.image_url?.url
    if (imageUrl) {
      const base64 = imageUrl.replace(/^data:image\/[a-z]+;base64,/, "")
      const buffer = Buffer.from(base64, "base64")
      const upload = await uploadToCloudinary(buffer, { filename: options.filename || `or-img-${Date.now()}`, folder: options.folder || "prausdit-lab/agent-generated", tags: options.tags || ["agent-generated", modelId.split("/").pop() || "openrouter"] })
      if ("error" in upload) return { success: false, error: `Generated OK but upload failed: ${upload.error}` }
      return { success: true, cloudinaryUrl: upload.url, publicId: upload.publicId, model: modelId, bytes: upload.bytes }
    }

    // Some models embed image in content array
    const contentParts = Array.isArray(message?.content) ? message.content : []
    for (const part of contentParts) {
      const imgUrl = part?.image_url?.url || part?.url
      if (imgUrl && imgUrl.startsWith("data:image")) {
        const base64 = imgUrl.replace(/^data:image\/[a-z]+;base64,/, "")
        const buffer = Buffer.from(base64, "base64")
        const upload = await uploadToCloudinary(buffer, { filename: options.filename || `or-img-${Date.now()}`, folder: options.folder || "prausdit-lab/agent-generated", tags: options.tags || ["agent-generated"] })
        if ("error" in upload) return { success: false, error: `Generated OK but upload failed: ${upload.error}` }
        return { success: true, cloudinaryUrl: upload.url, publicId: upload.publicId, model: modelId, bytes: upload.bytes }
      }
    }

    return { success: false, error: `OpenRouter ${modelId} response contained no image data. Response: ${JSON.stringify(message).slice(0, 200)}` }
  } catch (e) {
    return { success: false, error: `OpenRouter ${modelId} exception: ${String(e)}` }
  }
}

// ── Main image generation dispatcher ─────────────────────────────────────────

async function generateImage(
  prompt: string,
  requestedModel: string,   // "auto" | any ImageModelKey
  options: { filename?: string; folder?: string; tags?: string[] } = {}
): Promise<ImageGenResult> {
  const cloudinaryReady = await isCloudinaryConfigured()
  if (!cloudinaryReady) {
    return { success: false, error: "Cloudinary not configured. Images are generated but cannot be stored. Add Cloudinary keys in Settings → Manage API → Cloudinary." }
  }

  const geminiKey = await getGeminiApiKey()
  const openrouterKey = await getOpenRouterApiKey()

  if (!geminiKey && !openrouterKey) {
    return { success: false, error: "No API keys available. Add a Gemini API key or OpenRouter API key in Settings → Manage API." }
  }

  // Resolve "auto" to best available model based on task
  let modelKey: string = requestedModel
  if (modelKey === "auto") {
    // Read the user's preferred image model from settings, or auto-route
    const settingsModel = await getImageGenerationModel()
    if (settingsModel && settingsModel !== "auto") {
      modelKey = settingsModel
    } else {
      modelKey = autoSelectImageModel(prompt, !!geminiKey, !!openrouterKey)
    }
  }

  const catalog = IMAGE_MODEL_CATALOG[modelKey as ImageModelKey]

  if (!catalog) {
    // Unknown model key — try as raw OpenRouter model ID
    if (openrouterKey) return generateWithOpenRouter(prompt, modelKey, openrouterKey, options)
    return { success: false, error: `Unknown image model: ${modelKey}` }
  }

  if (catalog.provider === "openrouter") {
    if (!openrouterKey) {
      // Fallback to Gemini direct
      if (geminiKey) return generateWithGeminiDirect(prompt, "gemini-2.0-flash-image", geminiKey, options)
      return { success: false, error: `OpenRouter API key not configured for model ${catalog.label}. Add it in Settings → Manage API.` }
    }
    return generateWithOpenRouter(prompt, modelKey, openrouterKey, options)
  }

  // Gemini direct
  if (!geminiKey) {
    // Fallback to OpenRouter Gemini
    if (openrouterKey) return generateWithOpenRouter(prompt, "google/gemini-2.5-flash-image", openrouterKey, options)
    return { success: false, error: `Gemini API key not configured for model ${catalog.label}. Add it in Settings → Manage API.` }
  }
  return generateWithGeminiDirect(prompt, modelKey as "gemini-2.0-flash-image" | "gemini-2.5-flash-image" | "imagen-4", geminiKey, options)
}

// ── Plan markdown builder ─────────────────────────────────────────────────────

function buildPlanMarkdown(
  title: string,
  overview: string,
  sections: Array<{ heading: string; subheading?: string; description: string; steps: string[]; toolsRequired?: string[] }>,
  sources?: Array<{ title: string; url: string }>,
  imagePlan?: { needed: boolean; description?: string } | null
): string {
  const lines: string[] = [`# Plan: ${title}`, "", `> ${overview}`, "", "---", ""]
  sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.heading}`)
    if (s.subheading) lines.push(`### ${s.subheading}`)
    lines.push("", s.description, "", "**Steps:**")
    s.steps.forEach((step, j) => lines.push(`${j + 1}. ${step}`))
    if (s.toolsRequired?.length) lines.push("", `*Tools: ${s.toolsRequired.join(", ")}*`)
    lines.push("")
  })
  if (imagePlan?.needed) lines.push("## Image Plan", "", imagePlan.description || "Images will be uploaded to Cloudinary.", "")
  if (sources?.length) { lines.push("## Sources", ""); sources.forEach((s, i) => lines.push(`${i + 1}. [${s.title}](${s.url})`)); lines.push("") }
  lines.push("---", "*Awaiting approval. Reply **approve** to execute, or provide feedback to refine.*")
  return lines.join("\n")
}

// ════════════════════════════════════════════════════════════════════════════
// TOOLS
// ════════════════════════════════════════════════════════════════════════════

export const searchInternalDocs = tool({
  description: "Search the internal knowledge base. Results are automatically scoped to the current project when one is selected.",
  inputSchema: z.object({
    query: z.string(),
    sources: z.array(z.enum(["docs", "experiments", "datasets", "notes", "roadmap", "models"])).optional(),
    limit: z.number().int().min(1).max(10).optional().default(4),
    projectId: z.string().optional().describe("Auto-injected from session context."),
  }),
  execute: async ({ query, sources, limit = 4, projectId }) => {
    const searchAll = !sources || sources.length === 0
    const results: Record<string, unknown[]> = {}
    const pf = projectId ? { OR: [{ projectId }, { projectId: null }] } : {}
    try {
      if (searchAll || sources?.includes("docs")) {
        const docs = await prisma.documentationPage.findMany({ where: { AND: [pf, { OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }, { tags: { hasSome: query.split(" ") } }] }] }, select: { id: true, title: true, slug: true, section: true, content: true, tags: true, progress: true, updatedAt: true, projectId: true }, take: limit, orderBy: { updatedAt: "desc" } })
        results.documentation = docs.map(d => ({ ...d, content: d.content.slice(0, 1000) + (d.content.length > 1000 ? "..." : "") }))
      }
      if (searchAll || sources?.includes("experiments")) {
        results.experiments = await prisma.experiment.findMany({ where: { AND: [pf, { OR: [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }, { baseModel: { contains: query, mode: "insensitive" } }] }] }, select: { id: true, name: true, status: true, baseModel: true, description: true, resultSummary: true, method: true, createdAt: true, projectId: true }, take: limit, orderBy: { createdAt: "desc" } })
      }
      if (searchAll || sources?.includes("datasets")) {
        results.datasets = await prisma.dataset.findMany({ where: { AND: [pf, { OR: [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] }] }, select: { id: true, name: true, datasetType: true, description: true, numSamples: true, preprocessStatus: true, projectId: true }, take: limit, orderBy: { createdAt: "desc" } })
      }
      if (searchAll || sources?.includes("notes")) {
        const notes = await prisma.note.findMany({ where: { AND: [pf, { OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }] }] }, select: { id: true, title: true, content: true, tags: true, pinned: true, updatedAt: true, projectId: true }, take: limit, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] })
        results.notes = notes.map(n => ({ ...n, content: n.content.slice(0, 600) + (n.content.length > 600 ? "..." : "") }))
      }
      if (searchAll || sources?.includes("roadmap")) {
        results.roadmap = await prisma.roadmapStep.findMany({ where: { AND: [pf, { OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] }] }, select: { id: true, title: true, phase: true, status: true, description: true, progressPercent: true, milestone: true, priority: true, projectId: true }, take: limit, orderBy: { phase: "asc" } })
      }
      if (searchAll || sources?.includes("models")) {
        results.models = await prisma.modelVersion.findMany({ where: { AND: [pf, { OR: [{ name: { contains: query, mode: "insensitive" } }, { version: { contains: query, mode: "insensitive" } }] }] }, select: { id: true, name: true, version: true, description: true, bleuScore: true, pass1Score: true, isDeployed: true, projectId: true }, take: limit, orderBy: { createdAt: "desc" } })
      }
      return { query, totalFound: Object.values(results).reduce((a, arr) => a + arr.length, 0), results, scopedToProject: projectId || "all" }
    } catch (err) { return { query, totalFound: 0, results: {}, error: String(err) } }
  },
})

export const getKnowledgeGraph = tool({
  description: "Retrieve a knowledge graph showing relationships between CRM entities. Scoped to the current project.",
  inputSchema: z.object({
    includeMetrics: z.boolean().optional().default(false),
    projectId: z.string().optional().describe("Auto-injected from session context."),
  }),
  execute: async ({ includeMetrics = false, projectId }) => {
    try {
      const pf = projectId ? { projectId } : {}
      const [experiments, datasets, roadmapPhases, models, recentNotes] = await Promise.all([
        prisma.experiment.findMany({ where: pf, select: { id: true, name: true, status: true, baseModel: true, method: true, datasetId: true, evalLoss: true, evalAccuracy: true, modelVersions: { select: { id: true, name: true, version: true } } }, take: 20, orderBy: { createdAt: "desc" } }),
        prisma.dataset.findMany({ where: pf, select: { id: true, name: true, datasetType: true, numSamples: true, preprocessStatus: true }, take: 20, orderBy: { createdAt: "desc" } }),
        prisma.roadmapStep.findMany({ where: pf, select: { id: true, title: true, phase: true, status: true, progressPercent: true, priority: true, tasks: { select: { id: true, title: true, completed: true } } }, orderBy: { phase: "asc" }, take: 30 }),
        prisma.modelVersion.findMany({ where: pf, select: { id: true, name: true, version: true, isDeployed: true, quantization: true, ...(includeMetrics ? { bleuScore: true, pass1Score: true, humanEval: true, mmluScore: true } : {}) }, take: 10, orderBy: { createdAt: "desc" } }),
        prisma.note.findMany({ where: pf, select: { id: true, title: true, tags: true }, take: 10, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }] }),
      ])
      return {
        summary: { totalExperiments: experiments.length, totalDatasets: datasets.length, totalRoadmapSteps: roadmapPhases.length, totalModels: models.length, recentNoteCount: recentNotes.length },
        nodes: { experiments, datasets, roadmapSteps: roadmapPhases, models, recentNotes },
        relationships: experiments.map(e => ({ experimentId: e.id, experimentName: e.name, datasetId: e.datasetId, linkedModels: e.modelVersions.map(m => m.id) })),
        scopedToProject: projectId || "all",
      }
    } catch (err) { return { error: String(err) } }
  },
})

export const readDocument = tool({
  description: "Read the full content of a specific documentation page by its slug.",
  inputSchema: z.object({ slug: z.string() }),
  execute: async ({ slug }) => {
    try {
      const page = await prisma.documentationPage.findUnique({ where: { slug } })
      if (!page) return { error: `No page found with slug "${slug}"` }
      return { id: page.id, title: page.title, slug: page.slug, section: page.section, content: page.content, tags: page.tags, progress: page.progress }
    } catch (err) { return { error: String(err) } }
  },
})

export const createDocument = tool({
  description: "Create a new documentation page. projectId is auto-injected from session context.",
  inputSchema: z.object({
    title: z.string(), slug: z.string(), section: z.string(), content: z.string(),
    tags: z.array(z.string()).optional(),
    progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional().default("COMPLETED"),
    projectId: z.string().optional(),
  }),
  execute: async ({ title, slug, section, content, tags, progress, projectId }) => {
    try {
      const existing = await prisma.documentationPage.findUnique({ where: { slug } })
      const finalSlug = existing ? `${slug}-${Date.now()}` : slug
      const page = await prisma.documentationPage.create({ data: { title, slug: finalSlug, section, content, tags: tags || [], order: 99, progress: progress ?? "COMPLETED", projectId: projectId ?? null } })
      return { success: true, id: page.id, slug: page.slug, title: page.title, projectId: page.projectId, ...(existing ? { note: "Slug taken — used unique alternative" } : {}) }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const updateDocument = tool({
  description: "Update an existing documentation page by its slug.",
  inputSchema: z.object({ slug: z.string(), title: z.string().optional(), content: z.string().optional(), section: z.string().optional(), tags: z.array(z.string()).optional(), progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional() }),
  execute: async ({ slug, ...updates }) => {
    try {
      const page = await prisma.documentationPage.update({ where: { slug }, data: updates })
      return { success: true, id: page.id, slug: page.slug }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const createNote = tool({
  description: "Create a new research note. projectId is auto-injected from session context.",
  inputSchema: z.object({
    title: z.string(), content: z.string(), tags: z.array(z.string()).optional(), pinned: z.boolean().optional().default(false),
    projectId: z.string().optional(),
  }),
  execute: async ({ title, content, tags, pinned, projectId }) => {
    try {
      const note = await prisma.note.create({ data: { title, content, tags: tags || [], pinned: pinned ?? false, projectId: projectId ?? null } })
      return { success: true, id: note.id, title: note.title, projectId: note.projectId }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const updateNote = tool({
  description: "Update an existing research note by its ID.",
  inputSchema: z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional(), tags: z.array(z.string()).optional(), pinned: z.boolean().optional() }),
  execute: async ({ id, ...updates }) => {
    try {
      const note = await prisma.note.update({ where: { id }, data: updates })
      return { success: true, id: note.id, title: note.title }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const createRoadmapStep = tool({
  description: "Create a new roadmap step/phase entry. projectId is auto-injected from session context.",
  inputSchema: z.object({
    title: z.string(), phase: z.number().int(), description: z.string(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().default("MEDIUM"),
    milestone: z.string().optional(), tasks: z.array(z.string()).optional(), estimatedCompletion: z.string().optional(),
    projectId: z.string().optional(),
  }),
  execute: async ({ title, phase, description, priority, milestone, tasks, estimatedCompletion, projectId }) => {
    try {
      const step = await prisma.roadmapStep.create({ data: { title, phase, description, priority: priority ?? "MEDIUM", milestone, status: "PENDING", order: 99, estimatedCompletion: estimatedCompletion ? new Date(estimatedCompletion) : undefined, tasks: tasks ? { create: tasks.map(t => ({ title: t, completed: false })) } : undefined, projectId: projectId ?? null }, include: { tasks: true } })
      return { success: true, id: step.id, phase: step.phase, title: step.title, tasksCreated: step.tasks.length, projectId: step.projectId }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const updateRoadmapStep = tool({
  description: "Update an existing roadmap step.",
  inputSchema: z.object({ id: z.string(), title: z.string().optional(), description: z.string().optional(), status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(), progressPercent: z.number().min(0).max(100).optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(), milestone: z.string().optional() }),
  execute: async ({ id, ...updates }) => {
    try {
      const step = await prisma.roadmapStep.update({ where: { id }, data: updates })
      return { success: true, id: step.id, title: step.title, status: step.status, progressPercent: step.progressPercent }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const completeRoadmapTask = tool({
  description: "Mark a specific roadmap task as completed.",
  inputSchema: z.object({ taskId: z.string() }),
  execute: async ({ taskId }) => {
    try {
      const task = await prisma.roadmapTask.update({ where: { id: taskId }, data: { completed: true } })
      return { success: true, taskId: task.id, title: task.title }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const createExperiment = tool({
  description: "Create a new ML experiment entry. projectId is auto-injected from session context.",
  inputSchema: z.object({
    name: z.string(), baseModel: z.string(), description: z.string().optional(), method: z.string().optional(),
    loraRank: z.number().optional(), loraAlpha: z.number().optional(), batchSize: z.number().optional(), learningRate: z.number().optional(), epochs: z.number().optional(),
    datasetId: z.string().optional(), config: z.record(z.string(), z.unknown()).optional(),
    projectId: z.string().optional(),
  }),
  execute: async ({ name, baseModel, description, method, loraRank, loraAlpha, batchSize, learningRate, epochs, datasetId, config, projectId }) => {
    try {
      const exp = await prisma.experiment.create({ data: { name, baseModel, description, method, status: "PENDING", loraRank, loraAlpha, batchSize, learningRate, epochs, datasetId, config: config as InputJsonValue | undefined, projectId: projectId ?? null } })
      return { success: true, id: exp.id, name: exp.name, projectId: exp.projectId }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const updateExperiment = tool({
  description: "Update an existing experiment.",
  inputSchema: z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(), resultSummary: z.string().optional(), evalLoss: z.number().optional(), evalAccuracy: z.number().optional(), bleuScore: z.number().optional(), pass1Score: z.number().optional() }),
  execute: async ({ id, ...updates }) => {
    try {
      const exp = await prisma.experiment.update({ where: { id }, data: updates })
      return { success: true, id: exp.id, name: exp.name, status: exp.status }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const createDataset = tool({
  description: "Create a new dataset entry in the lab. projectId is auto-injected from session context.",
  inputSchema: z.object({
    name: z.string(), description: z.string().optional(), datasetType: z.enum(["CODE", "TEXT", "INSTRUCTION", "QA", "MIXED"]),
    numSamples: z.number().optional(), format: z.string().optional(), sourceUrl: z.string().optional(), tags: z.array(z.string()).optional(), license: z.string().optional(),
    projectId: z.string().optional(),
  }),
  execute: async ({ name, description, datasetType, numSamples, format, sourceUrl, tags, license, projectId }) => {
    try {
      const ds = await prisma.dataset.create({ data: { name, description, datasetType, numSamples, format, sourceUrl, tags: tags || [], license, preprocessStatus: "RAW", projectId: projectId ?? null } })
      return { success: true, id: ds.id, name: ds.name, projectId: ds.projectId }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const updateDataset = tool({
  description: "Update an existing dataset.",
  inputSchema: z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), preprocessStatus: z.enum(["RAW", "CLEANING", "CLEANED", "FORMATTED", "AUGMENTED", "READY"]).optional(), numSamples: z.number().optional(), tags: z.array(z.string()).optional(), format: z.string().optional() }),
  execute: async ({ id, ...updates }) => {
    try {
      const ds = await prisma.dataset.update({ where: { id }, data: updates })
      return { success: true, id: ds.id, name: ds.name }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const analyzeDatasetIntelligence = tool({
  description: "Analyze a dataset: quality, statistics, documentation, experiment suggestions.",
  inputSchema: z.object({ datasetId: z.string() }),
  execute: async ({ datasetId }) => {
    try {
      const ds = await prisma.dataset.findUnique({ where: { id: datasetId }, include: { experiments: { select: { id: true, name: true, status: true, baseModel: true } } } })
      if (!ds) return { error: "Dataset not found" }
      const relatedDocs = await prisma.documentationPage.findMany({ where: { OR: [{ title: { contains: ds.name, mode: "insensitive" } }, { tags: { hasSome: ds.tags } }] }, select: { id: true, title: true, slug: true }, take: 3 })
      return { dataset: { id: ds.id, name: ds.name, type: ds.datasetType, numSamples: ds.numSamples, format: ds.format, preprocessStatus: ds.preprocessStatus, tags: ds.tags, description: ds.description, license: ds.license }, linkedExperiments: ds.experiments, relatedDocumentation: relatedDocs, analysisContext: { hasExperiments: ds.experiments.length > 0, isReady: ds.preprocessStatus === "READY", sampleCount: ds.numSamples || "unknown" } }
    } catch (err) { return { error: String(err) } }
  },
})

export const benchmarkModel = tool({
  description: "Record benchmark results for a model version and generate a benchmark report.",
  inputSchema: z.object({ modelVersionId: z.string(), bleuScore: z.number().optional(), pass1Score: z.number().optional(), humanEval: z.number().optional(), mmluScore: z.number().optional(), benchmarkNotes: z.string().optional(), generateReport: z.boolean().optional().default(true) }),
  execute: async ({ modelVersionId, bleuScore, pass1Score, humanEval, mmluScore, benchmarkNotes, generateReport }) => {
    try {
      const model = await prisma.modelVersion.update({ where: { id: modelVersionId }, data: { bleuScore, pass1Score, humanEval, mmluScore } })
      let docResult = null
      if (generateReport) {
        const slug = `benchmark-${model.name.toLowerCase().replace(/\s+/g, "-")}-${model.version}-${Date.now()}`
        const content = `# Benchmark Report: ${model.name} v${model.version}\n\n| Metric | Score |\n|--------|-------|\n| BLEU | ${bleuScore ?? "N/A"} |\n| pass@1 | ${pass1Score ?? "N/A"} |\n| HumanEval | ${humanEval ?? "N/A"} |\n| MMLU | ${mmluScore ?? "N/A"} |\n\n## Notes\n${benchmarkNotes || "None."}\n\nGenerated: ${new Date().toISOString()}`
        const doc = await prisma.documentationPage.create({ data: { title: `Benchmark: ${model.name} v${model.version}`, slug, section: "Benchmarks", content, tags: ["benchmark", "model"], order: 99, progress: "COMPLETED" } })
        docResult = { docId: doc.id, docSlug: doc.slug }
      }
      return { success: true, modelId: model.id, name: model.name, version: model.version, metrics: { bleuScore, pass1Score, humanEval, mmluScore }, report: docResult }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const getModelLeaderboard = tool({
  description: "Retrieve the model leaderboard sorted by benchmark metrics.",
  inputSchema: z.object({ sortBy: z.enum(["bleuScore", "pass1Score", "humanEval", "mmluScore"]).optional().default("pass1Score"), limit: z.number().int().min(1).max(20).optional().default(10) }),
  execute: async ({ sortBy = "pass1Score", limit = 10 }) => {
    try {
      const models = await prisma.modelVersion.findMany({ where: { [sortBy]: { not: null } }, select: { id: true, name: true, version: true, quantization: true, isDeployed: true, bleuScore: true, pass1Score: true, humanEval: true, mmluScore: true, parameterCount: true, createdAt: true, experiment: { select: { id: true, name: true, baseModel: true } } }, orderBy: { [sortBy]: "desc" }, take: limit })
      return { leaderboard: models, sortedBy: sortBy, total: models.length }
    } catch (err) { return { error: String(err) } }
  },
})

export const crawlWeb = tool({
  description: "Fetch a specific known public URL. For broad research queries, use the `research` tool instead.",
  inputSchema: z.object({ url: z.string().url(), reason: z.string().optional() }),
  execute: async ({ url }) => {
    if (!isSafeUrl(url)) return { error: "Only HTTPS URLs to public hosts are allowed" }
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Prausdit-LabBot/2.0", Accept: "text/html,text/plain,application/json,text/markdown" }, signal: AbortSignal.timeout(10000) })
      if (!res.ok) return { error: `HTTP ${res.status}`, url }
      const ct = res.headers.get("content-type") || ""
      const raw = await res.text()
      let text: string
      if (ct.includes("application/json")) { try { text = JSON.stringify(JSON.parse(raw), null, 2).slice(0, 8000) } catch { text = raw.slice(0, 8000) } }
      else if (ct.includes("text/plain") || ct.includes("text/markdown")) { text = raw.slice(0, 8000) }
      else { text = stripHtml(raw) }
      const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i)
      return { url, title: titleMatch ? titleMatch[1].trim() : url, content: text, length: text.length }
    } catch (err) { return { error: String(err), url } }
  },
})

export const runResearchAutopilot = tool({
  description: "Execute a full research autopilot workflow. Results scoped to current project.",
  inputSchema: z.object({
    topic: z.string(),
    scope: z.array(z.enum(["roadmap", "experiments", "datasets", "documentation", "notes"])).optional(),
    projectId: z.string().optional(),
  }),
  execute: async ({ topic, scope, projectId }) => {
    const targetScopes = scope || ["roadmap", "experiments", "datasets", "documentation", "notes"]
    const pf = projectId ? { projectId } : {}
    try {
      const [experiments, datasets, docs, roadmapSteps] = await Promise.all([
        targetScopes.includes("experiments") ? prisma.experiment.findMany({ where: { AND: [pf, { OR: [{ name: { contains: topic, mode: "insensitive" } }, { description: { contains: topic, mode: "insensitive" } }] }] }, select: { id: true, name: true, status: true }, take: 5 }) : [],
        targetScopes.includes("datasets") ? prisma.dataset.findMany({ where: { AND: [pf, { OR: [{ name: { contains: topic, mode: "insensitive" } }, { description: { contains: topic, mode: "insensitive" } }] }] }, select: { id: true, name: true, datasetType: true }, take: 5 }) : [],
        targetScopes.includes("documentation") ? prisma.documentationPage.findMany({ where: { AND: [pf, { OR: [{ title: { contains: topic, mode: "insensitive" } }, { content: { contains: topic, mode: "insensitive" } }] }] }, select: { id: true, title: true, slug: true }, take: 5 }) : [],
        targetScopes.includes("roadmap") ? prisma.roadmapStep.findMany({ where: { AND: [pf, { OR: [{ title: { contains: topic, mode: "insensitive" } }, { description: { contains: topic, mode: "insensitive" } }] }] }, select: { id: true, title: true, status: true, phase: true }, take: 5 }) : [],
      ])
      return {
        topic,
        existingContext: {
          experiments: experiments.map((e: { id: string; name: string; status: string }) => ({ id: e.id, name: e.name, status: e.status })),
          datasets: datasets.map((d: { id: string; name: string; datasetType: string }) => ({ id: d.id, name: d.name, type: d.datasetType })),
          documentation: docs.map((d: { id: string; title: string; slug: string }) => ({ id: d.id, title: d.title, slug: d.slug })),
          roadmapSteps: roadmapSteps.map((r: { id: string; title: string; status: string; phase: number }) => ({ id: r.id, title: r.title, status: r.status, phase: r.phase })),
        },
        gaps: { needsExperiments: experiments.length === 0, needsDatasets: datasets.length === 0, needsDocumentation: docs.length === 0, needsRoadmapEntry: roadmapSteps.length === 0 },
        recommendation: `Focus on: ${[experiments.length === 0 ? "creating experiments" : "building on existing", datasets.length === 0 ? "sourcing datasets" : "leveraging existing", docs.length === 0 ? "writing documentation" : "updating docs"].join(", ")}.`,
        scopedToProject: projectId || "all",
      }
    } catch (err) { return { error: String(err), topic } }
  },
})

export const researchTool = tool({
  description: "Perform deep web research. Searches Tavily → Exa → SerpAPI (keys from Settings DB). Exa uses deep mode for thorough research and auto-detects research paper queries. Crawls top results via Firecrawl → Crawl4AI → basic fetch. ALWAYS use for external research.",
  inputSchema: z.object({
    query: z.string(),
    mode: z.enum(["deep", "quick"]).optional().default("deep"),
    maxCrawl: z.number().int().min(1).max(4).optional().default(2),
    saveAsNote: z.boolean().optional().default(false),
    projectId: z.string().optional(),
  }),
  execute: async ({ query, mode, maxCrawl, saveAsNote, projectId }) => {
    try {
      const output = await deepResearch(query, { maxCrawl: maxCrawl ?? 2, crawlEnabled: mode !== "quick", mode: mode === "deep" ? "deep" : "auto" })
      let noteResult: { id: string; title: string } | null = null
      if (saveAsNote && output.results.length > 0) {
        const noteContent = [`# Research: ${query}`, "", `**Provider:** ${output.provider} | **Crawled:** ${output.crawledCount} pages`, "", "## Summary", output.summary, "", "## Sources", ...output.sources.map((s, i) => `${i + 1}. ${s}`)].join("\n")
        try { const note = await prisma.note.create({ data: { title: `Research: ${query}`, content: noteContent, tags: ["research", "auto-saved"], pinned: false, projectId: projectId ?? null } }); noteResult = { id: note.id, title: note.title } } catch { /* non-fatal */ }
      }
      return { query, provider: output.provider, crawlProvider: output.crawlProvider, crawledCount: output.crawledCount, resultCount: output.results.length, summary: output.summary, sources: output.sources, results: output.results.map(r => ({ title: r.title, url: r.url, snippet: r.snippet, content: r.content ? r.content.slice(0, 2000) : undefined, score: r.score })), savedNote: noteResult, error: output.error }
    } catch (err) { return { query, error: String(err), results: [], sources: [] } }
  },
})

export const generatePlan = tool({
  description: "Generate a structured execution plan for user approval BEFORE doing any work. ALWAYS use for complex multi-step tasks.",
  inputSchema: z.object({
    title: z.string(), overview: z.string(),
    sections: z.array(z.object({ heading: z.string(), subheading: z.string().optional(), description: z.string(), steps: z.array(z.string()), toolsRequired: z.array(z.string()).optional() })).min(2),
    imagePlan: z.object({ needed: z.boolean(), description: z.string().optional() }).optional(),
    sources: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
    estimatedSteps: z.number().int().optional(),
    projectId: z.string().optional(),
    requestedBy: z.string().optional(),
  }),
  execute: async ({ title, overview, sections, imagePlan, sources, estimatedSteps, projectId, requestedBy }) => {
    try {
      const planContent = buildPlanMarkdown(title, overview, sections, sources, imagePlan)
      const note = await prisma.note.create({ data: { title: `PLAN: ${title}`, content: planContent, tags: ["agent-plan", "pending-approval"], pinned: true, projectId: projectId ?? null } })
      return { success: true, planId: note.id, title, overview, sections: sections.map(s => ({ heading: s.heading, stepsCount: s.steps.length, toolsRequired: s.toolsRequired })), imagePlan, sources, estimatedSteps, status: "PENDING_APPROVAL", requestedBy, message: `Plan ready (Note ID: ${note.id}). Reply **approve** to execute.` }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const updatePlan = tool({
  description: "Refine an existing plan based on user feedback.",
  inputSchema: z.object({ planNoteId: z.string(), changes: z.string(), newTitle: z.string().optional(), newOverview: z.string().optional(), newSections: z.array(z.object({ heading: z.string(), subheading: z.string().optional(), description: z.string(), steps: z.array(z.string()), toolsRequired: z.array(z.string()).optional() })).optional(), newSources: z.array(z.object({ title: z.string(), url: z.string() })).optional() }),
  execute: async ({ planNoteId, changes, newTitle, newOverview, newSections, newSources }) => {
    try {
      const existing = await prisma.note.findUnique({ where: { id: planNoteId } })
      if (!existing) return { success: false, error: `Plan note ${planNoteId} not found` }
      const title = newTitle || existing.title.replace("PLAN: ", "").replace("PLAN (REVISED): ", "")
      const updatedContent = buildPlanMarkdown(title, newOverview || "", newSections || [], newSources ?? []) + `\n\n---\n**Revision:** ${changes}\n**Updated:** ${new Date().toISOString()}`
      const updated = await prisma.note.update({ where: { id: planNoteId }, data: { title: `PLAN (REVISED): ${title}`, content: updatedContent, tags: ["agent-plan", "revised", "pending-approval"] } })
      return { success: true, planNoteId: updated.id, title, changes, status: "PENDING_APPROVAL", message: `Plan revised. Reply **approve** to proceed.` }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const approvePlan = tool({
  description: "Record that a plan has been approved. Call ONLY when user explicitly approves.",
  inputSchema: z.object({ planNoteId: z.string(), approvedBy: z.string().optional() }),
  execute: async ({ planNoteId, approvedBy }) => {
    try {
      const note = await prisma.note.findUnique({ where: { id: planNoteId } })
      if (!note) return { success: false, error: `Plan note ${planNoteId} not found` }
      await prisma.note.update({ where: { id: planNoteId }, data: { title: note.title.replace("PLAN:", "APPROVED:").replace("(REVISED):", "(APPROVED):"), content: note.content + `\n\n---\nAPPROVED by ${approvedBy || "user"} at ${new Date().toISOString()}`, tags: ["agent-plan", "approved"], pinned: false } })
      return { success: true, planNoteId, status: "APPROVED", message: "Plan approved. Proceeding...", approvedBy: approvedBy || "user", approvedAt: new Date().toISOString() }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const finalizeExecution = tool({
  description: "Record completion of a plan execution. Uploads images to Cloudinary (keys from Settings DB) if configured.",
  inputSchema: z.object({
    planNoteId: z.string().optional(), executionTitle: z.string(), summary: z.string(),
    createdEntities: z.array(z.object({ type: z.enum(["document", "note", "experiment", "dataset", "roadmap_step", "model"]), id: z.string(), title: z.string() })).optional(),
    imageUrls: z.array(z.string()).optional(),
    projectId: z.string().optional(),
  }),
  execute: async ({ planNoteId, executionTitle, summary, createdEntities, imageUrls, projectId }) => {
    try {
      const cloudinaryResults: Array<{ original: string; cloudinaryUrl: string }> = []
      const cloudinaryReady = await isCloudinaryConfigured()
      if (imageUrls && imageUrls.length > 0 && cloudinaryReady) {
        for (const url of imageUrls.slice(0, 4)) {
          const result = await downloadAndUpload(url, { folder: "prausdit-lab/agent-generated", tags: ["agent-generated"] })
          if (result && "url" in result) cloudinaryResults.push({ original: url, cloudinaryUrl: result.url })
        }
      }
      const reportLines = [`# Execution Complete: ${executionTitle}`, "", `**Completed:** ${new Date().toISOString()}`, planNoteId ? `**Plan ID:** ${planNoteId}` : "", "", "## Summary", summary]
      if (createdEntities?.length) { reportLines.push("", "## Created Entities"); createdEntities.forEach(e => reportLines.push(`- **${e.type}**: ${e.title} (ID: ${e.id})`)) }
      if (cloudinaryResults.length) { reportLines.push("", "## Uploaded Images"); cloudinaryResults.forEach(r => { reportLines.push(`- ![](${r.cloudinaryUrl})`); reportLines.push(`  CDN: ${r.cloudinaryUrl}`) }) }
      const reportNote = await prisma.note.create({ data: { title: `DONE: ${executionTitle}`, content: reportLines.filter(Boolean).join("\n"), tags: ["execution-report", "completed"], pinned: false, projectId: projectId ?? null } })
      if (planNoteId) { try { await prisma.note.update({ where: { id: planNoteId }, data: { tags: ["agent-plan", "executed"], pinned: false } }) } catch { /* non-fatal */ } }
      return { success: true, reportNoteId: reportNote.id, executionTitle, createdEntities: createdEntities || [], cloudinaryUploads: cloudinaryResults, message: `Done. Report saved (Note ID: ${reportNote.id}).` }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

export const generateImageTool = tool({
  description: "Generate an image using Gemini or OpenRouter image models and automatically upload it to Cloudinary CDN. Model is selected from Settings (auto-routing picks the best available model for the task type). Use whenever documentation, notes, or responses would benefit from a diagram, illustration, chart, or visual. Returns a permanent Cloudinary CDN URL and a ready-to-embed markdown string. DO NOT use placeholder URLs — if this fails, report the exact error.",
  inputSchema: z.object({
    prompt: z.string().describe("Detailed image generation prompt. Be specific: style, content, layout. E.g. 'A clean architecture diagram showing LoRA fine-tuning pipeline with data flow arrows, white background, technical style'"),
    model: z.string().optional().default("auto").describe("Model override: 'auto' (default, uses Settings preference), or any key from the image model catalog. In auto mode the best available model is selected based on task type and configured API keys."),
    aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional().default("1:1").describe("Aspect ratio for supported models"),
    filename: z.string().optional().describe("Filename for Cloudinary (no extension)."),
    folder: z.string().optional().describe("Cloudinary folder. Defaults to prausdit-lab/agent-generated."),
    tags: z.array(z.string()).optional().describe("Cloudinary tags."),
  }),
  execute: async ({ prompt, model, filename, folder, tags }) => {
    const result = await generateImage(prompt, model ?? "auto", { filename, folder, tags })
    if (!result.success) {
      return { success: false, error: result.error, tip: "Check image model settings and ensure Cloudinary is configured in Settings → Manage API." }
    }
    return {
      success: true,
      cloudinaryUrl: result.cloudinaryUrl,
      publicId: result.publicId,
      model: result.model,
      bytes: result.bytes,
      markdownEmbed: `![${prompt.slice(0, 80)}](${result.cloudinaryUrl})`,
      message: `Image generated with ${result.model} and uploaded: ${result.cloudinaryUrl}`,
    }
  },
})

export const uploadImage = tool({
  description: "Upload an image URL to Cloudinary CDN (keys read from Settings DB). Returns permanent CDN URL.",
  inputSchema: z.object({ imageUrl: z.string().url(), filename: z.string().optional(), folder: z.string().optional(), tags: z.array(z.string()).optional() }),
  execute: async ({ imageUrl, filename, folder, tags }) => {
    const cloudinaryReady = await isCloudinaryConfigured()
    if (!cloudinaryReady) {
      return { success: false, error: "Cloudinary not configured. Go to Settings → Manage API → Cloudinary and add your Cloud Name and Upload Preset.", fallback: imageUrl }
    }
    const result = await downloadAndUpload(imageUrl, { filename, folder, tags })
    if ("error" in result) {
      return { success: false, error: result.error, fallback: imageUrl }
    }
    return { success: true, cloudinaryUrl: result.url, publicId: result.publicId, width: result.width, height: result.height, bytes: result.bytes, message: `Image uploaded successfully: ${result.url}` }
  },
})

// ── Project Management Tools ──────────────────────────────────────────────────

export const listProjects = tool({
  description: "List all available projects. Use when user asks 'list all projects', 'what projects exist', or wants to choose a project.",
  inputSchema: z.object({ includeStats: z.boolean().optional().default(true) }),
  execute: async ({ includeStats = true }) => {
    try {
      const projects = await prisma.project.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
          id: true, name: true, type: true, description: true, createdAt: true, updatedAt: true, createdByName: true,
          ...(includeStats ? { _count: { select: { datasets: true, experiments: true, documentation: true, roadmapSteps: true, notes: true, modelVersions: true } } } : {}),
        },
        take: 50,
      })
      return {
        success: true,
        totalProjects: projects.length,
        projects: projects.map(p => ({
          id: p.id, name: p.name, type: p.type, description: p.description || "", createdByName: p.createdByName || "", createdAt: p.createdAt, updatedAt: p.updatedAt,
          ...(includeStats && "_count" in p ? { stats: (p as typeof p & { _count: Record<string, number> })._count } : {}),
        })),
        message: `Found ${projects.length} project${projects.length !== 1 ? "s" : ""}.`,
      }
    } catch (err) { return { success: false, error: String(err), projects: [] } }
  },
})

export const switchProject = tool({
  description: "Switch the active project context by name or ID. After switching, ALL subsequent operations use the new project automatically.",
  inputSchema: z.object({ projectNameOrId: z.string().describe("Project name (partial match ok) or exact project ID") }),
  execute: async ({ projectNameOrId }) => {
    try {
      let project = await prisma.project.findFirst({ where: { id: projectNameOrId }, include: { _count: { select: { datasets: true, experiments: true, documentation: true, roadmapSteps: true, notes: true } } } })
      if (!project) {
        project = await prisma.project.findFirst({ where: { name: { contains: projectNameOrId, mode: "insensitive" } }, include: { _count: { select: { datasets: true, experiments: true, documentation: true, roadmapSteps: true, notes: true } } }, orderBy: { updatedAt: "desc" } })
      }
      if (!project) {
        const available = await prisma.project.findMany({ select: { id: true, name: true, type: true }, take: 10, orderBy: { updatedAt: "desc" } })
        return { success: false, error: `No project found matching "${projectNameOrId}".`, availableProjects: available, message: `Available: ${available.map(p => `${p.name} (${p.id})`).join(", ")}` }
      }
      return { success: true, switchedTo: { id: project.id, name: project.name, type: project.type, description: project.description || "", stats: project._count }, newProjectId: project.id, message: `Switched to **${project.name}** (ID: \`${project.id}\`). All operations now use this project.`, __action: "SWITCH_PROJECT", __projectId: project.id, __projectName: project.name }
    } catch (err) { return { success: false, error: String(err) } }
  },
})

// ── Tool Registry ─────────────────────────────────────────────────────────────

export const agentTools = {
  search_internal_docs:   searchInternalDocs,
  get_knowledge_graph:    getKnowledgeGraph,
  read_document:          readDocument,
  create_document:        createDocument,
  update_document:        updateDocument,
  create_note:            createNote,
  update_note:            updateNote,
  create_roadmap_step:    createRoadmapStep,
  update_roadmap_step:    updateRoadmapStep,
  complete_roadmap_task:  completeRoadmapTask,
  create_experiment:      createExperiment,
  update_experiment:      updateExperiment,
  create_dataset:         createDataset,
  update_dataset:         updateDataset,
  analyze_dataset:        analyzeDatasetIntelligence,
  benchmark_model:        benchmarkModel,
  get_model_leaderboard:  getModelLeaderboard,
  crawl_web:              crawlWeb,
  run_research_autopilot: runResearchAutopilot,
  research:               researchTool,
  generate_plan:          generatePlan,
  update_plan:            updatePlan,
  approve_plan:           approvePlan,
  finalize_execution:     finalizeExecution,
  generate_image:         generateImageTool,
  upload_image:           uploadImage,
  list_projects:          listProjects,
  switch_project:         switchProject,
} as const

export type AgentToolName = keyof typeof agentTools

// ── Project-Scoped Tool Factory ───────────────────────────────────────────────
// Returns agentTools with projectId pre-filled for every create/search tool.
// The agent never needs to track or pass projectId — it comes from the session.

const PROJECT_SCOPED_TOOLS = new Set([
  "search_internal_docs", "get_knowledge_graph",
  "create_document", "create_note",
  "create_roadmap_step", "create_experiment", "create_dataset",
  "run_research_autopilot", "research",
  "generate_plan", "finalize_execution",
])

type AnyToolExecute = (args: Record<string, unknown>) => Promise<unknown>

export function buildProjectScopedTools(currentProjectId: string | null | undefined): typeof agentTools {
  if (!currentProjectId) return agentTools

  const scoped: Record<string, unknown> = {}
  for (const [name, t] of Object.entries(agentTools)) {
    if (PROJECT_SCOPED_TOOLS.has(name)) {
      const originalExecute = (t as unknown as { execute: AnyToolExecute }).execute
      scoped[name] = {
        ...t,
        execute: async (args: Record<string, unknown>) => originalExecute({ ...args, projectId: currentProjectId }),
      }
    } else {
      scoped[name] = t
    }
  }
  return scoped as typeof agentTools
}

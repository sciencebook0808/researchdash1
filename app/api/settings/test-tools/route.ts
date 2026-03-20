/**
 * POST /api/settings/test-tools
 *
 * Test connections for all tool provider API keys.
 * Each provider has a lightweight ping/validation call.
 *
 * Body: { provider: string, apiKey?: string, apiUrl?: string }
 *
 * Providers:
 *   "tavily"    - search
 *   "exa"       - search
 *   "serpapi"   - search
 *   "firecrawl" - crawl
 *   "crawl4ai"  - crawl
 *   "cloudinary"- image CDN
 */

import { NextResponse } from "next/server"
import { requireWriteAuth } from "@/lib/api-auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const auth = await requireWriteAuth()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const { provider, apiKey: bodyKey, apiUrl: bodyUrl } = body

    if (!provider) {
      return NextResponse.json({ success: false, error: "provider is required" }, { status: 400 })
    }

    // Fallback: load stored key from DB if none provided
    const settings = await prisma.aISettings.findFirst().catch(() => null)
    const s = settings as Record<string, string | null> | null

    switch (provider) {

      // ── TAVILY ───────────────────────────────────────────────────────────────
      case "tavily": {
        const key = bodyKey || s?.tavilyApiKey || process.env.TAVILY_API_KEY
        if (!key) return NextResponse.json({ success: false, error: "No Tavily API key provided" })
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ api_key: key, query: "test", max_results: 1, search_depth: "basic" }),
            signal:  AbortSignal.timeout(8000),
          })
          if (res.ok) return NextResponse.json({ success: true, message: "Tavily API key is valid ✓" })
          const err = await res.json().catch(() => ({}))
          return NextResponse.json({ success: false, error: (err as { detail?: string }).detail || `HTTP ${res.status}` })
        } catch (e) {
          return NextResponse.json({ success: false, error: `Connection failed: ${String(e)}` })
        }
      }

      // ── EXA ─────────────────────────────────────────────────────────────────
      case "exa": {
        const key = bodyKey || s?.exaApiKey || process.env.EXA_API_KEY
        if (!key) return NextResponse.json({ success: false, error: "No Exa API key provided" })
        try {
          const res = await fetch("https://api.exa.ai/search", {
            method:  "POST",
            headers: { "Content-Type": "application/json", "x-api-key": key },
            body:    JSON.stringify({ query: "test", type: "auto", num_results: 1 }),
            signal:  AbortSignal.timeout(8000),
          })
          if (res.ok) return NextResponse.json({ success: true, message: "Exa API key is valid ✓" })
          const err = await res.json().catch(() => ({}))
          return NextResponse.json({ success: false, error: (err as { error?: string }).error || `HTTP ${res.status}` })
        } catch (e) {
          return NextResponse.json({ success: false, error: `Connection failed: ${String(e)}` })
        }
      }

      // ── SERPAPI ──────────────────────────────────────────────────────────────
      case "serpapi": {
        const key = bodyKey || s?.serpApiKey || process.env.SERPAPI_KEY
        if (!key) return NextResponse.json({ success: false, error: "No SerpAPI key provided" })
        try {
          const res = await fetch(`https://serpapi.com/account?api_key=${key}`, {
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) {
            const data = await res.json()
            const credits = (data as { total_searches_left?: number }).total_searches_left
            return NextResponse.json({
              success: true,
              message: `SerpAPI key valid ✓${credits !== undefined ? ` · ${credits.toLocaleString()} searches remaining` : ""}`,
            })
          }
          return NextResponse.json({ success: false, error: `HTTP ${res.status}: Invalid API key` })
        } catch (e) {
          return NextResponse.json({ success: false, error: `Connection failed: ${String(e)}` })
        }
      }

      // ── FIRECRAWL ────────────────────────────────────────────────────────────
      case "firecrawl": {
        const key = bodyKey || s?.firecrawlApiKey || process.env.FIRECRAWL_API_KEY
        if (!key) return NextResponse.json({ success: false, error: "No Firecrawl API key provided" })
        try {
          const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method:  "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
            body:    JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }),
            signal:  AbortSignal.timeout(15000),
          })
          if (res.ok || res.status === 200) {
            return NextResponse.json({ success: true, message: "Firecrawl API key is valid ✓" })
          }
          if (res.status === 401 || res.status === 403) {
            return NextResponse.json({ success: false, error: "Invalid Firecrawl API key" })
          }
          // Any other 2xx/4xx that isn't auth means key is valid but maybe rate-limited
          const data = await res.json().catch(() => ({}))
          const msg  = (data as { error?: string }).error
          return NextResponse.json({ success: msg ? false : true, error: msg, message: msg ? undefined : "Firecrawl API key is valid ✓" })
        } catch (e) {
          return NextResponse.json({ success: false, error: `Connection failed: ${String(e)}` })
        }
      }

      // ── CRAWL4AI ─────────────────────────────────────────────────────────────
      case "crawl4ai": {
        const url = bodyUrl || s?.crawl4aiUrl || process.env.CRAWL4AI_API_URL
        if (!url) return NextResponse.json({ success: false, error: "No Crawl4AI URL provided" })
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
          return NextResponse.json({ success: false, error: "URL must start with http:// or https://" })
        }
        try {
          const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
            signal: AbortSignal.timeout(8000),
          })
          if (res.ok) return NextResponse.json({ success: true, message: "Crawl4AI instance is reachable ✓" })
          // Some self-hosted instances don't have /health — try root
          const rootRes = await fetch(url.replace(/\/$/, ""), { signal: AbortSignal.timeout(5000) })
          if (rootRes.ok || rootRes.status < 500) {
            return NextResponse.json({ success: true, message: "Crawl4AI instance is reachable ✓" })
          }
          return NextResponse.json({ success: false, error: `Instance returned HTTP ${res.status}` })
        } catch (e) {
          return NextResponse.json({ success: false, error: `Cannot reach Crawl4AI at ${url}: ${String(e)}` })
        }
      }

      // ── CLOUDINARY ───────────────────────────────────────────────────────────
      case "cloudinary": {
        const cloudName = bodyKey || s?.cloudinaryCloudName || process.env.CLOUDINARY_CLOUD_NAME
        if (!cloudName) return NextResponse.json({ success: false, error: "No Cloudinary Cloud Name provided" })
        try {
          // Ping the Cloudinary ping endpoint — public, no auth needed to verify cloud name exists
          const res = await fetch(`https://res.cloudinary.com/${cloudName}/image/upload/sample`, {
            method: "HEAD",
            signal: AbortSignal.timeout(8000),
          })
          // 200 = cloud name valid + sample image exists
          // 404 = cloud name valid but no sample (still valid config)
          // 400/401 = invalid cloud name
          if (res.ok || res.status === 404) {
            return NextResponse.json({ success: true, message: `Cloudinary cloud "${cloudName}" is valid ✓` })
          }
          return NextResponse.json({ success: false, error: `Invalid Cloudinary Cloud Name (HTTP ${res.status})` })
        } catch (e) {
          return NextResponse.json({ success: false, error: `Connection failed: ${String(e)}` })
        }
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown provider: ${provider}` }, { status: 400 })
    }
  } catch (err) {
    console.error("[/api/settings/test-tools] Error:", err)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}

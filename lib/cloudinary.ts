/**
 * Prausdit Research Lab — Cloudinary Integration (lib/cloudinary.ts)
 *
 * NOTE: The agent tools (lib/agent-tools.ts) have their own inline Cloudinary
 * helpers that read keys DB-first. This file exists for any non-agent code
 * that needs Cloudinary (e.g. direct API routes). It also reads DB-first.
 *
 * Key reading priority: DB (AISettings) → process.env → null
 *
 * Upload paths supported:
 *   1. Unsigned (uploadPreset configured)        — simplest, recommended
 *   2. Signed   (apiKey + CLOUDINARY_API_SECRET) — for production signed uploads
 */

import { prisma } from "./prisma"

export interface CloudinaryUploadResult {
  url:      string    // secure HTTPS CDN URL
  publicId: string    // cloudinary public_id
  width?:   number
  height?:  number
  format?:  string
  bytes?:   number
}

export interface CloudinaryConfig {
  cloudName:    string
  uploadPreset: string | null
  apiKey:       string | null
  apiSecret:    string | null   // only from env, never stored in DB
  folder:       string
}

// ── DB-first config reader ────────────────────────────────────────────────────

export async function getCloudinaryConfig(): Promise<CloudinaryConfig | null> {
  let dbSettings: {
    cloudinaryCloudName?: string | null
    cloudinaryUploadPreset?: string | null
    cloudinaryApiKey?: string | null
  } | null = null

  try {
    dbSettings = await prisma.aISettings.findFirst({
      select: {
        cloudinaryCloudName:    true,
        cloudinaryUploadPreset: true,
        cloudinaryApiKey:       true,
      },
    })
  } catch { /* DB unavailable — fall through to env */ }

  const cloudName =
    dbSettings?.cloudinaryCloudName    || process.env.CLOUDINARY_CLOUD_NAME    || null
  if (!cloudName) return null

  return {
    cloudName,
    uploadPreset: dbSettings?.cloudinaryUploadPreset || process.env.CLOUDINARY_UPLOAD_PRESET || null,
    apiKey:       dbSettings?.cloudinaryApiKey       || process.env.CLOUDINARY_API_KEY       || null,
    apiSecret:    process.env.CLOUDINARY_API_SECRET || null,  // never stored in DB
    folder:       process.env.CLOUDINARY_FOLDER || "prausdit-lab",
  }
}

export async function isCloudinaryConfigured(): Promise<boolean> {
  const cfg = await getCloudinaryConfig()
  return !!cfg && (!!cfg.uploadPreset || (!!cfg.apiKey && !!cfg.apiSecret))
}

// ── Upload helpers ────────────────────────────────────────────────────────────

export async function uploadToCloudinary(
  imageData: Buffer | string,
  options: { filename?: string; folder?: string; tags?: string[] } = {}
): Promise<CloudinaryUploadResult | { error: string }> {
  const cfg = await getCloudinaryConfig()
  if (!cfg) return { error: "CLOUDINARY_CLOUD_NAME not configured. Add it in Settings → Manage API." }

  const base64 = Buffer.isBuffer(imageData)
    ? `data:image/png;base64,${imageData.toString("base64")}`
    : imageData.startsWith("data:") ? imageData : `data:image/png;base64,${imageData}`

  const folder   = options.folder   || cfg.folder
  const tags     = options.tags     || ["agent-generated"]
  const filename = options.filename || `img-${Date.now()}`

  // Path 1: Unsigned upload
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
        const err = await res.json().catch(() => ({}))
        return { error: `Cloudinary upload failed HTTP ${res.status}: ${(err as Record<string,unknown>).error || res.statusText}` }
      }
      const data = await res.json()
      return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height, format: data.format, bytes: data.bytes }
    } catch (e) { return { error: `Upload exception: ${String(e)}` } }
  }

  // Path 2: Signed upload
  if (cfg.apiKey && cfg.apiSecret) {
    try {
      const { createHmac } = await import("crypto")
      const timestamp = Math.floor(Date.now() / 1000)
      const paramsToSign = [`folder=${folder}`, `public_id=${filename}`, `tags=${tags.join(",")}`, `timestamp=${timestamp}`].sort().join("&")
      const signature = createHmac("sha1", cfg.apiSecret).update(paramsToSign).digest("hex")
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
        const err = await res.json().catch(() => ({}))
        return { error: `Cloudinary signed upload failed HTTP ${res.status}: ${(err as Record<string,unknown>).error || res.statusText}` }
      }
      const data = await res.json()
      return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height, format: data.format, bytes: data.bytes }
    } catch (e) { return { error: `Signed upload exception: ${String(e)}` } }
  }

  return { error: "Cloudinary not fully configured. Set CLOUDINARY_UPLOAD_PRESET (unsigned) or CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET (signed) in Settings or env vars." }
}

export async function downloadAndUpload(
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
    if (!res.ok) return { error: `Failed to fetch image — HTTP ${res.status}: ${res.statusText}` }
    const ct = res.headers.get("content-type") || ""
    if (!ct.startsWith("image/")) {
      return { error: `URL does not point to an image (content-type: ${ct})` }
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    return uploadToCloudinary(buffer, options)
  } catch (e) {
    return { error: `Failed to download image: ${String(e)}` }
  }
}

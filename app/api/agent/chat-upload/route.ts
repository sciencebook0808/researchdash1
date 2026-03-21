/**
 * POST /api/agent/chat-upload
 *
 * Handles file uploads for the chat interface.
 * Supported: PDF, DOCX, CSV, TXT, Images (PNG/JPG/GIF/WebP)
 * Max file size: 20 MB
 *
 * Returns: { id, name, mimeType, size, url, content }
 */

import { NextResponse }     from "next/server"
import { requireWriteAuth } from "@/lib/api-auth"
import { getCloudinaryConfig } from "@/lib/cloudinary"
import { prisma } from "@/lib/prisma"

export const maxDuration = 60

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".csv", ".txt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
])

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ""
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── CSV Extractor (no external deps) ─────────────────────────────────────────

function extractCsvContent(text: string): string {
  try {
    const lines   = text.trim().split(/\r?\n/)
    if (!lines.length) return text

    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""))
    const dataRows = lines.slice(1, 51)

    const rows = dataRows.map(line => {
      const values: string[] = []
      let inQuote = false
      let cell    = ""
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"' && !inQuote) { inQuote = true;  continue }
        if (ch === '"' &&  inQuote) { inQuote = false; continue }
        if (ch === ","  && !inQuote) { values.push(cell.trim()); cell = ""; continue }
        cell += ch
      }
      values.push(cell.trim())

      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = values[i] ?? "" })
      return obj
    })

    const totalRows = lines.length - 1
    return `CSV Dataset — ${totalRows} rows × ${headers.length} columns\nColumns: ${headers.join(", ")}\n\nFirst ${Math.min(50, totalRows)} rows:\n${JSON.stringify(rows, null, 2)}`
  } catch {
    return text.slice(0, 10000)
  }
}

// ─── DOCX Extractor (via mammoth) ─────────────────────────────────────────────

async function extractDocxContent(buffer: ArrayBuffer): Promise<string> {
  try {
    // mammoth is added to package.json — dynamic import keeps it server-only
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
    }
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return result.value.trim().slice(0, 20000)
  } catch (err) {
    console.warn("[chat-upload] DOCX extraction failed:", err instanceof Error ? err.message : String(err))
    return ""
  }
}

// ─── Cloudinary Uploader ───────────────────────────────────────────────────────

async function uploadFileToCloudinary(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<{ url: string } | { error: string }> {
  const cfg = await getCloudinaryConfig()
  if (!cfg) {
    return { error: "Cloudinary not configured. Add Cloudinary credentials in Settings → Manage API." }
  }

  const resourceType = isImageMime(mimeType) ? "image" : "raw"
  const folder       = `${cfg.folder}/chat-uploads`
  const publicId     = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.\-]/g, "_")}`
  const base64       = buffer.toString("base64")
  const dataUri      = `data:${mimeType};base64,${base64}`

  // Unsigned upload (preferred)
  if (cfg.uploadPreset) {
    try {
      const form = new FormData()
      form.append("file",          dataUri)
      form.append("upload_preset", cfg.uploadPreset)
      form.append("folder",        folder)
      form.append("public_id",     publicId)
      form.append("resource_type", resourceType)

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`,
        { method: "POST", body: form, signal: AbortSignal.timeout(60_000) }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        return { error: `Cloudinary upload failed: ${String(err.error ?? res.statusText)}` }
      }
      const data = await res.json() as { secure_url: string }
      return { url: data.secure_url }
    } catch (e) {
      return { error: `Upload error: ${String(e)}` }
    }
  }

  // Signed upload
  if (cfg.apiKey && cfg.apiSecret) {
    try {
      const { createHmac } = await import("crypto")
      const timestamp      = Math.floor(Date.now() / 1000)
      const paramStr       = [`folder=${folder}`, `public_id=${publicId}`, `timestamp=${timestamp}`].sort().join("&")
      const signature      = createHmac("sha1", cfg.apiSecret).update(paramStr).digest("hex")

      const form = new FormData()
      form.append("file",          dataUri)
      form.append("api_key",       cfg.apiKey)
      form.append("timestamp",     String(timestamp))
      form.append("signature",     signature)
      form.append("folder",        folder)
      form.append("public_id",     publicId)
      form.append("resource_type", resourceType)

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`,
        { method: "POST", body: form, signal: AbortSignal.timeout(60_000) }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        return { error: `Cloudinary signed upload failed: ${String(err.error ?? res.statusText)}` }
      }
      const data = await res.json() as { secure_url: string }
      return { url: data.secure_url }
    } catch (e) {
      return { error: `Signed upload error: ${String(e)}` }
    }
  }

  return { error: "Cloudinary not fully configured (need uploadPreset or apiKey+apiSecret)." }
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const authResult = await requireWriteAuth()
  if (!authResult.ok) return authResult.response

  try {
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 })
    }

    const formData  = await req.formData()
    const file      = formData.get("file")      as File   | null
    const sessionId = formData.get("sessionId") as string | null

    if (!file)      return NextResponse.json({ error: "No file provided" },  { status: 400 })
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${formatBytes(file.size)}). Maximum: ${formatBytes(MAX_FILE_SIZE)}` },
        { status: 400 }
      )
    }

    const ext      = getExtension(file.name)
    const mimeType = file.type || "application/octet-stream"

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "File type not supported. Allowed: PDF, DOCX, CSV, TXT, PNG, JPG, GIF, WebP" },
        { status: 400 }
      )
    }

    // ── Read buffer ────────────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    // ── Extract text content ───────────────────────────────────────────────
    let extractedContent: string | null = null

    if (ext === ".csv" || mimeType === "text/csv") {
      extractedContent = extractCsvContent(buffer.toString("utf-8"))
    } else if (ext === ".docx" || mimeType.includes("wordprocessingml")) {
      extractedContent = await extractDocxContent(arrayBuffer) || null
    } else if (ext === ".txt" || mimeType === "text/plain") {
      extractedContent = buffer.toString("utf-8").slice(0, 20000)
    }
    // PDFs and images: no server-side extraction — model reads the URL directly

    // ── Upload to Cloudinary ───────────────────────────────────────────────
    const uploadResult = await uploadFileToCloudinary(buffer, file.name, mimeType)
    if ("error" in uploadResult) {
      return NextResponse.json({ error: uploadResult.error }, { status: 500 })
    }

    // ── Save metadata to DB ────────────────────────────────────────────────
    type AttachmentRow = { id: string; name: string; mimeType: string; size: number; url: string; content: string | null }
    let attachment: AttachmentRow

    try {
      attachment = await prisma.chatAttachment.create({
        data: {
          sessionId,
          name:    file.name,
          mimeType,
          size:    file.size,
          url:     uploadResult.url,
          content: extractedContent,
        },
        select: { id: true, name: true, mimeType: true, size: true, url: true, content: true },
      }) as AttachmentRow
    } catch (dbErr) {
      console.warn("[chat-upload] DB save failed:", dbErr instanceof Error ? dbErr.message : String(dbErr))
      // Non-fatal: return upload result without DB record
      attachment = {
        id:       `local-${Date.now()}`,
        name:     file.name,
        mimeType,
        size:     file.size,
        url:      uploadResult.url,
        content:  extractedContent,
      }
    }

    return NextResponse.json({
      success:  true,
      id:       attachment.id,
      name:     attachment.name,
      mimeType: attachment.mimeType,
      size:     attachment.size,
      url:      attachment.url,
      content:  attachment.content,
    })
  } catch (err) {
    console.error("[/api/agent/chat-upload] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    )
  }
}

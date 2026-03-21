/**
 * POST /api/agent/chat-upload
 * FIXES:
 *  - PDFs uploaded as Cloudinary `image` type (prevents ERR_INVALID_RESPONSE)
 *  - resource_type removed from FormData (already in URL path — sending twice caused failures)
 *  - publicId strips extension for image type (prevents double-extension URLs)
 */
import { NextResponse }       from "next/server"
import { requireWriteAuth }   from "@/lib/api-auth"
import { getCloudinaryConfig } from "@/lib/cloudinary"
import { prisma }             from "@/lib/prisma"

export const maxDuration = 60

const MAX_FILE_SIZE = 20 * 1024 * 1024

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".csv", ".txt",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
])

function getExtension(f: string): string { const d = f.lastIndexOf("."); return d >= 0 ? f.slice(d).toLowerCase() : "" }
function formatBytes(b: number): string { if (b < 1024) return `${b} B`; if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`; return `${(b/1024/1024).toFixed(1)} MB` }

/** PDFs → "image" (Cloudinary serves PDFs reliably via image endpoint).
 *  Raw endpoint can return ERR_INVALID_RESPONSE when preset disallows raw delivery. */
function getResourceType(mimeType: string, ext: string): "image" | "raw" {
  if (mimeType.startsWith("image/"))     return "image"
  if (mimeType === "application/pdf")    return "image"
  if (ext === ".pdf")                    return "image"
  return "raw"
}

/** For image type: strip extension (Cloudinary appends it).
 *  For raw type: keep full filename. */
function buildPublicId(filename: string, resourceType: "image" | "raw"): string {
  const safe = filename.replace(/[^a-zA-Z0-9.\-]/g, "_")
  return resourceType === "image"
    ? `${Date.now()}-${safe.replace(/\.[^.]+$/, "")}`
    : `${Date.now()}-${safe}`
}

function extractCsvContent(text: string): string {
  try {
    const lines = text.trim().split(/\r?\n/)
    if (!lines.length) return text
    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""))
    const rows = lines.slice(1, 51).map(line => {
      const vals: string[] = []; let inQ = false, cell = ""
      for (const ch of line) {
        if (ch === '"' && !inQ) { inQ = true; continue }
        if (ch === '"' &&  inQ) { inQ = false; continue }
        if (ch === "," && !inQ) { vals.push(cell.trim()); cell = ""; continue }
        cell += ch
      }
      vals.push(cell.trim())
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = vals[i] ?? "" })
      return obj
    })
    const totalRows = lines.length - 1
    return `CSV Dataset — ${totalRows} rows × ${headers.length} columns\nColumns: ${headers.join(", ")}\n\nFirst ${Math.min(50, totalRows)} rows:\n${JSON.stringify(rows, null, 2)}`
  } catch { return text.slice(0, 10000) }
}

async function extractDocxContent(buffer: ArrayBuffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> }
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return result.value.trim().slice(0, 20000)
  } catch (err) {
    console.warn("[chat-upload] DOCX extraction failed:", err instanceof Error ? err.message : String(err))
    return ""
  }
}

async function uploadToCloudinary(
  buffer: Buffer, filename: string, mimeType: string, ext: string
): Promise<{ url: string } | { error: string }> {
  const cfg = await getCloudinaryConfig()
  if (!cfg) return { error: "Cloudinary not configured. Add credentials in Settings → Manage API." }

  const resourceType = getResourceType(mimeType, ext)
  const folder       = `${cfg.folder}/chat-uploads`
  const publicId     = buildPublicId(filename, resourceType)
  const dataUri      = `data:${mimeType};base64,${buffer.toString("base64")}`
  const endpoint     = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`

  // Unsigned upload
  if (cfg.uploadPreset) {
    try {
      const form = new FormData()
      form.append("file",          dataUri)
      form.append("upload_preset", cfg.uploadPreset)
      form.append("folder",        folder)
      form.append("public_id",     publicId)
      // ⚠️ Do NOT append resource_type here — it is already encoded in the URL endpoint above.
      // Sending it twice in FormData causes Cloudinary to reject the request silently.
      const res = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) })
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as Record<string, unknown>
        return { error: `Cloudinary upload failed (${res.status}): ${String(e.error ?? res.statusText)}` }
      }
      return { url: (await res.json() as { secure_url: string }).secure_url }
    } catch (e) { return { error: `Upload error: ${String(e)}` } }
  }

  // Signed upload
  if (cfg.apiKey && cfg.apiSecret) {
    try {
      const { createHmac } = await import("crypto")
      const ts  = Math.floor(Date.now() / 1000)
      const sig = createHmac("sha1", cfg.apiSecret)
        .update([`folder=${folder}`, `public_id=${publicId}`, `timestamp=${ts}`].sort().join("&"))
        .digest("hex")
      const form = new FormData()
      form.append("file",       dataUri)
      form.append("api_key",    cfg.apiKey)
      form.append("timestamp",  String(ts))
      form.append("signature",  sig)
      form.append("folder",     folder)
      form.append("public_id",  publicId)
      // ⚠️ Same: do NOT append resource_type — already in endpoint URL.
      const res = await fetch(endpoint, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) })
      if (!res.ok) {
        const e = await res.json().catch(() => ({})) as Record<string, unknown>
        return { error: `Cloudinary signed upload failed (${res.status}): ${String(e.error ?? res.statusText)}` }
      }
      return { url: (await res.json() as { secure_url: string }).secure_url }
    } catch (e) { return { error: `Signed upload error: ${String(e)}` } }
  }

  return { error: "Cloudinary not fully configured (need uploadPreset or apiKey+apiSecret)." }
}

export async function POST(req: Request) {
  const authResult = await requireWriteAuth()
  if (!authResult.ok) return authResult.response

  try {
    const contentType = req.headers.get("content-type") || ""
    if (!contentType.includes("multipart/form-data"))
      return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 })

    const formData  = await req.formData()
    const file      = formData.get("file")      as File   | null
    const sessionId = formData.get("sessionId") as string | null

    if (!file)      return NextResponse.json({ error: "No file provided" },  { status: 400 })
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    if (file.size > MAX_FILE_SIZE)
      return NextResponse.json({ error: `File too large (${formatBytes(file.size)}). Max: ${formatBytes(MAX_FILE_SIZE)}` }, { status: 400 })

    const ext      = getExtension(file.name)
    const mimeType = file.type || "application/octet-stream"

    if (!ALLOWED_EXTENSIONS.has(ext))
      return NextResponse.json({ error: "Unsupported type. Allowed: PDF, DOCX, CSV, TXT, PNG, JPG, GIF, WebP" }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    let extractedContent: string | null = null
    if (ext === ".csv" || mimeType === "text/csv")
      extractedContent = extractCsvContent(buffer.toString("utf-8"))
    else if (ext === ".docx" || mimeType.includes("wordprocessingml"))
      extractedContent = (await extractDocxContent(arrayBuffer)) || null
    else if (ext === ".txt" || mimeType === "text/plain")
      extractedContent = buffer.toString("utf-8").slice(0, 20000)
    // PDFs & images: URL passed directly to model (Gemini reads natively via multimodal API)

    const uploadResult = await uploadToCloudinary(buffer, file.name, mimeType, ext)
    if ("error" in uploadResult)
      return NextResponse.json({ error: uploadResult.error }, { status: 500 })

    type Row = { id: string; name: string; mimeType: string; size: number; url: string; content: string | null }
    let attachment: Row
    try {
      attachment = await prisma.chatAttachment.create({
        data: { sessionId, name: file.name, mimeType, size: file.size, url: uploadResult.url, content: extractedContent },
        select: { id: true, name: true, mimeType: true, size: true, url: true, content: true },
      }) as Row
    } catch (dbErr) {
      console.warn("[chat-upload] DB save skipped:", dbErr instanceof Error ? dbErr.message : String(dbErr))
      attachment = { id: `local-${Date.now()}`, name: file.name, mimeType, size: file.size, url: uploadResult.url, content: extractedContent }
    }

    return NextResponse.json({ success: true, ...attachment })
  } catch (err) {
    console.error("[/api/agent/chat-upload]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 })
  }
}

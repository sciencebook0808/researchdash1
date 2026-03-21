/**
 * components/chat/file-upload-button.tsx
 *
 * File attachment button for the chat input area.
 * - Shows only when the active model supports files
 * - Handles upload, progress, and preview
 * - Renders attached file chips above the textarea
 */

"use client"

import { useRef, useState, useCallback } from "react"
import {
  Paperclip, X, FileText, Image, Table, File,
  Loader2, AlertCircle, CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { AttachedFile, MessageAttachment } from "@/types/chat"

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
].join(",")

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── File type helpers ────────────────────────────────────────────────────────

function getFileIcon(mimeType: string): React.ElementType {
  if (mimeType.startsWith("image/"))         return Image
  if (mimeType === "text/csv")               return Table
  if (mimeType === "application/pdf")        return FileText
  if (mimeType.includes("wordprocessingml")) return FileText
  return File
}

function getFileColor(mimeType: string): string {
  if (mimeType.startsWith("image/"))         return "text-blue-400   border-blue-500/30   bg-blue-500/5"
  if (mimeType === "text/csv")               return "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
  if (mimeType === "application/pdf")        return "text-red-400     border-red-500/30     bg-red-500/5"
  if (mimeType.includes("wordprocessingml")) return "text-sky-400     border-sky-500/30     bg-sky-500/5"
  return "text-muted-foreground border-border bg-muted/30"
}

// ─── Single file chip ─────────────────────────────────────────────────────────

function FileChip({
  file,
  onRemove,
}: {
  file:     AttachedFile
  onRemove: (id: string) => void
}) {
  const Icon  = getFileIcon(file.mimeType)
  const color = getFileColor(file.mimeType)

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12px] max-w-[200px] group relative",
        color
      )}
    >
      {/* Icon / status */}
      <div className="flex-shrink-0">
        {file.status === "uploading" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : file.status === "error" ? (
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <Icon className="w-3.5 h-3.5" />
        )}
      </div>

      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium leading-none">{file.name}</p>
        <p className="text-[10px] opacity-60 mt-0.5 leading-none">
          {file.status === "uploading"
            ? "Uploading…"
            : file.status === "error"
              ? (file.error || "Upload failed")
              : formatBytes(file.size)}
        </p>
      </div>

      {/* Remove button */}
      {file.status !== "uploading" && (
        <button
          onClick={() => onRemove(file.id)}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/10"
          title="Remove attachment"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Ready indicator */}
      {file.status === "ready" && (
        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 opacity-60" />
      )}
    </div>
  )
}

// ─── File image preview ───────────────────────────────────────────────────────

function ImagePreviewChip({
  file,
  onRemove,
}: {
  file:     AttachedFile
  onRemove: (id: string) => void
}) {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-border w-16 h-16 flex-shrink-0">
      {file.url ? (
        <img
          src={file.url}
          alt={file.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <button
          onClick={() => onRemove(file.id)}
          className="p-1 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors"
          title="Remove"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      </div>

      {/* Status overlay */}
      {file.status === "uploading" && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-white" />
        </div>
      )}
    </div>
  )
}

// ─── Attached Files Preview Bar ───────────────────────────────────────────────

export function AttachedFilesBar({
  files,
  onRemove,
}: {
  files:    AttachedFile[]
  onRemove: (id: string) => void
}) {
  if (files.length === 0) return null

  return (
    <div className="flex items-end gap-2 px-1 pb-2 overflow-x-auto scrollbar-hide">
      {files.map(file =>
        file.mimeType.startsWith("image/") ? (
          <ImagePreviewChip key={file.id} file={file} onRemove={onRemove} />
        ) : (
          <FileChip key={file.id} file={file} onRemove={onRemove} />
        )
      )}
    </div>
  )
}

// ─── Upload Button ─────────────────────────────────────────────────────────────

interface FileUploadButtonProps {
  sessionId:    string
  onFilesAdded: (files: AttachedFile[]) => void
  disabled?:    boolean
  /** If false, the button is hidden */
  visible?:     boolean
}

export function FileUploadButton({
  sessionId,
  onFilesAdded,
  disabled = false,
  visible  = true,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const uploadFile = useCallback(
    async (rawFile: File): Promise<AttachedFile> => {
      // Create a pending entry immediately so the UI updates
      const tempId: string = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const pending: AttachedFile = {
        id:       tempId,
        name:     rawFile.name,
        mimeType: rawFile.type || "application/octet-stream",
        size:     rawFile.size,
        url:      null,
        content:  null,
        status:   "uploading",
      }

      // Start the actual upload
      const form = new FormData()
      form.append("file",      rawFile)
      form.append("sessionId", sessionId)

      try {
        const res = await fetch("/api/agent/chat-upload", {
          method: "POST",
          body:   form,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }))
          return {
            ...pending,
            status: "error",
            error:  err.error || `HTTP ${res.status}`,
          }
        }

        const data = await res.json()
        return {
          id:       data.id,
          name:     data.name,
          mimeType: data.mimeType,
          size:     data.size,
          url:      data.url,
          content:  data.content,
          status:   "ready",
        }
      } catch (err) {
        return {
          ...pending,
          status: "error",
          error:  err instanceof Error ? err.message : "Upload failed",
        }
      }
    },
    [sessionId]
  )

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || [])
      if (selected.length === 0) return

      // Reset input so the same file can be re-selected
      e.target.value = ""

      // Validate each file
      const valid: File[] = []
      for (const file of selected) {
        if (file.size > MAX_FILE_SIZE) {
          alert(`"${file.name}" is too large. Max 20 MB.`)
          continue
        }
        valid.push(file)
      }
      if (valid.length === 0) return

      // Create pending entries + start uploads in parallel
      const pendings: AttachedFile[] = valid.map((f, i) => ({
        id:       `temp-${Date.now()}-${i}`,
        name:     f.name,
        mimeType: f.type || "application/octet-stream",
        size:     f.size,
        url:      null,
        content:  null,
        status:   "uploading" as const,
      }))

      // Immediately add pending so UI shows them
      onFilesAdded(pendings)

      // Upload concurrently, then replace pending entries with final results
      const results = await Promise.all(valid.map(uploadFile))

      // Replace pending entries with real results
      onFilesAdded(
        results.map((result, i) => ({
          ...result,
          // Keep the same tempId so parent can match and replace
          id: result.id !== pendings[i].id ? result.id : pendings[i].id,
          _replaces: pendings[i].id,
        } as AttachedFile & { _replaces?: string }))
      )
    },
    [onFilesAdded, uploadFile]
  )

  if (!visible) return null

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        onChange={handleChange}
        className="hidden"
        aria-label="Attach files"
      />
      <button
        onClick={handleClick}
        disabled={disabled}
        title="Attach file (PDF, DOCX, CSV, Image)"
        className={cn(
          "flex-shrink-0 p-2.5 rounded-lg transition-all",
          disabled
            ? "text-muted-foreground/30 cursor-not-allowed"
            : "text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
        )}
      >
        <Paperclip className="w-4 h-4" />
      </button>
    </>
  )
}

// ─── In-message file card ─────────────────────────────────────────────────────

export function MessageFileCard({ attachment }: { attachment: MessageAttachment }) {
  const isImage = attachment.mimeType.startsWith("image/")
  const Icon    = getFileIcon(attachment.mimeType)
  const color   = getFileColor(attachment.mimeType)

  if (isImage && attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-2 rounded-xl overflow-hidden border border-border/40 max-w-xs"
      >
        <img
          src={attachment.url}
          alt={attachment.name}
          className="w-full max-h-48 object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = "none" }}
        />
        <div className="px-2.5 py-1 bg-muted/40 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground truncate">{attachment.name}</p>
        </div>
      </a>
    )
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 mt-2 rounded-xl border max-w-xs transition-opacity hover:opacity-80",
        color
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate">{attachment.name}</p>
        <p className="text-[10px] opacity-60">{formatBytes(attachment.size)}</p>
      </div>
    </a>
  )
}

// ─── Type re-export for convenience ───────────────────────────────────────────
export type { AttachedFile, MessageAttachment } from "@/types/chat"

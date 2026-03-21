/**
 * lib/hooks/use-agent-stream.ts
 *
 * Custom React hook that encapsulates the full agent streaming lifecycle:
 *   - Sends POST /api/agent and streams SSE events live
 *   - Captures the X-Job-Id from the response header
 *   - Persists job ID to localStorage keyed by sessionId (survives browser close/reopen)
 *   - On mount, checks if there is a stored running job → reconnects via SSE
 *   - Falls back to polling if SSE reconnect fails
 *   - Exposes clean callbacks: onText, onToolCall, onToolResult, onDone, onError
 */

"use client"

import { useRef, useCallback, useEffect } from "react"
import type { AgentEvent, AttachedFile } from "@/types/chat"
import type { AgentMessage }              from "@/lib/agent-engine"

// ─── Storage key helper ───────────────────────────────────────────────────────

function jobStorageKey(sessionId: string): string {
  return `agentJob:${sessionId}`
}

interface StoredJob {
  jobId:    string
  /** Last event sequence replayed (for efficient reconnect) */
  lastSeq:  number
  savedAt:  number
}

export function loadStoredJob(sessionId: string): StoredJob | null {
  try {
    const raw = localStorage.getItem(jobStorageKey(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredJob
    // Discard jobs older than 30 minutes (matches Vercel maxDuration buffer)
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
      localStorage.removeItem(jobStorageKey(sessionId))
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function saveStoredJob(sessionId: string, jobId: string, lastSeq = 0): void {
  try {
    const data: StoredJob = { jobId, lastSeq, savedAt: Date.now() }
    localStorage.setItem(jobStorageKey(sessionId), JSON.stringify(data))
  } catch { /* localStorage unavailable (incognito/SSR) */ }
}

export function clearStoredJob(sessionId: string): void {
  try {
    localStorage.removeItem(jobStorageKey(sessionId))
  } catch { /* ignore */ }
}

// ─── Hook types ───────────────────────────────────────────────────────────────

export interface StreamCallbacks {
  onStatus:     (text: string, step: number) => void
  onText:       (delta: string)              => void
  onToolCall:   (event: AgentEvent)          => void
  onToolResult: (event: AgentEvent)          => void
  onProjectSwitch: (projectId: string, projectName: string) => void
  onDone:       () => void
  onError:      (text: string)               => void
}

export interface SendMessageOptions {
  message:          string
  sessionId:        string
  history:          AgentMessage[]
  provider:         "gemini" | "openrouter"
  model:            string
  currentProjectId: string | null
  sessionMemory:    string | null
  attachments:      AttachedFile[]
}

// ─── SSE event parser ─────────────────────────────────────────────────────────

function parseSSELine(line: string): AgentEvent | null {
  if (!line.startsWith("data: ")) return null
  const raw = line.slice(6).trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as AgentEvent
  } catch {
    return null
  }
}

async function drainSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  let buffer = ""
  const decoder = new TextDecoder()

  while (true) {
    if (signal.aborted) break

    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines  = buffer.split("\n")
    buffer       = lines.pop() ?? ""

    for (const line of lines) {
      const event = parseSSELine(line)
      if (!event) continue
      dispatchEvent(event, callbacks)
    }
  }
}

function dispatchEvent(event: AgentEvent, callbacks: StreamCallbacks): void {
  switch (event.type) {
    case "status":
      callbacks.onStatus(event.text || "", event.step ?? 0)
      break
    case "text":
      if (event.text) callbacks.onText(event.text)
      break
    case "tool_call":
      callbacks.onToolCall(event)
      break
    case "tool_result":
      callbacks.onToolResult(event)
      break
    case "project_switch":
      if (event.projectId) {
        callbacks.onProjectSwitch(event.projectId, event.projectName || "")
      }
      break
    case "done":
      callbacks.onDone()
      break
    case "error":
      callbacks.onError(event.text || "Unknown error")
      break
  }
}

// ─── Polling fallback ─────────────────────────────────────────────────────────

async function pollFallback(
  jobId: string,
  lastSeq: number,
  callbacks: StreamCallbacks,
  signal: AbortSignal
): Promise<void> {
  let seq = lastSeq
  let done = false
  let attempts = 0
  const MAX_ATTEMPTS = 600 // 5 minutes at 500ms

  while (!done && !signal.aborted && attempts < MAX_ATTEMPTS) {
    attempts++
    await new Promise<void>(r => setTimeout(r, 500))
    if (signal.aborted) break

    try {
      const res = await fetch(`/api/agent/stream/${jobId}?from=${seq}`, {
        signal,
        headers: { Accept: "text/event-stream" },
      })
      if (!res.ok) break

      const text = await res.text()
      const lines = text.split("\n")

      for (const line of lines) {
        const event = parseSSELine(line)
        if (!event) continue
        dispatchEvent(event, callbacks)
        seq++
        if (event.type === "done" || event.type === "error") {
          done = true
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") break
      // Network error — keep retrying
    }
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAgentStream(callbacks: StreamCallbacks) {
  const abortRef    = useRef<AbortController | null>(null)
  const callbackRef = useRef(callbacks)

  // Keep callbacks ref fresh without re-creating send/reconnect
  useEffect(() => {
    callbackRef.current = callbacks
  }, [callbacks])

  /** Abort any in-flight stream */
  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  /**
   * Send a new message and stream the agent response.
   * Returns the jobId (for storage/reconnect) or null on failure.
   */
  const send = useCallback(async (opts: SendMessageOptions): Promise<string | null> => {
    stop()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      // Convert AttachedFile[] → minimal attachment objects for API
      const attachments = opts.attachments
        .filter(f => f.status === "ready" && f.url)
        .map(f => ({
          name:     f.name,
          mimeType: f.mimeType,
          url:      f.url!,
          content:  f.content,
        }))

      const res = await fetch("/api/agent", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message:          opts.message,
          history:          opts.history,
          provider:         opts.provider,
          model:            opts.model,
          sessionId:        opts.sessionId,
          currentProjectId: opts.currentProjectId,
          sessionMemory:    opts.sessionMemory,
          attachments,
        }),
        signal: ctrl.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "API error" }))
        callbackRef.current.onError(err.error || `HTTP ${res.status}`)
        return null
      }

      // Extract job ID for reconnection
      const jobId = res.headers.get("X-Job-Id") || null
      if (jobId) {
        saveStoredJob(opts.sessionId, jobId)
      }

      const reader = res.body?.getReader()
      if (!reader) {
        callbackRef.current.onError("No stream body")
        return null
      }

      await drainSSEStream(reader, callbackRef.current, ctrl.signal)

      // Clean up stored job on success
      clearStoredJob(opts.sessionId)
      return jobId
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return null
      callbackRef.current.onError(err instanceof Error ? err.message : "Stream error")
      return null
    }
  }, [stop])

  /**
   * Reconnect to a running job via SSE.
   * Used when the user navigates back to a page with an active job.
   * Falls back to polling if SSE reconnect fails.
   */
  const reconnect = useCallback(async (sessionId: string): Promise<boolean> => {
    const stored = loadStoredJob(sessionId)
    if (!stored) return false

    stop()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      // Try SSE reconnect first
      const res = await fetch(
        `/api/agent/stream/${stored.jobId}?from=${stored.lastSeq}`,
        {
          signal:  ctrl.signal,
          headers: { Accept: "text/event-stream" },
        }
      )

      if (res.ok && res.body) {
        const reader = res.body.getReader()
        await drainSSEStream(reader, callbackRef.current, ctrl.signal)
        clearStoredJob(sessionId)
        return true
      }

      // SSE reconnect failed — fall back to polling
      await pollFallback(stored.jobId, stored.lastSeq, callbackRef.current, ctrl.signal)
      clearStoredJob(sessionId)
      return true
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return false
      // Reconnect failed — clear stale job
      clearStoredJob(sessionId)
      return false
    }
  }, [stop])

  /**
   * Check if there is a stored running job for the given session.
   * Returns the stored job metadata (for showing "reconnecting..." UI).
   */
  const checkStoredJob = useCallback((sessionId: string): StoredJob | null => {
    return loadStoredJob(sessionId)
  }, [])

  return { send, stop, reconnect, checkStoredJob }
}

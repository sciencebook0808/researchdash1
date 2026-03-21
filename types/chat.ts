/**
 * types/chat.ts — Shared chat system types, models, and constants.
 *
 * UPDATED: Added AttachedFile interface and file-upload related types.
 * These are used by the chat page and upload components.
 */

// ─── Re-export AgentStep from the canonical location ─────────────────────────
export type { AgentStep } from "./agent"
import type { AgentStep } from "./agent"

// ─── SSE streaming event types ───────────────────────────────────────────────

export type AgentEventType =
  | "text"
  | "status"
  | "tool_call"
  | "tool_result"
  | "done"
  | "error"
  | "project_switch"

export interface AgentEvent {
  type:           AgentEventType
  text?:          string
  tool?:          string
  args?:          Record<string, unknown>
  result?:        unknown
  resultPreview?: string
  step?:          number
  projectId?:     string
  projectName?:   string
}

// ─── File attachment ──────────────────────────────────────────────────────────

/** A file the user has selected/uploaded to attach to a message */
export interface AttachedFile {
  /** DB id (from ChatAttachment), or a local temp id while uploading */
  id:       string
  name:     string
  mimeType: string
  size:     number
  /** Cloudinary CDN URL — null while uploading */
  url:      string | null
  /** Extracted text content — null for images/PDFs */
  content:  string | null
  /** Upload state */
  status:   "uploading" | "ready" | "error"
  /** Error message if status=error */
  error?:   string
}

/** Minimal attachment passed to the agent engine */
export interface MessageAttachment {
  id:       string
  name:     string
  mimeType: string
  size:     number
  url:      string
  content:  string | null
}

// ─── Chat message ─────────────────────────────────────────────────────────────

export interface Message {
  id:                 string
  role:               "user" | "assistant"
  content:            string
  loading?:           boolean
  agentSteps?:        AgentStep[]
  stepsExpanded?:     boolean
  reasoning?:         string
  reasoningExpanded?: boolean
  modelId?:           string
  /** Files attached to this message */
  attachments?:       MessageAttachment[]
  /** Background job ID for reconnection */
  jobId?:             string
}

// ─── Model ────────────────────────────────────────────────────────────────────

export interface ChatModel {
  id:        string
  name:      string
  provider:  "gemini" | "openrouter"
  shortName: string
  /** True for OpenRouter free-tier models (display badge only) */
  free?:     boolean
  /** True if this model supports file attachments */
  supportsFiles?: boolean
}

/**
 * RoutingMode — used to track whether the user has selected a real model
 * manually or one of the auto-routing pseudo-models.
 */
export type RoutingMode = "manual" | "auto" | "auto-free" | "auto-paid"

// ─── Chat session ─────────────────────────────────────────────────────────────

export interface ChatSession {
  id:           string
  title:        string
  creatorId:    string
  creatorName?: string
  visibility:   "team" | "private"
  createdAt:    string
  updatedAt:    string
  _count?:      { messages: number }
}

// ─── Gemini model catalogue ───────────────────────────────────────────────────

export const GEMINI_MODELS: ChatModel[] = [
  { id: "gemini-2.5-flash",      name: "Gemini 2.5 Flash",      provider: "gemini", shortName: "2.5 Flash",  supportsFiles: true  },
  { id: "gemini-2.5-pro",        name: "Gemini 2.5 Pro",        provider: "gemini", shortName: "2.5 Pro",    supportsFiles: true  },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", provider: "gemini", shortName: "2.5 Lite",   supportsFiles: true  },
  { id: "gemini-2.5-flash-live", name: "Gemini 2.5 Flash Live", provider: "gemini", shortName: "2.5 Live",   supportsFiles: true  },
]

// ─── Auto-routing pseudo-models ───────────────────────────────────────────────

export const AUTO_ROUTING_MODELS: ChatModel[] = [
  {
    id:           "auto",
    name:         "Auto (Best Available)",
    provider:     "openrouter",
    shortName:    "Auto",
    free:         false,
    supportsFiles: false,
  },
  {
    id:           "auto-free",
    name:         "Auto (Free Models Only)",
    provider:     "openrouter",
    shortName:    "Auto Free",
    free:         true,
    supportsFiles: false,
  },
  {
    id:           "auto-paid",
    name:         "Auto (Premium Models)",
    provider:     "openrouter",
    shortName:    "Auto Paid",
    free:         false,
    supportsFiles: false,
  },
]

// ─── File-capable model detection ─────────────────────────────────────────────

/** Returns true if the given model ID supports file attachments */
export function modelSupportsFiles(modelId: string, provider?: string): boolean {
  // All Gemini models support files
  if (provider === "gemini") return true
  // Gemini models accessed via OpenRouter
  if (/gemini/i.test(modelId)) return true
  // GPT-4o family
  if (/gpt-4o/i.test(modelId)) return true
  // Claude 3+ family
  if (/claude-3|claude-sonnet|claude-opus|claude-haiku/i.test(modelId)) return true
  return false
}

// ─── Slash commands ───────────────────────────────────────────────────────────

export const SLASH_COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: "/document",   desc: "Create a documentation page" },
  { cmd: "/roadmap",    desc: "Add a roadmap step"           },
  { cmd: "/experiment", desc: "Design an experiment"         },
  { cmd: "/dataset",    desc: "Register a dataset"           },
  { cmd: "/note",       desc: "Save a research note"         },
]

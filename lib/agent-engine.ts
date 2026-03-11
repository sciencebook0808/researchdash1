/**
 * Prausdit Research Lab — Agentic Engine (v5)
 *
 * Powered by Vercel AI SDK (ai package) with multi-provider support.
 * Uses streamText with stopWhen: stepCountIs(15) for agentic tool loops.
 *
 * Providers:
 *   Gemini   → @ai-sdk/google
 *   OpenRouter → @ai-sdk/openai (OpenAI-compatible base URL)
 *
 * Stream output (SSE):
 *   { type: "status",      text, step }
 *   { type: "tool_call",   tool, text, args, step }
 *   { type: "tool_result", tool, text, result, step }
 *   { type: "text",        text }
 *   { type: "done" }
 *   { type: "error",       text }
 */

import { streamText, stepCountIs } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "./prisma"
import { agentTools } from "./agent-tools"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: "user" | "assistant"
  content: string
}

export interface AgentOptions {
  message: string
  history: AgentMessage[]
  provider: "gemini" | "openrouter"
  model: string
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Prausdit Lab Assistant — an autonomous AI research agent for the Prausdit Research Lab, specialising in the Protroit Agent project and ProtroitOS development.

## Your Capabilities
You have tools to:
- **Search & read** internal documentation, experiments, datasets, notes, and roadmap
- **Create** documentation pages, research notes, roadmap steps, experiments, and datasets
- **Update** existing records
- **Crawl the web** to retrieve external documentation, papers, or references

## Expertise
- Small Language Models (SLMs), LoRA/QLoRA fine-tuning, GGUF/ONNX quantization
- Mobile and offline-first AI inference
- Dataset engineering (JSONL, instruction tuning, synthetic data)
- PyTorch, transformers, PEFT, trl training stacks
- Protroit Agent architecture and ProtroitOS design

## Reasoning Approach
1. **Analyse** what the user needs
2. **Search** internal knowledge base for relevant context
3. **Plan** what tools to call
4. **Execute** tools sequentially, using each result to inform the next step
5. **Synthesise** a clear, actionable response with Markdown formatting

## Tool Rules
- ALWAYS search internal docs BEFORE creating new content (avoid duplicates)
- For /document: search first, then write rich detailed documentation (not placeholders)
- For /roadmap: check existing phases before adding a new step
- For /experiment: check related experiments and datasets first
- For /dataset: check for similar datasets before creating
- For /note: create immediately without pre-search
- For @resource references: search_internal_docs first; crawl_web only if not found internally
- Limit web crawling to 2 URLs per turn

## Security
- No shell/filesystem access — all actions via the defined tools only
- Web crawling: HTTPS only, no private/local addresses

## Response Style
- Rich Markdown with headings, code blocks, and lists
- When you create something: confirm with the record ID and a link`

// ─── Provider adapter ─────────────────────────────────────────────────────────

async function getModel(provider: "gemini" | "openrouter", modelId: string) {
  const settings = await prisma.aISettings.findFirst().catch(() => null)

  if (provider === "openrouter") {
    const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error("OpenRouter API key not configured. Add it in Settings → Manage API.")
    const openai = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      headers: {
        "HTTP-Referer": "https://prausdit.app",
        "X-Title": "Prausdit Research Lab",
      },
    })
    return openai(modelId)
  }

  // Gemini (default)
  const apiKey = settings?.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error("Gemini API key not configured. Set GOOGLE_API_KEY or add it in Settings.")
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelId)
}

// ─── Tool status labels ───────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_internal_docs:  "🔍 Searching knowledge base",
  read_document:         "📖 Reading documentation",
  create_document:       "📝 Creating documentation page",
  update_document:       "✏️ Updating documentation",
  create_note:           "🗒️ Saving research note",
  create_roadmap_step:   "🗺️ Creating roadmap step",
  update_roadmap_step:   "🗺️ Updating roadmap",
  create_experiment:     "🧪 Creating experiment",
  update_experiment:     "🧪 Updating experiment",
  create_dataset:        "🗃️ Creating dataset entry",
  update_dataset:        "🗃️ Updating dataset",
  crawl_web:             "🌐 Fetching web content",
}

// ─── Main agent runner ────────────────────────────────────────────────────────

export function runAgent(options: AgentOptions): ReadableStream<Uint8Array> {
  const { message, history, provider, model } = options
  const encoder = new TextEncoder()

  function evt(payload: object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
  }

  // Build messages array for Vercel AI SDK
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-12),
    { role: "user", content: message },
  ]

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const aiModel = await getModel(provider, model)
        let stepNum = 0

        const result = streamText({
          model: aiModel,
          system: SYSTEM_PROMPT,
          messages,
          tools: agentTools,
          stopWhen: stepCountIs(15),
          maxRetries: 1,
          temperature: 0.7,
          onChunk({ chunk }) {
            try {
              if (chunk.type === "tool-call") {
                stepNum++
                const label = TOOL_LABELS[chunk.toolName] || `⚙️ Calling ${chunk.toolName}`
                controller.enqueue(evt({
                  type: "tool_call",
                  tool: chunk.toolName,
                  text: label,
                  args: chunk.input,
                  step: stepNum,
                }))
              }

              if (chunk.type === "tool-result") {
                controller.enqueue(evt({
                  type: "tool_result",
                  tool: chunk.toolName,
                  text: `✓ ${TOOL_LABELS[chunk.toolName] || chunk.toolName} complete`,
                  result: chunk.result,
                  step: stepNum,
                }))
                // Brief "planning" status after each tool result if loop continues
                controller.enqueue(evt({ type: "status", text: "💭 Analysing results…", step: stepNum }))
              }

              if (chunk.type === "text-delta" && chunk.textDelta) {
                controller.enqueue(evt({ type: "text", text: chunk.textDelta }))
              }
            } catch { /* ignore serialization errors */ }
          },
        })

        // Drive the stream to completion
        for await (const _ of result.textStream) { /* consumed via onChunk */ }

        controller.enqueue(evt({ type: "done" }))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        try {
          controller.enqueue(evt({ type: "error", text: msg }))
          controller.enqueue(evt({ type: "done" }))
          controller.close()
        } catch { /* controller already closed */ }
      }
    },
  })
}

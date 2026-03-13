/**
 * Prausdit Research Lab — Agent Engine
 * AI SDK 6.x (March 2026) — npm package "ai" latest: 6.0.116
 *
 * Architecture:
 *   User Message
 *     → Context injection (knowledge graph + history)
 *     → Model routing (Gemini / OpenRouter via AI Gateway)
 *     → Reasoning loop (streamText + maxSteps)
 *     → Tool router (CRM APIs via Prisma)
 *     → SSE stream to UI
 *
 * Supports workflows:
 *   - Documentation automation
 *   - Roadmap autopilot
 *   - Dataset intelligence
 *   - Experiment planning
 *   - Model benchmarking
 *   - Research autopilot
 *   - Web research
 *
 * Stream SSE format:
 *   { type: "status",      text, step }
 *   { type: "tool_call",   tool, text, args, step }
 *   { type: "tool_result", tool, text, result, step }
 *   { type: "text",        text }
 *   { type: "done" }
 *   { type: "error",       text }
 *
 * NOTE: toolCallStreaming option was REMOVED in AI SDK 5.0+
 *       Tool call streaming is now always enabled by default.
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
  /** Optional: inject pre-built context (for workflow triggers) */
  systemContext?: string
}

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are **Prausdit Lab Agent** — the autonomous AI brain of the Prausdit Research Lab.

You operate as a reasoning agent that thinks step by step, calls tools to interact with the CRM, and completes complex research workflows autonomously.

## Mission
Power the development of **Protroit Agent** (offline-first SLM AI for mobile/edge) and **ProtroitOS** (agentic operating system) by automating research workflows.

## Tool Capabilities

### Knowledge & RAG
- \`search_internal_docs\` — Full-text search across docs, experiments, datasets, notes, roadmap, models
- \`get_knowledge_graph\` — Retrieve entity relationship graph for research context

### Documentation
- \`read_document\` — Read a full doc page by slug
- \`create_document\` — Write comprehensive documentation (not placeholders)
- \`update_document\` — Patch existing documentation

### Research Notes
- \`create_note\` — Save research note with Markdown content
- \`update_note\` — Update existing note

### Roadmap Autopilot
- \`create_roadmap_step\` — Add phase with tasks and milestones
- \`update_roadmap_step\` — Mark steps complete, update progress
- \`complete_roadmap_task\` — Check off individual tasks

### Experiment Planning
- \`create_experiment\` — Register ML experiment with full hyperparameter config
- \`update_experiment\` — Record results, update status

### Dataset Intelligence
- \`create_dataset\` — Register dataset with metadata
- \`update_dataset\` — Update preprocessing status / sample count
- \`analyze_dataset\` — Full dataset analysis + experiment suggestions

### Model Benchmarking
- \`benchmark_model\` — Record scores + auto-generate benchmark report doc
- \`get_model_leaderboard\` — Ranked model comparison table

### Web Research
- \`crawl_web\` — Fetch HTTPS pages (papers, docs, GitHub); max 2 URLs/turn

### Workflow Orchestration
- \`run_research_autopilot\` — Execute full research planning workflow for any topic

## AI Expertise
- SLMs: TinyLlama, Phi-3-mini, Gemma-2B, Mistral-7B, Qwen-1.5B
- Training: LoRA, QLoRA, GRPO, full fine-tune with trl/PEFT/transformers
- Quantization: GGUF, GPTQ, AWQ, INT4/INT8 — for mobile/edge deployment
- Datasets: JSONL instruction tuning, ShareGPT format, synthetic data generation
- Evaluation: BLEU, HumanEval pass@1, MMLU, MT-Bench
- Deployment: ONNX, Core ML, TFLite, llama.cpp on mobile

## Rules
- **Always search before creating** (avoid duplicates)
- **No shell/filesystem access** — tools only
- **HTTPS only** for web crawling; max 2 URLs/turn
- **Be comprehensive** — write real content, not placeholders
- **Confirm every action** with IDs and links
- **Think out loud** — explain your reasoning before each tool call

## Response Style
Rich Markdown with headings, tables, code blocks. When you create something, always confirm with: Created [Title] (ID: \`xyz\`)`

// ─── Provider Adapter ─────────────────────────────────────────────────────────

async function getModel(provider: "gemini" | "openrouter", modelId: string) {
  // Safely fetch settings - handle database unavailability gracefully
  let settings: Awaited<ReturnType<typeof prisma.aISettings.findFirst>> | null = null
  try {
    settings = await prisma.aISettings.findFirst()
  } catch (dbErr) {
    console.warn("[agent-engine] Could not fetch AI settings from database:", 
      dbErr instanceof Error ? dbErr.message : String(dbErr))
    // Continue with environment variables only
  }

  if (provider === "openrouter") {
    const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key not configured.\n\n" +
        "To fix this:\n" +
        "1. Add OPENROUTER_API_KEY to your environment variables, or\n" +
        "2. Configure it in Settings → Manage API (requires database connection)"
      )
    }
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
  if (!apiKey) {
    throw new Error(
      "Gemini API key not configured.\n\n" +
      "To fix this:\n" +
      "1. Set GOOGLE_API_KEY in your environment variables (get one at https://aistudio.google.com/app/apikey), or\n" +
      "2. Configure it in Settings → Manage API (requires database connection)"
    )
  }
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelId)
}

// ─── Tool Status Labels ───────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_internal_docs:     "Searching knowledge base",
  get_knowledge_graph:      "Loading knowledge graph",
  read_document:            "Reading documentation",
  create_document:          "Creating documentation page",
  update_document:          "Updating documentation",
  create_note:              "Saving research note",
  update_note:              "Updating research note",
  create_roadmap_step:      "Creating roadmap step",
  update_roadmap_step:      "Updating roadmap",
  complete_roadmap_task:    "Completing roadmap task",
  create_experiment:        "Creating experiment",
  update_experiment:        "Updating experiment",
  create_dataset:           "Creating dataset entry",
  update_dataset:           "Updating dataset",
  analyze_dataset:          "Analysing dataset intelligence",
  benchmark_model:          "Recording benchmark results",
  get_model_leaderboard:    "Loading model leaderboard",
  crawl_web:                "Fetching web content",
  run_research_autopilot:   "Running research autopilot",
}

// ─── Workflow Intent Detection ────────────────────────────────────────────────

function detectWorkflowIntent(message: string): string {
  const lower = message.toLowerCase()

  if (/start research|research for|research on|investigate/i.test(message))
    return "Research Autopilot activated — analysing knowledge graph and planning research workflow..."
  if (/plan experiments?|create experiments? for|design experiments?/i.test(message))
    return "Experiment Planner activated — analysing datasets and designing experiment suite..."
  if (/benchmark|evaluate model|score model|rank model/i.test(message))
    return "Benchmark Automation activated — preparing evaluation pipeline..."
  if (/analyse dataset|analyze dataset|dataset intelligence/i.test(message))
    return "Dataset Intelligence activated — performing deep dataset analysis..."
  if (/(training|pipeline|milestone|roadmap).*(done|complete|finished)|finished.*training/i.test(message))
    return "Roadmap Autopilot activated — updating milestones and planning next steps..."
  if (/\/document|create doc|write doc|generate doc|document this/i.test(message))
    return "Documentation Automation activated — searching for existing docs first..."
  if (/\/experiment/i.test(message))
    return "Experiment creation mode — checking related experiments and datasets..."
  if (/\/dataset/i.test(message))
    return "Dataset registration mode — checking for similar datasets..."
  if (/\/roadmap/i.test(message))
    return "Roadmap mode — checking existing phases..."
  if (/\/note/i.test(message))
    return "Research note mode — saving your note..."
  if (/leaderboard|ranking|best model|top model/i.test(message))
    return "Loading model leaderboard..."
  if (lower.includes("@documentation") || lower.includes("@docs"))
    return "Fetching referenced documentation..."
  if (lower.includes("search") || lower.includes("find") || lower.includes("look up"))
    return "Searching knowledge base..."

  return "Agent thinking..."
}

// ─── Main Agent Runner ────────────────────────────────────────────────────────

export function runAgent(options: AgentOptions): ReadableStream<Uint8Array> {
  const { message, history, provider, model, systemContext } = options
  const encoder = new TextEncoder()

  function evt(payload: object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-14),
    { role: "user", content: message },
  ]

  // Build system prompt with optional workflow context
  const systemPrompt = systemContext
    ? `${SYSTEM_PROMPT}\n\n## Active Workflow Context\n${systemContext}`
    : SYSTEM_PROMPT

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Emit initial status based on intent detection
        const initialStatus = detectWorkflowIntent(message)
        controller.enqueue(evt({ type: "status", text: initialStatus, step: 0 }))

        const aiModel = await getModel(provider, model)
        let stepNum = 0

        // AI SDK 6: streamText with maxSteps for multi-step tool execution
        // NOTE: toolCallStreaming was REMOVED in AI SDK 5+ — it is always on by default
        const result = streamText({
          model: aiModel,
          system: systemPrompt,
          messages,
          tools: agentTools,
          stopWhen: stepCountIs(20),
          maxRetries: 1,
          temperature: 0.65,
        })

        // Iterate fullStream for streaming chunks
        for await (const chunk of result.fullStream) {
          try {
            if (chunk.type === "tool-call") {
              stepNum++
              const label = TOOL_LABELS[chunk.toolName] || `Calling ${chunk.toolName}`
              controller.enqueue(evt({
                type: "tool_call",
                tool: chunk.toolName,
                text: label,
                args: chunk.args,
                step: stepNum,
              }))
            }

            if (chunk.type === "tool-result") {
              const resultPreview = typeof chunk.result === "object"
                ? JSON.stringify(chunk.result).slice(0, 200)
                : String(chunk.result ?? "").slice(0, 200)
              controller.enqueue(evt({
                type: "tool_result",
                tool: chunk.toolName,
                text: `${TOOL_LABELS[chunk.toolName] || chunk.toolName} complete`,
                result: chunk.result,
                resultPreview,
                step: stepNum,
              }))
              controller.enqueue(evt({ type: "status", text: "Analysing results...", step: stepNum }))
            }

            if (chunk.type === "text-delta" && chunk.textDelta) {
              controller.enqueue(evt({ type: "text", text: chunk.textDelta }))
            }
          } catch { /* ignore serialization errors on individual chunks */ }
        }

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

// ─── Workflow Trigger Helpers ─────────────────────────────────────────────────

/** Run a specific workflow with pre-loaded context */
export function runWorkflow(
  workflowType: "documentation_automation" | "roadmap_autopilot" | "experiment_planning" | "research_autopilot" | "dataset_intelligence" | "model_benchmark",
  payload: Record<string, unknown>,
  options: Omit<AgentOptions, "message" | "systemContext">
): ReadableStream<Uint8Array> {
  const workflowMessages: Record<string, string> = {
    documentation_automation: `Generate comprehensive documentation for the following: ${JSON.stringify(payload)}. Use create_document to save it.`,
    roadmap_autopilot: `Update the roadmap based on this completion event: ${JSON.stringify(payload)}. Mark completed, create next steps.`,
    experiment_planning: `Plan and create experiments for this topic: ${JSON.stringify(payload)}. Use create_experiment for each planned experiment.`,
    research_autopilot: `Start a full research autopilot workflow for: ${JSON.stringify(payload)}. Run run_research_autopilot first, then crawl web, create notes and documentation.`,
    dataset_intelligence: `Perform full dataset intelligence analysis for dataset ID: ${JSON.stringify(payload)}. Use analyze_dataset, then create documentation and suggest experiments.`,
    model_benchmark: `Process benchmark results for model: ${JSON.stringify(payload)}. Use benchmark_model to record scores and generate report.`,
  }

  const message = workflowMessages[workflowType] || `Execute workflow: ${workflowType} with payload: ${JSON.stringify(payload)}`
  const systemContext = `ACTIVE WORKFLOW: ${workflowType}\nPayload: ${JSON.stringify(payload, null, 2)}`

  return runAgent({ ...options, message, systemContext })
}

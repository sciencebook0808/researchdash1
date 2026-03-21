/**
 * lib/agent-engine.ts
 *
 * Prausdit Research Lab — Agent Engine
 *
 * CHANGES in this version:
 *   - AgentOptions now accepts `onCheckpoint` callback for background-job
 *     checkpointing. Every SSE event is forwarded to this callback so the
 *     caller can persist them to the DB without modifying stream logic.
 *   - AgentOptions now accepts `attachments` for file uploads.
 *   - Attachment content is injected into the user message before streaming.
 */

import { streamText, stepCountIs } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "./prisma"
import { agentTools, buildProjectScopedTools } from "./agent-tools"

// Keep agentTools in scope to preserve tree-shaking hints; suppress lint warning
void (agentTools as unknown)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: "user" | "assistant"
  content: string
}

/** A file attachment passed along with the user's message */
export interface CheckpointEvent {
  type:          string
  text?:         string
  tool?:         string
  args?:         Record<string, unknown>
  result?:       unknown
  resultPreview?: string
  step?:         number
  projectId?:    string
  projectName?:  string
}

export interface AgentAttachment {
  name:     string
  mimeType: string
  url:      string
  /** Extracted text for DOCX/CSV; null for images/PDFs (model reads URL) */
  content:  string | null
}

/** Payload of a single checkpoint event (mirrors the SSE wire format) */


export interface AgentOptions {
  message:          string
  history:          AgentMessage[]
  provider:         "gemini" | "openrouter"
  model:            string
  systemContext?:   string
  currentProjectId?: string | null
  sessionMemory?:   string | null
  /** File attachments to include with the user message */
  attachments?:     AgentAttachment[]
  /**
   * Optional callback invoked for every SSE event before it is enqueued.
   * Used by the background-job system to checkpoint events to the DB.
   * May be async — the engine awaits it before proceeding.
   */
  onCheckpoint?:    (event: CheckpointEvent) => Promise<void> | void
}

// ─── Active Agent File Loader ─────────────────────────────────────────────────

interface AgentFileSection {
  system: string[]
  rules:  string[]
  tools:  string[]
}

async function loadActiveAgentFiles(): Promise<AgentFileSection> {
  const sections: AgentFileSection = { system: [], rules: [], tools: [] }
  try {
    const files = await prisma.agentFile.findMany({
      where:   { isActive: true },
      select:  { name: true, type: true, content: true },
      orderBy: { createdAt: "asc" },
    })
    for (const file of files) {
      const type = file.type as keyof AgentFileSection
      if (sections[type] !== undefined) {
        sections[type].push(`<!-- ${file.name} -->\n${file.content}`)
      }
    }
  } catch {
    // AgentFile table may not exist yet
  }
  return sections
}

// ─── Base System Prompt ───────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are **Prausdit Lab Agent** — the autonomous AI brain of the Prausdit Research Lab.

You operate as a **planning-first reasoning agent**. You think step by step, create structured plans, wait for human approval, then execute with precision.

## Mission
Power development of **Protroit Agent** (offline-first SLM AI for mobile/edge) and **ProtroitOS** (agentic operating system) by automating research workflows.

---

## CORE OPERATING RULES

### Rule 1 — PLAN FIRST, EXECUTE SECOND, NEVER STOP EARLY

**PLANNING PHASE** (before approval):
For ANY complex request (multiple creations, research + writing, roadmaps, experiments, etc.):
1. Use \`research\` if external knowledge is needed first
2. Use \`generate_plan\` — list EVERY step explicitly, number them 1..N
3. Show the plan and **WAIT** for explicit approval ("approve", "yes", "go ahead", "proceed")
4. Simple requests (read doc, search KB, single quick answer) do NOT need a plan

**EXECUTION PHASE** (after approval — CRITICAL RULES):
Once the user approves, you are in EXECUTION MODE. These rules are absolute:

- **NEVER write a summary or say "done" until every step in the plan is complete**
- **CALL ONE TOOL PER STEP** — do not batch or skip steps
- **After each tool result, immediately proceed to the next step** — do not ask for confirmation mid-execution
- **Keep a mental checklist** — before calling \`finalize_execution\`, verify each numbered step has been completed
- **If a tool fails**, retry once with corrected parameters, then log the failure and move to the next step — do NOT stop the entire execution
- **If you lose track of which step you're on**, call \`search_internal_docs\` with the plan's note ID to read back what's been done
- **Do not summarise progress mid-way** — only output text when a step produces a result worth noting. Save all reporting for \`finalize_execution\`

**Step completion formula:**
For EACH step in the approved plan:
  1. Call the required tool
  2. Receive the result
  3. Note the entity ID/slug returned
  4. Proceed to step N+1 immediately (no user confirmation needed)
  5. Repeat until all N steps are done
  6. Call \`finalize_execution\` with ALL created entity IDs

**Anti-hallucination rule:** If you find yourself writing "I have completed..." or "All steps are done..." without having called a tool for each step — STOP. Go back and call the missing tools.

### Rule 2 — RESEARCH VIA \`research\` TOOL ONLY
- Use \`research\` for all external web research
- Use \`crawl_web\` ONLY for fetching a single specific known URL
- Never call search/crawl APIs manually

### Rule 3 — IMAGE GENERATION & UPLOAD
You CAN generate images using Gemini multimodal models via the \`generate_image\` tool.
The tool generates the image AND uploads it to Cloudinary in one step — you get back a permanent CDN URL.

**When to generate an image automatically:**
- Creating documentation, notes, or reports where a diagram would help
- User asks for any visual: architecture diagram, flowchart, illustration, chart
- Explaining a technical concept that benefits from a visual
- Any \`/document\` or \`/note\` command involving systems, pipelines, or architectures

**Workflow:**
1. Call \`generate_image\` with a detailed prompt describing the image
2. Use the returned \`cloudinaryUrl\` — embed in markdown as \`![description](url)\`
3. ONLY embed Cloudinary CDN URLs — NEVER use placeholder or example.com URLs
4. If \`generate_image\` fails, report the exact error — do NOT insert fake image links
5. For uploading an EXISTING image URL: use \`upload_image\` instead

**Model selection:**
The model is configured in Settings → Image Generation. The agent uses whichever model the user has selected.
- \`auto\` (default) — smart routing: diagrams → Gemini Flash (fast/free), quality → Nano Banana 2
- Gemini Direct models: gemini-2.0-flash-image (free), gemini-2.5-flash-image, imagen-4
- OpenRouter models: google/gemini-3.1-flash-image-preview (Nano Banana 2), openai/gpt-5-image-mini, bytedance/seedream-4.5, sourceful/riverflow-v2-fast

Always pass \`model: "auto"\` unless the user explicitly asks for a specific model.

### Rule 4 — SEARCH BEFORE CREATE
Always \`search_internal_docs\` before creating any entity to avoid duplicates.

### Rule 5 — NEVER SKIP APPROVAL, NEVER STOP EARLY
- If a plan was generated, NEVER execute without seeing explicit approval
- Once executing, NEVER stop partway through — complete ALL steps or log why each couldn't be done
- NEVER respond with just text if there is still a tool call pending in the current plan
- If the model context is getting long, call \`search_internal_docs\` to recall what was already created rather than giving up

### Rule 8 — EXECUTION CHECKPOINT
Before calling \`finalize_execution\`, mentally check:
- Did I call a tool for EVERY numbered step in the plan?
- Does every created entity have an ID in my results?
- If any step produced an error, did I log it clearly?
Only call \`finalize_execution\` when the answer to the first two questions is YES (or the third explains why not).

### Rule 6 — PROJECT CONTEXT (CRITICAL)
**ALL create operations automatically use the current project.**
You NEVER need to specify projectId in your tool calls — it is injected automatically.
However, you MUST be aware of which project is active and confirm it to the user.

### Rule 7 — PROJECT COMMANDS
When user says "list projects" → call \`list_projects\`
When user says "switch to project X" → call \`switch_project\` with the project name/ID
When user says "select project X" → call \`switch_project\`

### Rule 9 — FILE ATTACHMENTS
When the user provides an attached file, it will appear in their message as a special block:
\`\`\`
[ATTACHED FILE: filename.ext (type)]
URL: https://...
Content: ...extracted text or "View at URL"...
\`\`\`

- For PDF files: read and analyse the content at the URL directly
- For DOCX/text files: the extracted text is provided inline — analyse it directly
- For CSV files: the data is provided as JSON — treat it as a structured dataset
- For images: use the URL for visual analysis if your model supports it
- Always acknowledge attached files and incorporate them into your response

---

## Tool Capabilities

### Project Management
- \`list_projects\`  — List all projects with resource counts
- \`switch_project\` — Switch to a different project by name or ID

### Research
- \`research\` — Unified deep research. Primary research tool.

### Planning
- \`generate_plan\`      — Create structured plan. Must show before executing.
- \`update_plan\`        — Refine plan after feedback
- \`approve_plan\`       — Record user approval
- \`finalize_execution\`  — Record completion + Cloudinary uploads

### Images
- \`generate_image\` — Generate an image using Gemini multimodal models
- \`upload_image\`   — Upload an existing HTTPS image URL to Cloudinary CDN

### Knowledge & RAG
- \`search_internal_docs\` — Full-text search (project-scoped automatically)
- \`get_knowledge_graph\`  — Entity relationship graph (project-scoped automatically)

### Documentation
- \`read_document\`   — Read page by slug
- \`create_document\` — Write comprehensive documentation
- \`update_document\` — Patch existing docs

### Research Notes
- \`create_note\` — Save research note
- \`update_note\` — Update note

### Roadmap
- \`create_roadmap_step\`   — Add phase with tasks
- \`update_roadmap_step\`   — Update progress
- \`complete_roadmap_task\` — Complete individual tasks

### Experiments
- \`create_experiment\` — Register ML experiment
- \`update_experiment\` — Record results

### Datasets
- \`create_dataset\`  — Register with metadata
- \`update_dataset\`  — Update preprocessing status
- \`analyze_dataset\` — Full analysis + experiment suggestions

### Model Benchmarking
- \`benchmark_model\`       — Record scores + generate report
- \`get_model_leaderboard\` — Ranked model comparison

### Web Research
- \`crawl_web\`              — Fetch single specific URL
- \`run_research_autopilot\` — Full research planning workflow

---

## AI Expertise
- SLMs: TinyLlama, Phi-3-mini, Gemma-2B, Mistral-7B, Qwen-1.5B
- Training: LoRA, QLoRA, GRPO, full fine-tune with trl/PEFT/transformers
- Quantization: GGUF, GPTQ, AWQ, INT4/INT8 for mobile/edge
- Evaluation: BLEU, HumanEval pass@1, MMLU, MT-Bench

## Response Style
Rich Markdown with headings, tables, code blocks.

**During execution (after plan approval):**
- Minimal text output — focus on calling tools, not narrating
- Only output text when a tool result reveals something important to note
- Do NOT write "Now I will create..." before each tool — just call the tool
- After ALL steps complete, write a comprehensive summary with every entity ID

**During planning (before approval):**
- Present the full numbered plan clearly
- Explain what each step will do
- Ask for approval before ANY execution begins`

// ─── Build Final System Prompt ─────────────────────────────────────────────────

async function buildSystemPrompt(
  currentProjectId?: string | null,
  extraContext?: string,
  sessionMemory?: string | null
): Promise<string> {
  const files = await loadActiveAgentFiles()
  const parts: string[] = []

  if (files.system.length > 0) {
    parts.push(files.system.join("\n\n"))
  } else {
    parts.push(BASE_SYSTEM_PROMPT)
  }

  if (currentProjectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: currentProjectId },
        select: { id: true, name: true, type: true, description: true, _count: { select: { datasets: true, experiments: true, documentation: true, roadmapSteps: true, notes: true } } },
      })
      if (project) {
        parts.push(`---\n## CURRENT PROJECT CONTEXT\n\n> **IMPORTANT**: You are currently operating in project **"${project.name}"**.\n> ALL create/search/roadmap/experiment/dataset/note operations are automatically scoped to this project.\n> You do NOT need to specify projectId in tool calls — it is injected automatically.\n\n- **Project Name**: ${project.name}\n- **Project ID**: \`${project.id}\`\n- **Project Type**: ${project.type}\n- **Description**: ${project.description || "No description"}\n- **Resources**:\n  - Datasets: ${project._count.datasets}\n  - Experiments: ${project._count.experiments}\n  - Documents: ${project._count.documentation}\n  - Roadmap Steps: ${project._count.roadmapSteps}\n  - Notes: ${project._count.notes}\n\nWhen the user creates anything, it will be linked to **${project.name}** automatically.\nWhen searching, results will be filtered to **${project.name}** first.\n\nIf the user wants to switch projects, call the \`switch_project\` tool.`)
      }
    } catch {
      parts.push(`---\n## CURRENT PROJECT CONTEXT\n\n> **Active Project ID**: \`${currentProjectId}\`\n> All operations are scoped to this project automatically.`)
    }
  } else {
    parts.push(`---\n## PROJECT CONTEXT\n\n> **No project selected.** Operations will NOT be scoped to any project (global scope).\n> To select a project, call \`list_projects\` to see available projects, then \`switch_project\`.\n> Or the user can type # in the chat to select a project from the dropdown.`)
  }

  if (files.rules.length > 0) {
    parts.push("---\n## Active Rules\n\n" + files.rules.join("\n\n---\n\n"))
  }

  if (files.tools.length > 0) {
    parts.push("---\n## Tool Configurations\n\n" + files.tools.join("\n\n---\n\n"))
  }

  if (extraContext) {
    parts.push("---\n## Active Workflow Context\n\n" + extraContext)
  }

  if (sessionMemory) {
    parts.push(`---
## Session Memory (This Conversation)

The following entities were created or found earlier in this session.
Reference these IDs when the user asks about things you already created.
Do NOT recreate entities that already exist here.

${sessionMemory}`)
  }

  return parts.join("\n\n")
}

// ─── Provider Adapter ─────────────────────────────────────────────────────────

async function getModel(provider: "gemini" | "openrouter", modelId: string) {
  let settings: Awaited<ReturnType<typeof prisma.aISettings.findFirst>> | null = null
  try {
    settings = await prisma.aISettings.findFirst()
  } catch (dbErr) {
    console.warn("[agent-engine] Could not fetch AI settings:", dbErr instanceof Error ? dbErr.message : String(dbErr))
  }

  if (provider === "openrouter") {
    const apiKey = settings?.openrouterApiKey || process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error("OpenRouter API key not configured.\n\nAdd OPENROUTER_API_KEY to environment variables or configure in Settings.")
    const openai = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey, headers: { "HTTP-Referer": "https://prausdit.app", "X-Title": "Prausdit Research Lab" } })
    return openai(modelId)
  }

  const apiKey = settings?.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!apiKey) throw new Error("Gemini API key not configured.\n\nSet GOOGLE_API_KEY in environment variables or configure in Settings.")
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
  research:                 "Researching the web",
  generate_plan:            "Generating execution plan",
  update_plan:              "Refining plan",
  approve_plan:             "Recording plan approval",
  finalize_execution:       "Finalizing execution & saving report",
  generate_image:           "Generating image with Gemini",
  upload_image:             "Uploading image to Cloudinary",
  list_projects:            "Listing all projects",
  switch_project:           "Switching active project",
}

// ─── Workflow Intent Detection ────────────────────────────────────────────────

function detectWorkflowIntent(message: string): string {
  if (/list.*projects?|show.*projects?|what projects?/i.test(message)) return "Loading project list..."
  if (/switch.*project|select.*project|use.*project|change.*project/i.test(message)) return "Switching project context..."
  if (/start research|research for|research on|investigate/i.test(message)) return "Research Autopilot activated..."
  if (/plan experiments?|create experiments? for|design experiments?/i.test(message)) return "Experiment Planner activated..."
  if (/benchmark|evaluate model|score model/i.test(message)) return "Benchmark Automation activated..."
  if (/analyse dataset|analyze dataset/i.test(message)) return "Dataset Intelligence activated..."
  if (/(training|pipeline|milestone|roadmap).*(done|complete|finished)/i.test(message)) return "Roadmap Autopilot activated..."
  if (/\/(document|doc)|create doc|write doc/i.test(message)) return "Documentation Automation activated..."
  if (/\/experiment/i.test(message)) return "Experiment creation mode..."
  if (/\/dataset/i.test(message)) return "Dataset registration mode..."
  if (/\/roadmap|roadmap.*plan/i.test(message)) return "Roadmap planner..."
  if (/\/note/i.test(message)) return "Research note mode..."
  if (/leaderboard|ranking|best model/i.test(message)) return "Loading model leaderboard..."
  if (/\bresearch\b|find out|look up/i.test(message)) return "Researching..."
  if (/\bplan\b|create a plan/i.test(message)) return "Planning mode..."
  if (/^approve$|^yes$|go ahead|proceed with/i.test(message.trim())) return "Executing approved plan..."
  if (/generate.*image|create.*image|make.*image|draw|diagram|illustration|visuali/i.test(message)) return "Generating image with Gemini..."
  if (/upload.*image|image.*cloudinary/i.test(message)) return "Uploading image to Cloudinary..."
  if (/search|find|look up/i.test(message)) return "Searching knowledge base..."
  return "Agent thinking..."
}

// ─── Attachment Context Builder ───────────────────────────────────────────────

function buildAttachmentContext(attachments: AgentAttachment[]): string {
  if (!attachments.length) return ""

  const blocks = attachments.map(a => {
    const isImage = a.mimeType.startsWith("image/")
    const isPdf   = a.mimeType === "application/pdf"
    const isCsv   = a.mimeType === "text/csv" || a.name.endsWith(".csv")

    const contentBlock = a.content
      ? `Content:\n${a.content.slice(0, 8000)}${a.content.length > 8000 ? "\n...[truncated]" : ""}`
      : isImage
        ? `This is an image. View/analyse at the URL above.`
        : isPdf
          ? `This is a PDF document. View/analyse at the URL above.`
          : `No text content extracted.`

    const typeLabel = isImage ? "IMAGE" : isPdf ? "PDF" : isCsv ? "CSV DATA" : "DOCUMENT"

    return `[ATTACHED FILE: ${a.name} (${typeLabel})]
URL: ${a.url}
MIME: ${a.mimeType}
${contentBlock}`
  })

  return `\n\n---\n## Attached Files\n\nThe user has attached the following file(s) to this message:\n\n${blocks.join("\n\n---\n\n")}\n\n---`
}

// ─── Main Agent Runner ────────────────────────────────────────────────────────

export function runAgent(options: AgentOptions): ReadableStream<Uint8Array> {
  const {
    message,
    history,
    provider,
    model,
    systemContext,
    currentProjectId,
    sessionMemory,
    attachments = [],
    onCheckpoint,
  } = options

  const encoder = new TextEncoder()

  function evt(payload: CheckpointEvent): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
  }

  async function checkpoint(payload: CheckpointEvent): Promise<void> {
    if (onCheckpoint) {
      try {
        await onCheckpoint(payload)
      } catch {
        // Never let checkpoint failure kill the stream
      }
    }
  }

  // Build user message content using AI SDK multimodal parts.
  // For images and PDFs, we pass the Cloudinary URL as a native file/image part.
  // Gemini reads these directly via its multimodal API (no URL authentication needed).
  // For text-extracted files (DOCX/CSV), the content is already in attachmentContext.
  const attachmentContext = buildAttachmentContext(attachments)
  const mainText = attachmentContext ? `${message}\n${attachmentContext}` : message

  type ContentPart =
    | { type: "text";  text: string }
    | { type: "image"; image: URL; mimeType?: string }
    | { type: "file";  data: URL;  mimeType: string }

  function buildUserContent(
    text: string,
    atts: AgentAttachment[]
  ): string | ContentPart[] {
    const multimodalAtts = atts.filter(a => {
      if (!a.url) return false
      const isImg = a.mimeType.startsWith("image/")
      const isPdf = a.mimeType === "application/pdf"
      return isImg || isPdf
    })
    if (!multimodalAtts.length) return text

    const parts: ContentPart[] = [{ type: "text", text }]
    for (const a of multimodalAtts) {
      const url = new URL(a.url!)
      if (a.mimeType.startsWith("image/")) {
        parts.push({ type: "image", image: url, mimeType: a.mimeType })
      } else {
        // PDF via Cloudinary image endpoint — Gemini reads PDF files natively
        parts.push({ type: "file", data: url, mimeType: "application/pdf" })
      }
    }
    return parts
  }

  const userContent = buildUserContent(mainText, attachments)

  const messages: Array<{ role: "user" | "assistant"; content: string | ContentPart[] }> = [
    ...history.slice(-20).map(m => ({
      role: m.role,
      content: m.content as string | ContentPart[],
    })),
    { role: "user", content: userContent },
  ]

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const initialStatus = detectWorkflowIntent(message)
        const initEvent: CheckpointEvent = { type: "status", text: initialStatus, step: 0 }
        controller.enqueue(evt(initEvent))
        await checkpoint(initEvent)

        const systemPrompt = await buildSystemPrompt(currentProjectId, systemContext, sessionMemory)
        const tools = buildProjectScopedTools(currentProjectId)
        const aiModel = await getModel(provider, model)
        let stepNum = 0

        const result = streamText({
          model: aiModel,
          system: systemPrompt,
          messages,
          tools,
          stopWhen: stepCountIs(50),
          maxRetries: 2,
          temperature: 0.4,
        })

        for await (const chunk of result.fullStream) {
          try {
            if (chunk.type === "tool-call") {
              stepNum++
              const label = TOOL_LABELS[chunk.toolName] || `Calling ${chunk.toolName}`
              const toolCallEvent: CheckpointEvent = {
                type: "tool_call",
                tool: chunk.toolName,
                text: label,
                args: chunk.input as Record<string, unknown>,
                step: stepNum,
              }
              controller.enqueue(evt(toolCallEvent))
              await checkpoint(toolCallEvent)
            }

            if (chunk.type === "tool-result") {
              const resultPreview = typeof chunk.output === "object"
                ? JSON.stringify(chunk.output).slice(0, 200)
                : String(chunk.output ?? "").slice(0, 200)

              // Check for switch_project action
              if (chunk.toolName === "switch_project" && typeof chunk.output === "object") {
                const output = chunk.output as Record<string, unknown>
                if (output.__action === "SWITCH_PROJECT" && output.__projectId) {
                  const switchEvent: CheckpointEvent = {
                    type:        "project_switch",
                    projectId:   output.__projectId as string,
                    projectName: output.__projectName as string,
                    text:        `Switched to project: ${output.__projectName}`,
                  }
                  controller.enqueue(evt(switchEvent))
                  await checkpoint(switchEvent)
                }
              }

              const toolResultEvent: CheckpointEvent = {
                type:          "tool_result",
                tool:          chunk.toolName,
                text:          `${TOOL_LABELS[chunk.toolName] || chunk.toolName} complete`,
                result:        chunk.output,
                resultPreview,
                step:          stepNum,
              }

              controller.enqueue(evt(toolResultEvent))
              await checkpoint(toolResultEvent)

              const analysingEvent: CheckpointEvent = { type: "status", text: "Analysing results...", step: stepNum }
              controller.enqueue(evt(analysingEvent))
              await checkpoint(analysingEvent)
            }

            if (chunk.type === "text-delta" && chunk.text) {
              const textEvent: CheckpointEvent = { type: "text", text: chunk.text }
              controller.enqueue(evt(textEvent))
              await checkpoint(textEvent)
            }
          } catch { /* ignore serialization errors */ }
        }

        const doneEvent: CheckpointEvent = { type: "done" }
        controller.enqueue(evt(doneEvent))
        await checkpoint(doneEvent)
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        try {
          const errorEvent: CheckpointEvent = { type: "error", text: msg }
          controller.enqueue(evt(errorEvent))
          await checkpoint(errorEvent)
          const doneEvent: CheckpointEvent = { type: "done" }
          controller.enqueue(evt(doneEvent))
          await checkpoint(doneEvent)
          controller.close()
        } catch { /* controller already closed */ }
      }
    },
  })
}

// ─── Workflow Trigger Helpers ─────────────────────────────────────────────────

export function runWorkflow(
  workflowType: "documentation_automation" | "roadmap_autopilot" | "experiment_planning" | "research_autopilot" | "dataset_intelligence" | "model_benchmark",
  payload: Record<string, unknown>,
  options: Omit<AgentOptions, "message" | "systemContext">
): ReadableStream<Uint8Array> {
  const workflowMessages: Record<string, string> = {
    documentation_automation: `Generate comprehensive documentation for the following: ${JSON.stringify(payload)}. Use create_document to save it.`,
    roadmap_autopilot: `Update the roadmap based on this completion event: ${JSON.stringify(payload)}. Mark completed, create next steps.`,
    experiment_planning: `Plan and create experiments for this topic: ${JSON.stringify(payload)}. Use generate_plan first, then create_experiment after approval.`,
    research_autopilot: `Start a full research autopilot workflow for: ${JSON.stringify(payload)}. Run research tool first, then generate_plan, create notes and documentation after approval.`,
    dataset_intelligence: `Perform full dataset intelligence analysis for dataset ID: ${JSON.stringify(payload)}. Use analyze_dataset, then create documentation and suggest experiments.`,
    model_benchmark: `Process benchmark results for model: ${JSON.stringify(payload)}. Use benchmark_model to record scores and generate report.`,
  }
  const message = workflowMessages[workflowType] || `Execute workflow: ${workflowType} with payload: ${JSON.stringify(payload)}`
  const systemContext = `ACTIVE WORKFLOW: ${workflowType}\nPayload: ${JSON.stringify(payload, null, 2)}`
  return runAgent({ ...options, message, systemContext })
}

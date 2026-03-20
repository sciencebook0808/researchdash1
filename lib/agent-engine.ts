/**
 * Prausdit Research Lab — Agent Engine
 *
 * UPGRADED (Project Context Awareness):
 *   - AgentOptions now accepts currentProjectId
 *   - System prompt automatically includes current project context
 *   - Uses buildProjectScopedTools() so all tools auto-inject projectId
 *   - list_projects / switch_project added to TOOL_LABELS
 */

import { streamText, stepCountIs } from "ai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "./prisma"
import { agentTools, buildProjectScopedTools } from "./agent-tools"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentMessage {
  role: "user" | "assistant"
  content: string
}

export interface AgentOptions {
  message: string
  history: AgentMessage[]
  provider: "gemini" | "openrouter"
  model: string
  systemContext?: string
  /** The currently selected project ID from the user's session */
  currentProjectId?: string | null
}

// ─── Active Agent File Loader ─────────────────────────────────────────────────

interface AgentFileSection {
  system:  string[]
  rules:   string[]
  tools:   string[]
}

async function loadActiveAgentFiles(): Promise<AgentFileSection> {
  const sections: AgentFileSection = { system: [], rules: [], tools: [] }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const files = await (prisma as any).agentFile.findMany({
      where: { isActive: true },
      select: { name: true, type: true, content: true },
      orderBy: { createdAt: "asc" },
    })
    for (const file of files as Array<{ name: string; type: string; content: string }>) {
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

### Rule 1 — PLAN FIRST, EXECUTE SECOND
For ANY complex request (multiple creations, research + writing, roadmaps, experiments, etc.):
1. Use \`research\` if external knowledge is needed
2. Use \`generate_plan\` to present a structured plan to the user
3. **WAIT** for explicit approval ("approve", "yes", "go ahead", "proceed")
4. ONLY THEN execute using CRM tools
5. Call \`finalize_execution\` when all steps are done

Simple requests (read doc, search KB, single quick answer) do NOT need a plan.

### Rule 2 — RESEARCH VIA \`research\` TOOL ONLY
- Use \`research\` for all external web research
- Use \`crawl_web\` ONLY for fetching a single specific known URL
- Never call search/crawl APIs manually

### Rule 3 — IMAGES GO TO CLOUDINARY
If execution includes images:
1. Generate or obtain image URL
2. Call \`upload_image\` → get permanent Cloudinary CDN URL
3. ONLY store/display Cloudinary URLs in documents/notes

### Rule 4 — SEARCH BEFORE CREATE
Always \`search_internal_docs\` before creating any entity to avoid duplicates.

### Rule 5 — NEVER SKIP APPROVAL
If a plan was generated, NEVER execute without seeing explicit approval.

### Rule 6 — PROJECT CONTEXT (CRITICAL)
**ALL create operations automatically use the current project.**
You NEVER need to specify projectId in your tool calls — it is injected automatically.
However, you MUST be aware of which project is active and confirm it to the user.

### Rule 7 — PROJECT COMMANDS
When user says "list projects" → call \`list_projects\`
When user says "switch to project X" → call \`switch_project\` with the project name/ID
When user says "select project X" → call \`switch_project\`

---

## Tool Capabilities

### Project Management (NEW)
- \`list_projects\`  — List all projects with resource counts
- \`switch_project\` — Switch to a different project by name or ID

### Research
- \`research\` — Unified deep research. Primary research tool.

### Planning
- \`generate_plan\`     — Create structured plan. Must show before executing.
- \`update_plan\`       — Refine plan after feedback
- \`approve_plan\`      — Record user approval
- \`finalize_execution\` — Record completion + Cloudinary uploads

### Images
- \`upload_image\` — Upload URL → Cloudinary CDN → permanent HTTPS URL

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
- \`benchmark_model\`      — Record scores + generate report
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
Rich Markdown with headings, tables, code blocks. Always confirm created entities with IDs.
When a plan is generated, present it clearly and ask for approval before proceeding.`

// ─── Build Final System Prompt ─────────────────────────────────────────────────

async function buildSystemPrompt(
  currentProjectId?: string | null,
  extraContext?: string
): Promise<string> {
  const files = await loadActiveAgentFiles()
  const parts: string[] = []

  // 1. Base system prompt or custom system files
  if (files.system.length > 0) {
    parts.push(files.system.join("\n\n"))
  } else {
    parts.push(BASE_SYSTEM_PROMPT)
  }

  // 2. ── PROJECT CONTEXT INJECTION (CRITICAL) ──────────────────────────────
  // This is the key fix: inject the current project ID prominently in the
  // system prompt so the agent always knows which project is active.
  if (currentProjectId) {
    try {
      const project = await prisma.project.findUnique({
        where: { id: currentProjectId },
        select: { id: true, name: true, type: true, description: true, _count: { select: { datasets: true, experiments: true, documentation: true, roadmapSteps: true, notes: true } } },
      })
      if (project) {
        parts.push(`---\n## CURRENT PROJECT CONTEXT

> **IMPORTANT**: You are currently operating in project **"${project.name}"**.
> ALL create/search/roadmap/experiment/dataset/note operations are automatically scoped to this project.
> You do NOT need to specify projectId in tool calls — it is injected automatically.

- **Project Name**: ${project.name}
- **Project ID**: \`${project.id}\`
- **Project Type**: ${project.type}
- **Description**: ${project.description || "No description"}
- **Resources**:
  - Datasets: ${project._count.datasets}
  - Experiments: ${project._count.experiments}
  - Documents: ${project._count.documentation}
  - Roadmap Steps: ${project._count.roadmapSteps}
  - Notes: ${project._count.notes}

When the user creates anything, it will be linked to **${project.name}** automatically.
When searching, results will be filtered to **${project.name}** first.

If the user wants to switch projects, call the \`switch_project\` tool.`)
      }
    } catch {
      // DB unavailable — include basic context without DB lookup
      parts.push(`---\n## CURRENT PROJECT CONTEXT\n\n> **Active Project ID**: \`${currentProjectId}\`\n> All operations are scoped to this project automatically.`)
    }
  } else {
    parts.push(`---\n## PROJECT CONTEXT\n\n> **No project selected.** Operations will NOT be scoped to any project (global scope).
> To select a project, call \`list_projects\` to see available projects, then \`switch_project\`.
> Or the user can type # in the chat to select a project from the dropdown.`)
  }

  // 3. Active rules files
  if (files.rules.length > 0) {
    parts.push("---\n## Active Rules\n\n" + files.rules.join("\n\n---\n\n"))
  }

  // 4. Active tools files
  if (files.tools.length > 0) {
    parts.push("---\n## Tool Configurations\n\n" + files.tools.join("\n\n---\n\n"))
  }

  // 5. Workflow-specific context
  if (extraContext) {
    parts.push("---\n## Active Workflow Context\n\n" + extraContext)
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
  upload_image:             "Uploading image to Cloudinary",
  // NEW: Project management
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
  if (/upload.*image|image.*cloudinary/i.test(message)) return "Uploading image to Cloudinary..."
  if (/search|find|look up/i.test(message)) return "Searching knowledge base..."
  return "Agent thinking..."
}

// ─── Main Agent Runner ────────────────────────────────────────────────────────

export function runAgent(options: AgentOptions): ReadableStream<Uint8Array> {
  const { message, history, provider, model, systemContext, currentProjectId } = options
  const encoder = new TextEncoder()

  function evt(payload: object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history.slice(-14),
    { role: "user", content: message },
  ]

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const initialStatus = detectWorkflowIntent(message)
        controller.enqueue(evt({ type: "status", text: initialStatus, step: 0 }))

        // Build system prompt — injects current project context
        const systemPrompt = await buildSystemPrompt(currentProjectId, systemContext)

        // Use project-scoped tools so projectId is auto-injected
        const tools = buildProjectScopedTools(currentProjectId)

        const aiModel = await getModel(provider, model)
        let stepNum = 0

        const result = streamText({
          model: aiModel,
          system: systemPrompt,
          messages,
          tools,
          stopWhen: stepCountIs(20),
          maxRetries: 1,
          temperature: 0.65,
        })

        for await (const chunk of result.fullStream) {
          try {
            if (chunk.type === "tool-call") {
              stepNum++
              const label = TOOL_LABELS[chunk.toolName] || `Calling ${chunk.toolName}`
              controller.enqueue(evt({ type: "tool_call", tool: chunk.toolName, text: label, args: chunk.input, step: stepNum }))
            }
            if (chunk.type === "tool-result") {
              const resultPreview = typeof chunk.output === "object"
                ? JSON.stringify(chunk.output).slice(0, 200)
                : String(chunk.output ?? "").slice(0, 200)

              // Check for switch_project action — emit special event for UI
              if (chunk.toolName === "switch_project" && typeof chunk.output === "object") {
                const output = chunk.output as Record<string, unknown>
                if (output.__action === "SWITCH_PROJECT" && output.__projectId) {
                  controller.enqueue(evt({
                    type: "project_switch",
                    projectId: output.__projectId,
                    projectName: output.__projectName,
                    text: `Switched to project: ${output.__projectName}`,
                  }))
                }
              }

              controller.enqueue(evt({ type: "tool_result", tool: chunk.toolName, text: `${TOOL_LABELS[chunk.toolName] || chunk.toolName} complete`, result: chunk.output, resultPreview, step: stepNum }))
              controller.enqueue(evt({ type: "status", text: "Analysing results...", step: stepNum }))
            }
            if (chunk.type === "text-delta" && chunk.text) {
              controller.enqueue(evt({ type: "text", text: chunk.text }))
            }
          } catch { /* ignore serialization errors */ }
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

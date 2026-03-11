/**
 * Prausdit Research Lab — OpenClaw-Compatible Agent Tools (v6)
 *
 * All tools execute through Prisma only — no shell access, no arbitrary
 * filesystem access. Security boundary enforced here.
 *
 * Tool registry follows OpenClaw's tool schema pattern:
 *   - Typed parameters (Zod)
 *   - Descriptive docstrings for LLM tool selection
 *   - Structured JSON returns
 *   - Error-safe execution
 */

import { tool } from "ai"
import { z } from "zod"
import { prisma } from "./prisma"

// ─── Helper: strip HTML for web content ─────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 8000)
}

// ─── 1. Knowledge Graph / RAG Search ─────────────────────────────────────────

export const searchInternalDocs = tool({
  description:
    "Search the internal knowledge base including documentation pages, experiments, datasets, notes, and roadmap steps. Use this to find existing research, avoid duplicates, and retrieve context before creating new content. Supports full-text search across all CRM entities.",
  inputSchema: z.object({
    query: z.string().describe("Search query (keywords or natural language phrases)"),
    sources: z
      .array(z.enum(["docs", "experiments", "datasets", "notes", "roadmap", "models"]))
      .optional()
      .describe("Which sources to search. Omit to search all."),
    limit: z.number().int().min(1).max(10).optional().default(4),
  }),
  execute: async ({ query, sources, limit = 4 }) => {
    const searchAll = !sources || sources.length === 0
    const results: Record<string, unknown[]> = {}

    try {
      if (searchAll || sources?.includes("docs")) {
        const docs = await prisma.documentationPage.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { content: { contains: query, mode: "insensitive" } },
              { section: { contains: query, mode: "insensitive" } },
              { tags: { hasSome: query.split(" ") } },
            ],
          },
          select: { id: true, title: true, slug: true, section: true, content: true, tags: true, progress: true, updatedAt: true },
          take: limit,
          orderBy: { updatedAt: "desc" },
        })
        results.documentation = docs.map((d) => ({
          ...d,
          content: d.content.slice(0, 1000) + (d.content.length > 1000 ? "…" : ""),
        }))
      }

      if (searchAll || sources?.includes("experiments")) {
        const exps = await prisma.experiment.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { baseModel: { contains: query, mode: "insensitive" } },
              { method: { contains: query, mode: "insensitive" } },
              { resultSummary: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true, name: true, status: true, baseModel: true,
            description: true, resultSummary: true, method: true,
            evalLoss: true, evalAccuracy: true, bleuScore: true, pass1Score: true,
            createdAt: true,
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        })
        results.experiments = exps
      }

      if (searchAll || sources?.includes("datasets")) {
        const ds = await prisma.dataset.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { tags: { hasSome: query.split(" ") } },
            ],
          },
          select: {
            id: true, name: true, datasetType: true, description: true,
            numSamples: true, preprocessStatus: true, format: true, license: true,
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        })
        results.datasets = ds
      }

      if (searchAll || sources?.includes("notes")) {
        const notes = await prisma.note.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { content: { contains: query, mode: "insensitive" } },
              { tags: { hasSome: query.split(" ") } },
            ],
          },
          select: { id: true, title: true, content: true, tags: true, pinned: true, updatedAt: true },
          take: limit,
          orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        })
        results.notes = notes.map((n) => ({
          ...n,
          content: n.content.slice(0, 600) + (n.content.length > 600 ? "…" : ""),
        }))
      }

      if (searchAll || sources?.includes("roadmap")) {
        const steps = await prisma.roadmapStep.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { milestone: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true, title: true, phase: true, status: true,
            description: true, progressPercent: true, milestone: true, priority: true,
          },
          take: limit,
          orderBy: { phase: "asc" },
        })
        results.roadmap = steps
      }

      if (searchAll || sources?.includes("models")) {
        const models = await prisma.modelVersion.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { version: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true, name: true, version: true, description: true,
            bleuScore: true, pass1Score: true, humanEval: true, mmluScore: true,
            quantization: true, isDeployed: true,
          },
          take: limit,
          orderBy: { createdAt: "desc" },
        })
        results.models = models
      }

      const totalFound = Object.values(results).reduce((acc, arr) => acc + arr.length, 0)
      return { query, totalFound, results }
    } catch (err) {
      return { query, totalFound: 0, results: {}, error: String(err) }
    }
  },
})

export const getKnowledgeGraph = tool({
  description:
    "Retrieve a knowledge graph showing relationships between CRM entities. Returns datasets linked to experiments, experiments linked to models, and roadmap steps with tasks. Use this for research autopilot workflows to understand the full project context.",
  inputSchema: z.object({
    includeMetrics: z.boolean().optional().default(false).describe("Include benchmark metrics in model nodes"),
  }),
  execute: async ({ includeMetrics = false }) => {
    try {
      const [experiments, datasets, roadmapPhases, models, recentNotes] = await Promise.all([
        prisma.experiment.findMany({
          select: {
            id: true, name: true, status: true, baseModel: true, method: true,
            datasetId: true, evalLoss: true, evalAccuracy: true,
            modelVersions: { select: { id: true, name: true, version: true } },
          },
          take: 20,
          orderBy: { createdAt: "desc" },
        }),
        prisma.dataset.findMany({
          select: { id: true, name: true, datasetType: true, numSamples: true, preprocessStatus: true },
          take: 20,
          orderBy: { createdAt: "desc" },
        }),
        prisma.roadmapStep.findMany({
          select: {
            id: true, title: true, phase: true, status: true, progressPercent: true, priority: true,
            tasks: { select: { id: true, title: true, completed: true } },
          },
          orderBy: { phase: "asc" },
          take: 30,
        }),
        prisma.modelVersion.findMany({
          select: {
            id: true, name: true, version: true, isDeployed: true, quantization: true,
            ...(includeMetrics ? { bleuScore: true, pass1Score: true, humanEval: true, mmluScore: true } : {}),
          },
          take: 10,
          orderBy: { createdAt: "desc" },
        }),
        prisma.note.findMany({
          select: { id: true, title: true, tags: true },
          take: 10,
          orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        }),
      ])

      return {
        summary: {
          totalExperiments: experiments.length,
          totalDatasets: datasets.length,
          totalRoadmapSteps: roadmapPhases.length,
          totalModels: models.length,
          recentNoteCount: recentNotes.length,
        },
        nodes: { experiments, datasets, roadmapSteps: roadmapPhases, models, recentNotes },
        relationships: experiments.map((e) => ({
          experimentId: e.id,
          experimentName: e.name,
          datasetId: e.datasetId,
          linkedModels: e.modelVersions.map((m) => m.id),
        })),
      }
    } catch (err) {
      return { error: String(err) }
    }
  },
})

// ─── 2. Documentation Tools ───────────────────────────────────────────────────

export const readDocument = tool({
  description: "Read the full content of a specific documentation page by its slug.",
  inputSchema: z.object({
    slug: z.string().describe("The documentation page slug (e.g. 'slm-training-pipeline')"),
  }),
  execute: async ({ slug }) => {
    try {
      const page = await prisma.documentationPage.findUnique({ where: { slug } })
      if (!page) return { error: `No documentation page found with slug "${slug}"` }
      return { id: page.id, title: page.title, slug: page.slug, section: page.section, content: page.content, tags: page.tags, progress: page.progress }
    } catch (err) {
      return { error: String(err) }
    }
  },
})

export const createDocument = tool({
  description:
    "Create a new documentation page in the Prausdit Research Lab knowledge base. Use for /document commands, auto-documentation after experiments, and research reports. Write comprehensive, technical content — not placeholders.",
  inputSchema: z.object({
    title: z.string().describe("Page title"),
    slug: z.string().describe("URL slug (kebab-case, unique)"),
    section: z.string().describe("Section category (e.g. 'Research', 'Architecture', 'Training', 'Benchmarks', 'Datasets')"),
    content: z.string().describe("Full documentation content in Markdown with headings, code blocks, tables, etc. Be comprehensive."),
    tags: z.array(z.string()).optional().describe("Relevant tags"),
    progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional().default("COMPLETED"),
  }),
  execute: async ({ title, slug, section, content, tags, progress }) => {
    try {
      const existing = await prisma.documentationPage.findUnique({ where: { slug } })
      if (existing) {
        const newSlug = `${slug}-${Date.now()}`
        const page = await prisma.documentationPage.create({
          data: { title, slug: newSlug, section, content, tags: tags || [], order: 99, progress: progress ?? "COMPLETED" },
        })
        return { success: true, id: page.id, slug: page.slug, note: "Slug was taken — used unique alternative" }
      }
      const page = await prisma.documentationPage.create({
        data: { title, slug, section, content, tags: tags || [], order: 99, progress: progress ?? "COMPLETED" },
      })
      return { success: true, id: page.id, slug: page.slug, title: page.title }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateDocument = tool({
  description: "Update an existing documentation page by its slug. Use for incremental improvements, adding benchmark results, or updating research findings.",
  inputSchema: z.object({
    slug: z.string().describe("The slug of the page to update"),
    title: z.string().optional(),
    content: z.string().optional(),
    section: z.string().optional(),
    tags: z.array(z.string()).optional(),
    progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).optional(),
  }),
  execute: async ({ slug, ...updates }) => {
    try {
      const page = await prisma.documentationPage.update({ where: { slug }, data: updates })
      return { success: true, id: page.id, slug: page.slug }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

// ─── 3. Research Notes ────────────────────────────────────────────────────────

export const createNote = tool({
  description: "Create a new research note. Use for /note commands, research findings summaries, web research summaries, and saving important discoveries.",
  inputSchema: z.object({
    title: z.string().describe("Note title"),
    content: z.string().describe("Note content in Markdown. Be detailed and include sources/references."),
    tags: z.array(z.string()).optional(),
    pinned: z.boolean().optional().default(false),
  }),
  execute: async ({ title, content, tags, pinned }) => {
    try {
      const note = await prisma.note.create({ data: { title, content, tags: tags || [], pinned: pinned ?? false } })
      return { success: true, id: note.id, title: note.title }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateNote = tool({
  description: "Update an existing research note by its ID.",
  inputSchema: z.object({
    id: z.string().describe("Note ID"),
    title: z.string().optional(),
    content: z.string().optional(),
    tags: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const note = await prisma.note.update({ where: { id }, data: updates })
      return { success: true, id: note.id, title: note.title }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

// ─── 4. Roadmap Autopilot ────────────────────────────────────────────────────

export const createRoadmapStep = tool({
  description: "Create a new roadmap step/phase entry. Use for /roadmap commands and research autopilot workflows. Always check existing phases first.",
  inputSchema: z.object({
    title: z.string().describe("Step title"),
    phase: z.number().int().describe("Phase number (1, 2, 3, ...)"),
    description: z.string().describe("Detailed description of this roadmap step"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().default("MEDIUM"),
    milestone: z.string().optional().describe("Milestone name or goal"),
    tasks: z.array(z.string()).optional().describe("List of task titles for this step"),
    estimatedCompletion: z.string().optional().describe("ISO date string for estimated completion"),
  }),
  execute: async ({ title, phase, description, priority, milestone, tasks, estimatedCompletion }) => {
    try {
      const step = await prisma.roadmapStep.create({
        data: {
          title, phase, description,
          priority: priority ?? "MEDIUM",
          milestone, status: "PENDING", order: 99,
          estimatedCompletion: estimatedCompletion ? new Date(estimatedCompletion) : undefined,
          tasks: tasks ? { create: tasks.map((t) => ({ title: t, completed: false })) } : undefined,
        },
        include: { tasks: true },
      })
      return { success: true, id: step.id, phase: step.phase, title: step.title, tasksCreated: step.tasks.length }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateRoadmapStep = tool({
  description: "Update an existing roadmap step. Use for marking milestones complete, updating progress, or changing priority after research findings.",
  inputSchema: z.object({
    id: z.string().describe("Roadmap step ID"),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
    progressPercent: z.number().min(0).max(100).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    milestone: z.string().optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const step = await prisma.roadmapStep.update({ where: { id }, data: updates })
      return { success: true, id: step.id, title: step.title, status: step.status, progressPercent: step.progressPercent }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const completeRoadmapTask = tool({
  description: "Mark a specific roadmap task as completed within a roadmap step.",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the roadmap task to complete"),
  }),
  execute: async ({ taskId }) => {
    try {
      const task = await prisma.roadmapTask.update({ where: { id: taskId }, data: { completed: true } })
      return { success: true, taskId: task.id, title: task.title }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

// ─── 5. Experiment Planning & Intelligence ─────────────────────────────────────

export const createExperiment = tool({
  description: "Create a new ML experiment entry. Use for /experiment commands and experiment planning workflows. Include all relevant hyperparameters.",
  inputSchema: z.object({
    name: z.string().describe("Experiment name"),
    baseModel: z.string().describe("Base model (e.g. 'TinyLlama/TinyLlama-1.1B-Chat-v1.0')"),
    description: z.string().optional(),
    method: z.string().optional().describe("Training method (e.g. 'LoRA', 'QLoRA', 'full fine-tune', 'GRPO')"),
    loraRank: z.number().optional().describe("LoRA rank (r parameter)"),
    loraAlpha: z.number().optional().describe("LoRA alpha scaling"),
    batchSize: z.number().optional(),
    learningRate: z.number().optional(),
    epochs: z.number().optional(),
    datasetId: z.string().optional().describe("ID of the dataset to use"),
    config: z.record(z.unknown()).optional().describe("Additional config as JSON"),
  }),
  execute: async ({ name, baseModel, description, method, loraRank, loraAlpha, batchSize, learningRate, epochs, datasetId, config }) => {
    try {
      const exp = await prisma.experiment.create({
        data: { name, baseModel, description, method, status: "PENDING", loraRank, loraAlpha, batchSize, learningRate, epochs, datasetId, config },
      })
      return { success: true, id: exp.id, name: exp.name }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateExperiment = tool({
  description: "Update an existing experiment. Use to record results, update status, or add result summaries after analysis.",
  inputSchema: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
    resultSummary: z.string().optional().describe("Narrative summary of results and conclusions"),
    evalLoss: z.number().optional(),
    evalAccuracy: z.number().optional(),
    bleuScore: z.number().optional(),
    pass1Score: z.number().optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const exp = await prisma.experiment.update({ where: { id }, data: updates })
      return { success: true, id: exp.id, name: exp.name, status: exp.status }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

// ─── 6. Dataset Intelligence ─────────────────────────────────────────────────

export const createDataset = tool({
  description: "Create a new dataset entry in the lab. Use for /dataset commands and dataset intelligence workflows. Include full metadata.",
  inputSchema: z.object({
    name: z.string(),
    description: z.string().optional(),
    datasetType: z.enum(["CODE", "TEXT", "INSTRUCTION", "QA", "MIXED"]),
    numSamples: z.number().optional(),
    format: z.string().optional().describe("e.g. 'JSONL', 'CSV', 'Parquet', 'Arrow'"),
    sourceUrl: z.string().optional(),
    tags: z.array(z.string()).optional(),
    license: z.string().optional().describe("e.g. 'Apache-2.0', 'MIT', 'CC-BY-4.0'"),
  }),
  execute: async ({ name, description, datasetType, numSamples, format, sourceUrl, tags, license }) => {
    try {
      const ds = await prisma.dataset.create({
        data: { name, description, datasetType, numSamples, format, sourceUrl, tags: tags || [], license, preprocessStatus: "RAW" },
      })
      return { success: true, id: ds.id, name: ds.name }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateDataset = tool({
  description: "Update an existing dataset. Use to update preprocessing status, add sample counts, or improve descriptions after dataset analysis.",
  inputSchema: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    preprocessStatus: z.enum(["RAW", "CLEANING", "CLEANED", "FORMATTED", "AUGMENTED", "READY"]).optional(),
    numSamples: z.number().optional(),
    tags: z.array(z.string()).optional(),
    format: z.string().optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const ds = await prisma.dataset.update({ where: { id }, data: updates })
      return { success: true, id: ds.id, name: ds.name }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

// ─── 7. Model Benchmarking ────────────────────────────────────────────────────

export const benchmarkModel = tool({
  description:
    "Record benchmark results for a model version and generate a benchmark report. Use when a model has been evaluated. Creates a structured benchmark documentation page and updates model metrics.",
  inputSchema: z.object({
    modelVersionId: z.string().describe("ID of the ModelVersion to benchmark"),
    bleuScore: z.number().optional().describe("BLEU score (0-100)"),
    pass1Score: z.number().optional().describe("HumanEval pass@1 score (0-100)"),
    humanEval: z.number().optional().describe("Human evaluation score (0-100)"),
    mmluScore: z.number().optional().describe("MMLU benchmark score (0-100)"),
    benchmarkNotes: z.string().optional().describe("Qualitative notes about benchmark results"),
    generateReport: z.boolean().optional().default(true).describe("Whether to auto-generate a benchmark documentation page"),
  }),
  execute: async ({ modelVersionId, bleuScore, pass1Score, humanEval, mmluScore, benchmarkNotes, generateReport }) => {
    try {
      const model = await prisma.modelVersion.update({
        where: { id: modelVersionId },
        data: { bleuScore, pass1Score, humanEval, mmluScore },
      })

      let docResult = null
      if (generateReport) {
        const slug = `benchmark-${model.name.toLowerCase().replace(/\s+/g, "-")}-${model.version}-${Date.now()}`
        const reportContent = `# Benchmark Report: ${model.name} v${model.version}

## Overview
Model: **${model.name}** (version ${model.version})
Quantization: ${model.quantization || "None"}
Deployment Status: ${model.isDeployed ? "✅ Deployed" : "⏳ Not deployed"}

## Benchmark Results

| Metric | Score |
|--------|-------|
| BLEU Score | ${bleuScore !== undefined ? bleuScore.toFixed(2) : "N/A"} |
| HumanEval pass@1 | ${pass1Score !== undefined ? pass1Score.toFixed(2) : "N/A"} |
| Human Evaluation | ${humanEval !== undefined ? humanEval.toFixed(2) : "N/A"} |
| MMLU | ${mmluScore !== undefined ? mmluScore.toFixed(2) : "N/A"} |

## Analysis
${benchmarkNotes || "No qualitative notes provided."}

## Ranking Context
This report was automatically generated by the Prausdit Lab Agent.
Generated: ${new Date().toISOString()}
`
        const doc = await prisma.documentationPage.create({
          data: {
            title: `Benchmark: ${model.name} v${model.version}`,
            slug,
            section: "Benchmarks",
            content: reportContent,
            tags: ["benchmark", "model", model.name, model.version],
            order: 99,
            progress: "COMPLETED",
          },
        })
        docResult = { docId: doc.id, docSlug: doc.slug }
      }

      return {
        success: true,
        modelId: model.id,
        name: model.name,
        version: model.version,
        metrics: { bleuScore, pass1Score, humanEval, mmluScore },
        report: docResult,
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const getModelLeaderboard = tool({
  description: "Retrieve the model leaderboard sorted by benchmark metrics. Use this to rank models and compare performance.",
  inputSchema: z.object({
    sortBy: z.enum(["bleuScore", "pass1Score", "humanEval", "mmluScore"]).optional().default("pass1Score"),
    limit: z.number().int().min(1).max(20).optional().default(10),
  }),
  execute: async ({ sortBy = "pass1Score", limit = 10 }) => {
    try {
      const models = await prisma.modelVersion.findMany({
        where: { [sortBy]: { not: null } },
        select: {
          id: true, name: true, version: true, quantization: true, isDeployed: true,
          bleuScore: true, pass1Score: true, humanEval: true, mmluScore: true,
          parameterCount: true, createdAt: true,
          experiment: { select: { id: true, name: true, baseModel: true } },
        },
        orderBy: { [sortBy]: "desc" },
        take: limit,
      })
      return { leaderboard: models, sortedBy: sortBy, total: models.length }
    } catch (err) {
      return { error: String(err) }
    }
  },
})

// ─── 8. Web Research ─────────────────────────────────────────────────────────

export const crawlWeb = tool({
  description:
    "Fetch and read a public web page for research purposes. Use to retrieve papers, documentation, GitHub READMEs, or current research. Limit to 2 URLs per turn.",
  inputSchema: z.object({
    url: z.string().url().describe("Full HTTPS URL to fetch"),
    reason: z.string().optional().describe("Why you are fetching this URL"),
  }),
  execute: async ({ url, reason: _reason }) => {
    if (!url.startsWith("https://")) return { error: "Only HTTPS URLs are allowed" }
    const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "169.254.", "::1", "metadata.google", "169.254.169.254", "instance-data"]
    if (blocked.some((b) => url.includes(b))) return { error: "Access to local/private addresses is blocked" }

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Prausdit-LabBot/2.0 (Research AI Assistant; +https://prausdit.app)",
          Accept: "text/html,text/plain,application/json,text/markdown",
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}`, url }

      const contentType = res.headers.get("content-type") || ""
      const raw = await res.text()

      let text: string
      if (contentType.includes("application/json")) {
        try { text = JSON.stringify(JSON.parse(raw), null, 2).slice(0, 8000) } catch { text = raw.slice(0, 8000) }
      } else if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
        text = raw.slice(0, 8000)
      } else {
        text = stripHtml(raw)
      }

      const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : url

      return { url, title, content: text, length: text.length }
    } catch (err) {
      return { error: String(err), url }
    }
  },
})

// ─── 9. Workflow Orchestration ────────────────────────────────────────────────

export const analyzeDatasetIntelligence = tool({
  description:
    "Analyze a dataset and produce intelligence: quality assessment, sample statistics, documentation, and experiment suggestions. This is the Dataset Intelligence automation workflow.",
  inputSchema: z.object({
    datasetId: z.string().describe("ID of the dataset to analyze"),
  }),
  execute: async ({ datasetId }) => {
    try {
      const ds = await prisma.dataset.findUnique({
        where: { id: datasetId },
        include: { experiments: { select: { id: true, name: true, status: true, baseModel: true } } },
      })
      if (!ds) return { error: "Dataset not found" }

      // Get related documentation
      const relatedDocs = await prisma.documentationPage.findMany({
        where: { OR: [{ title: { contains: ds.name, mode: "insensitive" } }, { tags: { hasSome: ds.tags } }] },
        select: { id: true, title: true, slug: true },
        take: 3,
      })

      return {
        dataset: {
          id: ds.id, name: ds.name, type: ds.datasetType,
          numSamples: ds.numSamples, format: ds.format,
          preprocessStatus: ds.preprocessStatus, tags: ds.tags,
          description: ds.description, license: ds.license,
        },
        linkedExperiments: ds.experiments,
        relatedDocumentation: relatedDocs,
        analysisContext: {
          hasExperiments: ds.experiments.length > 0,
          isReady: ds.preprocessStatus === "READY",
          sampleCount: ds.numSamples || "unknown",
        },
      }
    } catch (err) {
      return { error: String(err) }
    }
  },
})

export const runResearchAutopilot = tool({
  description:
    "Execute a full research autopilot workflow for a given topic. Performs knowledge graph search, identifies gaps, and returns a structured research plan with specific actions to take. Use for 'start research for X' commands.",
  inputSchema: z.object({
    topic: z.string().describe("Research topic (e.g. 'mobile-optimized SLM models', 'quantization techniques')"),
    scope: z.array(z.enum(["roadmap", "experiments", "datasets", "documentation", "notes"])).optional().describe("Which areas to cover in the research plan"),
  }),
  execute: async ({ topic, scope }) => {
    const targetScopes = scope || ["roadmap", "experiments", "datasets", "documentation", "notes"]

    try {
      // Build context from existing knowledge
      const existing = await Promise.all([
        targetScopes.includes("experiments") ? prisma.experiment.findMany({
          where: { OR: [{ name: { contains: topic, mode: "insensitive" } }, { description: { contains: topic, mode: "insensitive" } }] },
          select: { id: true, name: true, status: true }, take: 5,
        }) : [],
        targetScopes.includes("datasets") ? prisma.dataset.findMany({
          where: { OR: [{ name: { contains: topic, mode: "insensitive" } }, { description: { contains: topic, mode: "insensitive" } }] },
          select: { id: true, name: true, datasetType: true }, take: 5,
        }) : [],
        targetScopes.includes("documentation") ? prisma.documentationPage.findMany({
          where: { OR: [{ title: { contains: topic, mode: "insensitive" } }, { content: { contains: topic, mode: "insensitive" } }] },
          select: { id: true, title: true, slug: true }, take: 5,
        }) : [],
        targetScopes.includes("roadmap") ? prisma.roadmapStep.findMany({
          where: { OR: [{ title: { contains: topic, mode: "insensitive" } }, { description: { contains: topic, mode: "insensitive" } }] },
          select: { id: true, title: true, status: true, phase: true }, take: 5,
        }) : [],
      ])

      const [experiments, datasets, docs, roadmapSteps] = existing

      return {
        topic,
        existingContext: {
          experiments: experiments.map((e: { id: string; name: string; status: string }) => ({ id: e.id, name: e.name, status: e.status })),
          datasets: datasets.map((d: { id: string; name: string; datasetType: string }) => ({ id: d.id, name: d.name, type: d.datasetType })),
          documentation: docs.map((d: { id: string; title: string; slug: string }) => ({ id: d.id, title: d.title, slug: d.slug })),
          roadmapSteps: roadmapSteps.map((r: { id: string; title: string; status: string; phase: number }) => ({ id: r.id, title: r.title, status: r.status, phase: r.phase })),
        },
        gaps: {
          needsExperiments: experiments.length === 0,
          needsDatasets: datasets.length === 0,
          needsDocumentation: docs.length === 0,
          needsRoadmapEntry: roadmapSteps.length === 0,
        },
        recommendation: `Based on existing context, focus on: ${[
          experiments.length === 0 ? "creating experiments" : "building on existing experiments",
          datasets.length === 0 ? "sourcing datasets" : "leveraging existing datasets",
          docs.length === 0 ? "writing documentation" : "updating documentation",
          roadmapSteps.length === 0 ? "adding roadmap entries" : "updating roadmap progress",
        ].join(", ")}.`,
      }
    } catch (err) {
      return { error: String(err), topic }
    }
  },
})

// ─── Tool registry ────────────────────────────────────────────────────────────

export const agentTools = {
  // Knowledge & RAG
  search_internal_docs: searchInternalDocs,
  get_knowledge_graph: getKnowledgeGraph,
  // Documentation
  read_document: readDocument,
  create_document: createDocument,
  update_document: updateDocument,
  // Notes
  create_note: createNote,
  update_note: updateNote,
  // Roadmap Autopilot
  create_roadmap_step: createRoadmapStep,
  update_roadmap_step: updateRoadmapStep,
  complete_roadmap_task: completeRoadmapTask,
  // Experiments
  create_experiment: createExperiment,
  update_experiment: updateExperiment,
  // Datasets
  create_dataset: createDataset,
  update_dataset: updateDataset,
  analyze_dataset: analyzeDatasetIntelligence,
  // Model Benchmarking
  benchmark_model: benchmarkModel,
  get_model_leaderboard: getModelLeaderboard,
  // Web Research
  crawl_web: crawlWeb,
  // Workflow Orchestration
  run_research_autopilot: runResearchAutopilot,
} as const

export type AgentToolName = keyof typeof agentTools

/**
 * Prausdit Research Lab — Agent Tools
 *
 * All tools execute through existing API routes / Prisma — no shell access,
 * no arbitrary filesystem access.  Security boundary is enforced here.
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
    .slice(0, 6000)
}

// ─── Internal Knowledge Tools ────────────────────────────────────────────────

export const searchInternalDocs = tool({
  description:
    "Search the internal knowledge base including documentation pages, experiments, datasets, notes, and roadmap steps. Use this to find existing research, context, or reference material before creating new content.",
  parameters: z.object({
    query: z.string().describe("Search query (keywords or phrases)"),
    sources: z
      .array(z.enum(["docs", "experiments", "datasets", "notes", "roadmap"]))
      .optional()
      .describe("Which sources to search. Omit to search all."),
  }),
  execute: async ({ query, sources }) => {
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
            ],
          },
          select: { id: true, title: true, slug: true, section: true, content: true, tags: true },
          take: 4,
        })
        results.documentation = docs.map((d) => ({
          ...d,
          content: d.content.slice(0, 800) + (d.content.length > 800 ? "…" : ""),
        }))
      }

      if (searchAll || sources?.includes("experiments")) {
        const exps = await prisma.experiment.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { baseModel: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, status: true, baseModel: true, description: true, resultSummary: true },
          take: 4,
        })
        results.experiments = exps
      }

      if (searchAll || sources?.includes("datasets")) {
        const ds = await prisma.dataset.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, datasetType: true, description: true, numSamples: true },
          take: 4,
        })
        results.datasets = ds
      }

      if (searchAll || sources?.includes("notes")) {
        const notes = await prisma.note.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { content: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, title: true, content: true, tags: true },
          take: 4,
          orderBy: { pinned: "desc" },
        })
        results.notes = notes.map((n) => ({
          ...n,
          content: n.content.slice(0, 500) + (n.content.length > 500 ? "…" : ""),
        }))
      }

      if (searchAll || sources?.includes("roadmap")) {
        const steps = await prisma.roadmapStep.findMany({
          where: {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
            ],
          },
          select: { id: true, title: true, phase: true, status: true, description: true, progressPercent: true },
          take: 4,
        })
        results.roadmap = steps
      }

      const totalFound = Object.values(results).reduce((acc, arr) => acc + arr.length, 0)
      return { query, totalFound, results }
    } catch (err) {
      return { query, totalFound: 0, results: {}, error: String(err) }
    }
  },
})

export const readDocument = tool({
  description: "Read the full content of a specific documentation page by its slug.",
  parameters: z.object({
    slug: z.string().describe("The documentation page slug (e.g. 'slm-training-pipeline')"),
  }),
  execute: async ({ slug }) => {
    try {
      const page = await prisma.documentationPage.findUnique({ where: { slug } })
      if (!page) return { error: `No documentation page found with slug "${slug}"` }
      return {
        id: page.id,
        title: page.title,
        slug: page.slug,
        section: page.section,
        content: page.content,
        tags: page.tags,
        progress: page.progress,
      }
    } catch (err) {
      return { error: String(err) }
    }
  },
})

// ─── Create Tools ─────────────────────────────────────────────────────────────

export const createDocument = tool({
  description:
    "Create a new documentation page in the Prausdit Research Lab knowledge base. Use this when the user requests /document or asks to write documentation.",
  parameters: z.object({
    title: z.string().describe("Page title"),
    slug: z.string().describe("URL slug (kebab-case, unique)"),
    section: z.string().describe("Section category (e.g. 'Research', 'Architecture', 'Training')"),
    content: z
      .string()
      .describe("Full documentation content in Markdown or HTML with headings, code blocks, etc."),
    tags: z.array(z.string()).optional().describe("Relevant tags"),
  }),
  execute: async ({ title, slug, section, content, tags }) => {
    try {
      const existing = await prisma.documentationPage.findUnique({ where: { slug } })
      if (existing) {
        const newSlug = `${slug}-${Date.now()}`
        const page = await prisma.documentationPage.create({
          data: { title, slug: newSlug, section, content, tags: tags || [], order: 99 },
        })
        return { success: true, id: page.id, slug: page.slug, note: "Slug was taken — used unique alternative" }
      }
      const page = await prisma.documentationPage.create({
        data: { title, slug, section, content, tags: tags || [], order: 99 },
      })
      return { success: true, id: page.id, slug: page.slug, title: page.title }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateDocument = tool({
  description: "Update an existing documentation page by its slug.",
  parameters: z.object({
    slug: z.string().describe("The slug of the page to update"),
    title: z.string().optional(),
    content: z.string().optional(),
    section: z.string().optional(),
    tags: z.array(z.string()).optional(),
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

export const createNote = tool({
  description:
    "Create a new research note. Use this when the user requests /note or asks to save research notes.",
  parameters: z.object({
    title: z.string().describe("Note title"),
    content: z.string().describe("Note content in Markdown"),
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

export const createRoadmapStep = tool({
  description:
    "Create a new roadmap step/phase entry. Use this when the user requests /roadmap.",
  parameters: z.object({
    title: z.string().describe("Step title"),
    phase: z.number().int().describe("Phase number (1, 2, 3, ...)"),
    description: z.string().describe("Detailed description of this roadmap step"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().default("MEDIUM"),
    milestone: z.string().optional().describe("Milestone name or goal"),
    tasks: z.array(z.string()).optional().describe("List of task titles for this step"),
  }),
  execute: async ({ title, phase, description, priority, milestone, tasks }) => {
    try {
      const step = await prisma.roadmapStep.create({
        data: {
          title,
          phase,
          description,
          priority: priority ?? "MEDIUM",
          milestone,
          status: "PENDING",
          order: 99,
          tasks: tasks
            ? { create: tasks.map((t) => ({ title: t, completed: false })) }
            : undefined,
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
  description: "Update an existing roadmap step by its ID.",
  parameters: z.object({
    id: z.string().describe("Roadmap step ID"),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]).optional(),
    progressPercent: z.number().min(0).max(100).optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const step = await prisma.roadmapStep.update({ where: { id }, data: updates })
      return { success: true, id: step.id, title: step.title }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const createExperiment = tool({
  description:
    "Create a new ML experiment entry. Use this when the user requests /experiment.",
  parameters: z.object({
    name: z.string().describe("Experiment name"),
    baseModel: z.string().describe("Base model (e.g. 'TinyLlama/TinyLlama-1.1B-Chat-v1.0')"),
    description: z.string().optional(),
    method: z.string().optional().describe("Training method (e.g. 'LoRA', 'QLoRA', 'full fine-tune')"),
    loraRank: z.number().optional(),
    loraAlpha: z.number().optional(),
    batchSize: z.number().optional(),
    learningRate: z.number().optional(),
    epochs: z.number().optional(),
  }),
  execute: async ({ name, baseModel, description, method, loraRank, loraAlpha, batchSize, learningRate, epochs }) => {
    try {
      const exp = await prisma.experiment.create({
        data: { name, baseModel, description, method, status: "PENDING", loraRank, loraAlpha, batchSize, learningRate, epochs },
      })
      return { success: true, id: exp.id, name: exp.name }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const updateExperiment = tool({
  description: "Update an existing experiment by its ID.",
  parameters: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
    resultSummary: z.string().optional(),
    evalLoss: z.number().optional(),
    evalAccuracy: z.number().optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const exp = await prisma.experiment.update({ where: { id }, data: updates })
      return { success: true, id: exp.id }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

export const createDataset = tool({
  description:
    "Create a new dataset entry in the lab. Use this when the user requests /dataset.",
  parameters: z.object({
    name: z.string(),
    description: z.string().optional(),
    datasetType: z.enum(["CODE", "TEXT", "INSTRUCTION", "QA", "MIXED"]),
    numSamples: z.number().optional(),
    format: z.string().optional().describe("e.g. 'JSONL', 'CSV', 'Parquet'"),
    sourceUrl: z.string().optional(),
    tags: z.array(z.string()).optional(),
    license: z.string().optional(),
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
  description: "Update an existing dataset by its ID.",
  parameters: z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    preprocessStatus: z.enum(["RAW", "CLEANING", "CLEANED", "FORMATTED", "AUGMENTED", "READY"]).optional(),
    numSamples: z.number().optional(),
  }),
  execute: async ({ id, ...updates }) => {
    try {
      const ds = await prisma.dataset.update({ where: { id }, data: updates })
      return { success: true, id: ds.id }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

// ─── Web Crawling Tool ────────────────────────────────────────────────────────

export const crawlWeb = tool({
  description:
    "Fetch and read a public web page. Use this to retrieve current documentation, research papers, GitHub READMEs, or any publicly accessible URL.",
  parameters: z.object({
    url: z.string().url().describe("The full URL to fetch (must start with https://)"),
    reason: z.string().optional().describe("Why you are fetching this URL"),
  }),
  execute: async ({ url, reason: _reason }) => {
    // Security: only allow https, block private/local IPs
    if (!url.startsWith("https://")) {
      return { error: "Only HTTPS URLs are allowed" }
    }
    const blocked = [
      "localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.", "172.",
      "169.254.", "::1", "metadata.google", "169.254.169.254",
    ]
    if (blocked.some((b) => url.includes(b))) {
      return { error: "Access to local/private addresses is blocked" }
    }

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Prausdit-LabBot/1.0 (Research AI Assistant)",
          Accept: "text/html,text/plain,application/json",
        },
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}`, url }

      const contentType = res.headers.get("content-type") || ""
      const raw = await res.text()

      let text: string
      if (contentType.includes("application/json")) {
        try {
          text = JSON.stringify(JSON.parse(raw), null, 2).slice(0, 6000)
        } catch {
          text = raw.slice(0, 6000)
        }
      } else if (contentType.includes("text/plain") || contentType.includes("text/markdown")) {
        text = raw.slice(0, 6000)
      } else {
        text = stripHtml(raw)
      }

      // Extract title
      const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : url

      return { url, title, content: text, length: text.length }
    } catch (err) {
      return { error: String(err), url }
    }
  },
})

// ─── Export all tools as a map ────────────────────────────────────────────────

export const agentTools = {
  search_internal_docs: searchInternalDocs,
  read_document: readDocument,
  create_document: createDocument,
  update_document: updateDocument,
  create_note: createNote,
  create_roadmap_step: createRoadmapStep,
  update_roadmap_step: updateRoadmapStep,
  create_experiment: createExperiment,
  update_experiment: updateExperiment,
  create_dataset: createDataset,
  update_dataset: updateDataset,
  crawl_web: crawlWeb,
} as const

export type AgentToolName = keyof typeof agentTools

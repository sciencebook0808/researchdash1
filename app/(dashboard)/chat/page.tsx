"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Send, User, Loader2, Trash2, ChevronDown, Code,
  FileText, Zap, X, Cpu, Globe, ChevronUp,
  Search, Wrench, CheckCircle2, BrainCircuit, Plus,
  MessageSquare, Lock, Users, MoreHorizontal, Pencil, Eye,
  EyeOff, ArrowLeft, Copy, RotateCcw, ChevronRight,
  FolderOpen, Hash, ExternalLink, Layers,
  FlaskConical, WifiOff, RefreshCw,
} from "lucide-react"
import { MarkdownRenderer }   from "@/components/chat/markdown-renderer"
import { SourcesList }        from "@/components/chat/sources-list"
import { useCurrentUser }     from "@/components/auth/auth-guard"
import { useProject, Project } from "@/components/project/project-context"
import { ModelBadge }         from "@/components/chatbot/model-badge"
import {
  FileUploadButton,
  AttachedFilesBar,
  MessageFileCard,
} from "@/components/chat/file-upload-button"
import { useAgentStream }     from "@/lib/hooks/use-agent-stream"
import type {
  AgentStep,
  AgentEvent,
  Message,
  ChatModel,
  ChatSession,
  RoutingMode,
  AttachedFile,
  MessageAttachment,
} from "@/types/chat"
import {
  GEMINI_MODELS,
  AUTO_ROUTING_MODELS,
  SLASH_COMMANDS,
  modelSupportsFiles,
} from "@/types/chat"

// ─── Task Strip ───────────────────────────────────────────────────────────────

function TaskStrip({ steps, isStreaming, currentStatus }: {
  steps: AgentStep[]
  isStreaming: boolean
  currentStatus: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const activeSteps = steps.filter(s => s.type === "tool_call" || s.type === "tool_result")
  if (activeSteps.length === 0 && !isStreaming) return null
  const completedCount = activeSteps.filter(s => s.type === "tool_result").length
  const totalCount     = Math.ceil(activeSteps.length / 2)
  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isStreaming
            ? <Loader2 className="w-4 h-4 animate-spin text-amber-400 flex-shrink-0" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
          <span className="text-[12px] text-foreground font-medium truncate">
            {isStreaming && currentStatus ? currentStatus : `${completedCount} task${completedCount !== 1 ? "s" : ""} completed`}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {totalCount > 0 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalCount, 6) }).map((_, i) => (
                <div key={i} className={cn("w-2 h-2 rounded-full transition-colors", i < completedCount ? "bg-emerald-400" : "bg-muted-foreground/30")} />
              ))}
              {totalCount > 6 && <span className="text-[10px] text-muted-foreground ml-1">+{totalCount - 6}</span>}
            </div>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expanded && activeSteps.length > 0 && (
        <div className="mt-2 rounded-lg border border-border bg-card overflow-hidden max-h-48 overflow-y-auto">
          {activeSteps.map(step => {
            const Icon = step.tool ? (TOOL_ICONS[step.tool] || Wrench) : BrainCircuit
            const isComplete = step.type === "tool_result"
            return (
              <div key={step.id} className={cn("flex items-center gap-2 px-4 py-2 text-[12px] border-b border-border/50 last:border-0", isComplete ? "text-emerald-400/80" : "text-muted-foreground")}>
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Icon className="w-3.5 h-3.5" />}
                </div>
                <span className={cn("flex-1 truncate", isComplete && "line-through opacity-70")}>{step.text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Tool Icon Map ─────────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, React.ElementType> = {
  search_internal_docs:   Search,
  get_knowledge_graph:    Layers,
  read_document:          FileText,
  create_document:        FileText,
  update_document:        FileText,
  create_note:            FileText,
  update_note:            FileText,
  create_roadmap_step:    Zap,
  update_roadmap_step:    Zap,
  complete_roadmap_task:  CheckCircle2,
  create_experiment:      FlaskConical,
  update_experiment:      FlaskConical,
  create_dataset:         Cpu,
  update_dataset:         Cpu,
  analyze_dataset:        Cpu,
  benchmark_model:        Zap,
  get_model_leaderboard:  Zap,
  crawl_web:              Globe,
  run_research_autopilot: Search,
  research:               Search,
  generate_plan:          FileText,
  update_plan:            FileText,
  approve_plan:           CheckCircle2,
  finalize_execution:     CheckCircle2,
  generate_image:         Code,
  upload_image:           Globe,
  list_projects:          FolderOpen,
  switch_project:         FolderOpen,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHostname(url: string): string {
  try { return new URL(url).hostname.replace("www.", "") }
  catch { return url }
}

const PROVIDER_COLORS: Record<string, string> = {
  tavily:        "text-blue-400 bg-blue-500/10 border-blue-500/20",
  exa:           "text-violet-400 bg-violet-500/10 border-violet-500/20",
  serpapi:       "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  firecrawl:     "text-orange-400 bg-orange-500/10 border-orange-500/20",
  "crawl4ai":    "text-amber-400 bg-amber-500/10 border-amber-500/20",
  "basic-fetch": "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResultItem {
  title: string; url: string; snippet: string; content?: string; score?: number
}
interface ResearchToolResult {
  query: string; provider: string; crawlProvider?: string
  crawledCount: number; resultCount: number; summary: string
  sources: string[]; results: SearchResultItem[]; error?: string
}

const SEARCH_TOOLS  = new Set(["research", "crawl_web", "run_research_autopilot"])
const CREATE_TOOLS  = new Set(["create_document","create_note","create_roadmap_step","create_experiment","create_dataset"])
const UPDATE_TOOLS  = new Set(["update_document","update_note","update_roadmap_step","update_experiment","update_dataset","complete_roadmap_task"])
const PLAN_TOOLS    = new Set(["generate_plan","update_plan","approve_plan","finalize_execution"])
const PROJECT_TOOLS = new Set(["list_projects","switch_project"])
const IMAGE_TOOLS   = new Set(["generate_image","upload_image"])
const MODEL_TOOLS   = new Set(["benchmark_model","get_model_leaderboard"])
const KB_TOOLS      = new Set(["search_internal_docs","get_knowledge_graph","run_research_autopilot"])

// ── Source Card ───────────────────────────────────────────────────────────────

function SourceCard({ result, index, crawled }: { result: SearchResultItem; index: number; crawled: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hostname   = getHostname(result.url)
  const hasContent = !!result.content && result.content.length > 0
  return (
    <div className={cn("rounded-lg border transition-all overflow-hidden", expanded ? "border-amber-500/30 bg-amber-500/3" : "border-border/50 bg-card/40 hover:border-border/80")}>
      <div className="flex items-start gap-2 p-2">
        <div className="w-5 h-5 rounded flex-shrink-0 bg-muted/50 flex items-center justify-center mt-0.5 overflow-hidden">
          <img src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`} alt="" className="w-3.5 h-3.5" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1 mb-0.5">
            <span className="text-[9px] font-bold text-muted-foreground/40 flex-shrink-0 mt-0.5 w-3">{index+1}</span>
            <a href={result.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] font-medium text-foreground hover:text-amber-400 transition-colors leading-tight line-clamp-1 flex-1">{result.title || hostname}</a>
            <a href={result.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex-shrink-0 p-0.5 rounded hover:bg-accent"><ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30" /></a>
          </div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[9px] text-muted-foreground/40 truncate max-w-[120px]">{hostname}</span>
            {crawled && <span className="text-[8px] px-1 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 flex-shrink-0">crawled</span>}
            {result.score !== undefined && <span className="text-[9px] text-muted-foreground/30 flex-shrink-0">{(result.score*100).toFixed(0)}%</span>}
          </div>
          {result.snippet && <p className="text-[10px] text-muted-foreground/80 leading-relaxed line-clamp-2">{result.snippet}</p>}
        </div>
      </div>
      {hasContent && (
        <>
          <button onClick={() => setExpanded(v=>!v)} className="w-full flex items-center gap-1 px-2.5 py-1 border-t border-border/30 hover:bg-muted/20 transition-colors text-left">
            <ChevronRight className={cn("w-2.5 h-2.5 text-muted-foreground/40 transition-transform flex-shrink-0", expanded && "rotate-90")} />
            <span className="text-[9px] text-muted-foreground/50">{expanded ? "Hide" : "Show"} extracted content</span>
            <span className="ml-auto text-[9px] text-muted-foreground/30">{result.content!.length.toLocaleString()} chars</span>
          </button>
          {expanded && (
            <div className="px-3 py-2 border-t border-border/20 bg-muted/10 max-h-40 overflow-y-auto">
              <pre className="text-[9px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">{result.content}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Search Results Panel ──────────────────────────────────────────────────────

function SearchResultsPanel({ step }: { step: AgentStep }) {
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen]       = useState(true)
  const raw = step.result as Record<string,unknown> | null
  if (!raw) return null

  if (step.tool === "crawl_web") {
    const url   = raw.url   as string|undefined
    const title = raw.title as string|undefined
    const body  = raw.content as string|undefined
    const err   = raw.error as string|undefined
    return (
      <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/20 border-b border-border/30">
          <Globe className="w-3 h-3 text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-medium text-foreground flex-1 truncate">{title || url || "Web page"}</span>
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="p-0.5 rounded hover:bg-accent"><ExternalLink className="w-2.5 h-2.5 text-muted-foreground/40" /></a>}
          <span className="text-[9px] text-blue-400/60 border border-blue-500/20 bg-blue-500/5 px-1 py-0.5 rounded">fetched</span>
        </div>
        <div className="px-2.5 py-2">
          {err ? <p className="text-[10px] text-red-400">{err}</p>
            : body ? <pre className="text-[9px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">{body.slice(0,1200)}{body.length>1200?"\n…":""}</pre>
            : <p className="text-[10px] text-muted-foreground/50">No content extracted</p>}
        </div>
      </div>
    )
  }

  const r = raw as unknown as ResearchToolResult
  if (!r.results?.length && !r.error) return null
  const pc = PROVIDER_COLORS[r.provider] || "text-muted-foreground bg-muted/30 border-border"
  const crawledSet = new Set(r.results?.filter(x=>x.content).map(x=>x.url)||[])
  const visible = showAll ? (r.results||[]) : (r.results||[]).slice(0,4)

  return (
    <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
      <button onClick={()=>setOpen(v=>!v)} className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-muted/20 hover:bg-muted/30 transition-colors border-b border-border/30">
        <Search className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
        <span className="text-[10px] font-medium text-foreground flex-1 text-left">
          {r.resultCount||r.results?.length||0} sources
          {r.query && <span className="text-muted-foreground/60 font-normal"> · "{r.query.slice(0,35)}{r.query.length>35?"…":""}"</span>}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={cn("text-[8px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wide", pc)}>{r.provider}</span>
          {(r.crawledCount||0)>0 && <span className="text-[8px] px-1 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">{r.crawledCount} crawled</span>}
          {open ? <ChevronUp className="w-2.5 h-2.5 text-muted-foreground/40"/> : <ChevronDown className="w-2.5 h-2.5 text-muted-foreground/40"/>}
        </div>
      </button>
      {open && (
        <div className="p-2 space-y-1">
          {r.error && <p className="text-[10px] text-red-400 px-1">{r.error}</p>}
          {visible.map((res,i) => <SourceCard key={res.url+i} result={res} index={i} crawled={crawledSet.has(res.url)} />)}
          {(r.results?.length||0)>4 && (
            <button onClick={()=>setShowAll(v=>!v)} className="w-full text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors py-0.5 text-center">
              {showAll ? "Show less" : `Show ${(r.results?.length||0)-4} more sources`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Entity Created Card ───────────────────────────────────────────────────────

function EntityCreatedCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw || !raw.success) return null
  const id    = raw.id   as string|undefined
  const name  = (raw.title||raw.name||raw.slug||raw.executionTitle) as string|undefined
  const phase = raw.phase as number|undefined
  const tasks = raw.tasksCreated as number|undefined
  const pid   = raw.projectId as string|undefined
  const toolColors: Record<string,string> = {
    create_document:     "text-blue-400  border-blue-500/20  bg-blue-500/5",
    create_note:         "text-amber-400 border-amber-500/20 bg-amber-500/5",
    create_roadmap_step: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    create_experiment:   "text-violet-400 border-violet-500/20 bg-violet-500/5",
    create_dataset:      "text-orange-400 border-orange-500/20 bg-orange-500/5",
    finalize_execution:  "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    generate_plan:       "text-amber-400 border-amber-500/20 bg-amber-500/5",
    approve_plan:        "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    benchmark_model:     "text-violet-400 border-violet-500/20 bg-violet-500/5",
  }
  const colorClass = (step.tool && toolColors[step.tool]) || "text-muted-foreground border-border bg-muted/20"
  const Icon = step.tool ? (TOOL_ICONS[step.tool]||CheckCircle2) : CheckCircle2
  return (
    <div className={cn("mt-1.5 rounded-lg border px-2.5 py-2 flex items-start gap-2", colorClass)}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {name && <p className="text-[11px] font-medium text-foreground leading-snug truncate">{name}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
          {id    && <span className="text-[9px] text-muted-foreground/50 font-mono">id: {id.slice(0,16)}…</span>}
          {phase !== undefined && <span className="text-[9px] text-muted-foreground/60">Phase {phase}</span>}
          {tasks !== undefined && tasks > 0 && <span className="text-[9px] text-muted-foreground/60">{tasks} tasks</span>}
          {pid   && <span className="text-[9px] text-muted-foreground/40 font-mono">proj: {pid.slice(0,10)}…</span>}
        </div>
      </div>
      <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
    </div>
  )
}

// ── Image Result Card ─────────────────────────────────────────────────────────

function ImageResultCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw || !raw.success) return null
  const url   = raw.cloudinaryUrl as string|undefined
  const model = raw.model         as string|undefined
  const bytes = raw.bytes         as number|undefined
  if (!url) return null
  return (
    <div className="mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/3 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-amber-500/10">
        <Code className="w-3 h-3 text-amber-400 flex-shrink-0" />
        <span className="text-[10px] font-medium text-amber-300 flex-1 truncate">Image generated</span>
        {model && <span className="text-[9px] text-amber-400/50 truncate max-w-[120px]">{model.split("/").pop()}</span>}
        {bytes && <span className="text-[9px] text-muted-foreground/40">{(bytes/1024).toFixed(0)} KB</span>}
        <a href={url} target="_blank" rel="noopener noreferrer" className="p-0.5 rounded hover:bg-amber-500/10"><ExternalLink className="w-2.5 h-2.5 text-amber-400/50" /></a>
      </div>
      <div className="p-2">
        <img src={url} alt="Agent-generated" className="rounded max-h-48 max-w-full object-contain mx-auto" onError={e => { (e.target as HTMLImageElement).style.display="none" }} />
        <p className="mt-1 text-[9px] text-muted-foreground/40 font-mono truncate px-1">{url}</p>
      </div>
    </div>
  )
}

// ── Project Result Card ───────────────────────────────────────────────────────

function ProjectResultCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw || !raw.success) return null
  if (step.tool === "switch_project" && raw.switchedTo) {
    const p = raw.switchedTo as Record<string,unknown>
    return (
      <div className="mt-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-foreground truncate">{p.name as string}</p>
            <p className="text-[9px] text-muted-foreground/50 font-mono">{p.type as string} · id: {(p.id as string).slice(0,14)}…</p>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-500/20 bg-emerald-500/10 flex-shrink-0">active</span>
        </div>
      </div>
    )
  }
  if (step.tool === "list_projects") {
    const projects = raw.projects as Record<string,unknown>[]|undefined
    const total    = raw.totalProjects as number|undefined
    return (
      <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/20 border-b border-border/30">
          <FolderOpen className="w-3 h-3 text-amber-400/70" />
          <span className="text-[10px] font-medium text-foreground">{total||0} projects</span>
        </div>
        <div className="p-2 space-y-1">
          {(projects||[]).slice(0,6).map((p,i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded border border-border/30 bg-muted/10">
              <FolderOpen className="w-2.5 h-2.5 text-amber-400/50 flex-shrink-0" />
              <span className="text-[10px] text-foreground flex-1 truncate">{p.name as string}</span>
              <span className="text-[8px] text-muted-foreground/40">{p.type as string}</span>
            </div>
          ))}
          {(total||0)>6 && <p className="text-[9px] text-muted-foreground/40 text-center">+{(total||0)-6} more</p>}
        </div>
      </div>
    )
  }
  return null
}

// ── Model Result Card ─────────────────────────────────────────────────────────

function ModelResultCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw || !raw.success) return null
  if (step.tool === "benchmark_model") {
    const m = raw.metrics as Record<string,number|undefined>|undefined
    return (
      <div className="mt-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-2.5 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Zap className="w-3 h-3 text-violet-400 flex-shrink-0" />
          <span className="text-[10px] font-medium text-foreground">{raw.name as string} v{raw.version as string}</span>
          <span className="ml-auto text-[9px] text-violet-400/60">benchmarked</span>
        </div>
        {m && (
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(m).filter(([,v])=>v!==undefined).map(([k,v]) => (
              <div key={k} className="flex items-center justify-between px-1.5 py-0.5 rounded bg-muted/20 border border-border/30">
                <span className="text-[9px] text-muted-foreground/60">{k.replace("Score","")}</span>
                <span className="text-[10px] font-mono text-violet-300">{(v as number).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (step.tool === "get_model_leaderboard") {
    const lb = raw.leaderboard as Record<string,unknown>[]|undefined
    return (
      <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
        <div className="px-2.5 py-1.5 bg-muted/20 border-b border-border/30 flex items-center gap-2">
          <Zap className="w-3 h-3 text-amber-400/70" />
          <span className="text-[10px] font-medium">Leaderboard · {lb?.length||0} models</span>
        </div>
        <div className="p-2 space-y-1">
          {(lb||[]).slice(0,5).map((m,i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1 rounded border border-border/30 bg-muted/10">
              <span className="text-[9px] font-bold text-muted-foreground/40 w-3">{i+1}</span>
              <span className="text-[10px] text-foreground flex-1 truncate">{m.name as string}</span>
              {m.pass1Score !== undefined && <span className="text-[9px] font-mono text-violet-300">{(m.pass1Score as number).toFixed(2)}</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

// ── KB Result Card ────────────────────────────────────────────────────────────

function KBResultCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw) return null
  if (step.tool === "search_internal_docs") {
    const total   = raw.totalFound as number|undefined
    const results = raw.results as Record<string,unknown[]>|undefined
    const scoped  = raw.scopedToProject as string|undefined
    if (!total && !results) return null
    const sections = Object.entries(results||{}).filter(([,arr])=>arr.length>0)
    return (
      <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/20 border-b border-border/30">
          <Search className="w-3 h-3 text-amber-400/70" />
          <span className="text-[10px] font-medium">{total||0} results in KB</span>
          {scoped && scoped !== "all" && <span className="text-[9px] text-amber-400/50 border border-amber-500/20 px-1 rounded">{scoped.slice(0,10)}</span>}
        </div>
        {sections.length > 0 && (
          <div className="p-2 space-y-1">
            {sections.map(([section, items]) => (
              <div key={section}>
                <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mb-0.5">{section}</p>
                {(items as Record<string,unknown>[]).slice(0,3).map((item,i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/10 border border-border/20 mb-0.5">
                    <FileText className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                    <span className="text-[10px] text-foreground flex-1 truncate">{(item.title||item.name||item.slug) as string}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (step.tool === "get_knowledge_graph") {
    const summary = raw.summary as Record<string,number>|undefined
    const scoped  = raw.scopedToProject as string|undefined
    if (!summary) return null
    return (
      <div className="mt-1.5 rounded-lg border border-border/50 px-2.5 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <Layers className="w-3 h-3 text-amber-400/70" />
          <span className="text-[10px] font-medium text-foreground">Knowledge Graph</span>
          {scoped && scoped !== "all" && <span className="text-[9px] text-muted-foreground/40 ml-auto">{scoped.slice(0,12)}</span>}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Object.entries(summary).map(([k,v]) => (
            <div key={k} className="text-center px-1 py-1 rounded bg-muted/20 border border-border/30">
              <p className="text-[13px] font-bold text-foreground">{v}</p>
              <p className="text-[8px] text-muted-foreground/50 capitalize">{k.replace("total","").replace(/([A-Z])/g," $1").trim()}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

// ── Plan Result Card ──────────────────────────────────────────────────────────

function PlanResultCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw || !raw.success) return null
  if (step.tool === "generate_plan") {
    const sections = raw.sections as Array<{heading:string;stepsCount:number}>|undefined
    return (
      <div className="mt-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-amber-500/10">
          <FileText className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] font-medium text-amber-300 flex-1 truncate">{raw.title as string}</span>
          <span className="text-[9px] text-amber-400/60 border border-amber-500/20 px-1 py-0.5 rounded">awaiting approval</span>
        </div>
        {sections && (
          <div className="p-2 space-y-0.5">
            {sections.map((s,i) => (
              <div key={i} className="flex items-center gap-2 px-1.5 py-0.5">
                <span className="text-[9px] font-bold text-amber-400/50 w-4">{i+1}.</span>
                <span className="text-[10px] text-foreground flex-1">{s.heading}</span>
                <span className="text-[9px] text-muted-foreground/40">{s.stepsCount} steps</span>
              </div>
            ))}
          </div>
        )}
        <p className="px-2.5 pb-2 text-[9px] text-amber-400/60 italic">Reply "approve" to execute</p>
      </div>
    )
  }
  if (step.tool === "approve_plan") {
    return (
      <div className="mt-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2 flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-[10px] text-emerald-300 font-medium">Plan approved — executing now…</span>
      </div>
    )
  }
  if (step.tool === "finalize_execution") {
    const entities = raw.createdEntities as Array<{type:string;title:string;id:string}>|undefined
    const uploads  = raw.cloudinaryUploads as Array<{cloudinaryUrl:string}>|undefined
    const title    = raw.executionTitle as string|undefined
    return (
      <div className="mt-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-emerald-500/10">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="text-[10px] font-medium text-emerald-300 flex-1 truncate">{title||"Execution complete"}</span>
          {entities && <span className="text-[9px] text-emerald-400/60">{entities.length} created</span>}
        </div>
        {entities && entities.length > 0 && (
          <div className="p-2 space-y-0.5">
            {entities.map((e,i) => (
              <div key={i} className="flex items-center gap-2 px-1.5 py-0.5 rounded bg-emerald-500/5">
                <span className="text-[8px] text-emerald-400/50 uppercase w-16 flex-shrink-0">{e.type}</span>
                <span className="text-[10px] text-foreground flex-1 truncate">{e.title}</span>
                <span className="text-[8px] font-mono text-muted-foreground/30">{e.id.slice(0,8)}</span>
              </div>
            ))}
          </div>
        )}
        {uploads && uploads.length > 0 && (
          <div className="px-2.5 pb-2">
            <p className="text-[9px] text-muted-foreground/50 mb-1">Uploaded images:</p>
            {uploads.map((u,i) => (
              <a key={i} href={u.cloudinaryUrl} target="_blank" rel="noopener noreferrer" className="block text-[9px] font-mono text-amber-400/60 hover:text-amber-400 truncate">{u.cloudinaryUrl}</a>
            ))}
          </div>
        )}
      </div>
    )
  }
  return null
}

// ── Generic Result Card ───────────────────────────────────────────────────────

function GenericResultCard({ step }: { step: AgentStep }) {
  const raw = step.result as Record<string,unknown>|null
  if (!raw) return null
  if (raw.success === false && raw.error) {
    return (
      <div className="mt-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2 flex items-start gap-2">
        <X className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-red-400 leading-relaxed">{String(raw.error)}</p>
      </div>
    )
  }
  if (raw.success === true && (raw.id || raw.taskId)) {
    const name = (raw.title||raw.name||raw.slug) as string|undefined
    const id   = (raw.id||raw.taskId) as string|undefined
    return (
      <div className="mt-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
        {name && <span className="text-[10px] text-foreground flex-1 truncate">{name}</span>}
        {id && <span className="text-[9px] font-mono text-muted-foreground/40">id:{id.slice(0,10)}…</span>}
        <span className="text-[9px] text-emerald-400/60">updated</span>
      </div>
    )
  }
  return null
}

// ── Master Tool Result Dispatcher ─────────────────────────────────────────────

function ToolResultCard({ step }: { step: AgentStep }) {
  if (step.type !== "tool_result" || !step.tool) return null
  const tool = step.tool
  if (SEARCH_TOOLS.has(tool))  return <SearchResultsPanel step={step} />
  if (KB_TOOLS.has(tool))      return <KBResultCard step={step} />
  if (IMAGE_TOOLS.has(tool))   return <ImageResultCard step={step} />
  if (PROJECT_TOOLS.has(tool)) return <ProjectResultCard step={step} />
  if (MODEL_TOOLS.has(tool))   return <ModelResultCard step={step} />
  if (PLAN_TOOLS.has(tool))    return <PlanResultCard step={step} />
  if (CREATE_TOOLS.has(tool))  return <EntityCreatedCard step={step} />
  return <GenericResultCard step={step} />
}

// ── Agent Step Item ───────────────────────────────────────────────────────────

function AgentStepItem({ step }: { step: AgentStep }) {
  const Icon = step.tool ? (TOOL_ICONS[step.tool] || Wrench) : BrainCircuit
  const isComplete = step.type === "tool_result"
  return (
    <div className="py-1">
      <div className={cn("flex items-center gap-2 text-[11px]", isComplete ? "text-emerald-400/80" : "text-muted-foreground")}>
        <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
          {isComplete ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Icon className="w-3.5 h-3.5" />}
        </div>
        <span className="flex-1 leading-relaxed">{step.text}</span>
        {isComplete && step.tool && <span className="text-[9px] text-muted-foreground/30 flex-shrink-0">{step.tool}</span>}
      </div>
      {isComplete && <ToolResultCard step={step} />}
    </div>
  )
}

// ── Agent Steps Panel ─────────────────────────────────────────────────────────

function AgentStepsPanel({ steps, expanded, onToggle }: { steps: AgentStep[]; expanded: boolean; onToggle: () => void }) {
  if (steps.length === 0) return null
  return (
    <div className="mt-2 rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors text-left">
        <BrainCircuit className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
        <span className="text-[10px] text-muted-foreground font-medium flex-1">{steps.length} agent step{steps.length !== 1 ? "s" : ""}</span>
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>
      {expanded && <div className="px-3 pb-2 border-t border-border/30">{steps.map(s => <AgentStepItem key={s.id} step={s} />)}</div>}
    </div>
  )
}

// ── Reasoning Panel ───────────────────────────────────────────────────────────

function ReasoningPanel({ reasoning, expanded, onToggle }: { reasoning: string; expanded: boolean; onToggle: () => void }) {
  if (!reasoning) return null
  return (
    <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-500/10 transition-colors text-left">
        <ChevronRight className={cn("w-3 h-3 text-blue-400/70 flex-shrink-0 transition-transform", expanded && "rotate-90")} />
        <span className="text-[10px] text-blue-400/80 font-medium flex-1">Reasoning</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-blue-500/10">
          <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{reasoning}</p>
        </div>
      )}
    </div>
  )
}

// ── Tool Execution Indicator ──────────────────────────────────────────────────

function ToolExecutionIndicator({ step }: { step: AgentStep }) {
  const Icon      = step.tool ? (TOOL_ICONS[step.tool] || Wrench) : Wrench
  const isComplete= step.type === "tool_result"
  const isSearch  = !!(step.tool && SEARCH_TOOLS.has(step.tool))
  let borderColor = isComplete ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-amber-500/5 border-amber-500/20 text-amber-400"
  if (isSearch) borderColor = isComplete ? "bg-blue-500/5 border-blue-500/20 text-blue-400" : "bg-amber-500/5 border-amber-500/20 text-amber-400"
  const raw          = step.result as Record<string,unknown>|null
  const resultCount  = raw?.resultCount as number|undefined
  const provider     = raw?.provider    as string|undefined
  return (
    <div className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border", borderColor)}>
      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      </div>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium truncate">{step.tool || "tool"}</span>
      {isSearch && isComplete && resultCount !== undefined && <span className="text-[9px] text-blue-400/70">{resultCount} results</span>}
      {isSearch && isComplete && provider && <span className="text-[9px] px-1 py-0.5 rounded border border-current/20 ml-auto opacity-60">{provider}</span>}
      {!isComplete && <span className="text-[10px] opacity-60 ml-auto">{isSearch ? "searching…" : "running…"}</span>}
    </div>
  )
}

// ── Message Actions ───────────────────────────────────────────────────────────

function MessageActions({
  message, onCopy, onEdit, onResend, isEditing, setIsEditing,
}: {
  message: Message; onCopy: () => void; onEdit: (c: string) => void; onResend: () => void; isEditing: boolean; setIsEditing: (v: boolean) => void
}) {
  const [editValue, setEditValue] = useState(message.content)
  const [copied, setCopied]       = useState(false)
  useEffect(() => { if (isEditing) setEditValue(message.content) }, [isEditing, message.content])
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true); onCopy()
    setTimeout(() => setCopied(false), 1500)
  }
  if (isEditing && message.role === "user") {
    return (
      <div className="mt-2 space-y-2">
        <textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-[13px] text-foreground outline-none focus:border-amber-500/40 resize-none" rows={3} autoFocus />
        <div className="flex items-center gap-2">
          <button onClick={() => { onEdit(editValue); setIsEditing(false) }} className="px-3 py-1.5 rounded-md bg-amber-500 text-black text-[12px] font-medium hover:bg-amber-400 transition-colors">Save & Resend</button>
          <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-[12px] font-medium hover:bg-accent transition-colors">Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <div className={cn("flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity", message.role === "user" ? "justify-end" : "justify-start")}>
      <button onClick={handleCopy} className="p-1 rounded hover:bg-accent transition-colors" title="Copy">
        {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {message.role === "user" && (
        <>
          <button onClick={() => setIsEditing(true)} className="p-1 rounded hover:bg-accent transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
          <button onClick={onResend} className="p-1 rounded hover:bg-accent transition-colors" title="Resend"><RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /></button>
        </>
      )}
    </div>
  )
}

// ── Project Badge ─────────────────────────────────────────────────────────────

function ProjectBadge({ project }: { project: Project | null }) {
  if (!project) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-dashed border-border bg-muted/20">
        <Hash className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/50">No project</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-500/30 bg-amber-500/5">
      <FolderOpen className="w-3 h-3 text-amber-400 flex-shrink-0" />
      <span className="text-[11px] text-amber-300 font-medium truncate max-w-[120px]">{project.name}</span>
    </div>
  )
}

// ── # Project Dropdown ────────────────────────────────────────────────────────

function ProjectHashDropdown({ projects, onSelect, onClose }: {
  projects: Project[]; onSelect: (p: Project) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [onClose])
  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Select Project</span>
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {projects.length === 0 && (
          <div className="px-4 py-6 text-center">
            <FolderOpen className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground">No projects found</p>
          </div>
        )}
        {projects.map(p => (
          <button key={p.id} onClick={() => { onSelect(p); onClose() }}
            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-accent transition-colors text-left border-b border-border/30 last:border-0">
            <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{p.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono truncate">{p.id}</p>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground flex-shrink-0">{p.type}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Reconnecting banner ───────────────────────────────────────────────────────

function ReconnectingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
      <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
      <span className="text-[12px] text-amber-300 flex-1">Reconnecting to running agent…</span>
      <button onClick={onDismiss} className="p-1 rounded hover:bg-amber-500/20 transition-colors">
        <X className="w-3.5 h-3.5 text-amber-400" />
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function ModelLabel({ modelId }: { modelId?: string }) {
  if (!modelId) return null
  const shortName = modelId.split("/").pop()?.slice(0, 20) || modelId.slice(0, 20)
  return <span className="text-[10px] text-muted-foreground/50 font-mono">{shortName}</span>
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FullscreenChatPage() {
  const router    = useRouter()
  const appUser   = useCurrentUser()
  const currentUserId = appUser?.clerkId || ""
  const userRole  = appUser?.role || "user"

  const { projects, selectedProject, selectProject } = useProject()

  // ── Core state ────────────────────────────────────────────────────────────

  const [messages,          setMessages]          = useState<Message[]>([])
  const [input,             setInput]             = useState("")
  const [isStreaming,       setIsStreaming]        = useState(false)
  const [isReconnecting,    setIsReconnecting]     = useState(false)
  const [showCommands,      setShowCommands]       = useState(false)
  const [showModelPicker,   setShowModelPicker]    = useState(false)
  const [showHashDropdown,  setShowHashDropdown]   = useState(false)
  const [hashFilter,        setHashFilter]         = useState("")
  const [availableModels,   setAvailableModels]    = useState<ChatModel[]>(GEMINI_MODELS)
  const [selectedModel,     setSelectedModel]      = useState<ChatModel>(GEMINI_MODELS[0])
  const [currentStatus,     setCurrentStatus]      = useState<string | null>(null)
  const [sessions,          setSessions]           = useState<ChatSession[]>([])
  const [activeSessionId,   setActiveSessionId]    = useState<string | null>(null)
  const [sessionsLoading,   setSessionsLoading]    = useState(true)
  const [menuOpen,          setMenuOpen]           = useState<string | null>(null)
  const [renaming,          setRenaming]           = useState<string | null>(null)
  const [renameVal,         setRenameVal]          = useState("")
  const [mobileSidebarOpen, setMobileSidebarOpen]  = useState(false)
  const [autoRoutingConfig, setAutoRoutingConfig]  = useState<{ auto: string[]; autoFree: string[]; autoPaid: string[] } | null>(null)
  const [editingMessageId,  setEditingMessageId]   = useState<string | null>(null)

  // File attachment state
  const [attachedFiles,     setAttachedFiles]      = useState<AttachedFile[]>([])

  const scrollRef      = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)
  const finalAMsgRef   = useRef<Message | null>(null)
  const sendMessageRef = useRef<((text: string) => void) | null>(null)
  const activeAMsgId   = useRef<string | null>(null)

  // Derived
  const filteredProjects = hashFilter
    ? projects.filter(p => p.name.toLowerCase().includes(hashFilter.toLowerCase()))
    : projects

  const canSendFiles = modelSupportsFiles(selectedModel.id, selectedModel.provider)

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, currentStatus])

  // ── Agent stream hook ─────────────────────────────────────────────────────

  const streamCallbacks = {
    onStatus: useCallback((text: string) => {
      setCurrentStatus(text)
    }, []),

    onText: useCallback((delta: string) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== activeAMsgId.current) return m
        const updated = { ...m, content: (m.content || "") + delta, loading: false }
        finalAMsgRef.current = updated
        return updated
      }))
    }, []),

    onToolCall: useCallback((event: AgentEvent) => {
      if (event.text) setCurrentStatus(event.text)
      const step: AgentStep = {
        id:   `tc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "tool_call",
        text: event.text || "",
        tool: event.tool,
        args: event.args,
        step: event.step,
      }
      setMessages(prev => prev.map(m => {
        if (m.id !== activeAMsgId.current) return m
        const updated = { ...m, loading: false, agentSteps: [...(m.agentSteps || []), step] }
        finalAMsgRef.current = updated
        return updated
      }))
    }, []),

    onToolResult: useCallback((event: AgentEvent) => {
      setCurrentStatus(null)
      const step: AgentStep = {
        id:     `tr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type:   "tool_result",
        text:   event.text || "",
        tool:   event.tool,
        result: event.result,
        step:   event.step,
      }
      setMessages(prev => prev.map(m => {
        if (m.id !== activeAMsgId.current) return m
        const updated = { ...m, agentSteps: [...(m.agentSteps || []), step] }
        finalAMsgRef.current = updated
        return updated
      }))
    }, []),

    onProjectSwitch: useCallback((projectId: string, projectName: string) => {
      selectProject(projectId)
      setCurrentStatus(`Switched to: ${projectName}`)
    }, [selectProject]),

    onDone: useCallback(() => {
      setCurrentStatus(null)
      setIsStreaming(false)
      setIsReconnecting(false)
      setMessages(prev => prev.map(m => {
        if (m.id !== activeAMsgId.current) return m
        return { ...m, loading: false }
      }))
    }, []),

    onError: useCallback((text: string) => {
      setCurrentStatus(null)
      setIsStreaming(false)
      setIsReconnecting(false)
      setMessages(prev => prev.map(m => {
        if (m.id !== activeAMsgId.current) return m
        return { ...m, content: m.content || `Error: ${text}`, loading: false }
      }))
    }, []),
  }

  const { send, stop, reconnect, checkStoredJob } = useAgentStream(streamCallbacks)

  // ── Sessions ──────────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res  = await fetch("/api/chat-sessions")
      const data = res.ok ? await res.json() : { sessions: [] }
      const list: ChatSession[] = data.sessions || []
      setSessions(list)
      if (list.length > 0 && !activeSessionId) {
        setActiveSessionId(list[0].id)
        loadSessionMessages(list[0].id)
      }
    } catch { /* ignore */ }
    setSessionsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId])

  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const res  = await fetch(`/api/chat-sessions/${sessionId}/messages`)
      const data = res.ok ? await res.json() : { messages: [] }
      const msgs: Message[] = (data.messages || []).map((m: {
        id: string; role: string; content: string
        metadata?: { agentSteps?: AgentStep[]; attachments?: MessageAttachment[]; jobId?: string }
      }) => ({
        id:           m.id,
        role:         m.role as "user" | "assistant",
        content:      m.content,
        agentSteps:   m.metadata?.agentSteps   || [],
        attachments:  m.metadata?.attachments  || [],
        jobId:        m.metadata?.jobId,
        stepsExpanded: false,
      }))
      setMessages(msgs)

      // After loading messages, check if there is a stored running job
      const stored = checkStoredJob(sessionId)
      if (stored) {
        await attemptReconnect(sessionId)
      }
    } catch { setMessages([]) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkStoredJob])

  // ── Reconnect on load ─────────────────────────────────────────────────────

  const attemptReconnect = useCallback(async (sessionId: string) => {
    setIsReconnecting(true)
    setIsStreaming(true)

    // Create a placeholder assistant message for live updates
    const aMsg: Message = {
      id:       `reconnect-${Date.now()}`,
      role:     "assistant",
      content:  "",
      loading:  true,
      agentSteps: [],
      stepsExpanded: false,
    }
    activeAMsgId.current = aMsg.id
    finalAMsgRef.current = aMsg
    setMessages(prev => [...prev, aMsg])

    const ok = await reconnect(sessionId)
    if (!ok) {
      // Reconnect failed — remove placeholder
      setMessages(prev => prev.filter(m => m.id !== aMsg.id))
      setIsReconnecting(false)
      setIsStreaming(false)
    }
  }, [reconnect])

  // ── Settings load ─────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(async s => {
      if (!s) return
      const ids: string[] = s.selectedOpenRouterModels || []
      let orModels: ChatModel[] = []
      try {
        const res  = await fetch("/api/openrouter-models")
        const data = res.ok ? await res.json() : {}
        if (data.autoRouting) setAutoRoutingConfig(data.autoRouting)
        const allOrModels: Array<{ id: string; name: string; free?: boolean }> = [...(data.free || []), ...(data.pro || [])]
        if (ids.length > 0) {
          orModels = ids.map(id => {
            const found = allOrModels.find(m => m.id === id)
            return {
              id,
              name:          found?.name || id,
              provider:      "openrouter" as const,
              shortName:     (found?.name || id).split("/").pop()?.slice(0, 18) || id,
              free:          found?.free ?? false,
              supportsFiles: modelSupportsFiles(id),
            }
          })
        }
      } catch { /* ignore */ }
      const all = [...AUTO_ROUTING_MODELS, ...GEMINI_MODELS, ...orModels]
      setAvailableModels(all)
      const defProvider = s.defaultProvider || "gemini"
      const defGemini   = s.geminiDefaultModel || "gemini-2.5-flash"
      if (defProvider === "openrouter" && orModels.length > 0) setSelectedModel(orModels[0])
      else setSelectedModel(all.find(m => m.id === defGemini) || GEMINI_MODELS[0])
    }).catch(() => {})
    loadSessions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Command / hash detection ──────────────────────────────────────────────

  useEffect(() => {
    setShowCommands(input.startsWith("/") && !input.includes(" "))
    const hashMatch = input.match(/^#(\w*)$/)
    if (hashMatch) {
      setHashFilter(hashMatch[1] || "")
      setShowHashDropdown(true)
    } else {
      setShowHashDropdown(false)
      setHashFilter("")
    }
  }, [input])

  // ── Session menu close ────────────────────────────────────────────────────

  useEffect(() => {
    function h(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-session-menu]")) setMenuOpen(null)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  // ── Session management ────────────────────────────────────────────────────

  const createSession = useCallback(async () => {
    try {
      const res = await fetch("/api/chat-sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat", visibility: "team", projectId: selectedProject?.id || null }),
      })
      if (!res.ok) return null
      const session: ChatSession = await res.json()
      setSessions(prev => [session, ...prev])
      setActiveSessionId(session.id)
      setMessages([])
      setAttachedFiles([])
      setMobileSidebarOpen(false)
      return session.id
    } catch { return null }
  }, [selectedProject])

  const selectSession = useCallback((id: string) => {
    if (id === activeSessionId) return
    stop()
    setIsStreaming(false)
    setIsReconnecting(false)
    setActiveSessionId(id)
    setMessages([])
    setAttachedFiles([])
    loadSessionMessages(id)
    setMobileSidebarOpen(false)
  }, [activeSessionId, loadSessionMessages, stop])

  const renameSession = useCallback(async (id: string, title: string) => {
    await fetch(`/api/chat-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {})
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`/api/chat-sessions/${id}`, { method: "DELETE" }).catch(() => {})
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id)
      if (remaining.length > 0) { setActiveSessionId(remaining[0].id); loadSessionMessages(remaining[0].id) }
      else { setActiveSessionId(null); setMessages([]) }
    }
  }, [activeSessionId, sessions, loadSessionMessages])

  const changeVisibility = useCallback(async (id: string, vis: "team" | "private") => {
    await fetch(`/api/chat-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility: vis }) }).catch(() => {})
    setSessions(prev => prev.map(s => s.id === id ? { ...s, visibility: vis } : s))
  }, [])

  // ── File attachment management ────────────────────────────────────────────

  const handleFilesAdded = useCallback((newFiles: (AttachedFile & { _replaces?: string })[]) => {
    setAttachedFiles(prev => {
      let next = [...prev]
      for (const file of newFiles) {
        if (file._replaces) {
          // Replace the pending entry with the final result
          const idx = next.findIndex(f => f.id === file._replaces)
          const { _replaces: _, ...clean } = file
          if (idx >= 0) next[idx] = clean
          else next.push(clean)
        } else {
          next.push(file)
        }
      }
      return next
    })
  }, [])

  const handleRemoveFile = useCallback((id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id))
  }, [])

  // ── Toggle helpers ────────────────────────────────────────────────────────

  const toggleSteps = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, stepsExpanded: !m.stepsExpanded } : m))
  }, [])

  const toggleReasoning = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reasoningExpanded: !m.reasoningExpanded } : m))
  }, [])

  const handleCopyMessage = useCallback(() => {}, [])

  const handleEditMessage = useCallback((msgId: string, newContent: string) => {
    const msgIndex = messages.findIndex(m => m.id === msgId)
    if (msgIndex === -1) return
    setMessages(prev => { const u = [...prev]; u[msgIndex] = { ...u[msgIndex], content: newContent }; return u.slice(0, msgIndex + 1) })
    setTimeout(() => { sendMessageRef.current?.(newContent) }, 0)
  }, [messages])

  const handleResendMessage = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg || msg.role !== "user") return
    const msgIndex = messages.findIndex(m => m.id === msgId)
    setMessages(prev => prev.slice(0, msgIndex + 1))
    setTimeout(() => { sendMessageRef.current?.(msg.content) }, 0)
  }, [messages])

  const handleProjectHashSelect = useCallback((project: Project) => {
    selectProject(project.id)
    setInput("")
    setShowHashDropdown(false)
    inputRef.current?.focus()
  }, [selectProject])

  const canManage = (s: ChatSession) =>
    s.creatorId === currentUserId || userRole === "super_admin" || userRole === "admin"

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession()
      if (!sessionId) return
    }

    // Resolve auto routing
    let actualModel: ChatModel = selectedModel
    let actualProvider: "gemini" | "openrouter" = selectedModel.provider
    if (selectedModel.id.startsWith("auto")) {
      const routingKey = selectedModel.id === "auto-free" ? "autoFree" : selectedModel.id === "auto-paid" ? "autoPaid" : "auto"
      const routingList = autoRoutingConfig?.[routingKey] || []
      const resolvedModelId = routingList[0] || (selectedModel.id === "auto-free" ? "deepseek/deepseek-r1:free" : "anthropic/claude-3.7-sonnet")
      actualModel = { ...selectedModel, id: resolvedModelId, shortName: resolvedModelId.split("/").pop()?.slice(0, 18) || resolvedModelId }
      actualProvider = "openrouter"
      setCurrentStatus(`Auto-selecting: ${actualModel.shortName}`)
    }

    // Snapshot current attachments (ready only) and clear the bar
    const readyAttachments = attachedFiles.filter(f => f.status === "ready")
    setAttachedFiles([])

    // Build user message
    const userMsg: Message = {
      id:          Date.now().toString(),
      role:        "user",
      content:     text.trim(),
      attachments: readyAttachments.map(f => ({
        id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, url: f.url!, content: f.content,
      })),
    }
    const aMsg: Message = {
      id:           (Date.now() + 1).toString(),
      role:         "assistant",
      content:      "",
      loading:      true,
      agentSteps:   [],
      stepsExpanded: false,
      modelId:      actualModel.id,
    }
    finalAMsgRef.current  = aMsg
    activeAMsgId.current  = aMsg.id

    setMessages(prev => [...prev, userMsg, aMsg])
    setInput("")
    setIsStreaming(true)
    if (!currentStatus) setCurrentStatus("Agent thinking...")

    // Build history with tool context
    const history = messages.slice(-20).map(m => {
      if (m.role === "assistant" && m.agentSteps && m.agentSteps.length > 0) {
        const toolLines = m.agentSteps
          .filter(s => s.type === "tool_result" && s.tool)
          .map(s => {
            const r = s.result as Record<string, unknown> | null
            if (!r) return `[${s.tool}: done]`
            if (r.id && r.title)  return `[${s.tool}: created "${r.title}" id=${r.id}]`
            if (r.id && r.name)   return `[${s.tool}: created "${r.name}" id=${r.id}]`
            if (r.id && r.slug)   return `[${s.tool}: created slug=${r.slug} id=${r.id}]`
            if (r.switchedTo && typeof r.switchedTo === "object") {
              const p = r.switchedTo as Record<string, unknown>
              return `[${s.tool}: switched to project "${p.name}" id=${p.id}]`
            }
            if (r.totalFound !== undefined) return `[${s.tool}: found ${r.totalFound} results]`
            return `[${s.tool}: done]`
          })
        const toolContext = toolLines.length > 0 ? `<tool_context>\n${toolLines.join("\n")}\n</tool_context>\n\n` : ""
        return { role: m.role as "user" | "assistant", content: toolContext + m.content }
      }
      return { role: m.role as "user" | "assistant", content: m.content }
    })

    // Session memory digest
    const sessionMemoryLines: string[] = []
    messages.forEach(m => {
      if (m.role === "assistant" && m.agentSteps) {
        m.agentSteps.filter(s => s.type === "tool_result" && s.tool).forEach(s => {
          const r = s.result as Record<string, unknown> | null
          if (!r) return
          if (r.id && r.title)  sessionMemoryLines.push(`- ${s.tool}: "${r.title}" (id: ${r.id})`)
          else if (r.id && r.name) sessionMemoryLines.push(`- ${s.tool}: "${r.name}" (id: ${r.id})`)
          else if (r.id && r.slug) sessionMemoryLines.push(`- ${s.tool}: slug=${r.slug} (id: ${r.id})`)
          else if (r.newProjectId) sessionMemoryLines.push(`- switch_project: now in project id=${r.newProjectId}`)
        })
      }
    })
    const sessionMemory = sessionMemoryLines.length > 0 ? sessionMemoryLines.join("\n") : null

    try {
      await send({
        message:          text.trim(),
        sessionId,
        history,
        provider:         actualProvider,
        model:            actualModel.id,
        currentProjectId: selectedProject?.id || null,
        sessionMemory,
        attachments:      readyAttachments,
      })
    } finally {
      setIsStreaming(false)
      setCurrentStatus(null)
      activeAMsgId.current = null

      // Persist both messages to DB
      if (sessionId && finalAMsgRef.current) {
        const finalMsg = finalAMsgRef.current
        fetch(`/api/chat-sessions/${sessionId}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role:     userMsg.role,
                content:  userMsg.content,
                metadata: { attachments: userMsg.attachments || [] },
              },
              {
                role:     finalMsg.role,
                content:  finalMsg.content,
                metadata: { agentSteps: finalMsg.agentSteps || [], jobId: finalMsg.jobId },
              },
            ],
          }),
        }).catch(() => {})

        // Update session title if still "New Chat"
        setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s
          return { ...s, title: s.title === "New Chat" ? text.trim().slice(0, 50) : s.title, updatedAt: new Date().toISOString() }
        }))
        const found = sessions.find(s => s.id === sessionId)
        if (found?.title === "New Chat") {
          fetch(`/api/chat-sessions/${sessionId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: text.trim().slice(0, 50) }),
          }).catch(() => {})
        }
      }
    }
  }, [
    messages, isStreaming, selectedModel, activeSessionId, createSession,
    sessions, selectedProject, autoRoutingConfig, currentStatus, send,
    attachedFiles,
  ])

  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (showHashDropdown) return
      sendMessage(input)
    }
    if (e.key === "Escape") {
      setShowCommands(false)
      setShowModelPicker(false)
      setShowHashDropdown(false)
    }
  }

  const stopStreaming = () => {
    stop()
    setIsStreaming(false)
    setIsReconnecting(false)
    setCurrentStatus(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex overflow-hidden">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={cn(
        "lg:relative lg:translate-x-0 fixed inset-y-0 left-0 z-50 w-72 flex-shrink-0 border-r border-border bg-card flex flex-col h-full transition-transform duration-200",
        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/")} className="p-1.5 rounded-md hover:bg-accent transition-colors" title="Back">
              <ArrowLeft className="w-4 h-4 text-muted-foreground" />
            </button>
            <span className="text-[13px] font-semibold text-foreground">Chat Sessions</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={createSession} className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-500 hover:bg-amber-400 transition-colors" title="New session">
              <Plus className="w-4 h-4 text-black" />
            </button>
            <button onClick={() => setMobileSidebarOpen(false)} className="lg:hidden p-1.5 rounded-md hover:bg-accent transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-border bg-muted/20">
          <ProjectBadge project={selectedProject} />
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {sessionsLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!sessionsLoading && sessions.length === 0 && (
            <div className="text-center py-8 px-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[12px] text-muted-foreground">No sessions yet</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Click + to start a new chat</p>
            </div>
          )}
          {sessions.map(s => (
            <div key={s.id}
              className={cn("group relative flex items-start gap-2 px-3 py-3 mx-2 rounded-lg cursor-pointer transition-all",
                activeSessionId === s.id ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-muted/50")}
              onClick={() => selectSession(s.id)}>
              <MessageSquare className={cn("w-4 h-4 flex-shrink-0 mt-0.5", activeSessionId === s.id ? "text-amber-400" : "text-muted-foreground")} />
              <div className="flex-1 min-w-0 pr-1">
                {renaming === s.id ? (
                  <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => { if (renameVal.trim()) renameSession(s.id, renameVal.trim()); setRenaming(null) }}
                    onKeyDown={e => {
                      if (e.key === "Enter") { if (renameVal.trim()) renameSession(s.id, renameVal.trim()); setRenaming(null) }
                      if (e.key === "Escape") setRenaming(null)
                    }}
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-background border border-amber-500/40 rounded px-2 py-1 text-[13px] text-foreground outline-none" />
                ) : (
                  <p className={cn("text-[13px] font-medium truncate leading-tight", activeSessionId === s.id ? "text-foreground" : "text-foreground/80")}>{s.title}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  {s.visibility === "private" ? <Lock className="w-3 h-3 text-muted-foreground/60" /> : <Users className="w-3 h-3 text-muted-foreground/60" />}
                  <span className="text-[11px] text-muted-foreground/60">{timeAgo(s.updatedAt)}</span>
                  {s._count && <span className="text-[11px] text-muted-foreground/50">- {s._count.messages} msgs</span>}
                </div>
              </div>
              {canManage(s) && (
                <div data-session-menu className="relative flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === s.id ? null : s.id) }}
                    className={cn("p-1.5 rounded-md transition-colors", menuOpen === s.id ? "text-foreground bg-accent" : "text-transparent group-hover:text-muted-foreground hover:bg-accent")}>
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  {menuOpen === s.id && (
                    <div className="absolute right-0 top-8 z-50 w-48 rounded-lg border border-border bg-card shadow-xl py-1">
                      <button onClick={e => { e.stopPropagation(); setRenameVal(s.title); setRenaming(s.id); setMenuOpen(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-accent transition-colors text-left">
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Rename
                      </button>
                      <button onClick={e => { e.stopPropagation(); changeVisibility(s.id, s.visibility === "team" ? "private" : "team"); setMenuOpen(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-accent transition-colors text-left">
                        {s.visibility === "team"
                          ? <><EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> Make Private</>
                          : <><Eye className="w-3.5 h-3.5 text-muted-foreground" /> Make Team</>}
                      </button>
                      <div className="border-t border-border my-1" />
                      <button onClick={e => { e.stopPropagation(); deleteSession(s.id); setMenuOpen(null) }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-red-500/10 text-red-400 transition-colors text-left">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main chat area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50 flex-shrink-0">
          <button onClick={() => setMobileSidebarOpen(true)} className="lg:hidden p-1.5 rounded-md hover:bg-accent transition-colors">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <BrainCircuit className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-foreground truncate">
              {activeSessionId ? sessions.find(s => s.id === activeSessionId)?.title || "Chat" : "Prausdit Lab Agent"}
            </p>
            <div className="flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0",
                isReconnecting ? "bg-amber-400 animate-pulse"
                : isStreaming  ? "bg-amber-400 animate-pulse"
                :                "bg-emerald-500")} />
              <ModelBadge provider={selectedModel.provider} />
              <span className="text-[11px] text-muted-foreground">{selectedModel.shortName} - Agentic</span>
              {isReconnecting && <span className="text-[10px] text-amber-400 font-mono animate-pulse flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5 animate-spin" />RECONNECTING</span>}
              {isStreaming && !isReconnecting && <span className="text-[10px] text-amber-400 font-mono animate-pulse">RUNNING</span>}
            </div>
          </div>
          <div className="hidden sm:block flex-shrink-0">
            <ProjectBadge project={selectedProject} />
          </div>
          {activeSessionId && (
            <div className="flex items-center gap-1">
              {sessions.find(s => s.id === activeSessionId)?.visibility === "private"
                ? <Lock className="w-4 h-4 text-muted-foreground/60" />
                : <Users className="w-4 h-4 text-muted-foreground/60" />}
            </div>
          )}
        </div>

        {/* Reconnecting banner */}
        {isReconnecting && (
          <ReconnectingBanner onDismiss={() => { stop(); setIsReconnecting(false); setIsStreaming(false) }} />
        )}

        {/* Messages area */}
        {!activeSessionId && !sessionsLoading ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <BrainCircuit className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-[17px] font-bold text-foreground mb-2">Prausdit Lab Agent</h2>
              <p className="text-[13px] text-muted-foreground mb-3">Autonomous AI assistant for research workflows.</p>
              {selectedProject && (
                <div className="flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <FolderOpen className="w-4 h-4 text-amber-400" />
                  <span className="text-[12px] text-amber-300">Project: <strong>{selectedProject.name}</strong></span>
                </div>
              )}
              <button onClick={createSession} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[13px] font-medium transition-colors mx-auto">
                <Plus className="w-4 h-4" /> Start New Chat
              </button>
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {messages.length === 0 && !sessionsLoading && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
                  <BrainCircuit className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-[14px] font-semibold text-foreground">Start the conversation</p>
                {selectedProject
                  ? <p className="text-[12px] text-amber-400/80 mt-1 mb-1">Scoped to <strong>{selectedProject.name}</strong></p>
                  : <p className="text-[12px] text-muted-foreground/60 mt-1 mb-1">Type <strong className="text-amber-400">#</strong> to select a project</p>}
                <p className="text-[12px] text-muted-foreground mb-4">Ask questions, use /commands, or attach files</p>
                <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  {[
                    { icon: Search,   label: "Search KB"    },
                    { icon: Globe,    label: "Web research"  },
                    { icon: FileText, label: "Create docs"   },
                    { icon: Zap,      label: "Plan tasks"    },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border">
                      <Icon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} className={cn("group flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                    <BrainCircuit className="w-4 h-4 text-amber-400" />
                  </div>
                )}
                <div className="max-w-[85%] flex flex-col min-w-0">
                  <div className={cn("rounded-xl text-[14px] min-w-0",
                    msg.role === "user"
                      ? "px-4 py-3 bg-amber-500 text-black rounded-br-sm"
                      : "px-4 py-4 bg-muted/60 border border-border/60 rounded-bl-sm")}>

                    {/* User file attachments */}
                    {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-2 space-y-1">
                        {msg.attachments.map(att => (
                          <MessageFileCard key={att.id} attachment={att} />
                        ))}
                      </div>
                    )}

                    {msg.loading && !msg.content && !msg.agentSteps?.length ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                        <span className="text-muted-foreground text-[13px]">{currentStatus || "Agent thinking..."}</span>
                      </div>
                    ) : (
                      <>
                        {msg.role === "assistant" && msg.loading && msg.agentSteps && msg.agentSteps.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {msg.agentSteps.slice(-3).map(step => <ToolExecutionIndicator key={step.id} step={step} />)}
                          </div>
                        )}
                        {msg.role === "assistant" && msg.reasoning && (
                          <ReasoningPanel reasoning={msg.reasoning} expanded={msg.reasoningExpanded ?? false} onToggle={() => toggleReasoning(msg.id)} />
                        )}
                        {msg.content && (
                          msg.role === "assistant"
                            ? <MarkdownRenderer content={msg.content} />
                            : <span className="leading-relaxed whitespace-pre-wrap text-[14px]">{msg.content}</span>
                        )}
                        {msg.role === "assistant" && !msg.loading && !!msg.agentSteps?.length && (
                          <SourcesList steps={msg.agentSteps} />
                        )}
                        {msg.role === "assistant" && !!msg.agentSteps?.length && !msg.loading && (
                          <AgentStepsPanel steps={msg.agentSteps} expanded={msg.stepsExpanded ?? false} onToggle={() => toggleSteps(msg.id)} />
                        )}
                      </>
                    )}
                  </div>
                  {!msg.loading && (
                    <div className={cn("flex items-center gap-2 mt-1 px-1", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role === "assistant" && <ModelLabel modelId={msg.modelId || selectedModel.id} />}
                      <MessageActions
                        message={msg}
                        onCopy={handleCopyMessage}
                        onEdit={(content) => handleEditMessage(msg.id, content)}
                        onResend={() => handleResendMessage(msg.id)}
                        isEditing={editingMessageId === msg.id}
                        setIsEditing={(v) => setEditingMessageId(v ? msg.id : null)}
                      />
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-zinc-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Input area ────────────────────────────────────────────────── */}
        {activeSessionId && (
          <div className="border-t border-border p-4 flex-shrink-0 bg-card/50">
            {/* Task strip */}
            {(() => {
              const lastA  = messages.filter(m => m.role === "assistant").pop()
              const steps  = lastA?.agentSteps || []
              return (steps.length > 0 || (isStreaming && currentStatus))
                ? <TaskStrip steps={steps} isStreaming={isStreaming} currentStatus={currentStatus} />
                : null
            })()}

            {/* Slash commands */}
            {showCommands && (
              <div className="mb-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                {SLASH_COMMANDS.filter(c => c.cmd.includes(input)).map(c => (
                  <button key={c.cmd} onClick={() => { setInput(c.cmd + " "); setShowCommands(false); inputRef.current?.focus() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left">
                    <code className="text-[12px] text-amber-400 font-mono">{c.cmd}</code>
                    <span className="text-[12px] text-muted-foreground">{c.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Model picker */}
            {showModelPicker && (
              <div className="mb-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-amber-500/5 to-transparent">
                  <p className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Auto Routing</p>
                </div>
                {AUTO_ROUTING_MODELS.map(model => (
                  <button key={model.id} onClick={() => { setSelectedModel(model); setShowModelPicker(false); inputRef.current?.focus() }}
                    className={cn("w-full flex items-center gap-2 px-4 py-2.5 hover:bg-accent transition-colors text-left", selectedModel.id === model.id && "bg-amber-500/10")}>
                    <Zap className={cn("w-3.5 h-3.5", model.id === "auto-free" ? "text-emerald-400" : model.id === "auto-paid" ? "text-amber-400" : "text-blue-400")} />
                    <span className="text-[13px] text-foreground flex-1 truncate">{model.name}</span>
                    {model.free && <span className="text-[9px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">FREE</span>}
                    {selectedModel.id === model.id && <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                  </button>
                ))}
                <div className="px-3 py-2 border-b border-t border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Manual Selection</p>
                </div>
                {availableModels.filter(m => !m.id.startsWith("auto")).map(model => (
                  <button key={model.id} onClick={() => { setSelectedModel(model); setShowModelPicker(false); inputRef.current?.focus() }}
                    className={cn("w-full flex items-center gap-2 px-4 py-2.5 hover:bg-accent transition-colors text-left", selectedModel.id === model.id && "bg-amber-500/5")}>
                    <ModelBadge provider={model.provider} />
                    <span className="text-[13px] text-foreground flex-1 truncate">{model.name}</span>
                    {model.free && <span className="text-[9px] text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">FREE</span>}
                    {model.supportsFiles && <span className="text-[9px] text-blue-400/60 px-1 py-0.5 rounded border border-blue-500/20">files</span>}
                    {selectedModel.id === model.id && <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Model selector row */}
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setShowModelPicker(v => !v)}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors",
                  selectedModel.id.startsWith("auto") ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10" : "border-border bg-muted/30 hover:bg-accent")}>
                {selectedModel.id.startsWith("auto")
                  ? <Zap className={cn("w-3.5 h-3.5", selectedModel.id === "auto-free" ? "text-emerald-400" : selectedModel.id === "auto-paid" ? "text-amber-400" : "text-blue-400")} />
                  : <ModelBadge provider={selectedModel.provider} />}
                <span className="text-[12px] text-foreground font-medium max-w-[140px] truncate">{selectedModel.shortName}</span>
                {showModelPicker ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-[11px] text-muted-foreground">Agentic</span>
              </div>
              {canSendFiles && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[11px] text-muted-foreground">Files</span>
                </div>
              )}
              {isStreaming && (
                <button onClick={stopStreaming} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-colors active:scale-95">
                  <X className="w-3.5 h-3.5" /> Stop
                </button>
              )}
            </div>

            {/* Attached files preview */}
            <AttachedFilesBar files={attachedFiles} onRemove={handleRemoveFile} />

            {/* Textarea + dropdowns */}
            <div className="relative">
              {showHashDropdown && (
                <ProjectHashDropdown
                  projects={filteredProjects}
                  onSelect={handleProjectHashSelect}
                  onClose={() => setShowHashDropdown(false)}
                />
              )}
              <div className="flex items-end gap-3 bg-muted rounded-xl px-4 py-3 border border-border transition-colors focus-within:border-amber-500/30">
                {/* File upload button — left of textarea */}
                <FileUploadButton
                  sessionId={activeSessionId}
                  onFilesAdded={handleFilesAdded}
                  disabled={isStreaming}
                  visible={canSendFiles}
                />

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value)
                    const ta = e.target
                    ta.style.height = "auto"
                    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, 44), 140)}px`
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={selectedProject
                    ? `Ask about ${selectedProject.name}… (# switch project, / commands${canSendFiles ? ", 📎 attach files" : ""})`
                    : `Ask a question… (# select project, / commands${canSendFiles ? ", 📎 attach files" : ""})`}
                  rows={1}
                  className="flex-1 bg-transparent text-foreground text-[14px] outline-none resize-none placeholder:text-muted-foreground leading-relaxed focus:ring-0 focus:outline-none caret-amber-400"
                  style={{ minHeight: "44px", maxHeight: "140px" }}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isStreaming || showHashDropdown}
                  className={cn("p-2.5 rounded-lg transition-all flex-shrink-0 active:scale-95",
                    input.trim() && !isStreaming
                      ? "bg-amber-500 text-black hover:bg-amber-400"
                      : "text-muted-foreground bg-muted-foreground/10")}
                >
                  {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Active project context pill */}
            {selectedProject && (
              <div className="flex items-center gap-2 mt-2 px-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                  <FolderOpen className="w-3 h-3 text-amber-400/50" />
                  <span>All operations scoped to</span>
                  <span className="text-amber-400/70 font-medium">{selectedProject.name}</span>
                  <button onClick={() => selectProject(null)} className="ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Clear project">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

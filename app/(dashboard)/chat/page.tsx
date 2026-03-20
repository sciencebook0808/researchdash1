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
  FolderOpen, Hash,
} from "lucide-react"
import { DocContent } from "@/components/docs/doc-content"
import { useCurrentUser } from "@/components/auth/auth-guard"
import { useProject, Project } from "@/components/project/project-context"

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
  const totalCount = Math.ceil(activeSteps.length / 2)
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

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentEventType = "text" | "status" | "tool_call" | "tool_result" | "done" | "error" | "project_switch"

interface AgentEvent {
  type: AgentEventType
  text?: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  step?: number
  projectId?: string
  projectName?: string
}

interface AgentStep {
  id: string
  type: "status" | "tool_call" | "tool_result"
  text: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  step?: number
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  loading?: boolean
  agentSteps?: AgentStep[]
  stepsExpanded?: boolean
  reasoning?: string
  reasoningExpanded?: boolean
  modelId?: string
}

type RoutingMode = "auto" | "auto-free" | "auto-paid" | "manual"

interface ChatModel {
  id: string
  name: string
  provider: "gemini" | "openrouter"
  shortName: string
  free?: boolean
}

interface ChatSession {
  id: string
  title: string
  creatorId: string
  creatorName?: string
  visibility: "team" | "private"
  createdAt: string
  updatedAt: string
  _count?: { messages: number }
  projectId?: string | null
}

const AUTO_ROUTING_MODELS: ChatModel[] = [
  { id: "auto", name: "Auto (Best Available)", provider: "openrouter", shortName: "Auto", free: false },
  { id: "auto-free", name: "Auto-Free (Best Free)", provider: "openrouter", shortName: "Auto-Free", free: true },
  { id: "auto-paid", name: "Auto-Paid (Premium)", provider: "openrouter", shortName: "Auto-Paid", free: false },
]

const SLASH_COMMANDS = [
  { cmd: "/document", desc: "Create a documentation page" },
  { cmd: "/roadmap",  desc: "Add a roadmap step" },
  { cmd: "/experiment", desc: "Design an experiment" },
  { cmd: "/dataset",  desc: "Register a dataset" },
  { cmd: "/note",     desc: "Save a research note" },
]

const GEMINI_MODELS: ChatModel[] = [
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Preview)", provider: "gemini", shortName: "3.1 Pro" },
  { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash", provider: "gemini", shortName: "3.1 Flash" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini", shortName: "2.5 Pro" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini", shortName: "2.5 Flash" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", provider: "gemini", shortName: "2.5 Lite" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (2M Context)", provider: "gemini", shortName: "1.5 Pro" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "gemini", shortName: "1.5 Flash" },
]

const TOOL_ICONS: Record<string, React.ElementType> = {
  search_internal_docs: Search,
  read_document: FileText,
  create_document: FileText,
  update_document: FileText,
  create_note: FileText,
  create_roadmap_step: Zap,
  update_roadmap_step: Zap,
  create_experiment: Code,
  update_experiment: Code,
  create_dataset: Cpu,
  update_dataset: Cpu,
  crawl_web: Globe,
  list_projects: FolderOpen,
  switch_project: FolderOpen,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModelBadge({ provider }: { provider: "gemini" | "openrouter" }) {
  return provider === "gemini"
    ? <Cpu className="w-3 h-3 text-amber-400" />
    : <Globe className="w-3 h-3 text-blue-400" />
}

function AgentStepItem({ step }: { step: AgentStep }) {
  const Icon = step.tool ? (TOOL_ICONS[step.tool] || Wrench) : BrainCircuit
  return (
    <div className={cn("flex items-start gap-2 py-1.5 text-[11px]", step.type === "tool_result" ? "text-emerald-400/80" : "text-muted-foreground")}>
      <div className="w-4 h-4 flex-shrink-0 mt-0.5 flex items-center justify-center">
        {step.type === "tool_result" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Icon className="w-3.5 h-3.5" />}
      </div>
      <span className="leading-relaxed">{step.text}</span>
    </div>
  )
}

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

function MessageActions({
  message, onCopy, onEdit, onResend, isEditing, setIsEditing,
}: {
  message: Message; onCopy: () => void; onEdit: (c: string) => void; onResend: () => void; isEditing: boolean; setIsEditing: (v: boolean) => void
}) {
  const [editValue, setEditValue] = useState(message.content)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (isEditing) setEditValue(message.content) }, [isEditing, message.content])
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    onCopy()
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

function ToolExecutionIndicator({ step }: { step: AgentStep }) {
  const Icon = step.tool ? (TOOL_ICONS[step.tool] || Wrench) : Wrench
  const isComplete = step.type === "tool_result"
  return (
    <div className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border", isComplete ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-amber-500/5 border-amber-500/20 text-amber-400")}>
      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
        {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      </div>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium truncate">{step.tool || "tool"}</span>
      <span className={cn("text-[10px]", isComplete ? "text-emerald-400/60" : "text-amber-400/60")}>{isComplete ? "completed" : "running"}</span>
    </div>
  )
}

function ModelLabel({ modelId }: { modelId?: string }) {
  if (!modelId) return null
  const shortName = modelId.split("/").pop()?.slice(0, 20) || modelId.slice(0, 20)
  return <span className="text-[10px] text-muted-foreground/50 font-mono">{shortName}</span>
}

// ─── Project Badge ────────────────────────────────────────────────────────────

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

// ─── # Project Selector Dropdown ─────────────────────────────────────────────

function ProjectHashDropdown({ projects, onSelect, onClose }: {
  projects: Project[]
  onSelect: (p: Project) => void
  onClose: () => void
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FullscreenChatPage() {
  const router = useRouter()
  const appUser = useCurrentUser()
  const currentUserId = appUser?.clerkId || ""
  const userRole = appUser?.role || "user"

  // Project context
  const { projects, selectedProject, selectProject } = useProject()

  // UI state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showHashDropdown, setShowHashDropdown] = useState(false)
  const [hashFilter, setHashFilter] = useState("")
  const [availableModels, setAvailableModels] = useState<ChatModel[]>(GEMINI_MODELS)
  const [selectedModel, setSelectedModel] = useState<ChatModel>(GEMINI_MODELS[0])
  const [currentStatus, setCurrentStatus] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [autoRoutingConfig, setAutoRoutingConfig] = useState<{ auto: string[]; autoFree: string[]; autoPaid: string[] } | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)

  // Suppress unused warning — kept for potential future use
  const _routingMode: RoutingMode = "manual"
  void _routingMode

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const finalAMsgRef = useRef<Message | null>(null)
  const sendMessageRef = useRef<((text: string) => void) | null>(null)

  // Derived: filtered project list for # dropdown
  const filteredProjects = hashFilter
    ? projects.filter(p => p.name.toLowerCase().includes(hashFilter.toLowerCase()))
    : projects

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, currentStatus])

  // Load settings + sessions on mount
  useEffect(() => {
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(async s => {
      if (!s) return
      const ids: string[] = s.selectedOpenRouterModels || []
      let orModels: ChatModel[] = []
      try {
        const res = await fetch("/api/openrouter-models")
        const data = res.ok ? await res.json() : {}
        if (data.autoRouting) setAutoRoutingConfig(data.autoRouting)
        const allOrModels: Array<{ id: string; name: string; free?: boolean }> = [...(data.free || []), ...(data.pro || [])]
        if (ids.length > 0) {
          orModels = ids.map(id => {
            const found = allOrModels.find(m => m.id === id)
            return { id, name: found?.name || id, provider: "openrouter" as const, shortName: (found?.name || id).split("/").pop()?.slice(0, 18) || id, free: found?.free ?? false }
          })
        }
      } catch { /* ignore */ }
      const all = [...AUTO_ROUTING_MODELS, ...GEMINI_MODELS, ...orModels]
      setAvailableModels(all)
      const defProvider = s.defaultProvider || "gemini"
      const defGemini = s.geminiDefaultModel || "gemini-2.5-flash"
      if (defProvider === "openrouter" && orModels.length > 0) setSelectedModel(orModels[0])
      else setSelectedModel(all.find(m => m.id === defGemini) || GEMINI_MODELS[0])
    }).catch(() => {})
    loadSessions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Command palette trigger
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

  // Close session menus on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-session-menu]")) setMenuOpen(null)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch("/api/chat-sessions")
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
      const res = await fetch(`/api/chat-sessions/${sessionId}/messages`)
      const data = res.ok ? await res.json() : { messages: [] }
      const msgs: Message[] = (data.messages || []).map((m: { id: string; role: string; content: string; metadata?: { agentSteps?: AgentStep[] } }) => ({
        id: m.id, role: m.role as "user" | "assistant", content: m.content,
        agentSteps: m.metadata?.agentSteps || [], stepsExpanded: false,
      }))
      setMessages(msgs)
    } catch { setMessages([]) }
  }, [])

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
      setMobileSidebarOpen(false)
      return session.id
    } catch { return null }
  }, [selectedProject])

  const selectSession = useCallback((id: string) => {
    if (id === activeSessionId) return
    setActiveSessionId(id)
    setMessages([])
    loadSessionMessages(id)
    setMobileSidebarOpen(false)
  }, [activeSessionId, loadSessionMessages])

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

  // Handle # project selection from dropdown
  const handleProjectHashSelect = useCallback((project: Project) => {
    selectProject(project.id)
    setInput("")
    setShowHashDropdown(false)
    inputRef.current?.focus()
  }, [selectProject])

  const canManage = (s: ChatSession) =>
    s.creatorId === currentUserId || userRole === "super_admin" || userRole === "admin"

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession()
      if (!sessionId) return
    }

    // Resolve auto routing to actual model
    let actualModel = selectedModel
    let actualProvider: "gemini" | "openrouter" = selectedModel.provider
    if (selectedModel.id.startsWith("auto")) {
      const routingKey = selectedModel.id === "auto-free" ? "autoFree" : selectedModel.id === "auto-paid" ? "autoPaid" : "auto"
      const routingList = autoRoutingConfig?.[routingKey] || []
      const resolvedModelId = routingList[0] || (selectedModel.id === "auto-free" ? "deepseek/deepseek-r1:free" : "anthropic/claude-3.7-sonnet")
      actualModel = { ...selectedModel, id: resolvedModelId, shortName: resolvedModelId.split("/").pop()?.slice(0, 18) || resolvedModelId }
      actualProvider = "openrouter"
      setCurrentStatus(`Auto-selecting: ${actualModel.shortName}`)
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() }
    const aMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "", loading: true, agentSteps: [], stepsExpanded: false, modelId: actualModel.id }
    finalAMsgRef.current = aMsg

    setMessages(prev => [...prev, userMsg, aMsg])
    setInput("")
    setIsStreaming(true)
    if (!currentStatus) setCurrentStatus("Agent thinking...")
    abortRef.current = new AbortController()

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history,
          provider: actualProvider,
          model: actualModel.id,
          currentProjectId: selectedProject?.id || null,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "API error" }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No stream body")

      let accumulated = "", buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += new TextDecoder().decode(value)
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const event = JSON.parse(raw) as AgentEvent
            if (event.type === "text" && event.text) {
              accumulated += event.text
              setMessages(prev => prev.map(m => {
                if (m.id !== aMsg.id) return m
                finalAMsgRef.current = { ...m, content: accumulated, loading: false }
                return finalAMsgRef.current
              }))
            }
            if (event.type === "status" && event.text) setCurrentStatus(event.text)
            if (event.type === "tool_call" && event.text) {
              setCurrentStatus(event.text)
              const step: AgentStep = { id: `tc-${Date.now()}`, type: "tool_call", text: event.text, tool: event.tool, args: event.args, step: event.step }
              setMessages(prev => prev.map(m => {
                if (m.id !== aMsg.id) return m
                finalAMsgRef.current = { ...m, loading: false, agentSteps: [...(m.agentSteps || []), step] }
                return finalAMsgRef.current
              }))
            }
            if (event.type === "tool_result" && event.text) {
              setCurrentStatus(null)
              const step: AgentStep = { id: `tr-${Date.now()}`, type: "tool_result", text: event.text, tool: event.tool, result: event.result, step: event.step }
              setMessages(prev => prev.map(m => {
                if (m.id !== aMsg.id) return m
                finalAMsgRef.current = { ...m, agentSteps: [...(m.agentSteps || []), step] }
                return finalAMsgRef.current
              }))
            }
            // Agent-triggered project switch
            if (event.type === "project_switch" && event.projectId) {
              selectProject(event.projectId)
              setCurrentStatus(`Switched to: ${event.projectName}`)
            }
            if (event.type === "error") {
              setMessages(prev => prev.map(m => m.id === aMsg.id ? { ...m, content: `Error: ${event.text || "Unknown error"}`, loading: false } : m))
            }
            if (event.type === "done") {
              setCurrentStatus(null)
              setMessages(prev => prev.map(m => m.id === aMsg.id ? { ...m, loading: false } : m))
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return
      const msg = err instanceof Error ? err.message : "Unknown error"
      setMessages(prev => prev.map(m => m.id === aMsg.id ? { ...m, content: `Error: ${msg}`, loading: false } : m))
    } finally {
      setIsStreaming(false)
      setCurrentStatus(null)
      abortRef.current = null
      if (sessionId && finalAMsgRef.current) {
        const finalMsg = finalAMsgRef.current
        fetch(`/api/chat-sessions/${sessionId}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: userMsg.role, content: userMsg.content }, { role: finalMsg.role, content: finalMsg.content, metadata: { agentSteps: finalMsg.agentSteps || [] } }] }),
        }).catch(() => {})
        setSessions(prev => prev.map(s => {
          if (s.id !== sessionId) return s
          return { ...s, title: s.title === "New Chat" ? text.trim().slice(0, 50) : s.title, updatedAt: new Date().toISOString() }
        }))
        const found = sessions.find(s => s.id === sessionId)
        if (found?.title === "New Chat") {
          fetch(`/api/chat-sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: text.trim().slice(0, 50) }) }).catch(() => {})
        }
      }
    }
  }, [messages, isStreaming, selectedModel, activeSessionId, createSession, sessions, selectedProject, autoRoutingConfig, currentStatus, selectProject])

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
    abortRef.current?.abort()
    setIsStreaming(false)
    setCurrentStatus(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden -m-4 md:-m-6">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
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

        {/* Active project badge in sidebar */}
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

      {/* ── Main chat area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">

        {/* Chat header */}
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
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-500")} />
              <ModelBadge provider={selectedModel.provider} />
              <span className="text-[11px] text-muted-foreground">{selectedModel.shortName} - Agentic</span>
              {isStreaming && <span className="text-[10px] text-amber-400 font-mono animate-pulse">RUNNING</span>}
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
                  : <p className="text-[12px] text-muted-foreground/60 mt-1 mb-1">Type <strong className="text-amber-400">#</strong> to select a project</p>
                }
                <p className="text-[12px] text-muted-foreground mb-4">Ask questions, use /commands to create content</p>
                <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  {[{ icon: Search, label: "Search KB" }, { icon: Globe, label: "Web research" }, { icon: FileText, label: "Create docs" }, { icon: Zap, label: "Plan tasks" }].map(({ icon: Icon, label }) => (
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
                <div className="max-w-[80%] flex flex-col">
                  <div className={cn("rounded-xl px-4 py-3 text-[14px]",
                    msg.role === "user" ? "bg-amber-500 text-black rounded-br-sm" : "bg-muted border border-border rounded-bl-sm")}>
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
                            ? <div className="prose-dark text-[14px]"><DocContent content={msg.content} /></div>
                            : <span className="leading-relaxed">{msg.content}</span>
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

        {/* ── Input area ──────────────────────────────────────────────────── */}
        {activeSessionId && (
          <div className="border-t border-border p-4 flex-shrink-0 bg-card/50">
            {/* Task strip */}
            {(() => {
              const lastA = messages.filter(m => m.role === "assistant").pop()
              const steps = lastA?.agentSteps || []
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
              {isStreaming && (
                <button onClick={stopStreaming} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-colors active:scale-95">
                  <X className="w-3.5 h-3.5" /> Stop
                </button>
              )}
            </div>

            {/* Textarea + # project dropdown */}
            <div className="relative">
              {showHashDropdown && (
                <ProjectHashDropdown
                  projects={filteredProjects}
                  onSelect={handleProjectHashSelect}
                  onClose={() => setShowHashDropdown(false)}
                />
              )}
              <div className="flex items-end gap-3 bg-muted rounded-xl px-4 py-3 border border-border transition-colors">
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
                    ? `Ask about ${selectedProject.name}... (# switch project, / commands)`
                    : "Ask a question... (# select project, / commands)"}
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

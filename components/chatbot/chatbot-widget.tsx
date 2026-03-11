"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import {
  Send, User, Loader2, Trash2, ChevronDown, Code,
  FileText, Zap, Maximize2, Minimize2, X, Cpu, Globe, ChevronUp,
  Search, Wrench, CheckCircle2, BrainCircuit, Plus,
  MessageSquare, Lock, Users, MoreHorizontal, Pencil, Eye,
  EyeOff, Shield,
} from "lucide-react"
import { DocContent } from "@/components/docs/doc-content"

type AgentEventType = "text" | "status" | "tool_call" | "tool_result" | "done" | "error"

interface AgentEvent {
  type: AgentEventType
  text?: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  step?: number
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
}

interface ChatModel {
  id: string
  name: string
  provider: "gemini" | "openrouter"
  shortName: string
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
}

const SLASH_COMMANDS = [
  { cmd: "/document", desc: "Create a documentation page" },
  { cmd: "/roadmap",  desc: "Add a roadmap step" },
  { cmd: "/experiment", desc: "Design an experiment" },
  { cmd: "/dataset",  desc: "Register a dataset" },
  { cmd: "/note",     desc: "Save a research note" },
]

const GEMINI_MODELS: ChatModel[] = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini", shortName: "2.5 Flash" },
  { id: "gemini-2.5-pro",   name: "Gemini 2.5 Pro",   provider: "gemini", shortName: "2.5 Pro"   },
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
}

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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SessionSidebar({ sessions, activeId, loading, onSelect, onCreate, onRename, onDelete, onVisibilityChange, currentUserId, userRole }: {
  sessions: ChatSession[]
  activeId: string | null
  loading: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onVisibilityChange: (id: string, vis: "team" | "private") => void
  currentUserId: string
  userRole: string
}) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")

  useEffect(() => {
    function h(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest("[data-session-menu]")) setMenuOpen(null)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const canManage = (s: ChatSession) =>
    s.creatorId === currentUserId || userRole === "super_admin" || userRole === "admin"

  return (
    <div className="w-64 flex-shrink-0 border-r border-border bg-muted/10 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[12px] font-semibold text-foreground">Chat Sessions</span>
        <button onClick={onCreate} className="w-6 h-6 rounded-md flex items-center justify-center bg-amber-500 hover:bg-amber-400 transition-colors" title="New session">
          <Plus className="w-3.5 h-3.5 text-black" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {loading && <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
        {!loading && sessions.length === 0 && (
          <div className="text-center py-8 px-4">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">No sessions yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Click + to start</p>
          </div>
        )}
        {sessions.map(s => (
          <div key={s.id}
            className={cn("group relative flex items-start gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-all", activeId === s.id ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-muted/50")}
            onClick={() => onSelect(s.id)}
          >
            <MessageSquare className={cn("w-3.5 h-3.5 flex-shrink-0 mt-0.5", activeId === s.id ? "text-amber-400" : "text-muted-foreground")} />
            <div className="flex-1 min-w-0 pr-1">
              {renaming === s.id ? (
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => { if (renameVal.trim()) onRename(s.id, renameVal.trim()); setRenaming(null) }}
                  onKeyDown={e => { if (e.key === "Enter") { if (renameVal.trim()) onRename(s.id, renameVal.trim()); setRenaming(null) } if (e.key === "Escape") setRenaming(null) }}
                  onClick={e => e.stopPropagation()}
                  className="w-full bg-background border border-amber-500/40 rounded px-1.5 py-0.5 text-[12px] text-foreground outline-none"
                />
              ) : (
                <p className={cn("text-[12px] font-medium truncate leading-tight", activeId === s.id ? "text-foreground" : "text-foreground/80")}>{s.title}</p>
              )}
              <div className="flex items-center gap-1.5 mt-0.5">
                {s.visibility === "private" ? <Lock className="w-2.5 h-2.5 text-muted-foreground/60" /> : <Users className="w-2.5 h-2.5 text-muted-foreground/60" />}
                <span className="text-[10px] text-muted-foreground/60">{timeAgo(s.updatedAt)}</span>
                {s._count && <span className="text-[10px] text-muted-foreground/50">· {s._count.messages}</span>}
              </div>
            </div>
            {canManage(s) && (
              <div data-session-menu className="relative flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === s.id ? null : s.id) }}
                  className={cn("p-1 rounded-md transition-colors", menuOpen === s.id ? "text-foreground bg-accent" : "text-transparent group-hover:text-muted-foreground hover:bg-accent")}>
                  <MoreHorizontal className="w-3 h-3" />
                </button>
                {menuOpen === s.id && (
                  <div className="absolute right-0 top-6 z-50 w-44 rounded-lg border border-border bg-card shadow-xl py-1">
                    <button onClick={e => { e.stopPropagation(); setRenameVal(s.title); setRenaming(s.id); setMenuOpen(null) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent transition-colors text-left">
                      <Pencil className="w-3 h-3 text-muted-foreground" /> Rename
                    </button>
                    <button onClick={e => { e.stopPropagation(); onVisibilityChange(s.id, s.visibility === "team" ? "private" : "team"); setMenuOpen(null) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent transition-colors text-left">
                      {s.visibility === "team" ? <><EyeOff className="w-3 h-3 text-muted-foreground" /> Make Private</> : <><Eye className="w-3 h-3 text-muted-foreground" /> Make Team</>}
                    </button>
                    <div className="border-t border-border my-1" />
                    <button onClick={e => { e.stopPropagation(); onDelete(s.id); setMenuOpen(null) }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-red-500/10 text-red-400 transition-colors text-left">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MessagesPane({ messages, currentStatus, isStreaming, toggleSteps, scrollRef }: {
  messages: Message[]
  currentStatus: string | null
  isStreaming: boolean
  toggleSteps: (id: string) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  if (messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <BrainCircuit className="w-7 h-7 text-amber-400" />
          </div>
          <p className="text-[13px] font-bold text-foreground">Prausdit Lab Agent</p>
          <p className="text-[11px] text-muted-foreground mt-1">Autonomous AI assistant — reasons, searches, creates</p>
        </div>
        <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
          {[{ icon: Search, label: "Search internal KB" }, { icon: Globe, label: "Crawl web pages" }, { icon: FileText, label: "Create documents" }, { icon: Zap, label: "Plan & execute" }].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border">
              <Icon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 max-w-sm mx-auto">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Slash Commands</p>
          {SLASH_COMMANDS.map(c => (
            <div key={c.cmd} className="flex items-center gap-2 px-2 py-1">
              <code className="text-[11px] text-amber-400 font-mono w-28 flex-shrink-0">{c.cmd}</code>
              <span className="text-[11px] text-muted-foreground">{c.desc}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
      {messages.map(msg => (
        <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
          {msg.role === "assistant" && (
            <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-1">
              <BrainCircuit className="w-3.5 h-3.5 text-amber-400" />
            </div>
          )}
          <div className={cn("max-w-[88%] rounded-xl px-3 py-2.5 text-[13px]",
            msg.role === "user" ? "bg-amber-500 text-black rounded-br-sm" : "bg-muted border border-border rounded-bl-sm")}>
            {msg.loading && !msg.content && !msg.agentSteps?.length ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="text-muted-foreground text-[12px]">{currentStatus || "Agent thinking…"}</span>
              </div>
            ) : (
              <>
                {msg.loading && !msg.content && !!msg.agentSteps?.length && currentStatus && (
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400 flex-shrink-0" />
                    <span className="text-[11px] text-amber-400">{currentStatus}</span>
                  </div>
                )}
                {msg.content && (
                  msg.role === "assistant"
                    ? <div className="prose-dark text-[13px]"><DocContent content={msg.content} /></div>
                    : <span className="leading-relaxed">{msg.content}</span>
                )}
                {msg.role === "assistant" && !!msg.agentSteps?.length && (
                  <AgentStepsPanel steps={msg.agentSteps} expanded={msg.stepsExpanded ?? false} onToggle={() => toggleSteps(msg.id)} />
                )}
              </>
            )}
          </div>
          {msg.role === "user" && (
            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-1">
              <User className="w-3.5 h-3.5 text-zinc-300" />
            </div>
          )}
        </div>
      ))}
      {isStreaming && currentStatus && (
        <div className="flex items-center gap-2 pl-8">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            <span className="text-[11px] text-amber-400">{currentStatus}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function InputBar({ inputRef, input, setInput, handleKeyDown, sendMessage, isStreaming, onStop, selectedModel, showModelPicker, setShowModelPicker, availableModels, setSelectedModel, showCommands, setShowCommands }: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  input: string
  setInput: (v: string) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  sendMessage: (t: string) => void
  isStreaming: boolean
  onStop: () => void
  selectedModel: ChatModel
  showModelPicker: boolean
  setShowModelPicker: (v: boolean | ((p: boolean) => boolean)) => void
  availableModels: ChatModel[]
  setSelectedModel: (m: ChatModel) => void
  showCommands: boolean
  setShowCommands: (v: boolean) => void
}) {
  return (
    <div className="border-t border-border p-3 flex-shrink-0">
      {showCommands && (
        <div className="mb-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          {SLASH_COMMANDS.filter(c => c.cmd.includes(input)).map(c => (
            <button key={c.cmd} onClick={() => { setInput(c.cmd + " "); setShowCommands(false); inputRef.current?.focus() }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left">
              <code className="text-[11px] text-amber-400 font-mono">{c.cmd}</code>
              <span className="text-[11px] text-muted-foreground">{c.desc}</span>
            </button>
          ))}
        </div>
      )}
      {showModelPicker && (
        <div className="mb-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          <div className="px-3 py-2 border-b border-border"><p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Select Model</p></div>
          {availableModels.map(model => (
            <button key={model.id} onClick={() => { setSelectedModel(model); setShowModelPicker(false); inputRef.current?.focus() }}
              className={cn("w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent transition-colors text-left", selectedModel.id === model.id && "bg-amber-500/5")}>
              <ModelBadge provider={model.provider} />
              <span className="text-[12px] text-foreground flex-1 truncate">{model.name}</span>
              {selectedModel.id === model.id && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => setShowModelPicker(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-accent transition-colors">
          <ModelBadge provider={selectedModel.provider} />
          <span className="text-[11px] text-foreground font-medium max-w-[130px] truncate">{selectedModel.shortName}</span>
          {showModelPicker ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-muted-foreground">Agentic · {selectedModel.provider === "gemini" ? "Gemini" : "OpenRouter"}</span>
        </div>
        {isStreaming && (
          <button onClick={onStop} className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] hover:bg-red-500/20 transition-colors">
            <X className="w-3 h-3" /> Stop
          </button>
        )}
      </div>
      <div className="flex items-end gap-2 bg-muted rounded-xl px-3 py-2 border border-border focus-within:border-amber-500/40">
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Ask, use /command to create, or @docs to reference…" rows={1}
          className="flex-1 bg-transparent text-foreground text-[13px] outline-none resize-none placeholder:text-muted-foreground min-h-[20px] max-h-[100px]" />
        <button onClick={() => sendMessage(input)} disabled={!input.trim() || isStreaming}
          className={cn("p-1.5 rounded-lg transition-all flex-shrink-0", input.trim() && !isStreaming ? "bg-amber-500 text-black hover:bg-amber-400" : "text-muted-foreground")}>
          {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [availableModels, setAvailableModels] = useState<ChatModel[]>(GEMINI_MODELS)
  const [selectedModel, setSelectedModel] = useState<ChatModel>(GEMINI_MODELS[0])
  const [currentStatus, setCurrentStatus] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState("")
  const [userRole, setUserRole] = useState("")
  const [accessDenied, setAccessDenied] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const finalAMsgRef = useRef<Message | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, currentStatus])

  useEffect(() => {
    if (!open) return
    fetch("/api/settings").then(r => r.ok ? r.json() : null).then(async s => {
      if (!s) return
      const ids: string[] = s.selectedOpenRouterModels || []
      let orModels: ChatModel[] = []
      if (ids.length > 0) {
        try {
          const res = await fetch("/api/openrouter-models")
          const data = res.ok ? await res.json() : {}
          const all: Array<{ id: string; name: string }> = [...(data.free || []), ...(data.pro || [])]
          orModels = ids.map(id => {
            const found = all.find(m => m.id === id)
            return { id, name: found?.name || id, provider: "openrouter" as const, shortName: (found?.name || id).split("/").pop()?.slice(0, 18) || id }
          })
        } catch {}
      }
      const all = [...GEMINI_MODELS, ...orModels]
      setAvailableModels(all)
      const defProvider = s.defaultProvider || "gemini"
      const defGemini = s.geminiDefaultModel || "gemini-2.5-flash"
      if (defProvider === "openrouter" && orModels.length > 0) setSelectedModel(orModels[0])
      else setSelectedModel(all.find(m => m.id === defGemini) || GEMINI_MODELS[0])
    }).catch(() => {})

    fetch("/api/users/me").then(r => r.ok ? r.json() : null).then(u => {
      if (u) { setCurrentUserId(u.clerkId || ""); setUserRole(u.role || "user") }
    }).catch(() => {})
  }, [open])

  useEffect(() => {
    if (expanded && open) loadSessions()
  }, [expanded, open])

  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    setShowCommands(input.startsWith("/") && !input.includes(" "))
  }, [input])

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch("/api/chat-sessions")
      if (res.status === 403) { setAccessDenied(true); return }
      const data = res.ok ? await res.json() : { sessions: [] }
      const list: ChatSession[] = data.sessions || []
      setSessions(list)
      if (!activeSessionId && list.length > 0) {
        setActiveSessionId(list[0].id)
        loadSessionMessages(list[0].id)
      }
    } catch {}
    setSessionsLoading(false)
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
        body: JSON.stringify({ title: "New Chat", visibility: "team" }),
      })
      if (!res.ok) return null
      const session: ChatSession = await res.json()
      setSessions(prev => [session, ...prev])
      setActiveSessionId(session.id)
      setMessages([])
      return session.id
    } catch { return null }
  }, [])

  const selectSession = useCallback((id: string) => {
    if (id === activeSessionId) return
    setActiveSessionId(id)
    setMessages([])
    loadSessionMessages(id)
  }, [activeSessionId, loadSessionMessages])

  const renameSession = useCallback(async (id: string, title: string) => {
    await fetch(`/api/chat-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {})
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`/api/chat-sessions/${id}`, { method: "DELETE" }).catch(() => {})
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]) }
  }, [activeSessionId])

  const changeVisibility = useCallback(async (id: string, vis: "team" | "private") => {
    await fetch(`/api/chat-sessions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visibility: vis }) }).catch(() => {})
    setSessions(prev => prev.map(s => s.id === id ? { ...s, visibility: vis } : s))
  }, [])

  const toggleSteps = useCallback((msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, stepsExpanded: !m.stepsExpanded } : m))
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    let sessionId = activeSessionId
    if (expanded && !sessionId) {
      sessionId = await createSession()
      if (!sessionId) return
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() }
    const aMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "", loading: true, agentSteps: [], stepsExpanded: false }
    finalAMsgRef.current = aMsg

    setMessages(prev => [...prev, userMsg, aMsg])
    setInput("")
    setIsStreaming(true)
    setCurrentStatus("🤔 Agent thinking…")
    abortRef.current = new AbortController()

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, provider: selectedModel.provider, model: selectedModel.id }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) { const err = await res.json().catch(() => ({ error: "API error" })); throw new Error(err.error || `HTTP ${res.status}`) }

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
              setMessages(prev => prev.map(m => { if (m.id === aMsg.id) { finalAMsgRef.current = { ...m, content: accumulated, loading: false }; return finalAMsgRef.current } return m }))
            }
            if (event.type === "status" && event.text) setCurrentStatus(event.text)
            if (event.type === "tool_call" && event.text) {
              setCurrentStatus(event.text)
              const step: AgentStep = { id: `tc-${Date.now()}`, type: "tool_call", text: event.text, tool: event.tool, args: event.args, step: event.step }
              setMessages(prev => prev.map(m => { if (m.id === aMsg.id) { finalAMsgRef.current = { ...m, loading: false, agentSteps: [...(m.agentSteps || []), step] }; return finalAMsgRef.current } return m }))
            }
            if (event.type === "tool_result" && event.text) {
              setCurrentStatus(null)
              const step: AgentStep = { id: `tr-${Date.now()}`, type: "tool_result", text: event.text, tool: event.tool, result: event.result, step: event.step }
              setMessages(prev => prev.map(m => { if (m.id === aMsg.id) { finalAMsgRef.current = { ...m, agentSteps: [...(m.agentSteps || []), step] }; return finalAMsgRef.current } return m }))
            }
            if (event.type === "error") { const ec = `❌ ${event.text || "Unknown error"}`; setMessages(prev => prev.map(m => m.id === aMsg.id ? { ...m, content: ec, loading: false } : m)) }
            if (event.type === "done") { setCurrentStatus(null); setMessages(prev => prev.map(m => m.id === aMsg.id ? { ...m, loading: false } : m)) }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return
      const msg = err instanceof Error ? err.message : "Unknown error"
      setMessages(prev => prev.map(m => m.id === aMsg.id ? { ...m, content: `❌ ${msg}`, loading: false } : m))
    } finally {
      setIsStreaming(false)
      setCurrentStatus(null)
      abortRef.current = null
      // Persist to session
      if (expanded && sessionId && finalAMsgRef.current) {
        const finalMsg = finalAMsgRef.current
        fetch(`/api/chat-sessions/${sessionId}/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: userMsg.role, content: userMsg.content }, { role: finalMsg.role, content: finalMsg.content, metadata: { agentSteps: finalMsg.agentSteps || [] } }] }),
        }).catch(() => {})
        // Auto-title
        setSessions(prev => prev.map(s => {
          if (s.id === sessionId) {
            const newTitle = s.title === "New Chat" ? text.trim().slice(0, 50) : s.title
            return { ...s, title: newTitle, updatedAt: new Date().toISOString() }
          }
          return s
        }))
        if (sessions.find(s => s.id === sessionId)?.title === "New Chat") {
          fetch(`/api/chat-sessions/${sessionId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: text.trim().slice(0, 50) }) }).catch(() => {})
        }
      }
    }
  }, [messages, isStreaming, selectedModel, expanded, activeSessionId, createSession, sessions])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
    if (e.key === "Escape") { setShowCommands(false); setShowModelPicker(false) }
  }

  const stopStreaming = () => { abortRef.current?.abort(); setIsStreaming(false); setCurrentStatus(null) }

  const panelClass = expanded
    ? "fixed inset-4 sm:inset-6 z-50 rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
    : "fixed bottom-24 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] max-w-[440px] h-[min(660px,calc(100vh-8rem))] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden animate-slide-in-right"

 return (
    <>
      <button onClick={() => setOpen(!open)} aria-label={open ? "Close Agent" : "Open Agent"}
        className={cn("fixed bottom-6 right-4 sm:right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
          open ? "bg-zinc-800 border border-border scale-95" : "bg-amber-500 hover:bg-amber-400 amber-glow scale-100 hover:scale-105")}>
        {open ? <ChevronDown className="w-5 h-5 text-white" /> : <BrainCircuit className="w-5 h-5 text-black" />}
      </button>

      {open && (
        <div className={panelClass}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <BrainCircuit className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">{expanded ? "Chat Workspace" : "Prausdit Lab Agent"}</p>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-500")} />
                <ModelBadge provider={selectedModel.provider} />
                <span className="text-[11px] text-muted-foreground">{selectedModel.shortName} · Agentic</span>
                {isStreaming && <span className="text-[10px] text-amber-400 font-mono animate-pulse">RUNNING</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!expanded && messages.length > 0 && (
                <button onClick={() => { setMessages([]); abortRef.current?.abort() }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Clear">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => { setExpanded(!expanded); if (!expanded) setAccessDenied(false) }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title={expanded ? "Collapse" : "Expand workspace"}>
                {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setOpen(false); setExpanded(false); abortRef.current?.abort() }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {expanded ? (
            accessDenied ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm px-6">
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                    <Shield className="w-8 h-8 text-red-400" />
                  </div>
                  <h3 className="text-[15px] font-bold text-foreground mb-2">Access Denied</h3>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">This feature is restricted to internal developers. Contact an admin for access.</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden min-h-0">
                <SessionSidebar sessions={sessions} activeId={activeSessionId} loading={sessionsLoading}
                  onSelect={selectSession} onCreate={createSession} onRename={renameSession}
                  onDelete={deleteSession} onVisibilityChange={changeVisibility}
                  currentUserId={currentUserId} userRole={userRole} />
                <div className="flex-1 flex flex-col min-w-0">
                  {activeSessionId && (
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/10 flex-shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-[12px] font-medium text-foreground truncate flex-1">
                        {sessions.find(s => s.id === activeSessionId)?.title || "Chat"}
                      </span>
                      {sessions.find(s => s.id === activeSessionId)?.visibility === "private"
                        ? <Lock className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
                        : <Users className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />}
                      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                        {sessions.find(s => s.id === activeSessionId)?.creatorName}
                      </span>
                    </div>
                  )}
                  {!activeSessionId && !sessionsLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center">
                        <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-[13px] text-muted-foreground mb-3">Select or create a session</p>
                        <button onClick={createSession}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-medium transition-colors mx-auto">
                          <Plus className="w-3.5 h-3.5" /> New Chat Session
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MessagesPane messages={messages} currentStatus={currentStatus} isStreaming={isStreaming} toggleSteps={toggleSteps} scrollRef={scrollRef} />
                  )}
                  {activeSessionId && (
                    <InputBar inputRef={inputRef} input={input} setInput={setInput} handleKeyDown={handleKeyDown}
                      sendMessage={sendMessage} isStreaming={isStreaming} onStop={stopStreaming}
                      selectedModel={selectedModel} showModelPicker={showModelPicker} setShowModelPicker={setShowModelPicker}
                      availableModels={availableModels} setSelectedModel={setSelectedModel}
                      showCommands={showCommands} setShowCommands={setShowCommands} />
                  )}
                </div>
              </div>
            )
          ) : (
            <>
              <MessagesPane messages={messages} currentStatus={currentStatus} isStreaming={isStreaming} toggleSteps={toggleSteps} scrollRef={scrollRef} />
              <InputBar inputRef={inputRef} input={input} setInput={setInput} handleKeyDown={handleKeyDown}
                sendMessage={sendMessage} isStreaming={isStreaming} onStop={stopStreaming}
                selectedModel={selectedModel} showModelPicker={showModelPicker} setShowModelPicker={setShowModelPicker}
                availableModels={availableModels} setSelectedModel={setSelectedModel}
                showCommands={showCommands} setShowCommands={setShowCommands} />
            </>
          )}
        </div>
      )}
    </>
  )
}
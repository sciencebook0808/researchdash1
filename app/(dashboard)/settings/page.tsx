"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useUser } from "@clerk/nextjs"
import {
  Settings, Key, Cpu, User, Shield, CheckCircle2, XCircle,
  Loader2, Eye, EyeOff, RefreshCw, Zap, Star, Lock,
  ChevronRight, ChevronDown, AlertTriangle, Globe, MessageSquare,
  FileCode2, Search, Image, Server, Link2, Menu, X, ArrowLeft,
} from "lucide-react"
import { AgentFilesPanel } from "@/components/project/agent-files-panel"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AISettingsData {
  defaultProvider: string
  geminiDefaultModel: string
  selectedOpenRouterModels: string[]
  hasGeminiKey: boolean
  hasOpenRouterKey: boolean
  hasTavilyKey: boolean
  hasExaKey: boolean
  hasSerpApiKey: boolean
  hasFirecrawlKey: boolean
  hasCrawl4aiUrl: boolean
  crawl4aiUrl: string | null
  imageGenerationModel: string
  hasCloudinaryCloudName: boolean
  hasCloudinaryUploadPreset: boolean
  hasCloudinaryApiKey: boolean
  cloudinaryCloudName: string | null
}

interface ORModel { id: string; name: string; provider: string; free: boolean }
type ModelCategory = "chat" | "image" | "multimodal"
interface GeminiModelConfig { id: string; name: string; tier: "Free" | "Paid"; category: ModelCategory }
interface TestStatus { type: "success" | "error" | "loading" | null; message: string }

// ─── Nav section IDs ──────────────────────────────────────────────────────────

type SectionId =
  | "account-profile"
  | "account-permissions"
  | "api-provider"
  | "api-gemini"
  | "api-openrouter"
  | "api-search"
  | "api-crawl"
  | "api-image-gen"
  | "api-cloudinary"
  | "agent-files"

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_CHAT_MODELS: GeminiModelConfig[] = [
  { id: "auto", name: "Auto (Best Model)", tier: "Free", category: "chat" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", tier: "Paid", category: "chat" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", tier: "Free", category: "chat" },
  { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", tier: "Free", category: "chat" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "Paid", category: "chat" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "Free", category: "chat" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", tier: "Free", category: "chat" },
  { id: "gemini-2.5-flash-live", name: "Gemini 2.5 Flash Live", tier: "Free", category: "chat" },
]
const GEMINI_IMAGE_MODELS: GeminiModelConfig[] = [
  { id: "auto-image", name: "Auto (Best Image)", tier: "Free", category: "image" },
  { id: "gemini-3.1-flash-image", name: "Gemini 3.1 Flash Image", tier: "Paid", category: "image" },
  { id: "imagen-4", name: "Imagen 4", tier: "Paid", category: "image" },
]
const GEMINI_MULTIMODAL_MODELS: GeminiModelConfig[] = [
  { id: "auto-multimodal", name: "Auto (Best Multimodal)", tier: "Free", category: "multimodal" },
  { id: "gemini-embedding-2-preview", name: "Gemini Embedding 2", tier: "Paid", category: "multimodal" },
  { id: "veo-3.1-preview", name: "Veo 3.1 Preview", tier: "Paid", category: "multimodal" },
]
const GEMINI_MODELS = GEMINI_CHAT_MODELS.filter(m => !m.id.startsWith("auto"))

const ADMIN_ROLES = ["super_admin", "admin"]
const ROLE_DISPLAY: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", developer: "Developer", user: "User" }
const ROLE_COLOR: Record<string, string> = {
  super_admin: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  admin: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  developer: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  user: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
}

// ─── Sidebar nav structure ────────────────────────────────────────────────────

interface NavItem {
  id: SectionId
  label: string
  icon: React.ElementType
  badge?: string
}

interface NavGroup {
  label: string
  icon: React.ElementType
  collapsible?: boolean
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Account",
    icon: User,
    items: [
      { id: "account-profile",     label: "Profile",     icon: User    },
      { id: "account-permissions", label: "Permissions", icon: Shield  },
    ],
  },
  {
    label: "Manage API",
    icon: Key,
    collapsible: true,
    items: [
      { id: "api-provider",   label: "Default Provider",  icon: Zap    },
      { id: "api-gemini",     label: "Gemini",            icon: Cpu    },
      { id: "api-openrouter", label: "OpenRouter",        icon: Globe  },
      { id: "api-search",     label: "Search Providers",  icon: Search },
      { id: "api-crawl",      label: "Crawl Providers",   icon: Server },
      { id: "api-image-gen",  label: "Image Generation",  icon: Zap   },
      { id: "api-cloudinary", label: "Cloudinary CDN",    icon: Image  },
    ],
  },
  {
    label: "Agent Files",
    icon: FileCode2,
    items: [
      { id: "agent-files", label: "File Manager", icon: FileCode2, badge: "New" },
    ],
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: "Free" | "Paid" }) {
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border",
      tier === "Free" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30"
    )}>{tier}</span>
  )
}

function StatusMsg({ status }: { status: { type: "success" | "error" | null; message: string } }) {
  if (!status.type) return null
  return (
    <div className={cn("flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg border",
      status.type === "success" ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/20" : "text-red-400 bg-red-500/5 border-red-500/20"
    )}>
      {status.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      {status.message}
    </div>
  )
}

type AccentColor = "amber" | "blue" | "purple" | "emerald"
const ACCENT_CLS: Record<AccentColor, string> = {
  amber:   "bg-amber-500/10 border-amber-500/20 text-amber-400",
  blue:    "bg-blue-500/10 border-blue-500/20 text-blue-400",
  purple:  "bg-purple-500/10 border-purple-500/20 text-purple-400",
  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
}

function SectionCard({ title, icon: Icon, children, locked, accent = "amber", id }: {
  title: string; icon: React.ElementType; children: React.ReactNode
  locked?: boolean; accent?: AccentColor; id?: string
}) {
  return (
    <div id={id} className={cn("rounded-xl border border-border bg-card/50 overflow-hidden scroll-mt-4", locked && "opacity-60")}>
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-border bg-muted/20">
        <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0", ACCENT_CLS[accent])}>
          <Icon className="w-4 h-4" />
        </div>
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        {locked && <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground"><Lock className="w-3 h-3" /><span>Admin only</span></div>}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

function ToolKeyRow({ label, placeholder, hint, value, onChange, hasSaved, isPassword = true, onSave, onTest, saving, testStatus, disabled, docsUrl }: {
  label: string; placeholder: string; hint?: string; value: string
  onChange: (v: string) => void; hasSaved: boolean; isPassword?: boolean
  onSave: () => Promise<void>; onTest: () => Promise<void>
  saving: boolean; testStatus: TestStatus; disabled: boolean; docsUrl?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-2.5 pb-5 border-b border-border/50 last:border-0 last:pb-0">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[12px] font-semibold text-foreground">{label}</label>
        {hasSaved && <span className="text-[10px] text-emerald-400 font-medium border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 rounded-full">Saved ✓</span>}
        {docsUrl && (
          <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Link2 className="w-3 h-3" /> Docs
          </a>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-primary/40 transition-colors">
        <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <input type={isPassword && !show ? "password" : "text"} value={value} onChange={e => onChange(e.target.value)}
          placeholder={hasSaved ? "Enter new value to update" : placeholder} disabled={disabled}
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-0" />
        {isPassword && (
          <button type="button" onClick={() => setShow(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onSave} disabled={!value.trim() || disabled || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />} Save
        </button>
        <button onClick={onTest} disabled={testStatus.type === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50">
          {testStatus.type === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
        </button>
        {testStatus.type && testStatus.type !== "loading" && (
          <span className={cn("text-[12px] flex items-center gap-1 flex-wrap", testStatus.type === "success" ? "text-emerald-400" : "text-red-400")}>
            {testStatus.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {testStatus.message}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Settings Sidebar ─────────────────────────────────────────────────────────

function SettingsSidebar({ activeSection, onSelect, onClose }: {
  activeSection: SectionId
  onSelect: (id: SectionId) => void
  onClose?: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "Account": true,
    "Manage API": true,
    "Agent Files": true,
  })

  const toggle = (label: string) => setExpanded(p => ({ ...p, [label]: !p[label] }))

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Settings className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-[14px] font-bold text-foreground">Settings</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group) => {
          const GroupIcon = group.icon
          const isOpen = expanded[group.label] !== false
          return (
            <div key={group.label} className="mb-1">
              {/* Group header */}
              <button
                onClick={() => group.collapsible && toggle(group.label)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors",
                  group.collapsible ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
                )}
              >
                <GroupIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">{group.label}</span>
                {group.collapsible && (
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0", !isOpen && "-rotate-90")} />
                )}
              </button>

              {/* Nav items */}
              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = item.icon
                    const isActive = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => { onSelect(item.id); onClose?.() }}
                        className={cn(
                          "w-full flex items-center gap-2.5 pl-8 pr-3 py-2 rounded-lg text-left transition-all text-[13px]",
                          isActive
                            ? "bg-primary/10 text-primary font-medium border border-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        <ItemIcon className={cn("w-3.5 h-3.5 flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-400 flex-shrink-0">
                            {item.badge}
                          </span>
                        )}
                        {isActive && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoaded } = useUser()
  const [activeSection, setActiveSection] = useState<SectionId>("account-profile")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Settings data
  const [settings, setSettings] = useState<AISettingsData | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const canEdit = userRole ? ADMIN_ROLES.includes(userRole) : false

  // Gemini
  const [geminiKey, setGeminiKey] = useState("")
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" })
  const [testingGemini, setTestingGemini] = useState(false)
  const [savingGemini, setSavingGemini] = useState(false)
  const [selectedGeminiModel, setSelectedGeminiModel] = useState("gemini-2.5-flash")

  // OpenRouter
  const [orKey, setOrKey] = useState("")
  const [showOrKey, setShowOrKey] = useState(false)
  const [orKeyStatus, setOrKeyStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" })
  const [testingOR, setTestingOR] = useState(false)
  const [savingOR, setSavingOR] = useState(false)
  const [orModels, setOrModels] = useState<{ free: ORModel[]; pro: ORModel[] }>({ free: [], pro: [] })
  const [loadingModels, setLoadingModels] = useState(false)
  const [selectedORModels, setSelectedORModels] = useState<string[]>([])
  const [defaultProvider, setDefaultProvider] = useState<"gemini" | "openrouter">("gemini")
  const [savingProvider, setSavingProvider] = useState(false)

  // Research search
  const [tavilyKey, setTavilyKey] = useState(""); const [savingTavily, setSavingTavily] = useState(false); const [testTavily, setTestTavily] = useState<TestStatus>({ type: null, message: "" })
  const [exaKey, setExaKey] = useState(""); const [savingExa, setSavingExa] = useState(false); const [testExa, setTestExa] = useState<TestStatus>({ type: null, message: "" })
  const [serpKey, setSerpKey] = useState(""); const [savingSerp, setSavingSerp] = useState(false); const [testSerp, setTestSerp] = useState<TestStatus>({ type: null, message: "" })

  // Crawl
  const [firecrawlKey, setFirecrawlKey] = useState(""); const [savingFirecrawl, setSavingFirecrawl] = useState(false); const [testFirecrawl, setTestFirecrawl] = useState<TestStatus>({ type: null, message: "" })
  const [crawl4aiUrl, setCrawl4aiUrl] = useState(""); const [savingCrawl4ai, setSavingCrawl4ai] = useState(false); const [testCrawl4ai, setTestCrawl4ai] = useState<TestStatus>({ type: null, message: "" })

  // Image generation model
  const [imageGenModel, setImageGenModel] = useState("auto")
  const [savingImageModel, setSavingImageModel] = useState(false)

  // Cloudinary
  const [cloudName, setCloudName] = useState("")
  const [cloudPreset, setCloudPreset] = useState("")
  const [cloudApiKey, setCloudApiKey] = useState("")
  const [savingCloud, setSavingCloud] = useState(false)
  const [testCloud, setTestCloud] = useState<TestStatus>({ type: null, message: "" })

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      setLoadingSettings(true)
      const res = await fetch("/api/settings")
      if (res.ok) {
        const data: AISettingsData = await res.json()
        setSettings(data)
        setDefaultProvider((data.defaultProvider as "gemini" | "openrouter") || "gemini")
        setSelectedGeminiModel(data.geminiDefaultModel || "gemini-2.5-flash")
        setSelectedORModels(data.selectedOpenRouterModels || [])
        if (data.crawl4aiUrl) setCrawl4aiUrl(data.crawl4aiUrl)
        if (data.imageGenerationModel) setImageGenModel(data.imageGenerationModel || "auto")
        if (data.cloudinaryCloudName) setCloudName(data.cloudinaryCloudName)
      }
    } catch { /* ignore */ } finally { setLoadingSettings(false) }
  }, [])

  useEffect(() => {
    if (!user) return
    fetch("/api/users").then(r => r.json()).then(data => {
      const u = Array.isArray(data) ? data.find((u: { clerkId: string; role: string }) => u.clerkId === user.id) : null
      if (u) setUserRole(u.role)
    }).catch(() => {})
  }, [user])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  useEffect(() => {
    if (activeSection.startsWith("api-") && orModels.free.length === 0) {
      setLoadingModels(true)
      fetch("/api/openrouter-models").then(r => r.json()).then(data => setOrModels({ free: data.free || [], pro: data.pro || [] })).catch(() => {}).finally(() => setLoadingModels(false))
    }
  }, [activeSection, orModels.free.length])

  // Scroll to section on desktop
  const handleSectionSelect = (id: SectionId) => {
    setActiveSection(id)
    setTimeout(() => {
      const el = document.getElementById(id)
      el?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }

  // ── API helpers ─────────────────────────────────────────────────────────────

  const saveKey = async (fields: Record<string, string | null>) => {
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Save failed") }
    await fetchSettings()
  }

  const testProvider = async (provider: string, setStatus: (s: TestStatus) => void, apiKey?: string, apiUrl?: string) => {
    setStatus({ type: "loading", message: "Testing…" })
    try {
      const res = await fetch("/api/settings/test-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, apiKey, apiUrl }) })
      const data = await res.json()
      setStatus({ type: data.success ? "success" : "error", message: data.message || data.error })
    } catch (e) { setStatus({ type: "error", message: String(e) }) }
  }

  const saveGeminiKey = async () => {
    if (!geminiKey.trim()) return; setSavingGemini(true)
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ geminiApiKey: geminiKey, geminiDefaultModel: selectedGeminiModel }) })
      if (res.ok) { setGeminiKeyStatus({ type: "success", message: "Gemini API key saved" }); setGeminiKey(""); fetchSettings() }
      else { const e = await res.json(); setGeminiKeyStatus({ type: "error", message: e.error || "Failed" }) }
    } catch { setGeminiKeyStatus({ type: "error", message: "Network error" }) } finally { setSavingGemini(false) }
  }

  const testGemini = async () => {
    setTestingGemini(true); setGeminiKeyStatus({ type: null, message: "" })
    try {
      const res = await fetch("/api/settings/test-gemini", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: geminiKey || undefined }) })
      const data = await res.json()
      setGeminiKeyStatus({ type: data.success ? "success" : "error", message: data.success ? data.message : data.error })
    } catch { setGeminiKeyStatus({ type: "error", message: "Connection test failed" }) } finally { setTestingGemini(false) }
  }

  const saveORKey = async () => {
    if (!orKey.trim()) return; setSavingOR(true)
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ openrouterApiKey: orKey, selectedOpenRouterModels: selectedORModels }) })
      if (res.ok) {
        setOrKeyStatus({ type: "success", message: "OpenRouter key saved" }); setOrKey(""); fetchSettings()
        setLoadingModels(true); fetch("/api/openrouter-models").then(r => r.json()).then(d => setOrModels({ free: d.free || [], pro: d.pro || [] })).finally(() => setLoadingModels(false))
      } else { const e = await res.json(); setOrKeyStatus({ type: "error", message: e.error || "Failed" }) }
    } catch { setOrKeyStatus({ type: "error", message: "Network error" }) } finally { setSavingOR(false) }
  }

  const testOpenRouter = async () => {
    setTestingOR(true); setOrKeyStatus({ type: null, message: "" })
    try {
      const res = await fetch("/api/settings/test-openrouter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: orKey || undefined }) })
      const data = await res.json()
      setOrKeyStatus({ type: data.success ? "success" : "error", message: data.success ? data.message : data.error })
    } catch { setOrKeyStatus({ type: "error", message: "Connection test failed" }) } finally { setTestingOR(false) }
  }

  const saveDefaultProvider = async (p: "gemini" | "openrouter") => {
    setSavingProvider(true); setDefaultProvider(p)
    try { await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultProvider: p }) }); fetchSettings() }
    catch { /* ignore */ } finally { setSavingProvider(false) }
  }

  const saveGeminiModel = async (model: string) => {
    setSelectedGeminiModel(model)
    try { await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ geminiDefaultModel: model }) }) } catch { /* ignore */ }
  }

  const toggleORModel = async (modelId: string) => {
    const updated = selectedORModels.includes(modelId) ? selectedORModels.filter(m => m !== modelId) : selectedORModels.length >= 5 ? [...selectedORModels.slice(1), modelId] : [...selectedORModels, modelId]
    setSelectedORModels(updated)
    try { await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedOpenRouterModels: updated }) }) } catch { /* ignore */ }
  }

  if (!isLoaded) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
  const clerkRole = (user?.publicMetadata?.role as string) || userRole || "user"

  // ── Current section label for mobile header ─────────────────────────────────
  const currentLabel = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === activeSection)?.label || "Settings"
  const isApiSection = activeSection.startsWith("api-")
  const isAgentFiles = activeSection === "agent-files"

  return (
    <div className="flex-1 flex overflow-hidden h-full">

      {/* ─── Mobile overlay ─────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ─── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:static lg:translate-x-0 lg:z-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <SettingsSidebar
          activeSection={activeSection}
          onSelect={handleSectionSelect}
          onClose={() => setSidebarOpen(false)}
        />
      </aside>

      {/* ─── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm lg:hidden flex-shrink-0 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Settings className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-[14px] font-semibold text-foreground truncate">{currentLabel}</span>
          </div>
        </div>

        {/* Desktop page header */}
        <div className="hidden lg:flex items-center gap-3 px-6 py-5 border-b border-border flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-foreground">Settings</h1>
            <p className="text-[12px] text-muted-foreground">Manage account, AI providers, tools and agent configuration</p>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-16">

            {/* ── Admin warning (API sections) ── */}
            {(isApiSection || isAgentFiles) && !canEdit && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-[13px]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>You need <strong>Admin</strong> or <strong>Super Admin</strong> role to modify these settings.</span>
              </div>
            )}

            {/* ══════════════════════════════════════════════════
                ACCOUNT — PROFILE
            ══════════════════════════════════════════════════ */}
            {(activeSection === "account-profile" || activeSection === "account-permissions") && (
              <>
                <SectionCard title="Profile" icon={User} id="account-profile">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="relative flex-shrink-0">
                      {user?.imageUrl
                        ? <img src={user.imageUrl} alt={user.fullName || ""} className="w-16 h-16 rounded-full border-2 border-amber-500/30" />
                        : <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/30 flex items-center justify-center"><User className="w-8 h-8 text-amber-400" /></div>
                      }
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-[16px] font-bold text-foreground">{user?.fullName || user?.firstName || "—"}</h2>
                        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", ROLE_COLOR[clerkRole] || ROLE_COLOR.user)}>{ROLE_DISPLAY[clerkRole] || clerkRole}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress || "—"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Clerk ID: <code className="font-mono text-amber-400/70">{user?.id?.slice(0, 20)}…</code></p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: "Full Name", value: user?.fullName || "Not set" },
                      { label: "Email", value: user?.primaryEmailAddress?.emailAddress || "—" },
                      { label: "Role", value: ROLE_DISPLAY[clerkRole] || clerkRole },
                      { label: "Member Since", value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—" },
                    ].map(item => (
                      <div key={item.label} className="rounded-lg bg-muted/30 border border-border px-4 py-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{item.label}</p>
                        <p className="text-[13px] text-foreground font-medium truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Permissions" icon={Shield} id="account-permissions">
                  <div className="space-y-1">
                    {[
                      { label: "View Dashboard", allowed: true },
                      { label: "Create / Edit Content", allowed: true },
                      { label: "Manage AI & Tool Settings", allowed: canEdit },
                      { label: "Manage Agent Files", allowed: canEdit },
                      { label: "Manage Users", allowed: ["super_admin", "admin"].includes(clerkRole) },
                      { label: "Change Roles", allowed: clerkRole === "super_admin" },
                    ].map(perm => (
                      <div key={perm.label} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <span className="text-[13px] text-foreground">{perm.label}</span>
                        {perm.allowed ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-4 h-4 text-zinc-600 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </>
            )}

            {/* ══════════════════════════════════════════════════
                API — DEFAULT PROVIDER
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-provider" && (
              <SectionCard title="Default AI Provider" icon={Zap} locked={!canEdit} id="api-provider">
                <p className="text-[12px] text-muted-foreground mb-4">Choose which AI provider powers the chat assistant by default.</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["gemini", "openrouter"] as const).map(p => (
                    <button key={p} disabled={!canEdit || savingProvider} onClick={() => saveDefaultProvider(p)}
                      className={cn("relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all disabled:cursor-not-allowed",
                        defaultProvider === p ? "border-amber-500/60 bg-amber-500/10 text-amber-400" : "border-border bg-muted/30 text-muted-foreground hover:border-border/80")}>
                      {p === "gemini" ? <Cpu className="w-6 h-6" /> : <Globe className="w-6 h-6" />}
                      <span className="text-[13px] font-semibold">{p === "openrouter" ? "OpenRouter" : "Gemini"}</span>
                      {defaultProvider === p && <div className="absolute top-2 right-2"><CheckCircle2 className="w-3.5 h-3.5 text-amber-400" /></div>}
                      {loadingSettings && <Loader2 className="absolute bottom-2 right-2 w-3 h-3 animate-spin" />}
                    </button>
                  ))}
                </div>
                {settings && <p className="mt-3 text-[11px] text-muted-foreground">Current: <span className="text-amber-400 font-medium capitalize">{settings.defaultProvider}</span></p>}
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                API — GEMINI
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-gemini" && (
              <SectionCard title="Gemini API" icon={Key} locked={!canEdit} id="api-gemini">
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground font-medium mb-1.5 block">
                      API Key {settings?.hasGeminiKey && <span className="text-emerald-400 ml-1">· Saved ✓</span>}
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-amber-500/40">
                      <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <input type={showGeminiKey ? "text" : "password"} value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                        placeholder={settings?.hasGeminiKey ? "Enter new key to update" : "AIzaSy…"} disabled={!canEdit}
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-0" />
                      <button type="button" onClick={() => setShowGeminiKey(v => !v)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                        {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={saveGeminiKey} disabled={!geminiKey.trim() || !canEdit || savingGemini}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-[12px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {savingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />} Save Key
                    </button>
                    <button onClick={testGemini} disabled={testingGemini}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                      {testingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
                    </button>
                  </div>
                  <StatusMsg status={geminiKeyStatus} />
                </div>
                <div className="mt-6 space-y-6">
                  {[
                    { label: "Chat Models", models: GEMINI_CHAT_MODELS, color: "amber", Icon: MessageSquare },
                    { label: "Image Models", models: GEMINI_IMAGE_MODELS, color: "blue", Icon: Zap },
                    { label: "Multimodal Models", models: GEMINI_MULTIMODAL_MODELS, color: "emerald", Icon: Cpu },
                  ].map(({ label, models, color, Icon: IIcon }) => (
                    <div key={label}>
                      <h4 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-2">
                        <IIcon className={`w-3.5 h-3.5 text-${color}-400`} />{label}
                      </h4>
                      <div className="space-y-2">
                        {models.map(model => (
                          <button key={model.id} disabled={!canEdit} onClick={() => saveGeminiModel(model.id)}
                            className={cn("w-full flex items-center gap-3 px-3 sm:px-4 py-3 rounded-lg border transition-all text-left disabled:cursor-not-allowed",
                              selectedGeminiModel === model.id ? `border-${color}-500/50 bg-${color}-500/10` : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30")}>
                            <div className={cn("w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center", selectedGeminiModel === model.id ? `border-${color}-500` : "border-muted-foreground/40")}>
                              {selectedGeminiModel === model.id && <div className={`w-2 h-2 rounded-full bg-${color}-500`} />}
                            </div>
                            <span className="flex-1 text-[13px] text-foreground truncate">{model.name}</span>
                            <TierBadge tier={model.tier} />
                            {selectedGeminiModel === model.id && <span className="text-[10px] text-amber-400 font-medium hidden sm:block">Default</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                API — OPENROUTER
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-openrouter" && (
              <SectionCard title="OpenRouter API" icon={Globe} locked={!canEdit} id="api-openrouter">
                <div className="space-y-3">
                  <div>
                    <label className="text-[12px] text-muted-foreground font-medium mb-1.5 block">
                      API Key {settings?.hasOpenRouterKey && <span className="text-emerald-400 ml-1">· Saved ✓</span>}
                    </label>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-amber-500/40">
                      <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <input type={showOrKey ? "text" : "password"} value={orKey} onChange={e => setOrKey(e.target.value)}
                        placeholder={settings?.hasOpenRouterKey ? "Enter new key to update" : "sk-or-…"} disabled={!canEdit}
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-0" />
                      <button type="button" onClick={() => setShowOrKey(v => !v)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                        {showOrKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={saveORKey} disabled={!orKey.trim() || !canEdit || savingOR}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-[12px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {savingOR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />} Save Key
                    </button>
                    <button onClick={testOpenRouter} disabled={testingOR}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                      {testingOR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
                    </button>
                  </div>
                  <StatusMsg status={orKeyStatus} />
                </div>
                <div className="mt-3 text-[12px] text-muted-foreground px-3 py-2 rounded-lg bg-muted/20 border border-border">
                  Select up to 5 models — they appear in the chat switcher.
                  {selectedORModels.length > 0 && <span className="ml-2 text-amber-400 font-medium">{selectedORModels.length}/5 selected</span>}
                </div>
                {loadingModels ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-[12px]">Loading…</span></div>
                ) : (
                  <div className="mt-5 space-y-5">
                    {[{ label: "Free Models", tier: "Free" as const, models: orModels.free }, { label: "Pro Models", tier: "Paid" as const, models: orModels.pro }].map(({ label, tier, models }) => (
                      <div key={label}>
                        <div className="flex items-center gap-2 mb-3"><h4 className="text-[13px] font-semibold text-foreground">{label}</h4><TierBadge tier={tier} />{tier === "Paid" && <Star className="w-3.5 h-3.5 text-amber-400" />}</div>
                        <div className="space-y-2">
                          {models.map(model => {
                            const isSel = selectedORModels.includes(model.id)
                            return (
                              <button key={model.id} onClick={() => canEdit && toggleORModel(model.id)} disabled={!canEdit || (!isSel && selectedORModels.length >= 5)}
                                className={cn("w-full flex items-center gap-3 px-3 sm:px-4 py-3 rounded-lg border transition-all text-left disabled:cursor-not-allowed disabled:opacity-50",
                                  isSel ? (tier === "Free" ? "border-emerald-500/50 bg-emerald-500/10" : "border-amber-500/50 bg-amber-500/10") : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30")}>
                                <div className={cn("w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center", isSel ? (tier === "Free" ? "border-emerald-500 bg-emerald-500" : "border-amber-500 bg-amber-500") : "border-muted-foreground/40")}>
                                  {isSel && <CheckCircle2 className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0"><p className="text-[13px] text-foreground truncate">{model.name}</p><p className="text-[11px] text-muted-foreground capitalize">{model.provider}</p></div>
                                <TierBadge tier={tier} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedORModels.length > 0 && (
                  <div className="mt-5 p-4 rounded-xl border border-border bg-muted/20">
                    <p className="text-[12px] font-semibold text-foreground mb-3 flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400" />Active Chat Models</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <Cpu className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[12px] text-foreground flex-1 truncate">{GEMINI_MODELS.find(m => m.id === selectedGeminiModel)?.name || selectedGeminiModel}</span>
                        <span className="text-[10px] text-amber-400">Gemini</span>
                      </div>
                      {selectedORModels.map(id => {
                        const model = [...orModels.free, ...orModels.pro].find(m => m.id === id)
                        return (
                          <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border">
                            <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-[12px] text-foreground flex-1 truncate">{model?.name || id}</span>
                            <span className="text-[10px] text-muted-foreground">OpenRouter</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                API — SEARCH PROVIDERS
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-search" && (
              <SectionCard title="Search Providers" icon={Search} locked={!canEdit} accent="blue" id="api-search">
                <p className="text-[12px] text-muted-foreground mb-5">
                  Used by the <code className="text-blue-400 text-[11px]">research</code> agent tool.
                  Tried in order: <span className="text-blue-400 font-medium">Tavily → Exa → SerpAPI</span>. Add at least one.
                </p>
                <div className="space-y-6">
                  <ToolKeyRow label="Tavily API Key" placeholder="tvly-…" hasSaved={!!settings?.hasTavilyKey}
                    hint="Recommended primary. AI-optimised search with content extraction."
                    value={tavilyKey} onChange={setTavilyKey}
                    onSave={async () => { setSavingTavily(true); try { await saveKey({ tavilyApiKey: tavilyKey }); setTavilyKey("") } finally { setSavingTavily(false) } }}
                    onTest={async () => testProvider("tavily", setTestTavily, tavilyKey || undefined)}
                    saving={savingTavily} testStatus={testTavily} disabled={!canEdit} docsUrl="https://docs.tavily.com" />
                  <ToolKeyRow label="Exa API Key" placeholder="exa-…" hasSaved={!!settings?.hasExaKey}
                    hint="Secondary search. Neural AI search — excellent for research papers, deep research mode, and academic queries."
                    value={exaKey} onChange={setExaKey}
                    onSave={async () => { setSavingExa(true); try { await saveKey({ exaApiKey: exaKey }); setExaKey("") } finally { setSavingExa(false) } }}
                    onTest={async () => testProvider("exa", setTestExa, exaKey || undefined)}
                    saving={savingExa} testStatus={testExa} disabled={!canEdit} docsUrl="https://dashboard.exa.ai/api-keys" />
                  <ToolKeyRow label="SerpAPI Key" placeholder="your-serpapi-key" hasSaved={!!settings?.hasSerpApiKey}
                    hint="Final fallback. Google Search results."
                    value={serpKey} onChange={setSerpKey}
                    onSave={async () => { setSavingSerp(true); try { await saveKey({ serpApiKey: serpKey }); setSerpKey("") } finally { setSavingSerp(false) } }}
                    onTest={async () => testProvider("serpapi", setTestSerp, serpKey || undefined)}
                    saving={savingSerp} testStatus={testSerp} disabled={!canEdit} docsUrl="https://serpapi.com/manage-api-key" />
                </div>
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                API — CRAWL PROVIDERS
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-crawl" && (
              <SectionCard title="Crawl Providers" icon={Server} locked={!canEdit} accent="emerald" id="api-crawl">
                <p className="text-[12px] text-muted-foreground mb-5">
                  Extracts full page content. Order: <span className="text-emerald-400 font-medium">Firecrawl → Crawl4AI → Basic Fetch</span>.
                  Basic fetch is always available as fallback.
                </p>
                <div className="space-y-6">
                  <ToolKeyRow label="Firecrawl API Key" placeholder="fc-…" hasSaved={!!settings?.hasFirecrawlKey}
                    hint="Managed service with JS rendering. Best extraction quality."
                    value={firecrawlKey} onChange={setFirecrawlKey}
                    onSave={async () => { setSavingFirecrawl(true); try { await saveKey({ firecrawlApiKey: firecrawlKey }); setFirecrawlKey("") } finally { setSavingFirecrawl(false) } }}
                    onTest={async () => testProvider("firecrawl", setTestFirecrawl, firecrawlKey || undefined)}
                    saving={savingFirecrawl} testStatus={testFirecrawl} disabled={!canEdit} docsUrl="https://docs.firecrawl.dev" />

                  {/* Crawl4AI URL */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-[12px] font-semibold text-foreground">Crawl4AI Base URL</label>
                      {settings?.hasCrawl4aiUrl && <span className="text-[10px] text-emerald-400 font-medium border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 rounded-full">Saved ✓</span>}
                      <a href="https://github.com/unclecode/crawl4ai" target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"><Link2 className="w-3 h-3" />GitHub</a>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Self-hosted open-source crawler. Enter your instance URL.</p>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-primary/40">
                      <Server className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <input type="text" value={crawl4aiUrl} onChange={e => setCrawl4aiUrl(e.target.value)} placeholder="https://your-crawl4ai.example.com" disabled={!canEdit}
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-0" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={async () => { setSavingCrawl4ai(true); try { await saveKey({ crawl4aiUrl: crawl4aiUrl || null }) } finally { setSavingCrawl4ai(false) } }}
                        disabled={!crawl4aiUrl.trim() || !canEdit || savingCrawl4ai}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {savingCrawl4ai ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />} Save
                      </button>
                      <button onClick={async () => testProvider("crawl4ai", setTestCrawl4ai, undefined, crawl4aiUrl || undefined)} disabled={testCrawl4ai.type === "loading"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                        {testCrawl4ai.type === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
                      </button>
                      {testCrawl4ai.type && testCrawl4ai.type !== "loading" && (
                        <span className={cn("text-[12px] flex items-center gap-1", testCrawl4ai.type === "success" ? "text-emerald-400" : "text-red-400")}>
                          {testCrawl4ai.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{testCrawl4ai.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                API — IMAGE GENERATION MODEL
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-image-gen" && (
              <SectionCard title="Image Generation Model" icon={Zap} locked={!canEdit} accent="amber" id="api-image-gen">
                <p className="text-[12px] text-muted-foreground mb-5">
                  Select which model the agent uses when generating images for documents, notes, and diagrams.
                  <span className="text-amber-400 font-medium"> Auto</span> intelligently routes based on task type — diagrams use fast free models, high-quality visuals use pro models.
                  Requires <span className="text-amber-400 font-medium">Cloudinary</span> to be configured for image storage.
                </p>

                <div className="space-y-4">
                  {/* Auto option */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Routing</p>
                    {[
                      { id: "auto", label: "Auto (Recommended)", desc: "Intelligently routes: diagrams → Gemini Flash (fast/free), quality images → Nano Banana 2, photorealistic → best available", badge: "Smart", badgeColor: "amber" },
                    ].map(m => (
                      <label key={m.id} className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all", imageGenModel === m.id ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/20 hover:border-border/80")}>
                        <input type="radio" name="imageGenModel" value={m.id} checked={imageGenModel === m.id} onChange={() => setImageGenModel(m.id)} className="mt-0.5 accent-amber-500" disabled={!canEdit} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-foreground">{m.label}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-semibold", `text-${m.badgeColor}-400 bg-${m.badgeColor}-500/10 border-${m.badgeColor}-500/20`)}>{m.badge}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Gemini Direct models */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Gemini Direct (uses Gemini API key)</p>
                    {[
                      { id: "gemini-2.0-flash-image", label: "Gemini 2.0 Flash Image", desc: "Fast, free tier available. Best for: technical diagrams, architecture charts, flowcharts", badge: "Free", badgeColor: "emerald" },
                      { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image (Nano Banana)", desc: "High-quality illustrations, image editing, multi-image fusion. Great for research visuals", badge: "Paid", badgeColor: "blue" },
                      { id: "imagen-4", label: "Imagen 4", desc: "Photorealistic, brand assets, people. Highest quality for professional images", badge: "Paid", badgeColor: "purple" },
                    ].map(m => (
                      <label key={m.id} className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all", imageGenModel === m.id ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/20 hover:border-border/80")}>
                        <input type="radio" name="imageGenModel" value={m.id} checked={imageGenModel === m.id} onChange={() => setImageGenModel(m.id)} className="mt-0.5 accent-amber-500" disabled={!canEdit} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-foreground">{m.label}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-semibold", `text-${m.badgeColor}-400 bg-${m.badgeColor}-500/10 border-${m.badgeColor}-500/20`)}>{m.badge}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* OpenRouter models */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">OpenRouter (uses OpenRouter API key)</p>
                    {[
                      { id: "google/gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image via OpenRouter", desc: "Same as Nano Banana, routed via OpenRouter. Good choice if you use OR as primary provider", badge: "Paid", badgeColor: "blue" },
                      { id: "google/gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image (Nano Banana 2)", desc: "Pro-level quality at Flash speed. Best overall quality/cost ratio for complex visuals", badge: "Paid", badgeColor: "amber" },
                      { id: "openai/gpt-5-image-mini", label: "GPT-5 Image Mini via OpenRouter", desc: "Excellent text-in-image rendering, detailed edits, instruction following", badge: "Paid", badgeColor: "purple" },
                      { id: "bytedance/seedream-4.5", label: "Seedream 4.5 via OpenRouter", desc: "Best portrait refinement, editing consistency. $0.04/image", badge: "$0.04", badgeColor: "zinc" },
                      { id: "sourceful/riverflow-v2-fast", label: "Riverflow V2 Fast via OpenRouter", desc: "Fastest generation, best for production/high-volume. $0.02/1K images", badge: "Fastest", badgeColor: "emerald" },
                    ].map(m => (
                      <label key={m.id} className={cn("flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all", imageGenModel === m.id ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-muted/20 hover:border-border/80")}>
                        <input type="radio" name="imageGenModel" value={m.id} checked={imageGenModel === m.id} onChange={() => setImageGenModel(m.id)} className="mt-0.5 accent-amber-500" disabled={!canEdit} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-foreground">{m.label}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-semibold", `text-${m.badgeColor}-400 bg-${m.badgeColor}-500/10 border-${m.badgeColor}-500/20`)}>{m.badge}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Save button */}
                  <div className="pt-2">
                    <button
                      onClick={async () => { setSavingImageModel(true); try { await saveKey({ imageGenerationModel: imageGenModel }) } finally { setSavingImageModel(false) } }}
                      disabled={!canEdit || savingImageModel}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {savingImageModel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                      Save Image Model
                    </button>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Selected: <span className="text-amber-400 font-medium">{imageGenModel}</span>
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                API — CLOUDINARY
            ══════════════════════════════════════════════════ */}
            {activeSection === "api-cloudinary" && (
              <SectionCard title="Cloudinary Image CDN" icon={Image} locked={!canEdit} accent="purple" id="api-cloudinary">
                <p className="text-[12px] text-muted-foreground mb-5">
                  Stores agent-generated images permanently. Requires
                  <span className="text-purple-400 font-medium"> Cloud Name</span> +
                  <span className="text-purple-400 font-medium"> Upload Preset</span> (unsigned) or
                  <span className="text-purple-400 font-medium"> API Key</span> (signed).
                </p>

                {/* Cloud Name */}
                <div className="space-y-2.5 pb-5 border-b border-border/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-[12px] font-semibold text-foreground">Cloud Name</label>
                    {settings?.hasCloudinaryCloudName && <span className="text-[10px] text-emerald-400 font-medium border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 rounded-full">Saved ✓</span>}
                    <a href="https://cloudinary.com/documentation/cloudinary_get_started" target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"><Link2 className="w-3 h-3" />Docs</a>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Found in your Cloudinary dashboard. Not a secret.</p>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-primary/40">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <input type="text" value={cloudName} onChange={e => setCloudName(e.target.value)} placeholder="my-cloud-name" disabled={!canEdit}
                      className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-0" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={async () => { setSavingCloud(true); try { await saveKey({ cloudinaryCloudName: cloudName || null }) } finally { setSavingCloud(false) } }}
                      disabled={!cloudName.trim() || !canEdit || savingCloud}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                      {savingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />} Save
                    </button>
                    <button onClick={async () => testProvider("cloudinary", setTestCloud, cloudName || undefined)} disabled={testCloud.type === "loading"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                      {testCloud.type === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Test
                    </button>
                    {testCloud.type && testCloud.type !== "loading" && (
                      <span className={cn("text-[12px] flex items-center gap-1", testCloud.type === "success" ? "text-emerald-400" : "text-red-400")}>
                        {testCloud.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}{testCloud.message}
                      </span>
                    )}
                  </div>
                </div>

                <ToolKeyRow label="Upload Preset" placeholder="ml_default" hasSaved={!!settings?.hasCloudinaryUploadPreset}
                  hint="Create an unsigned preset in Cloudinary → Settings → Upload. Recommended." isPassword={false}
                  value={cloudPreset} onChange={setCloudPreset}
                  onSave={async () => { setSavingCloud(true); try { await saveKey({ cloudinaryUploadPreset: cloudPreset || null }); setCloudPreset("") } finally { setSavingCloud(false) } }}
                  onTest={async () => setTestCloud(cloudPreset || settings?.hasCloudinaryUploadPreset ? { type: "success", message: "Preset configured ✓" } : { type: "error", message: "No preset saved" })}
                  saving={savingCloud} testStatus={{ type: null, message: "" }} disabled={!canEdit} docsUrl="https://cloudinary.com/documentation/upload_presets" />

                <ToolKeyRow label="API Key (optional — signed uploads)" placeholder="123456789012345" hasSaved={!!settings?.hasCloudinaryApiKey}
                  hint="Only needed for signed uploads. Skip if using an unsigned preset."
                  value={cloudApiKey} onChange={setCloudApiKey}
                  onSave={async () => { setSavingCloud(true); try { await saveKey({ cloudinaryApiKey: cloudApiKey || null }); setCloudApiKey("") } finally { setSavingCloud(false) } }}
                  onTest={async () => setTestCloud(cloudApiKey || settings?.hasCloudinaryApiKey ? { type: "success", message: "API key configured ✓" } : { type: "error", message: "No API key saved" })}
                  saving={savingCloud} testStatus={{ type: null, message: "" }} disabled={!canEdit} docsUrl="https://cloudinary.com/documentation/upload_images" />

                {/* Status */}
                <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border">
                  <p className="text-[12px] font-medium text-foreground mb-2">Configuration Status</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Cloud Name", ok: !!settings?.hasCloudinaryCloudName },
                      { label: "Upload Preset", ok: !!settings?.hasCloudinaryUploadPreset },
                      { label: "API Key", ok: !!settings?.hasCloudinaryApiKey, optional: true },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2">
                        {item.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-muted-foreground/40" />}
                        <span className={cn("text-[12px]", item.ok ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
                        {(item as { optional?: boolean }).optional && !item.ok && <span className="text-[10px] text-muted-foreground">(optional)</span>}
                      </div>
                    ))}
                  </div>
                  {settings?.hasCloudinaryCloudName && settings?.hasCloudinaryUploadPreset && (
                    <p className="mt-2 text-[11px] text-emerald-400">✓ Cloudinary fully configured. Agent can upload images.</p>
                  )}
                </div>
              </SectionCard>
            )}

            {/* ══════════════════════════════════════════════════
                AGENT FILES
            ══════════════════════════════════════════════════ */}
            {activeSection === "agent-files" && (
              <>
                <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-purple-500/20 bg-purple-500/5 text-[13px]">
                  <FileCode2 className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-purple-300 font-medium mb-0.5">Agent Configuration Files</p>
                    <p className="text-muted-foreground text-[12px] leading-relaxed">
                      Control agent behavior via markdown files injected into the system prompt.
                      <span className="text-purple-400 mx-1">System</span>·
                      <span className="text-amber-400 mx-1">Rules</span>·
                      <span className="text-blue-400 ml-1">Tools</span>
                    </p>
                  </div>
                </div>
                <AgentFilesPanel />
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

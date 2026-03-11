"use client"

import { useState, useEffect, useCallback } from "react"
import { useUser } from "@clerk/nextjs"
import {
  Settings, Key, Cpu, User, Shield, CheckCircle2,
  XCircle, Loader2, Eye, EyeOff, RefreshCw, Zap,
  Star, Lock, ChevronRight, AlertTriangle, Globe,
} from "lucide-react"

// ─── Types ───────────────────────────────────────────────────────────────────

interface AISettingsData {
  defaultProvider: string
  geminiDefaultModel: string
  selectedOpenRouterModels: string[]
  hasGeminiKey: boolean
  hasOpenRouterKey: boolean
}

interface ORModel {
  id: string
  name: string
  provider: string
  free: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", tier: "Free" as const },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "Paid" as const },
  { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Exp", tier: "Free" as const },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", tier: "Paid" as const },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", tier: "Free" as const },
]

const ADMIN_ROLES = ["super_admin", "admin"]

const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  developer: "Developer",
  user: "User",
}

const ROLE_COLOR: Record<string, string> = {
  super_admin: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  admin: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  developer: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  user: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: "Free" | "Paid" }) {
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
      tier === "Free"
        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
        : "text-amber-400 bg-amber-500/10 border-amber-500/30"
    }`}>
      {tier}
    </span>
  )
}

function StatusMessage({ status }: { status: { type: "success" | "error" | null; message: string } }) {
  if (!status.type) return null
  return (
    <div className={`flex items-center gap-2 text-[12px] px-3 py-2 rounded-lg border ${
      status.type === "success"
        ? "text-emerald-400 bg-emerald-500/5 border-emerald-500/20"
        : "text-red-400 bg-red-500/5 border-red-500/20"
    }`}>
      {status.type === "success"
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
      {status.message}
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
  locked,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  locked?: boolean
}) {
  return (
    <div className={`rounded-xl border border-border bg-card/50 overflow-hidden ${locked ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-amber-400" />
        </div>
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
        {locked && (
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span>Admin only</span>
          </div>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoaded } = useUser()
  const [activeTab, setActiveTab] = useState<"account" | "ai-providers">("account")

  // AI Settings state
  const [settings, setSettings] = useState<AISettingsData | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const canEdit = userRole ? ADMIN_ROLES.includes(userRole) : false

  // Gemini state
  const [geminiKey, setGeminiKey] = useState("")
  const [showGeminiKey, setShowGeminiKey] = useState(false)
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" })
  const [testingGemini, setTestingGemini] = useState(false)
  const [savingGemini, setSavingGemini] = useState(false)
  const [selectedGeminiModel, setSelectedGeminiModel] = useState("gemini-2.5-flash")

  // OpenRouter state
  const [orKey, setOrKey] = useState("")
  const [showOrKey, setShowOrKey] = useState(false)
  const [orKeyStatus, setOrKeyStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" })
  const [testingOR, setTestingOR] = useState(false)
  const [savingOR, setSavingOR] = useState(false)
  const [orModels, setOrModels] = useState<{ free: ORModel[]; pro: ORModel[] }>({ free: [], pro: [] })
  const [loadingModels, setLoadingModels] = useState(false)
  const [selectedORModels, setSelectedORModels] = useState<string[]>([])

  // Provider toggle
  const [defaultProvider, setDefaultProvider] = useState<"gemini" | "openrouter">("gemini")
  const [savingProvider, setSavingProvider] = useState(false)

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      setLoadingSettings(true)
      const res = await fetch("/api/settings")
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        setDefaultProvider(data.defaultProvider || "gemini")
        setSelectedGeminiModel(data.geminiDefaultModel || "gemini-2.5-flash")
        setSelectedORModels(data.selectedOpenRouterModels || [])
      }
    } catch { /* ignore */ } finally {
      setLoadingSettings(false)
    }
  }, [])

  // Fetch user role from DB
  useEffect(() => {
    if (!user) return
    fetch("/api/users")
      .then(r => r.json())
      .then(data => {
        const u = Array.isArray(data) ? data.find((u: { clerkId: string; role: string }) => u.clerkId === user.id) : null
        if (u) setUserRole(u.role)
      })
      .catch(() => {})
  }, [user])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  // Fetch OR models when tab is opened
  useEffect(() => {
    if (activeTab === "ai-providers") {
      setLoadingModels(true)
      fetch("/api/openrouter-models")
        .then(r => r.json())
        .then(data => setOrModels({ free: data.free || [], pro: data.pro || [] }))
        .catch(() => {})
        .finally(() => setLoadingModels(false))
    }
  }, [activeTab])

  const saveGeminiKey = async () => {
    if (!geminiKey.trim()) return
    setSavingGemini(true)
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiApiKey: geminiKey, geminiDefaultModel: selectedGeminiModel }),
      })
      if (res.ok) {
        setGeminiKeyStatus({ type: "success", message: "Gemini API key saved successfully" })
        setGeminiKey("")
        fetchSettings()
      } else {
        const err = await res.json()
        setGeminiKeyStatus({ type: "error", message: err.error || "Failed to save" })
      }
    } catch {
      setGeminiKeyStatus({ type: "error", message: "Network error" })
    } finally {
      setSavingGemini(false)
    }
  }

  const testGemini = async () => {
    setTestingGemini(true)
    setGeminiKeyStatus({ type: null, message: "" })
    try {
      const res = await fetch("/api/settings/test-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: geminiKey || undefined }),
      })
      const data = await res.json()
      setGeminiKeyStatus({
        type: data.success ? "success" : "error",
        message: data.success ? data.message : data.error,
      })
    } catch {
      setGeminiKeyStatus({ type: "error", message: "Connection test failed" })
    } finally {
      setTestingGemini(false)
    }
  }

  const saveORKey = async () => {
    if (!orKey.trim()) return
    setSavingOR(true)
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openrouterApiKey: orKey, selectedOpenRouterModels: selectedORModels }),
      })
      if (res.ok) {
        setOrKeyStatus({ type: "success", message: "OpenRouter API key saved successfully" })
        setOrKey("")
        fetchSettings()
        // Reload models with new key
        setLoadingModels(true)
        fetch("/api/openrouter-models")
          .then(r => r.json())
          .then(data => setOrModels({ free: data.free || [], pro: data.pro || [] }))
          .finally(() => setLoadingModels(false))
      } else {
        const err = await res.json()
        setOrKeyStatus({ type: "error", message: err.error || "Failed to save" })
      }
    } catch {
      setOrKeyStatus({ type: "error", message: "Network error" })
    } finally {
      setSavingOR(false)
    }
  }

  const testOpenRouter = async () => {
    setTestingOR(true)
    setOrKeyStatus({ type: null, message: "" })
    try {
      const res = await fetch("/api/settings/test-openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: orKey || undefined }),
      })
      const data = await res.json()
      setOrKeyStatus({
        type: data.success ? "success" : "error",
        message: data.success ? data.message : data.error,
      })
    } catch {
      setOrKeyStatus({ type: "error", message: "Connection test failed" })
    } finally {
      setTestingOR(false)
    }
  }

  const saveDefaultProvider = async (p: "gemini" | "openrouter") => {
    setSavingProvider(true)
    setDefaultProvider(p)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultProvider: p }),
      })
      fetchSettings()
    } catch { /* ignore */ } finally {
      setSavingProvider(false)
    }
  }

  const saveGeminiModel = async (model: string) => {
    setSelectedGeminiModel(model)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geminiDefaultModel: model }),
      })
    } catch { /* ignore */ }
  }

  const toggleORModel = async (modelId: string) => {
    let updated: string[]
    if (selectedORModels.includes(modelId)) {
      updated = selectedORModels.filter(m => m !== modelId)
    } else if (selectedORModels.length >= 5) {
      updated = [...selectedORModels.slice(1), modelId]
    } else {
      updated = [...selectedORModels, modelId]
    }
    setSelectedORModels(updated)
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOpenRouterModels: updated }),
      })
    } catch { /* ignore */ }
  }

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
      </div>
    )
  }

  const clerkRole = (user?.publicMetadata?.role as string) || userRole || "user"

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold text-foreground">Settings</h1>
            <p className="text-[12px] text-muted-foreground">Manage your account and AI provider configuration</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex-shrink-0">
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border w-fit">
          {[
            { id: "account" as const, label: "Account", icon: User },
            { id: "ai-providers" as const, label: "Manage API", icon: Cpu },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-5">
        {/* ── ACCOUNT TAB ── */}
        {activeTab === "account" && (
          <>
            <SectionCard title="Account Status" icon={User}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {user?.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName || ""}
                      className="w-16 h-16 rounded-full border-2 border-amber-500/30"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/30 flex items-center justify-center">
                      <User className="w-8 h-8 text-amber-400" />
                    </div>
                  )}
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-[16px] font-bold text-foreground">
                      {user?.fullName || user?.firstName || "—"}
                    </h2>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLOR[clerkRole] || ROLE_COLOR.user}`}>
                      {ROLE_DISPLAY[clerkRole] || clerkRole}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {user?.primaryEmailAddress?.emailAddress || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Clerk ID: <code className="font-mono text-amber-400/70">{user?.id?.slice(0, 20)}…</code>
                  </p>
                </div>
              </div>

              {/* Details grid */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: "Full Name", value: user?.fullName || "Not set" },
                  { label: "Email", value: user?.primaryEmailAddress?.emailAddress || "—" },
                  { label: "Role", value: ROLE_DISPLAY[clerkRole] || clerkRole },
                  { label: "Member Since", value: user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—" },
                ].map(item => (
                  <div key={item.label} className="rounded-lg bg-muted/30 border border-border px-4 py-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{item.label}</p>
                    <p className="text-[13px] text-foreground font-medium">{item.value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Permissions" icon={Shield}>
              <div className="space-y-2">
                {[
                  { label: "View Dashboard", allowed: true },
                  { label: "Create / Edit Content", allowed: true },
                  { label: "Manage AI Settings", allowed: canEdit },
                  { label: "Manage Users", allowed: ["super_admin", "admin"].includes(clerkRole) },
                  { label: "Change Roles", allowed: clerkRole === "super_admin" },
                ].map(perm => (
                  <div key={perm.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-[13px] text-foreground">{perm.label}</span>
                    {perm.allowed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}

        {/* ── AI PROVIDERS TAB ── */}
        {activeTab === "ai-providers" && (
          <>
            {!canEdit && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-[13px]">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>You need <strong>Admin</strong> or <strong>Super Admin</strong> role to modify AI settings. You can view the current configuration.</span>
              </div>
            )}

            {/* Default Provider Toggle */}
            <SectionCard title="Default AI Provider" icon={Zap} locked={!canEdit}>
              <p className="text-[12px] text-muted-foreground mb-4">
                Choose which AI provider powers the chat assistant by default.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["gemini", "openrouter"] as const).map(p => (
                  <button
                    key={p}
                    disabled={!canEdit || savingProvider}
                    onClick={() => saveDefaultProvider(p)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      defaultProvider === p
                        ? "border-amber-500/60 bg-amber-500/10 text-amber-400"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
                    } disabled:cursor-not-allowed`}
                  >
                    {p === "gemini" ? <Cpu className="w-6 h-6" /> : <Globe className="w-6 h-6" />}
                    <span className="text-[13px] font-semibold capitalize">{p === "openrouter" ? "OpenRouter" : "Gemini"}</span>
                    {defaultProvider === p && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                    )}
                    {loadingSettings && <Loader2 className="absolute bottom-2 right-2 w-3 h-3 animate-spin" />}
                  </button>
                ))}
              </div>
              {settings && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Current: <span className="text-amber-400 font-medium capitalize">{settings.defaultProvider}</span>
                  {settings.hasGeminiKey || settings.hasOpenRouterKey ? "" : " · No API keys configured yet"}
                </p>
              )}
            </SectionCard>

            {/* ── GEMINI ── */}
            <SectionCard title="Gemini API" icon={Key} locked={!canEdit}>
              {/* Key input */}
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] text-muted-foreground font-medium mb-1.5 block">
                    API Key {settings?.hasGeminiKey && <span className="text-emerald-400 ml-1">· Key saved ✓</span>}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-amber-500/40">
                      <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <input
                        type={showGeminiKey ? "text" : "password"}
                        value={geminiKey}
                        onChange={e => setGeminiKey(e.target.value)}
                        placeholder={settings?.hasGeminiKey ? "Enter new key to update" : "AIzaSy…"}
                        disabled={!canEdit}
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(v => !v)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={saveGeminiKey}
                    disabled={!geminiKey.trim() || !canEdit || savingGemini}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-[12px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    Update API Key
                  </button>
                  <button
                    onClick={testGemini}
                    disabled={testingGemini}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {testingGemini ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Test Connection
                  </button>
                </div>

                <StatusMessage status={geminiKeyStatus} />
              </div>

              {/* Model selection */}
              <div className="mt-6">
                <h4 className="text-[13px] font-semibold text-foreground mb-3">Available Models</h4>
                <div className="space-y-2">
                  {GEMINI_MODELS.map(model => (
                    <button
                      key={model.id}
                      disabled={!canEdit}
                      onClick={() => saveGeminiModel(model.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                        selectedGeminiModel === model.id
                          ? "border-amber-500/50 bg-amber-500/10"
                          : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30"
                      } disabled:cursor-not-allowed`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        selectedGeminiModel === model.id ? "border-amber-500" : "border-muted-foreground/40"
                      }`}>
                        {selectedGeminiModel === model.id && (
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                        )}
                      </div>
                      <span className="flex-1 text-[13px] text-foreground">{model.name}</span>
                      <TierBadge tier={model.tier} />
                      {selectedGeminiModel === model.id && (
                        <span className="text-[10px] text-amber-400 font-medium">Default</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* ── OPENROUTER ── */}
            <SectionCard title="OpenRouter API" icon={Globe} locked={!canEdit}>
              {/* Key input */}
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] text-muted-foreground font-medium mb-1.5 block">
                    API Key {settings?.hasOpenRouterKey && <span className="text-emerald-400 ml-1">· Key saved ✓</span>}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 focus-within:border-amber-500/40">
                      <Key className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <input
                        type={showOrKey ? "text" : "password"}
                        value={orKey}
                        onChange={e => setOrKey(e.target.value)}
                        placeholder={settings?.hasOpenRouterKey ? "Enter new key to update" : "sk-or-…"}
                        disabled={!canEdit}
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOrKey(v => !v)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showOrKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={saveORKey}
                    disabled={!orKey.trim() || !canEdit || savingOR}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-[12px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingOR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    Update API Key
                  </button>
                  <button
                    onClick={testOpenRouter}
                    disabled={testingOR}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border bg-muted/50 text-[12px] text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {testingOR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Test Connection
                  </button>
                </div>

                <StatusMessage status={orKeyStatus} />
              </div>

              {/* Model selection hint */}
              <div className="mt-3 text-[12px] text-muted-foreground px-3 py-2 rounded-lg bg-muted/20 border border-border">
                <strong className="text-foreground">Model selection:</strong> Select up to 5 models below. They will appear in the chat model switcher.
                {selectedORModels.length > 0 && (
                  <span className="ml-2 text-amber-400">{selectedORModels.length}/5 selected</span>
                )}
              </div>

              {/* Models list */}
              {loadingModels ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[12px]">Loading models…</span>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {/* Free Models */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-[13px] font-semibold text-foreground">Top Free Models</h4>
                      <TierBadge tier="Free" />
                    </div>
                    <div className="space-y-2">
                      {orModels.free.map(model => {
                        const isSelected = selectedORModels.includes(model.id)
                        return (
                          <button
                            key={model.id}
                            onClick={() => canEdit && toggleORModel(model.id)}
                            disabled={!canEdit || (!isSelected && selectedORModels.length >= 5)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                              isSelected
                                ? "border-emerald-500/50 bg-emerald-500/10"
                                : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                              isSelected ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground/40"
                            }`}>
                              {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-foreground truncate">{model.name}</p>
                              <p className="text-[11px] text-muted-foreground capitalize">{model.provider}</p>
                            </div>
                            <TierBadge tier="Free" />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Pro Models */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-[13px] font-semibold text-foreground">Top Pro Models</h4>
                      <TierBadge tier="Paid" />
                      <Star className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="space-y-2">
                      {orModels.pro.map(model => {
                        const isSelected = selectedORModels.includes(model.id)
                        return (
                          <button
                            key={model.id}
                            onClick={() => canEdit && toggleORModel(model.id)}
                            disabled={!canEdit || (!isSelected && selectedORModels.length >= 5)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                              isSelected
                                ? "border-amber-500/50 bg-amber-500/10"
                                : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/30"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                              isSelected ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40"
                            }`}>
                              {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] text-foreground truncate">{model.name}</p>
                              <p className="text-[11px] text-muted-foreground capitalize">{model.provider}</p>
                            </div>
                            <TierBadge tier="Paid" />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Selected models summary */}
            {selectedORModels.length > 0 && (
              <div className="rounded-xl border border-border bg-card/50 p-5">
                <h4 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Active Chat Models
                  <span className="text-[11px] text-muted-foreground font-normal">(appear in chat switcher)</span>
                </h4>
                <div className="space-y-2">
                  {/* Gemini default */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <Cpu className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="text-[12px] text-foreground flex-1">{GEMINI_MODELS.find(m => m.id === selectedGeminiModel)?.name || selectedGeminiModel}</span>
                    <span className="text-[10px] text-amber-400">Gemini</span>
                  </div>
                  {selectedORModels.map((id, idx) => {
                    const model = [...orModels.free, ...orModels.pro].find(m => m.id === id)
                    return (
                      <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border">
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-[12px] text-foreground flex-1">{model?.name || id}</span>
                        <span className="text-[10px] text-muted-foreground">OpenRouter</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

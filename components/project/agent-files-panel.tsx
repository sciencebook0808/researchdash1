"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  FileText, Plus, Upload, ToggleLeft, ToggleRight, History,
  Loader2, CheckCircle2, XCircle, Trash2, RotateCcw,
  Save, Eye, EyeOff, Settings2, X, Shield, Wrench,
  BookOpen, ArrowLeft, ChevronRight, AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentFile {
  id: string
  name: string
  type: "system" | "rules" | "tools"
  content: string
  isActive: boolean
  order: number
  createdAt: string
  updatedAt: string
  history: Array<{ id: string; version: number; savedBy: string | null; createdAt: string }>
}

interface HistoryRecord {
  id: string
  version: number
  content: string
  savedBy: string | null
  createdAt: string
}

type EditorTab = "editor" | "history"

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_META = {
  system: { label: "System", icon: Shield,   color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", dot: "bg-purple-400", desc: "Replaces/extends the base system prompt" },
  rules:  { label: "Rules",  icon: BookOpen, color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20",   dot: "bg-amber-400",  desc: "Additional behavioral rules" },
  tools:  { label: "Tools",  icon: Wrench,   color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",     dot: "bg-blue-400",   desc: "Tool configuration and overrides" },
}

// ─── Toast hook ───────────────────────────────────────────────────────────────

interface Toast { id: string; message: string; type: "success" | "error" | "warning" }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now().toString()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  return { toasts, show }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AgentFilesPanel() {
  const [files, setFiles]             = useState<AgentFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<AgentFile | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editName, setEditName]       = useState("")
  const [saving, setSaving]           = useState(false)
  const [dirty, setDirty]             = useState(false)
  const [editorTab, setEditorTab]     = useState<EditorTab>("editor")
  const [history, setHistory]         = useState<HistoryRecord[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [toggling, setToggling]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [previewVer, setPreviewVer]   = useState<HistoryRecord | null>(null)
  // Mobile: "list" | "editor" panel view
  const [mobileView, setMobileView]   = useState<"list" | "editor">("list")
  const fileInputRef                  = useRef<HTMLInputElement>(null)
  const { toasts, show }              = useToast()

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/files")
      const data = await res.json()
      setFiles(data.files || [])
    } catch { show("Failed to load agent files", "error") }
    finally { setLoading(false) }
  }, [show])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  // ── Select ─────────────────────────────────────────────────────────────────

  const selectFile = (file: AgentFile) => {
    if (dirty && !confirm("Discard unsaved changes?")) return
    setSelected(file)
    setEditContent(file.content)
    setEditName(file.name)
    setDirty(false)
    setEditorTab("editor")
    setHistory([])
    setPreviewVer(null)
    setMobileView("editor") // auto-navigate on mobile
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const save = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch("/api/agent/files", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, name: editName, type: selected.type, content: editContent }),
      })
      const data = await res.json()
      if (!res.ok) { show(data.error || "Save failed", "error"); return }
      show("Saved ✓")
      setDirty(false)
      await fetchFiles()
      setSelected(p => p ? { ...p, content: editContent, name: editName } : p)
    } catch { show("Save failed", "error") }
    finally { setSaving(false) }
  }

  // ── Toggle ─────────────────────────────────────────────────────────────────

  const toggle = async (file: AgentFile, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setToggling(file.id)
    try {
      const res = await fetch("/api/agent/files/toggle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: file.id }) })
      const data = await res.json()
      if (!res.ok) { show(data.error || "Toggle failed", "error"); return }
      show(data.message)
      await fetchFiles()
      // Keep selected in sync
      if (selected?.id === file.id) setSelected(p => p ? { ...p, isActive: !p.isActive } : p)
    } catch { show("Toggle failed", "error") }
    finally { setToggling(null) }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteFile = async (file: AgentFile, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return
    setDeleting(file.id)
    try {
      const res = await fetch(`/api/agent/files?id=${file.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { show(data.error || "Delete failed", "error"); return }
      show("File deleted")
      if (selected?.id === file.id) { setSelected(null); setMobileView("list") }
      await fetchFiles()
    } catch { show("Delete failed", "error") }
    finally { setDeleting(null) }
  }

  // ── History ────────────────────────────────────────────────────────────────

  const loadHistory = async () => {
    if (!selected) return
    setHistLoading(true)
    try {
      const res = await fetch(`/api/agent/files/history?fileId=${selected.id}`)
      const data = await res.json()
      setHistory(data.history || [])
    } catch { show("Failed to load history", "error") }
    finally { setHistLoading(false) }
  }

  useEffect(() => {
    if (editorTab === "history" && selected) loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTab, selected?.id])

  // ── Rollback ───────────────────────────────────────────────────────────────

  const rollback = async (histId: string, version: number) => {
    if (!selected || !confirm(`Restore to v${version}? Current version will be backed up.`)) return
    try {
      const res = await fetch("/api/agent/files/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rollback", fileId: selected.id, historyId: histId }) })
      const data = await res.json()
      if (!res.ok) { show(data.error || "Rollback failed", "error"); return }
      show(data.message)
      setEditContent(data.file?.content || "")
      setDirty(false)
      setEditorTab("editor")
      await fetchFiles()
    } catch { show("Rollback failed", "error") }
  }

  // ── Upload ─────────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append("file", file)
    form.append("type", "rules")
    try {
      const res = await fetch("/api/agent/files/upload", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) { show(data.error || "Upload failed", "error"); return }
      show(data.message)
      await fetchFiles()
    } catch { show("Upload failed", "error") }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Grouped files ──────────────────────────────────────────────────────────

  const grouped = {
    system: files.filter(f => f.type === "system"),
    rules:  files.filter(f => f.type === "rules"),
    tools:  files.filter(f => f.type === "tools"),
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative">

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-xs w-full">
        {toasts.map(t => (
          <div key={t.id} className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg border pointer-events-auto",
            t.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
            t.type === "error"   ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                   "bg-amber-500/10 border-amber-500/20 text-amber-400"
          )}>
            {t.type === "success" ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{t.message}</span>
          </div>
        ))}
      </div>

      {/* ── MAIN PANEL ────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">

        {/* ── Mobile: stacked view ──────────────────────────────────────────
            Desktop: two-column layout via flex
        ─────────────────────────────────────────────────────────────────── */}
        <div className="flex h-[580px] sm:h-[640px]">

          {/* ── FILE LIST PANEL ─────────────────────────────────────────── */}
          <div className={cn(
            "flex flex-col border-r border-border bg-muted/10 transition-all duration-200",
            // Desktop: always visible fixed width
            "md:w-64 md:flex md:flex-shrink-0",
            // Mobile: full width when on list view, hidden when on editor
            mobileView === "list" ? "flex flex-col w-full" : "hidden md:flex"
          )}>

            {/* List header */}
            <div className="p-3 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[13px] font-semibold text-foreground">Agent Files</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{files.filter(f => f.isActive).length}/{files.length} active</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[12px] font-medium transition-colors border border-primary/20">
                  <Plus className="w-3.5 h-3.5" /> New
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-[12px] font-medium transition-colors border border-border">
                  <Upload className="w-3.5 h-3.5" /> Upload
                </button>
                <input ref={fileInputRef} type="file" accept=".md" className="hidden" onChange={handleUpload} />
              </div>
            </div>

            {/* File list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : files.length === 0 ? (
                <div className="py-10 text-center">
                  <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[12px] text-muted-foreground">No files yet.</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">Create one or upload a .md file.</p>
                </div>
              ) : (
                (["system", "rules", "tools"] as const).map(type => {
                  const group = grouped[type]
                  if (!group.length) return null
                  const meta = TYPE_META[type]
                  const Icon = meta.icon
                  return (
                    <div key={type}>
                      <div className="flex items-center gap-1.5 px-2 mb-1">
                        <Icon className={cn("w-3 h-3", meta.color)} />
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", meta.color)}>{meta.label}</span>
                      </div>
                      <div className="space-y-1">
                        {group.map(file => {
                          const isActive = file.id === selected?.id
                          return (
                            <div key={file.id} onClick={() => selectFile(file)}
                              className={cn(
                                "group relative flex items-center gap-2 px-2.5 py-2.5 rounded-lg cursor-pointer transition-all border",
                                isActive ? "bg-primary/10 border-primary/30" : "hover:bg-muted/50 border-transparent hover:border-border",
                                !file.isActive && "opacity-50"
                              )}>
                              {/* Active dot */}
                              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", file.isActive ? meta.dot : "bg-muted-foreground/30")} />

                              {/* Name + meta */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-foreground truncate">{file.name}</p>
                                <p className={cn("text-[10px]", file.isActive ? "text-emerald-400" : "text-muted-foreground")}>
                                  {file.isActive ? "active" : "inactive"}
                                </p>
                              </div>

                              {/* Arrow (mobile) / actions (desktop) */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Desktop quick actions */}
                                <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={e => toggle(file, e)} title={file.isActive ? "Deactivate" : "Activate"}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                    {toggling === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : file.isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </button>
                                  <button onClick={e => deleteFile(file, e)} title="Delete"
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors">
                                    {deleting === file.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                                {/* Mobile arrow */}
                                <ChevronRight className={cn("w-4 h-4 md:hidden flex-shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── EDITOR PANEL ────────────────────────────────────────────── */}
          <div className={cn(
            "flex-1 flex flex-col min-w-0",
            // Mobile: full width when on editor, hidden when on list
            mobileView === "editor" ? "flex" : "hidden md:flex"
          )}>
            {!selected ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-6">
                <FileText className="w-10 h-10 opacity-20" />
                <div className="text-center">
                  <p className="text-sm font-medium">Select a file to edit</p>
                  <p className="text-[12px] mt-1 opacity-60">or create / upload a new one</p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 w-full max-w-xs">
                  {(["system", "rules", "tools"] as const).map(type => {
                    const meta = TYPE_META[type]
                    const Icon = meta.icon
                    return (
                      <div key={type} className={cn("p-2.5 rounded-lg border text-center", meta.bg)}>
                        <Icon className={cn("w-4 h-4 mx-auto mb-1", meta.color)} />
                        <p className={cn("text-[10px] font-bold", meta.color)}>{meta.label}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                {/* Editor header */}
                <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-border bg-muted/10 flex-shrink-0">
                  {/* Back button — mobile only */}
                  <button onClick={() => setMobileView("list")} className="md:hidden p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  {/* Type badge */}
                  <div className={cn("hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold flex-shrink-0", TYPE_META[selected.type].bg, TYPE_META[selected.type].color)}>
                    {(() => { const Icon = TYPE_META[selected.type].icon; return <Icon className="w-3 h-3" /> })()}
                    {TYPE_META[selected.type].label}
                  </div>

                  {/* File name (editable) */}
                  <input value={editName} onChange={e => { setEditName(e.target.value); setDirty(true) }}
                    className="flex-1 text-[13px] font-semibold bg-transparent outline-none text-foreground min-w-0"
                    placeholder="File name…" />

                  {dirty && <span className="text-[10px] text-amber-400 font-medium flex-shrink-0 hidden sm:block">● unsaved</span>}

                  {/* Toggle */}
                  <button onClick={() => toggle(selected)} disabled={!!toggling}
                    className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors flex-shrink-0",
                      selected.isActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-muted border-border text-muted-foreground hover:bg-muted/80")}>
                    {toggling === selected.id ? <Loader2 className="w-3 h-3 animate-spin" /> : selected.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    <span className="hidden sm:block">{selected.isActive ? "Active" : "Inactive"}</span>
                  </button>

                  {/* Save */}
                  <button onClick={save} disabled={!dirty || saving}
                    className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors flex-shrink-0",
                      dirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed opacity-50")}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span className="hidden sm:block">Save</span>
                  </button>
                </div>

                {/* Mobile: dirty indicator */}
                {dirty && (
                  <div className="sm:hidden flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/20">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span className="text-[11px] text-amber-400">Unsaved changes</span>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-border flex-shrink-0">
                  {(["editor", "history"] as EditorTab[]).map(tab => (
                    <button key={tab} onClick={() => setEditorTab(tab)}
                      className={cn("px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors",
                        editorTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                      {tab === "history"
                        ? <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5" /><span>History</span>{selected.history[0]?.version ? <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{selected.history[0].version}</span> : null}</span>
                        : "Editor"}
                    </button>
                  ))}

                  {/* Delete — right side */}
                  <div className="ml-auto flex items-center pr-3">
                    <button onClick={() => deleteFile(selected)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors">
                      {deleting === selected.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      <span className="hidden sm:block">Delete</span>
                    </button>
                  </div>
                </div>

                {/* ── EDITOR ─────────────────────────────────────────────── */}
                {editorTab === "editor" && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <textarea
                      value={editContent}
                      onChange={e => { setEditContent(e.target.value); setDirty(true) }}
                      className="flex-1 w-full resize-none bg-transparent p-4 font-mono text-[13px] text-foreground leading-relaxed outline-none border-none"
                      placeholder={"# My Agent File\n\nWrite your markdown content here…"}
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/10 flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground">{editContent.length.toLocaleString()} chars</span>
                      <span className="text-[10px] text-muted-foreground">Updated {new Date(selected.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}

                {/* ── HISTORY ────────────────────────────────────────────── */}
                {editorTab === "history" && (
                  <div className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden">

                    {/* History list */}
                    <div className="sm:w-56 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto flex-shrink-0 max-h-48 sm:max-h-none">
                      {histLoading ? (
                        <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                      ) : history.length === 0 ? (
                        <div className="py-6 text-center text-[12px] text-muted-foreground px-4">No history yet.<br />Saves on each update.</div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {history.map(h => (
                            <div key={h.id} onClick={() => setPreviewVer(previewVer?.id === h.id ? null : h)}
                              className={cn("p-2.5 rounded-lg border cursor-pointer transition-colors",
                                previewVer?.id === h.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted/50 border-transparent hover:border-border")}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-semibold text-foreground">v{h.version}</span>
                                <button onClick={e => { e.stopPropagation(); rollback(h.id, h.version) }}
                                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors flex-shrink-0">
                                  <RotateCcw className="w-3 h-3" /> Restore
                                </button>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(h.createdAt).toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Version preview */}
                    <div className="flex-1 overflow-y-auto p-4 min-w-0">
                      {previewVer ? (
                        <>
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className="text-[12px] font-semibold text-foreground">Preview v{previewVer.version}</span>
                            <span className="text-[10px] text-muted-foreground">{new Date(previewVer.createdAt).toLocaleString()}</span>
                            <button onClick={() => rollback(previewVer.id, previewVer.version)}
                              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-[12px] font-medium hover:bg-primary/20 transition-colors">
                              <RotateCcw className="w-3.5 h-3.5" /> Restore
                            </button>
                          </div>
                          <pre className="text-[12px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">{previewVer.content}</pre>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-[12px] flex-col gap-2">
                          <History className="w-8 h-8 opacity-20" />
                          <span>Select a version to preview</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── CREATE MODAL ────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateFileModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await fetchFiles() }}
          show={show}
        />
      )}
    </div>
  )
}

// ─── Create File Modal ────────────────────────────────────────────────────────

function CreateFileModal({ onClose, onCreated, show }: {
  onClose: () => void
  onCreated: () => Promise<void>
  show: (m: string, t?: "success" | "error" | "warning") => void
}) {
  const [name, setName]       = useState("")
  const [type, setType]       = useState<"system" | "rules" | "tools">("rules")
  const [content, setContent] = useState("# New Agent File\n\n")
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (!name.trim()) { show("Name is required", "error"); return }
    if (!content.trim()) { show("Content is required", "error"); return }
    setCreating(true)
    try {
      const res = await fetch("/api/agent/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type, content }) })
      const data = await res.json()
      if (!res.ok) { show(data.error || "Failed to create", "error"); return }
      show(data.message || "File created")
      await onCreated()
    } catch { show("Create failed", "error") }
    finally { setCreating(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <span className="text-[14px] font-semibold text-foreground">New Agent File</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Core Safety Rules"
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-sm text-foreground outline-none focus:border-primary/50 transition-colors" />
            </div>

            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["system", "rules", "tools"] as const).map(t => {
                  const meta = TYPE_META[t]
                  const Icon = meta.icon
                  return (
                    <button key={t} onClick={() => setType(t)}
                      className={cn("flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center",
                        type === t ? cn(meta.bg) : "bg-muted border-border opacity-60 hover:opacity-100")}>
                      <Icon className={cn("w-4 h-4", meta.color)} />
                      <span className={cn("text-[11px] font-bold", meta.color)}>{meta.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">{TYPE_META[type].desc}</p>
            </div>

            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Content (Markdown)</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={7}
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border text-[12px] font-mono text-foreground outline-none focus:border-primary/50 transition-colors resize-none"
                placeholder="# File content…" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 sm:px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={create} disabled={creating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

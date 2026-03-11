"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Edit3, Save, X, Loader2, Tag, CheckCircle2, Clock, Circle, Trash2 } from "lucide-react"
import Link from "next/link"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { DocContent } from "@/components/docs/doc-content"
import { cn, formatDate } from "@/lib/utils"

interface DocPage {
  id: string
  title: string
  slug: string
  content: string
  section: string
  tags: string[]
  progress: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"
  updatedAt: string
  versions?: { id: string; version: number; createdAt: string }[]
}

const PROGRESS_CONFIG = {
  NOT_STARTED: { label: "Not Started", icon: Circle, color: "text-zinc-400", bg: "bg-zinc-400/10 border-zinc-400/20" },
  IN_PROGRESS: { label: "In Progress", icon: Clock, color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" },
}

export default function DocPage() {
  const { slug } = useParams() as { slug: string }
  const router = useRouter()
  const [doc, setDoc] = useState<DocPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/docs/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setDoc(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  const startEdit = () => {
    if (!doc) return
    setEditContent(doc.content)
    setEditTitle(doc.title)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!doc) return
    setSaving(true)
    const res = await fetch(`/api/docs/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, content: editContent }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDoc(updated)
      setEditing(false)
    }
    setSaving(false)
  }

  const updateProgress = async (progress: DocPage["progress"]) => {
    if (!doc) return
    const res = await fetch(`/api/docs/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progress }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDoc(updated)
    }
  }

  const handleDelete = async () => {
    if (!confirm("Delete this document permanently?")) return
    setDeleting(true)
    await fetch(`/api/docs/${slug}`, { method: "DELETE" })
    router.push("/docs")
  }

  if (loading) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="h-8 bg-muted rounded w-1/2 animate-pulse" />
        <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
        <div className="space-y-2 mt-8">
          {[1,2,3,4,5].map(i => <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${90 - i * 8}%` }} />)}
        </div>
      </div>
    )
  }

  if (!doc) {
    return (
      <div className="text-center py-20">
        <p className="text-[14px] text-muted-foreground mb-4">Document not found.</p>
        <Link href="/docs" className="text-amber-400 hover:text-amber-300 text-[13px]">← Back to Documentation</Link>
      </div>
    )
  }

  const progressCfg = PROGRESS_CONFIG[doc.progress]
  const ProgressIcon = progressCfg.icon

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono">
            <span className="text-amber-500">▸</span> {doc.section}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-amber-500/30 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-[12px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      {editing ? (
        <input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          className="w-full text-2xl font-bold bg-transparent border-b border-amber-500/40 text-foreground outline-none pb-2"
        />
      ) : (
        <h1 className="text-2xl font-bold text-foreground">{doc.title}</h1>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Progress tracker */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Progress:</span>
          <div className="flex items-center gap-1">
            {(Object.keys(PROGRESS_CONFIG) as DocPage["progress"][]).map(p => {
              const cfg = PROGRESS_CONFIG[p]
              const Ic = cfg.icon
              return (
                <button
                  key={p}
                  onClick={() => updateProgress(p)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono border transition-all",
                    doc.progress === p ? `${cfg.color} ${cfg.bg}` : "border-border text-muted-foreground hover:border-amber-500/30"
                  )}
                >
                  <Ic className="w-3 h-3" />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        <span className="text-[11px] text-muted-foreground">Updated {formatDate(doc.updatedAt)}</span>

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {doc.tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-card p-6">
        {editing ? (
          <RichTextEditor
            content={editContent}
            onChange={setEditContent}
            placeholder="Edit content…"
            minHeight="500px"
          />
        ) : (
          <DocContent content={doc.content} />
        )}
      </div>

      {/* Version history */}
      {doc.versions && doc.versions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Version History</p>
          <div className="space-y-1">
            {doc.versions.map(v => (
              <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-[12px] font-mono text-foreground">v{v.version}</span>
                <span className="text-[11px] text-muted-foreground">{formatDate(v.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { BookOpen, ArrowLeft, Sparkles, Loader2, Save } from "lucide-react"
import Link from "next/link"

const SECTIONS = ["Overview", "Architecture", "Data Engineering", "Training", "Evaluation", "Deployment", "Research", "Uncategorized"]

export default function CreateDocPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: "", slug: "", section: "Overview", tags: "", order: "0",
  })
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")

  const autoSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  const handleTitleChange = (val: string) => {
    setForm(p => ({ ...p, title: val, slug: autoSlug(val) }))
  }

  const handleSave = async () => {
    if (!form.title || !form.slug) { setError("Title and slug are required"); return }
    setSaving(true)
    setError("")
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        slug: form.slug,
        section: form.section,
        content: content || "<p>No content yet.</p>",
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        order: Number(form.order),
      }),
    })
    setSaving(false)
    if (res.ok) {
      const doc = await res.json()
      router.push(`/docs/${doc.slug}`)
    } else {
      const d = await res.json()
      setError(d.error || "Failed to create document")
    }
  }

  const generateWithAI = async () => {
    if (!form.title) { setError("Enter a title first"); return }
    setAiLoading(true)
    setError("")
    const res = await fetch("/api/ai-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "document", title: form.title, section: form.section }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.content) setContent(data.content)
      if (data.tags && !form.tags) setForm(p => ({ ...p, tags: data.tags.join(", ") }))
    } else {
      setError("AI generation failed. Check GOOGLE_API_KEY.")
    }
    setAiLoading(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> DOCUMENTATION
        </div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Create Document</h1>
        </div>
        <p className="text-[14px] text-muted-foreground">Write documentation with rich text formatting or generate with AI.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-foreground">Document Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Title *</label>
            <input
              value={form.title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="e.g. SLM Training Pipeline"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Slug *</label>
            <input
              value={form.slug}
              onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
              placeholder="slm-training-pipeline"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Section</label>
            <select
              value={form.section}
              onChange={e => setForm(p => ({ ...p, section: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              {SECTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              placeholder="training, lora, slm"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      </div>

      {/* Content editor */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Content</h3>
          <button
            onClick={generateWithAI}
            disabled={aiLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 text-[12px] hover:bg-amber-500/10 transition-colors disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate with AI
          </button>
        </div>
        <RichTextEditor
          content={content}
          onChange={setContent}
          placeholder="Start writing your documentation… Use the toolbar for rich formatting."
          minHeight="400px"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Document
        </button>
        <Link href="/docs" className="px-4 py-2.5 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  )
}

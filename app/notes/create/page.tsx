"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { StickyNote, ArrowLeft, Loader2, Save, Sparkles } from "lucide-react"
import Link from "next/link"

export default function CreateNotePage() {
  const router = useRouter()
  const [form, setForm] = useState({ title: "", tags: "", pinned: false })
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSave = async () => {
    if (!form.title || !content) { setError("Title and content are required"); return }
    setSaving(true)
    setError("")
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        content,
        pinned: form.pinned,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      }),
    })
    setSaving(false)
    if (res.ok) router.push("/notes")
    else { const d = await res.json(); setError(d.error || "Failed to create note") }
  }

  const generateWithAI = async () => {
    if (!form.title) { setError("Enter a title first"); return }
    setAiLoading(true)
    setError("")
    const res = await fetch("/api/ai-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title: form.title }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.content) setContent(data.content)
      if (data.tags) setForm(p => ({ ...p, tags: data.tags.join(", ") }))
    } else {
      setError("AI generation failed. Check GOOGLE_API_KEY.")
    }
    setAiLoading(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> RESEARCH NOTES
        </div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/notes" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">New Research Note</h1>
        </div>
        <p className="text-[14px] text-muted-foreground">Write a note with rich text formatting or generate with AI.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-[13px] text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-foreground">Note Info</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[11px] text-muted-foreground mb-1 block">Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Observations on TinyLlama Perplexity"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              placeholder="research, training, ideas"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input
              type="checkbox" id="pinned" checked={form.pinned}
              onChange={e => setForm(p => ({ ...p, pinned: e.target.checked }))}
              className="rounded border-border"
            />
            <label htmlFor="pinned" className="text-[13px] text-foreground">Pin this note</label>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Content *</h3>
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
          placeholder="Write your research note… Use rich formatting for clarity."
          minHeight="350px"
        />
      </div>

      <div className="flex items-center gap-3 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Note
        </button>
        <Link href="/notes" className="px-4 py-2.5 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  )
}

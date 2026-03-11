"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Database, ArrowLeft, Loader2, Save, Sparkles } from "lucide-react"
import Link from "next/link"

interface Experiment { id: string; name: string }

const TYPES = ["CODE", "TEXT", "INSTRUCTION", "QA", "MIXED"]
const FORMATS = ["JSON", "JSONL", "CSV", "Parquet", "HuggingFace", "Custom"]
const LICENSES = ["MIT", "Apache-2.0", "CC BY 4.0", "CC BY-SA 4.0", "OpenRAIL", "Custom"]

export default function CreateDatasetPage() {
  const router = useRouter()
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [form, setForm] = useState({
    name: "", description: "", sourceUrl: "", datasetType: "CODE",
    numSamples: "", format: "JSONL", license: "", tags: "",
  })
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/experiments").then(r => r.json()).then(d => setExperiments(Array.isArray(d) ? d : []))
  }, [])

  const handleSave = async () => {
    if (!form.name) { setError("Dataset name is required"); return }
    setSaving(true)
    setError("")
    const res = await fetch("/api/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, description: form.description, sourceUrl: form.sourceUrl,
        datasetType: form.datasetType, numSamples: form.numSamples ? Number(form.numSamples) : null,
        format: form.format, license: form.license,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      }),
    })
    setSaving(false)
    if (res.ok) router.push("/datasets")
    else { const d = await res.json(); setError(d.error || "Failed to create dataset") }
  }

  const generateWithAI = async () => {
    if (!form.name) { setError("Enter a name first"); return }
    setAiLoading(true)
    setError("")
    const res = await fetch("/api/ai-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "dataset", title: form.name, datasetType: form.datasetType }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.description) setForm(p => ({ ...p, description: data.description }))
      if (data.tags) setForm(p => ({ ...p, tags: data.tags.join(", ") }))
    } else {
      setError("AI generation failed. Check GOOGLE_API_KEY.")
    }
    setAiLoading(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> DATASETS
        </div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/datasets" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Add Dataset</h1>
        </div>
        <p className="text-[14px] text-muted-foreground">Register a new dataset for training or research.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-[13px] text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Dataset Info</h3>
          <button
            onClick={generateWithAI}
            disabled={aiLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-400 text-[12px] hover:bg-amber-500/10 transition-colors disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate with AI
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-[11px] text-muted-foreground mb-1 block">Dataset Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Python Code Instructions v2"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Type</label>
            <select
              value={form.datasetType}
              onChange={e => setForm(p => ({ ...p, datasetType: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Format</label>
            <select
              value={form.format}
              onChange={e => setForm(p => ({ ...p, format: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              {FORMATS.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Source / URL</label>
            <input
              value={form.sourceUrl}
              onChange={e => setForm(p => ({ ...p, sourceUrl: e.target.value }))}
              placeholder="https://huggingface.co/datasets/..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Sample Count</label>
            <input
              type="number" value={form.numSamples}
              onChange={e => setForm(p => ({ ...p, numSamples: e.target.value }))}
              placeholder="e.g. 50000"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">License</label>
            <select
              value={form.license}
              onChange={e => setForm(p => ({ ...p, license: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              <option value="">— Select —</option>
              {LICENSES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              placeholder="python, code, instruction"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3}
            placeholder="Describe the dataset contents, collection method, and intended use…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Add Dataset
        </button>
        <Link href="/datasets" className="px-4 py-2.5 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  )
}

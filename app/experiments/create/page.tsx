"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { FlaskConical, ArrowLeft, Loader2, Save, Sparkles } from "lucide-react"
import Link from "next/link"

interface Dataset { id: string; name: string }

export default function CreateExperimentPage() {
  const router = useRouter()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [form, setForm] = useState({
    name: "", description: "", baseModel: "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    datasetId: "", method: "", resultSummary: "",
    loraRank: "64", loraAlpha: "128", batchSize: "4",
    learningRate: "0.0002", epochs: "3",
  })
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/datasets").then(r => r.json()).then(d => setDatasets(Array.isArray(d) ? d : []))
  }, [])

  const handleSave = async () => {
    if (!form.name || !form.baseModel) { setError("Name and base model are required"); return }
    setSaving(true)
    setError("")
    const res = await fetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, description: form.description, baseModel: form.baseModel,
        datasetId: form.datasetId || null, method: form.method, resultSummary: form.resultSummary,
        loraRank: Number(form.loraRank), loraAlpha: Number(form.loraAlpha),
        batchSize: Number(form.batchSize), learningRate: Number(form.learningRate), epochs: Number(form.epochs),
      }),
    })
    setSaving(false)
    if (res.ok) router.push("/experiments")
    else { const d = await res.json(); setError(d.error || "Failed to create experiment") }
  }

  const generateWithAI = async () => {
    if (!form.name) { setError("Enter a name first"); return }
    setAiLoading(true)
    setError("")
    const res = await fetch("/api/ai-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "experiment", title: form.name, baseModel: form.baseModel }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.description) setForm(p => ({ ...p, description: data.description }))
      if (data.method) setForm(p => ({ ...p, method: data.method }))
      if (data.resultSummary) setForm(p => ({ ...p, resultSummary: data.resultSummary }))
    } else {
      setError("AI generation failed. Check GOOGLE_API_KEY.")
    }
    setAiLoading(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> EXPERIMENTS
        </div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/experiments" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Create Experiment</h1>
        </div>
        <p className="text-[14px] text-muted-foreground">Track a new training run or research experiment.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-[13px] text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Experiment Details</h3>
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
            <label className="text-[11px] text-muted-foreground mb-1 block">Experiment Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. TinyLlama LoRA Fine-tune v1"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Base Model *</label>
            <input
              value={form.baseModel}
              onChange={e => setForm(p => ({ ...p, baseModel: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Related Dataset</label>
            <select
              value={form.datasetId}
              onChange={e => setForm(p => ({ ...p, datasetId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              <option value="">— None —</option>
              {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Method / Technique</label>
            <input
              value={form.method}
              onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
              placeholder="e.g. QLoRA with 4-bit quantization"
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
            placeholder="Describe the experiment goals and approach…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 resize-none"
          />
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Result Summary (optional)</label>
          <textarea
            value={form.resultSummary}
            onChange={e => setForm(p => ({ ...p, resultSummary: e.target.value }))}
            rows={2}
            placeholder="Initial result observations or hypothesis…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 resize-none"
          />
        </div>
      </div>

      {/* Training config */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-[13px] font-semibold text-foreground">Training Configuration</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ["LoRA Rank", "loraRank"], ["LoRA Alpha", "loraAlpha"],
            ["Batch Size", "batchSize"], ["Learning Rate", "learningRate"], ["Epochs", "epochs"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="text-[11px] text-muted-foreground mb-1 block">{label}</label>
              <input
                value={form[key as keyof typeof form]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 font-mono"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Create Experiment
        </button>
        <Link href="/experiments" className="px-4 py-2.5 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Map, ArrowLeft, Plus, Trash2, Loader2, Save, Sparkles } from "lucide-react"
import Link from "next/link"

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

export default function CreateRoadmapPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    title: "", description: "", phase: "1", priority: "MEDIUM",
    milestone: "", estimatedCompletion: "", progressPercent: "0",
  })
  const [tasks, setTasks] = useState<string[]>([""])
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [error, setError] = useState("")

  const addTask = () => setTasks(p => [...p, ""])
  const removeTask = (i: number) => setTasks(p => p.filter((_, idx) => idx !== i))
  const updateTask = (i: number, val: string) => setTasks(p => p.map((t, idx) => idx === i ? val : t))

  const handleSave = async () => {
    if (!form.title) { setError("Title is required"); return }
    setSaving(true)
    setError("")
    const res = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        phase: Number(form.phase),
        priority: form.priority,
        milestone: form.milestone || null,
        estimatedCompletion: form.estimatedCompletion ? new Date(form.estimatedCompletion).toISOString() : null,
        progressPercent: Number(form.progressPercent),
        order: Number(form.phase),
        tasks: tasks.filter(t => t.trim()).map(title => ({ title })),
      }),
    })
    setSaving(false)
    if (res.ok) router.push("/roadmap")
    else { const d = await res.json(); setError(d.error || "Failed to create step") }
  }

  const generateWithAI = async () => {
    if (!form.title) { setError("Enter a title first"); return }
    setAiLoading(true)
    setError("")
    const res = await fetch("/api/ai-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "roadmap", title: form.title, phase: form.phase }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.description) setForm(p => ({ ...p, description: data.description }))
      if (data.tasks?.length) setTasks(data.tasks.map((t: { title: string }) => t.title || t))
    } else {
      setError("AI generation failed. Check GOOGLE_API_KEY.")
    }
    setAiLoading(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> ROADMAP
        </div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/roadmap" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-foreground">Create Roadmap Step</h1>
        </div>
        <p className="text-[14px] text-muted-foreground">Add a new development phase or milestone to the roadmap.</p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/5 text-[13px] text-red-400">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Step Details</h3>
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
            <label className="text-[11px] text-muted-foreground mb-1 block">Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Dataset Collection & Curation"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Phase Number</label>
            <input
              type="number" min="1" value={form.phase}
              onChange={e => setForm(p => ({ ...p, phase: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Priority</label>
            <select
              value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Milestone</label>
            <input
              value={form.milestone}
              onChange={e => setForm(p => ({ ...p, milestone: e.target.value }))}
              placeholder="e.g. v1.0 Release"
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Estimated Completion</label>
            <input
              type="date" value={form.estimatedCompletion}
              onChange={e => setForm(p => ({ ...p, estimatedCompletion: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Initial Progress %</label>
            <input
              type="number" min="0" max="100" value={form.progressPercent}
              onChange={e => setForm(p => ({ ...p, progressPercent: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={3}
            placeholder="Describe this phase's goals and scope…"
            className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 resize-none"
          />
        </div>
      </div>

      {/* Tasks */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">Tasks</h3>
          <button
            onClick={addTask}
            className="flex items-center gap-1 text-[12px] text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Task
          </button>
        </div>
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-mono w-5 text-right flex-shrink-0">{i + 1}.</span>
              <input
                value={task}
                onChange={e => updateTask(i, e.target.value)}
                placeholder={`Task ${i + 1}`}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
              />
              {tasks.length > 1 && (
                <button onClick={() => removeTask(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
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
          Save Step
        </button>
        <Link href="/roadmap" className="px-4 py-2.5 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </Link>
      </div>
    </div>
  )
}

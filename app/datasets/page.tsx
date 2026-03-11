"use client"

import { useState, useEffect } from "react"
import { Database, Plus, ExternalLink, Tag, Loader2, Search } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatBytes, formatNumber, getStatusColor } from "@/lib/utils"

interface Dataset {
  id: string
  name: string
  description?: string
  sourceUrl?: string
  datasetType: string
  numSamples?: number
  sizeBytes?: string
  preprocessStatus: string
  tags: string[]
  format?: string
  license?: string
  createdAt: string
}

const TYPE_COLORS: Record<string, string> = {
  CODE: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  TEXT: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  INSTRUCTION: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  QA: "text-pink-400 bg-pink-400/10 border-pink-400/20",
  MIXED: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<string>("ALL")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", sourceUrl: "", datasetType: "CODE", tags: "" })

  useEffect(() => {
    fetch("/api/datasets")
      .then(r => r.json())
      .then(d => { setDatasets(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setDatasets([]); setLoading(false) })
  }, [])

  const filtered = datasets.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    const matchFilter = filter === "ALL" || d.preprocessStatus === filter
    return matchSearch && matchFilter
  })

  const totalSamples = datasets.reduce((s, d) => s + (Number(d.numSamples) || 0), 0)
  const totalSize = datasets.reduce((s, d) => s + (Number(d.sizeBytes) || 0), 0)

  const handleCreate = async () => {
    const res = await fetch("/api/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) })
    })
    if (res.ok) {
      const newDs = await res.json()
      setDatasets(prev => [newDs, ...prev])
      setShowForm(false)
      setForm({ name: "", description: "", sourceUrl: "", datasetType: "CODE", tags: "" })
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> DATA ENGINEERING
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dataset Manager</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              {formatNumber(totalSamples)} total samples · {formatBytes(totalSize)}
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Dataset
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(
          datasets.reduce((acc, d) => {
            acc[d.preprocessStatus] = (acc[d.preprocessStatus] || 0) + 1
            return acc
          }, {} as Record<string, number>)
        ).map(([status, count]) => (
          <div key={status} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xl font-bold font-mono text-foreground">{count}</p>
            <span className={cn("text-[11px] font-mono mt-1 inline-block px-1.5 py-0.5 rounded border", getStatusColor(status))}>
              {status}
            </span>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 animate-fade-in">
          <h3 className="text-[14px] font-semibold text-foreground mb-4">Add New Dataset</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Dataset name"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
            <input
              placeholder="Source URL"
              value={form.sourceUrl}
              onChange={e => setForm(p => ({ ...p, sourceUrl: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
            <input
              placeholder="Tags (comma-separated)"
              value={form.tags}
              onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            />
            <select
              value={form.datasetType}
              onChange={e => setForm(p => ({ ...p, datasetType: e.target.value }))}
              className="px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50"
            >
              {["CODE", "TEXT", "INSTRUCTION", "QA", "MIXED"].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={2}
            className="w-full mt-3 px-3 py-2 rounded-lg border border-border bg-input text-foreground text-[13px] outline-none focus:border-amber-500/50 resize-none"
          />
          <div className="flex gap-2 mt-3">
            <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors">
              Create Dataset
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-[13px] text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search & filter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-sm px-3 py-2 rounded-lg border border-border bg-muted">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search datasets…"
            className="bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground flex-1"
          />
        </div>
        <div className="flex items-center gap-1">
          {["ALL", "RAW", "CLEANING", "CLEANED", "FORMATTED", "READY"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[12px] font-mono border transition-colors",
                filter === f ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Dataset cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.length === 0 && !loading && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-3">
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium text-foreground mb-1">
              {search || filter !== "ALL" ? "No datasets match your filters" : "No datasets yet"}
            </p>
            <p className="text-[12px] text-muted-foreground">
              {search || filter !== "ALL"
                ? "Try adjusting your search or filter."
                : "Add your first dataset using the button above."}
            </p>
          </div>
        )}
        {filtered.map(dataset => (
          <div key={dataset.id} className="rounded-xl border border-border bg-card p-5 card-hover">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Database className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-foreground">{dataset.name}</p>
                  {dataset.format && (
                    <p className="text-[11px] font-mono text-muted-foreground">{dataset.format}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded-full border", TYPE_COLORS[dataset.datasetType] ?? "")}>
                  {dataset.datasetType}
                </span>
                <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded-full border", getStatusColor(dataset.preprocessStatus))}>
                  {dataset.preprocessStatus}
                </span>
              </div>
            </div>

            {dataset.description && (
              <p className="text-[12px] text-muted-foreground mb-3 line-clamp-2">{dataset.description}</p>
            )}

            <div className="flex items-center gap-4 text-[12px] text-muted-foreground mb-3">
              {dataset.numSamples && (
                <span className="font-mono">{formatNumber(Number(dataset.numSamples))} samples</span>
              )}
              {dataset.sizeBytes && (
                <span className="font-mono">{formatBytes(Number(dataset.sizeBytes))}</span>
              )}
              {dataset.license && <span>{dataset.license}</span>}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                {dataset.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
              {dataset.sourceUrl && (
                <a href={dataset.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

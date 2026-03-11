"use client"
import { Skeleton } from "@/components/ui/skeleton"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { FlaskConical, Plus, ChevronDown, ChevronRight, TrendingDown } from "lucide-react"
import { cn, getStatusColor, formatDate } from "@/lib/utils"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

interface ExperimentLog { step: number; loss: number | null }
interface Experiment {
  id: string; name: string; description?: string; baseModel: string
  status: string; loraRank?: number; loraAlpha?: number; batchSize?: number
  learningRate?: number; epochs?: number; evalLoss?: number; evalAccuracy?: number
  pass1Score?: number; bleuScore?: number; createdAt: string
  logs: ExperimentLog[]
  dataset?: { name: string } | null
}

export default function ExperimentsPage() {
  const router = useRouter()
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/experiments")
      .then(r => r.json())
      .then(d => { setExperiments(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setExperiments([]); setLoading(false) })
  }, [])

  const handleCreate = () => {}  // unused - navigates to create page

  if (loading) return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> TRAINING
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Experiment Tracker</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              {experiments.filter(e => e.status === "COMPLETED").length} completed · {experiments.filter(e => e.status === "RUNNING").length} running
            </p>
          </div>
          <Link href="/experiments/create" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors">
            <Plus className="w-4 h-4" />
            New Experiment
          </Link>
        </div>
      </div>

      {/* Experiment list */}
      <div className="space-y-3">
        {experiments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-border bg-card">
            <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-3">
              <FlaskConical className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium text-foreground mb-1">No experiments yet</p>
            <p className="text-[12px] text-muted-foreground">
              Create your first experiment using the button above.
            </p>
          </div>
        )}
        {experiments.map(exp => {
          const isExpanded = expanded === exp.id
          const chartData = exp.logs
            .filter(l => l.loss !== null)
            .map(l => ({ step: l.step, loss: Number(l.loss?.toFixed(4)) }))

          return (
            <div key={exp.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : exp.id)}
              >
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <FlaskConical className="w-4.5 h-4.5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-foreground">{exp.name}</p>
                    <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded-full border", getStatusColor(exp.status))}>
                      {exp.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground font-mono">{exp.baseModel}</p>
                </div>
                <div className="flex items-center gap-6 mr-2">
                  {exp.evalLoss && (
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-muted-foreground">eval_loss</p>
                      <p className="text-[14px] font-mono font-bold text-foreground">{exp.evalLoss.toFixed(3)}</p>
                    </div>
                  )}
                  {exp.pass1Score && (
                    <div className="text-right hidden sm:block">
                      <p className="text-[11px] text-muted-foreground">pass@1</p>
                      <p className="text-[14px] font-mono font-bold text-amber-400">{(exp.pass1Score * 100).toFixed(1)}%</p>
                    </div>
                  )}
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
              </div>

              {isExpanded && (
                <div className="border-t border-border p-5 space-y-5">
                  {exp.description && (
                    <p className="text-[13px] text-muted-foreground">{exp.description}</p>
                  )}

                  {/* Config */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ["LoRA Rank", exp.loraRank, "r"],
                      ["LoRA Alpha", exp.loraAlpha, "α"],
                      ["Batch Size", exp.batchSize, "bs"],
                      ["Learning Rate", exp.learningRate?.toExponential(0), "lr"],
                      ["Epochs", exp.epochs, "ep"],
                      ["eval_loss", exp.evalLoss?.toFixed(4), "↓"],
                      ["eval_accuracy", exp.evalAccuracy ? `${(exp.evalAccuracy * 100).toFixed(1)}%` : null, "%"],
                      ["pass@1", exp.pass1Score ? `${(exp.pass1Score * 100).toFixed(1)}%` : null, "He"],
                    ].filter(([, v]) => v !== null && v !== undefined).map(([label, value, badge]) => (
                      <div key={label as string} className="bg-muted rounded-lg p-3">
                        <p className="text-[10px] text-muted-foreground uppercase">{label as string}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[11px] text-amber-500/80 font-mono bg-amber-500/10 px-1 rounded">{badge as string}</span>
                          <span className="text-[14px] font-bold font-mono text-foreground">{value as string}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Loss curve chart */}
                  {chartData.length > 1 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingDown className="w-4 h-4 text-amber-400" />
                        <p className="text-[13px] font-semibold text-foreground">Training Loss Curve</p>
                      </div>
                      <div className="h-48 bg-muted/30 rounded-lg p-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 15%)" />
                            <XAxis dataKey="step" tick={{ fontSize: 11, fill: "hsl(0 0% 45%)" }} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(0 0% 45%)" }} domain={["auto", "auto"]} />
                            <Tooltip
                              contentStyle={{ background: "hsl(0 0% 6%)", border: "1px solid hsl(0 0% 15%)", borderRadius: "6px", fontSize: "12px" }}
                              labelStyle={{ color: "hsl(0 0% 80%)" }}
                            />
                            <Line type="monotone" dataKey="loss" stroke="#f59e0b" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-muted-foreground">Created {formatDate(exp.createdAt)}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

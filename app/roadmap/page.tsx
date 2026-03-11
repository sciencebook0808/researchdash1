"use client"
import { Skeleton } from "@/components/ui/skeleton"

import { useState, useEffect } from "react"
import { CheckCircle2, Clock, Circle, Plus, Edit3, ChevronDown, ChevronRight, Check, X, Loader2 } from "lucide-react"
import { cn, getStatusColor } from "@/lib/utils"

interface Task { id: string; title: string; completed: boolean }
interface Step {
  id: string; phase: number; title: string; description: string
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED"; order: number; tasks: Task[]
}

export default function RoadmapPage() {
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingStep, setEditingStep] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/roadmap")
      .then(r => r.json())
      .then(d => { setSteps(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setSteps([]); setLoading(false) })
  }, [])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleTask = async (stepId: string, taskId: string, completed: boolean) => {
    const res = await fetch(`/api/roadmap/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed })
    })
    if (res.ok) {
      setSteps(prev => prev.map(s => s.id === stepId ? {
        ...s,
        tasks: s.tasks.map(t => t.id === taskId ? { ...t, completed } : t)
      } : s))
    }
  }

  const updateStepStatus = async (stepId: string, status: Step["status"]) => {
    const res = await fetch(`/api/roadmap/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    })
    if (res.ok) {
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, status } : s))
    }
  }

  const completedSteps = steps.filter(s => s.status === "COMPLETED").length
  const totalTasks = steps.reduce((sum, s) => sum + s.tasks.length, 0)
  const completedTasks = steps.reduce((sum, s) => sum + s.tasks.filter(t => t.completed).length, 0)
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  if (loading) return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded-xl border border-border p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> DEVELOPMENT ROADMAP
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Roadmap Tracker</h1>
            <p className="text-[14px] text-muted-foreground mt-1">Development roadmap for Protroit Agent and ProtroitOS</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold font-mono text-amber-400">{progressPct}%</p>
            <p className="text-[12px] text-muted-foreground">{completedTasks}/{totalTasks} tasks</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-2">
          <span>{completedSteps} of 12 phases complete</span>
          <span className="font-mono">{completedTasks}/{totalTasks} tasks done</span>
        </div>
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center gap-4 mt-3 text-[12px]">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {steps.filter(s => s.status === "COMPLETED").length} Completed
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            {steps.filter(s => s.status === "IN_PROGRESS").length} In Progress
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Circle className="w-3.5 h-3.5" />
            {steps.filter(s => s.status === "PENDING").length} Pending
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border bg-card/30">
            <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mb-3">
              <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-[14px] font-medium text-foreground mb-1">No roadmap steps yet</p>
            <p className="text-[12px] text-muted-foreground">Use the API or seed the database to add development phases.</p>
          </div>
        )}
        {steps.map((step) => {
          const isExpanded = expanded.has(step.id)
          const tasksDone = step.tasks.filter(t => t.completed).length
          const taskPct = step.tasks.length > 0 ? (tasksDone / step.tasks.length) * 100 : 0

          const statusIcon = {
            COMPLETED: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
            IN_PROGRESS: <Clock className="w-4 h-4 text-amber-400" />,
            PENDING: <Circle className="w-4 h-4 text-zinc-600" />,
          }[step.status]

          const borderColor = {
            COMPLETED: "border-emerald-500/20",
            IN_PROGRESS: "border-amber-500/30",
            PENDING: "border-border",
          }[step.status]

          const bgColor = {
            COMPLETED: "bg-emerald-500/3",
            IN_PROGRESS: "bg-amber-500/5",
            PENDING: "bg-card",
          }[step.status]

          return (
            <div key={step.id} className={cn("rounded-xl border transition-all", borderColor, bgColor)}>
              {/* Step header */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => toggleExpand(step.id)}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold font-mono flex-shrink-0",
                  step.status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                  step.status === "IN_PROGRESS" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                  "bg-muted text-muted-foreground border border-border"
                )}>
                  {step.phase}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {statusIcon}
                    <h3 className="text-[14px] font-semibold text-foreground">{step.title}</h3>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{step.description}</p>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <div className="text-right hidden sm:block">
                    <p className="text-[12px] font-mono text-muted-foreground">{tasksDone}/{step.tasks.length} tasks</p>
                    <div className="w-20 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", step.status === "COMPLETED" ? "bg-emerald-500" : "bg-amber-500")}
                        style={{ width: `${taskPct}%` }}
                      />
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4">
                  <p className="text-[13px] text-muted-foreground mb-4">{step.description}</p>

                  {/* Status selector */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[12px] text-muted-foreground">Status:</span>
                    {(["PENDING", "IN_PROGRESS", "COMPLETED"] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateStepStatus(step.id, s)}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all",
                          step.status === s ? getStatusColor(s) : "border-border text-muted-foreground hover:border-amber-500/30"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

                  {/* Tasks */}
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">Tasks</p>
                    {step.tasks.map(task => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 group"
                      >
                        <button
                          onClick={() => toggleTask(step.id, task.id, !task.completed)}
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all",
                            task.completed
                              ? "bg-emerald-500 border-emerald-500"
                              : "border-border group-hover:border-amber-500/50"
                          )}
                        >
                          {task.completed && <Check className="w-2.5 h-2.5 text-white" />}
                        </button>
                        <span className={cn(
                          "text-[13px] flex-1",
                          task.completed ? "line-through text-muted-foreground" : "text-foreground"
                        )}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

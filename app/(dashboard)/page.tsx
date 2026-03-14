import { prisma, isDatabaseConfigured } from "@/lib/prisma"
import { formatBytes, formatNumber, getStatusColor } from "@/lib/utils"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  FlaskConical, Database, Package, TrendingUp, ArrowRight,
  CheckCircle2, Clock, Circle, Target, HardDrive, Zap, GitBranch,
  AlertTriangle
} from "lucide-react"

export const dynamic = "force-dynamic"

async function getDashboardData() {
  // Check if database is configured before attempting queries
  if (!isDatabaseConfigured()) {
    console.warn("[Dashboard] Database not configured - showing empty state")
    return {
      roadmapSteps: [],
      datasets: [],
      experiments: [],
      models: [],
      completedSteps: 0,
      inProgressSteps: 0,
      progressPct: 0,
      totalSamples: 0,
      latestModel: undefined,
      totalTasks: 0,
      completedTasks: 0,
      databaseError: "Database not configured. Set DATABASE_URL to enable data features.",
    }
  }

  try {
    const [roadmapSteps, datasets, experiments, models] = await Promise.all([
      prisma.roadmapStep.findMany({ include: { tasks: true } }),
      prisma.dataset.findMany(),
      prisma.experiment.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.modelVersion.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    ])

    const totalTasks = roadmapSteps.reduce((s, step) => s + step.tasks.length, 0)
    const completedTasks = roadmapSteps.reduce((s, step) => s + step.tasks.filter(t => t.completed).length, 0)
    const completedSteps = roadmapSteps.filter(s => s.status === "COMPLETED").length
    const inProgressSteps = roadmapSteps.filter(s => s.status === "IN_PROGRESS").length
    const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    const totalSamples = datasets.reduce((s, d) => s + (d.numSamples || 0), 0)
    const latestModel = models[0]

    return { roadmapSteps, datasets, experiments, models, completedSteps, inProgressSteps, progressPct, totalSamples, latestModel, totalTasks, completedTasks, databaseError: null as string | null }
  } catch (error) {
    console.error("Dashboard data error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown database error"
    return {
      roadmapSteps: [] as Awaited<ReturnType<typeof prisma.roadmapStep.findMany<{ include: { tasks: true } }>>>,
      datasets: [] as Awaited<ReturnType<typeof prisma.dataset.findMany>>,
      experiments: [] as Awaited<ReturnType<typeof prisma.experiment.findMany>>,
      models: [] as Awaited<ReturnType<typeof prisma.modelVersion.findMany>>,
      completedSteps: 0, inProgressSteps: 0, progressPct: 0,
      totalSamples: 0, latestModel: undefined as Awaited<ReturnType<typeof prisma.modelVersion.findMany>>[0] | undefined,
      totalTasks: 0, completedTasks: 0,
      databaseError: `Database error: ${errorMessage}`,
    }
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  const statCards = [
    {
      label: "Roadmap Progress",
      value: `${data.progressPct}%`,
      sub: `${data.completedTasks} / ${data.totalTasks} tasks`,
      icon: TrendingUp,
      color: "amber",
      href: "/roadmap",
    },
    {
      label: "Dataset Samples",
      value: formatNumber(data.totalSamples),
      sub: `${data.datasets.length} datasets collected`,
      icon: Database,
      color: "blue",
      href: "/datasets",
    },
    {
      label: "Experiments",
      value: data.experiments.length.toString(),
      sub: `${data.experiments.filter(e => e.status === "COMPLETED").length} completed`,
      icon: FlaskConical,
      color: "violet",
      href: "/experiments",
    },
    {
      label: "Model Versions",
      value: data.models.length.toString(),
      sub: data.latestModel ? `Latest: ${data.latestModel.version}` : "No models yet",
      icon: Package,
      color: "emerald",
      href: "/models",
    },
  ]

  const colorMap: Record<string, string> = {
    amber: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    violet: "text-violet-400 bg-violet-400/10 border-violet-400/20",
    emerald: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Database configuration warning */}
      {data.databaseError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-300">Database Not Configured</p>
            <p className="text-[12px] text-muted-foreground mt-1">{data.databaseError}</p>
            <p className="text-[11px] text-muted-foreground mt-2">
              To enable data features, add <code className="px-1 py-0.5 bg-muted rounded text-amber-400">DATABASE_URL</code> to your environment variables.
            </p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> PRAUSDIT RESEARCH PLATFORM
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Project Overview</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Building Protroit Agent &amp; ProtroitOS — Offline-first AI ecosystem for edge devices
        </p>
      </div>

      {/* Protroit Agent spec banner */}
      <div className="relative overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="relative flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <FlaskConical className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground font-mono uppercase">Current Focus</p>
              <p className="text-[15px] font-semibold text-foreground">Protroit Agent v1.0</p>
            </div>
          </div>
          <div className="h-px w-full sm:h-8 sm:w-px bg-amber-500/20" />
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-6 w-full sm:w-auto">
            {[
              { icon: Target, label: "Target Platform", value: "Mobile / Edge" },
              { icon: HardDrive, label: "RAM Budget", value: "2–6 GB" },
              { icon: Zap, label: "Architecture", value: "SLM Orchestrator" },
              { icon: GitBranch, label: "Mode", value: "Offline-First" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-amber-500/70 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">{label}</p>
                  <p className="text-[12px] sm:text-[13px] font-semibold text-amber-300 font-mono truncate">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.label} href={card.href}>
              <div className="rounded-xl border border-border bg-card p-3 sm:p-4 card-hover cursor-pointer h-full">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-[11px] sm:text-[12px] text-muted-foreground">{card.label}</span>
                  <div className={cn("w-6 h-6 sm:w-7 sm:h-7 rounded-md border flex items-center justify-center flex-shrink-0", colorMap[card.color])}>
                    <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  </div>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-foreground font-mono">{card.value}</p>
                <p className="text-[11px] sm:text-[12px] text-muted-foreground mt-1 truncate">{card.sub}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Overall progress bar */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] sm:text-[14px] font-semibold text-foreground">Overall Project Progress</h3>
          <span className="text-[12px] sm:text-[13px] font-mono text-amber-400">{data.progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-1000"
            style={{ width: `${data.progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 text-[11px] sm:text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>{data.completedSteps} complete</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>{data.inProgressSteps} in progress</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Circle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            <span>{12 - data.completedSteps - data.inProgressSteps} pending</span>
          </span>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Recent experiments */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-[13px] sm:text-[14px] font-semibold text-foreground">Recent Experiments</h3>
            <Link href="/experiments" className="text-[11px] sm:text-[12px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {data.experiments.map((exp) => (
              <div key={exp.id} className="flex items-start sm:items-center gap-2 sm:gap-3 py-2 border-b border-border last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] sm:text-[13px] font-medium text-foreground truncate">{exp.name}</p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">{exp.baseModel}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={cn("text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full border font-mono", getStatusColor(exp.status))}>
                    {exp.status}
                  </span>
                  {exp.pass1Score && (
                    <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                      pass@1: {(exp.pass1Score * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Model versions */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-[13px] sm:text-[14px] font-semibold text-foreground">Model Versions</h3>
            <Link href="/models" className="text-[11px] sm:text-[12px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {data.models.map((model) => (
              <div key={model.id} className="flex items-center gap-2 sm:gap-3 py-2 border-b border-border last:border-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] sm:text-[13px] font-medium text-foreground truncate">{model.name} <span className="font-mono text-amber-400">{model.version}</span></p>
                  <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
                    {model.quantization ?? "FP16"} · {model.fileSizeBytes ? formatBytes(Number(model.fileSizeBytes)) : "–"}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {model.isDeployed && (
                    <span className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-400/10 border-emerald-400/20 font-mono">
                      DEPLOYED
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Roadmap phases quick view */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-[13px] sm:text-[14px] font-semibold text-foreground">Development Phases</h3>
          <Link href="/roadmap" className="text-[11px] sm:text-[12px] text-amber-400 hover:text-amber-300 flex items-center gap-1">
            Full roadmap <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {data.roadmapSteps.map((step) => {
            const completedCount = step.tasks.filter(t => t.completed).length
            const pct = step.tasks.length > 0 ? (completedCount / step.tasks.length) * 100 : 0
            const statusColor = step.status === "COMPLETED" ? "border-emerald-500/30 bg-emerald-500/5" :
              step.status === "IN_PROGRESS" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"

            return (
              <Link key={step.id} href="/roadmap">
                <div className={cn("rounded-lg border p-3 card-hover", statusColor)}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-mono text-muted-foreground">P{step.phase}</span>
                    {step.status === "COMPLETED" && <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />}
                    {step.status === "IN_PROGRESS" && <Clock className="w-3 h-3 text-amber-400 ml-auto" />}
                    {step.status === "PENDING" && <Circle className="w-3 h-3 text-zinc-600 ml-auto" />}
                  </div>
                  <p className="text-[12px] font-medium text-foreground leading-tight line-clamp-2">{step.title}</p>
                  <div className="mt-2 w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", step.status === "COMPLETED" ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { BookOpen, ArrowRight, Tag, Plus, CheckCircle2, Clock, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function DocsPage() {
  let pages: Awaited<ReturnType<typeof prisma.documentationPage.findMany>> = []

  try {
    pages = await prisma.documentationPage.findMany({
      orderBy: [{ section: "asc" }, { order: "asc" }],
      select: { id: true, title: true, slug: true, section: true, tags: true, updatedAt: true, progress: true } as never,
    })
  } catch (error) {
    console.error("DocsPage DB error:", error)
  }

  const grouped = (pages as Array<{ id: string; title: string; slug: string; section: string; tags: string[]; progress: string }>).reduce((acc, page) => {
    if (!acc[page.section]) acc[page.section] = []
    acc[page.section].push(page)
    return acc
  }, {} as Record<string, typeof pages>)

  const sectionColors: Record<string, string> = {
    "Overview": "text-amber-400",
    "Architecture": "text-violet-400",
    "Data Engineering": "text-blue-400",
    "Training": "text-emerald-400",
    "Evaluation": "text-pink-400",
    "Deployment": "text-orange-400",
    "Research": "text-cyan-400",
  }

  const progressIcon = (p: string) => {
    if (p === "COMPLETED") return <CheckCircle2 className="w-3 h-3 text-emerald-400" />
    if (p === "IN_PROGRESS") return <Clock className="w-3 h-3 text-amber-400" />
    return <Circle className="w-3 h-3 text-zinc-600" />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> DOCUMENTATION
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Documentation</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              Engineering reference for Protroit Agent &amp; ProtroitOS development
            </p>
          </div>
          <Link
            href="/docs/create"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Doc
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doc sections */}
        <div className="lg:col-span-2 space-y-6">
          {Object.keys(grouped).length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-border bg-card/30">
              <BookOpen className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-[14px] font-medium text-foreground mb-1">No documentation yet</p>
              <p className="text-[12px] text-muted-foreground mb-4">Create your first document to get started.</p>
              <Link href="/docs/create" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Create Document
              </Link>
            </div>
          )}
          {Object.entries(grouped).map(([section, sectionPages]) => (
            <div key={section}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-border" />
                <span className={cn("text-[12px] font-semibold uppercase tracking-wider", sectionColors[section] ?? "text-muted-foreground")}>
                  {section}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {(sectionPages as Array<{ id: string; title: string; slug: string; section: string; tags: string[]; progress: string }>).map((page) => (
                  <Link key={page.id} href={`/docs/${page.slug}`}>
                    <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card card-hover">
                      <BookOpen className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground">{page.title}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {page.tags.slice(0, 4).map(tag => (
                            <span key={tag} className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              <Tag className="w-2.5 h-2.5" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {progressIcon(page.progress)}
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[13px] font-semibold text-foreground mb-3">Sections</h3>
            <div className="space-y-1">
              {Object.entries(grouped).map(([section, sectionPages]) => (
                <div key={section} className="flex items-center justify-between py-1">
                  <span className={cn("text-[13px]", sectionColors[section] ?? "text-muted-foreground")}>
                    {section}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {sectionPages.length}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[13px] font-semibold text-amber-400 mb-2">AI Assistant</p>
            <p className="text-[12px] text-muted-foreground">
              Use <code className="font-mono text-amber-400 text-[11px]">/document</code> in the chat to generate documentation with AI.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

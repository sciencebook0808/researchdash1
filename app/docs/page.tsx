import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { BookOpen, ArrowRight, Tag } from "lucide-react"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function DocsPage() {
  let pages: Awaited<ReturnType<typeof prisma.documentationPage.findMany<{ select: { id: true; title: true; slug: true; section: true; tags: true; updatedAt: true } }>>> = []

  try {
    pages = await prisma.documentationPage.findMany({
      orderBy: [{ section: "asc" }, { order: "asc" }],
      select: { id: true, title: true, slug: true, section: true, tags: true, updatedAt: true },
    })
  } catch (error) {
    console.error("DocsPage DB error:", error)
  }

  const grouped = pages.reduce((acc, page) => {
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
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> DOCUMENTATION
        </div>
        <h1 className="text-2xl font-semibold text-foreground">Documentation</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Engineering reference for Protroit Agent &amp; ProtroitOS development
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doc sections */}
        <div className="lg:col-span-2 space-y-6">
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
                {sectionPages.map((page) => (
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
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
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
              Use the chat widget to ask questions about any documentation, generate code examples, or request explanations.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

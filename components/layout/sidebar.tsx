"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useId } from "react"
import { cn } from "@/lib/utils"
import { UserButton } from "@clerk/nextjs"
import { useCurrentUser } from "@/components/auth/auth-guard"
import {
  LayoutDashboard, Map, BookOpen, Database, FlaskConical,
  Package, StickyNote, ChevronRight, Activity, Users,
  Menu, X, Settings, Shield, MessageSquare,
} from "lucide-react"

const NAV_ITEMS = [
  { label: "Overview", href: "/", icon: LayoutDashboard, minRole: "developer" },
  { label: "AI Chat", href: "/chat", icon: MessageSquare, minRole: "developer" },
  { label: "Roadmap", href: "/roadmap", icon: Map, minRole: "developer" },
  { label: "Documentation", href: "/docs", icon: BookOpen, minRole: "developer" },
  { label: "Datasets", href: "/datasets", icon: Database, minRole: "developer" },
  { label: "Experiments", href: "/experiments", icon: FlaskConical, minRole: "developer" },
  { label: "Model Versions", href: "/models", icon: Package, minRole: "developer" },
  { label: "Notes", href: "/notes", icon: StickyNote, minRole: "developer" },
]

const ADMIN_ITEMS = [
  { label: "Users", href: "/users", icon: Users, minRole: "admin" },
  { label: "Settings", href: "/settings", icon: Settings, minRole: "admin" },
]

const ROLE_RANK: Record<string, number> = {
  user: 0, developer: 1, admin: 2, super_admin: 3,
}

function hasAccess(userRole: string, minRole: string) {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0)
}

function NavContent({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname()
  const appUser = useCurrentUser()
  const userRole = appUser?.role ?? "developer"
  const workspaceId = useId()
  const adminId = useId()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div 
            className="w-7 h-7 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center"
            aria-hidden="true"
          >
            <FlaskConical className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground leading-none">Prausdit Research Lab</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">AI Agent Research Environment</p>
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div className="px-3 pt-3">
        <div 
          className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-amber-500/5 border border-amber-500/15"
          role="status"
          aria-label="Current project phase: Phase 3, In Progress"
        >
          <Activity className="w-3 h-3 text-amber-400 flex-shrink-0" aria-hidden="true" />
          <span className="text-[11px] text-amber-400 font-mono truncate">PHASE 3 - IN PROGRESS</span>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
        <p 
          id={workspaceId}
          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2"
        >
          Workspace
        </p>
        <ul role="list" aria-labelledby={workspaceId} className="space-y-0.5">
          {NAV_ITEMS.filter(item => hasAccess(userRole, item.minRole)).map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            const Icon = item.icon

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onLinkClick}
                  className={cn(
                    "group flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all",
                    isActive
                      ? "bg-amber-500/10 text-amber-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon 
                    className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-amber-400" : "text-muted-foreground group-hover:text-foreground")} 
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-amber-500/60 flex-shrink-0" aria-hidden="true" />}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* Admin section — only for admin/super_admin */}
        {hasAccess(userRole, "admin") && (
          <>
            <p 
              id={adminId}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mt-4 mb-2 flex items-center gap-1"
            >
              <Shield className="w-3 h-3" aria-hidden="true" /> Admin
            </p>
            <ul role="list" aria-labelledby={adminId} className="space-y-0.5">
              {ADMIN_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href)
                const Icon = item.icon
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onLinkClick}
                      className={cn(
                        "group flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all",
                        isActive
                          ? "bg-amber-500/10 text-amber-400"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      )}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon 
                        className={cn("w-4 h-4 flex-shrink-0", isActive ? "text-amber-400" : "text-muted-foreground group-hover:text-foreground")} 
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {isActive && <ChevronRight className="w-3 h-3 text-amber-500/60 flex-shrink-0" aria-hidden="true" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </nav>

      {/* Footer — role badge + clerk user button */}
      <div className="px-3 pb-4 border-t border-border pt-3 flex-shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
          Account
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8">
            <UserButton
              appearance={{ elements: { avatarBox: "w-7 h-7", userButtonAvatarBox: "w-7 h-7" } }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-foreground font-medium truncate">{appUser?.name ?? "Prausdit"}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{userRole}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3.5 left-4 z-30 w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card hover:bg-accent transition-colors"
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
      >
        <Menu className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      </button>

      {mobileOpen && (
        <div 
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" 
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside 
        id="mobile-sidebar"
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Mobile navigation"
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3.5 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
        <NavContent onLinkClick={() => setMobileOpen(false)} />
      </aside>

      <aside 
        className="hidden md:flex w-60 flex-shrink-0 border-r border-border flex-col bg-card/50 backdrop-blur-sm"
        aria-label="Desktop navigation"
      >
        <NavContent />
      </aside>
    </>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { UserButton } from "@clerk/nextjs"
import {
  LayoutDashboard,
  Map,
  BookOpen,
  Database,
  FlaskConical,
  Package,
  StickyNote,
  ChevronRight,
  Activity,
  Users,
  Menu,
  X,
  Settings,
} from "lucide-react"

const navItems = [
  { label: "Overview",       href: "/",            icon: LayoutDashboard },
  { label: "Roadmap",        href: "/roadmap",      icon: Map             },
  { label: "Documentation",  href: "/docs",         icon: BookOpen        },
  { label: "Datasets",       href: "/datasets",     icon: Database        },
  { label: "Experiments",    href: "/experiments",  icon: FlaskConical    },
  { label: "Model Versions", href: "/models",       icon: Package         },
  { label: "Notes",          href: "/notes",        icon: StickyNote      },
  { label: "Users",          href: "/users",        icon: Users           },
]

function NavContent({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
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
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-amber-500/5 border border-amber-500/15">
          <Activity className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[11px] text-amber-400 font-mono truncate">PHASE 3 · IN PROGRESS</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
          Workspace
        </p>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              className={cn(
                "group flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all",
                isActive
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon
                className={cn(
                  "w-4 h-4 flex-shrink-0",
                  isActive
                    ? "text-amber-400"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 text-amber-500/60 flex-shrink-0" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer — profile + settings */}
      <div className="px-3 pb-4 border-t border-border pt-3 flex-shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
          Account
        </p>
        <div className="flex items-center gap-2">
          {/* Clerk user button */}
          <div className="flex items-center justify-center w-8 h-8">
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7",
                  userButtonAvatarBox: "w-7 h-7",
                },
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-foreground font-medium truncate">Prausdit</p>
            <p className="text-[11px] text-muted-foreground">v0.4.0</p>
          </div>

          {/* Settings icon */}
          <Link
            href="/settings"
            onClick={onLinkClick}
            className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center transition-colors flex-shrink-0",
              pathname === "/settings" || pathname.startsWith("/settings")
                ? "bg-amber-500/10 text-amber-400"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3.5 left-4 z-30 w-8 h-8 flex items-center justify-center rounded-md border border-border bg-card hover:bg-accent transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3.5 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close menu"
        >
          <X className="w-4 h-4" />
        </button>
        <NavContent onLinkClick={() => setMobileOpen(false)} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 border-r border-border flex-col bg-card/50 backdrop-blur-sm">
        <NavContent />
      </aside>
    </>
  )
}

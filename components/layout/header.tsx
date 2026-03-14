"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Bell } from "lucide-react"
import { GlobalSearch } from "@/components/dashboard/global-search"
import { UserButton } from "@clerk/nextjs"
import { ThemeToggle } from "@/components/ui/theme-toggle"

export function Header() {
  const [searchOpen, setSearchOpen] = useState(false)

  // Keyboard shortcut handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setSearchOpen(prev => !prev)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <>
      <header 
        className="h-14 border-b border-border flex items-center px-3 sm:px-4 md:px-6 gap-2 sm:gap-3 md:gap-4 bg-background/80 backdrop-blur-sm sticky top-0 z-20"
        role="banner"
      >
        {/* Spacer for mobile hamburger */}
        <div className="w-8 md:hidden flex-shrink-0" aria-hidden="true" />

        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-md bg-muted border border-border text-muted-foreground text-[13px] hover:border-amber-500/30 hover:text-foreground transition-colors flex-1 min-w-0 max-w-xs sm:max-w-sm"
          aria-label="Open search dialog"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline truncate">Search docs, experiments, datasets...</span>
          <span className="sm:hidden truncate">Search...</span>
          <div className="ml-auto hidden md:flex items-center gap-1 flex-shrink-0" aria-hidden="true">
            <kbd className="px-1.5 py-0.5 text-[11px] bg-background border border-border rounded font-mono">Cmd</kbd>
            <kbd className="px-1.5 py-0.5 text-[11px] bg-background border border-border rounded font-mono">K</kbd>
          </div>
        </button>

        {/* Right side controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Version badge - hidden on small screens */}
          <div 
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5"
            role="status"
            aria-label="Current version: Protroit v0.2"
          >
            <span className="status-dot completed" aria-hidden="true" />
            <span className="text-[12px] text-emerald-400 font-mono whitespace-nowrap">Protroit v0.2</span>
          </div>

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <button 
            className="w-8 h-8 rounded-md border border-border bg-muted hover:bg-accent flex items-center justify-center transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>

          {/* Clerk User Button */}
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8 ring-2 ring-border",
                userButtonAvatarBox: "w-8 h-8",
              }
            }}
          />
        </div>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Application error:", error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4" aria-hidden="true">
        <AlertTriangle className="w-7 h-7 text-red-400" />
      </div>
      <h1 className="text-lg font-semibold text-foreground mb-1" role="alert">Something went wrong</h1>
      <p className="text-sm text-muted-foreground mb-1 max-w-sm">
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      {error.digest && (
        <p className="text-[11px] text-muted-foreground mb-5 font-mono">
          Error ID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted border border-border text-sm text-foreground hover:bg-accent hover:border-amber-500/30 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Try again
      </button>
    </div>
  )
}

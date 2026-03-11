import Link from "next/link"
import { FlaskConical, Lock } from "lucide-react"

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-left">
            <p className="text-[14px] font-semibold text-foreground">Prausdit Research Lab</p>
            <p className="text-[11px] text-muted-foreground">AI Agent Research Environment</p>
          </div>
        </div>

        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7 text-red-400" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            You don&apos;t have permission to access this research platform.
          </p>
          <p className="text-[14px] text-muted-foreground mt-3">
            If you are a developer, the admin will grant access shortly.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-[13px] text-amber-400 font-semibold mb-1">Need Access?</p>
          <p className="text-[12px] text-muted-foreground">
            Contact the platform administrator to request developer access to Prausdit Research Lab.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  )
}

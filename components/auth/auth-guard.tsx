"use client"

/**
 * AuthGuard — wraps every protected dashboard page.
 *
 * Flow:
 *  1. Wait for Clerk to load
 *  2. If not signed in → /sign-in
 *  3. Fetch /api/users/me  (creates DB record on first login, promotes super_admin)
 *  4. If role ∈ {super_admin, admin, developer} → render children
 *  5. Otherwise → /access-denied
 *
 * The /api/users/me call is the single point where:
 *  - DB record is created for new users
 *  - super_admin email is synced to DB role
 *  - Profile fields (name, imageUrl) are kept in sync with Clerk
 */

import { useEffect, useState, createContext, useContext } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { Loader2, FlaskConical } from "lucide-react"

// ─── User context so any child component can read the current user ────────────

interface AppUser {
  id:       string
  clerkId:  string
  email:    string
  name?:    string | null
  imageUrl?: string | null
  role:     string
}

const UserContext = createContext<AppUser | null>(null)

/** Use this hook in any client component to get the current user */
export function useCurrentUser() {
  return useContext(UserContext)
}

// ─── Allowed roles for dashboard access ──────────────────────────────────────

const ALLOWED_ROLES = new Set(["super_admin", "admin", "developer"])

// ─── AuthGuard ────────────────────────────────────────────────────────────────

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const [status,  setStatus]  = useState<"loading" | "allowed" | "denied">("loading")
  const [appUser, setAppUser] = useState<AppUser | null>(null)

  useEffect(() => {
    if (!isLoaded) return

    if (!isSignedIn) {
      router.replace("/sign-in")
      return
    }

    fetch("/api/users/me")
      .then(async (res) => {
        if (!res.ok) {
          console.error("[AuthGuard] /api/users/me →", res.status)
          return null
        }
        return res.json()
      })
      .then((user) => {
        if (!user) {
          router.replace("/access-denied")
          return
        }

        console.log(`[AuthGuard] email=${user.email} | role=${user.role} | allowed=${ALLOWED_ROLES.has(user.role)}`)

        if (ALLOWED_ROLES.has(user.role)) {
          setAppUser(user as AppUser)
          setStatus("allowed")
        } else {
          router.replace("/access-denied")
        }
      })
      .catch((err) => {
        console.error("[AuthGuard] fetch error:", err)
        router.replace("/access-denied")
      })
  }, [isLoaded, isSignedIn, router])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-md bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <FlaskConical className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-[13px] font-mono">Verifying access…</span>
          </div>
        </div>
      </div>
    )
  }

  if (status === "denied") return null

  return (
    <UserContext.Provider value={appUser}>
      {children}
    </UserContext.Provider>
  )
}

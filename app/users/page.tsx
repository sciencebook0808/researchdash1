"use client"

import { useState, useEffect } from "react"
import { Users, Shield, ChevronDown, Loader2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"

interface User {
  id: string
  clerkId: string
  email: string
  name?: string
  imageUrl?: string
  role: string
  createdAt: string
}

const ROLES = ["user", "developer", "admin", "super_admin"]

const ROLE_COLORS: Record<string, string> = {
  super_admin: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  admin: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  developer: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  user: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/users")
      .then(r => r.json())
      .then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setUsers([]); setLoading(false) })
  }, [])

  const changeRole = async (userId: string, role: string) => {
    setUpdating(userId)
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(prev => prev.map(u => u.id === userId ? updated : u))
    }
    setUpdating(null)
  }

  const deleteUser = async (userId: string) => {
    if (!confirm("Remove this user?")) return
    await fetch(`/api/users/${userId}`, { method: "DELETE" })
    setUsers(prev => prev.filter(u => u.id !== userId))
  }

  const roleCount = (role: string) => users.filter(u => u.role === role).length

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> ADMINISTRATION
        </div>
        <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Manage access roles for Prausdit Research Lab users.
        </p>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROLES.map(role => (
          <div key={role} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xl font-bold font-mono text-foreground">{roleCount(role)}</p>
            <span className={cn("text-[11px] font-mono mt-1 inline-block px-1.5 py-0.5 rounded border", ROLE_COLORS[role])}>
              {role}
            </span>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-[13px] font-semibold text-foreground">All Users ({users.length})</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-[14px] font-medium text-foreground mb-1">No users yet</p>
            <p className="text-[12px] text-muted-foreground">Users appear here when they sign in via Clerk.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {users.map(user => (
              <div key={user.id} className="flex items-center gap-4 px-5 py-4">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-zinc-800 border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.imageUrl} alt={user.name || user.email} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[13px] font-semibold text-foreground">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground truncate">{user.name || "—"}</p>
                  <p className="text-[12px] text-muted-foreground truncate">{user.email}</p>
                </div>

                {/* Joined */}
                <p className="text-[11px] text-muted-foreground hidden sm:block">{formatDate(user.createdAt)}</p>

                {/* Role selector */}
                <div className="flex items-center gap-2">
                  {updating === user.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="relative">
                      <select
                        value={user.role}
                        onChange={e => changeRole(user.id, e.target.value)}
                        className={cn(
                          "appearance-none pl-2.5 pr-7 py-1 rounded-md text-[11px] font-mono border cursor-pointer outline-none transition-colors",
                          ROLE_COLORS[user.role]
                        )}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                    </div>
                  )}
                  <button
                    onClick={() => deleteUser(user.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role descriptions */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-[13px] font-semibold text-foreground mb-4">Role Permissions</h3>
        <div className="space-y-3">
          {[
            { role: "super_admin", desc: "Full platform access. Defined by SUPER_ADMIN_EMAIL env variable." },
            { role: "admin", desc: "Manage users, content, and platform settings." },
            { role: "developer", desc: "Create and manage research content: docs, experiments, datasets, notes, roadmap." },
            { role: "user", desc: "Limited read-only access. Requires admin approval to upgrade." },
          ].map(({ role, desc }) => (
            <div key={role} className="flex items-start gap-3">
              <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded border flex-shrink-0 mt-0.5", ROLE_COLORS[role])}>
                {role}
              </span>
              <p className="text-[12px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

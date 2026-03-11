"use client"

/**
 * /dashboard/users — User Management
 *
 * Visible to: super_admin, admin
 * - super_admin: can set any role on any user (including other super_admins)
 * - admin: can set roles user / developer / admin  (cannot promote to super_admin)
 * Both: cannot demote themselves
 */

import { useState, useEffect, useCallback } from "react"
import {
  Users, Shield, ChevronDown, Loader2, Trash2,
  RefreshCw, Crown, AlertCircle, CheckCircle2
} from "lucide-react"
import { cn } from "@/lib/utils"

interface User {
  id:        string
  clerkId:   string
  email:     string
  name?:     string
  imageUrl?: string
  role:      string
  createdAt: string
}

interface CurrentUser {
  id:      string
  clerkId: string
  role:    string
  email:   string
}

// Roles available in the dropdown for each actor role
const ROLES_FOR_ACTOR: Record<string, string[]> = {
  super_admin: ["user", "developer", "admin", "super_admin"],
  admin:       ["user", "developer", "admin"],
}

const ALL_ROLES = ["super_admin", "admin", "developer", "user"]

const ROLE_META: Record<string, { label: string; color: string; icon?: string }> = {
  super_admin: { label: "super_admin", color: "text-amber-400  bg-amber-400/10  border-amber-400/30",  icon: "👑" },
  admin:       { label: "admin",       color: "text-violet-400 bg-violet-400/10 border-violet-400/30" },
  developer:   { label: "developer",   color: "text-blue-400   bg-blue-400/10   border-blue-400/30"   },
  user:        { label: "user",        color: "text-zinc-400   bg-zinc-400/10   border-zinc-400/30"   },
}

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? ROLE_META.user
  return (
    <span className={cn("text-[11px] font-mono px-2 py-0.5 rounded border inline-flex items-center gap-1", m.color)}>
      {m.icon && <span>{m.icon}</span>}
      {m.label}
    </span>
  )
}

function Avatar({ user }: { user: User }) {
  return (
    <div className="w-9 h-9 rounded-full bg-zinc-800 border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
      {user.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.imageUrl} alt={user.name || user.email} className="w-full h-full object-cover" />
      ) : (
        <span className="text-[13px] font-semibold text-foreground">
          {(user.name || user.email).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

export default function UsersPage() {
  const [users,      setUsers]      = useState<User[]>([])
  const [me,         setMe]         = useState<CurrentUser | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [updating,   setUpdating]   = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRole, setFilterRole] = useState("all")

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, meRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/users/me"),
      ])
      const usersData = await usersRes.json()
      const meData    = await meRes.json()
      setUsers(Array.isArray(usersData) ? usersData : [])
      if (meData?.id) setMe(meData as CurrentUser)
    } catch {
      showToast("Failed to load users", false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const myRole    = me?.role ?? "user"
  const canManage = myRole === "super_admin" || myRole === "admin"
  const availableRoles = ROLES_FOR_ACTOR[myRole] ?? []

  const changeRole = async (user: User, newRole: string) => {
    if (user.clerkId === me?.clerkId) {
      showToast("You cannot change your own role", false); return
    }
    if (myRole === "admin" && newRole === "super_admin") {
      showToast("Admins cannot promote to super_admin", false); return
    }
    setUpdating(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        const updated = await res.json()
        setUsers(prev => prev.map(u => u.id === user.id ? updated : u))
        showToast(`${user.email} → ${newRole}`)
      } else {
        const err = await res.json().catch(() => ({}))
        showToast(err.error ?? "Failed to update role", false)
      }
    } catch {
      showToast("Network error", false)
    } finally {
      setUpdating(null)
    }
  }

  const deleteUser = async (user: User) => {
    if (user.clerkId === me?.clerkId) {
      showToast("You cannot delete your own account", false); return
    }
    if (!confirm(`Remove ${user.email} from the system?`)) return
    setDeleting(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" })
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== user.id))
        showToast(`${user.email} removed`)
      } else {
        showToast("Failed to delete user", false)
      }
    } catch {
      showToast("Network error", false)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = users.filter(u => {
    const matchesSearch =
      !searchTerm ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = filterRole === "all" || u.role === filterRole
    return matchesSearch && matchesRole
  })

  const roleCount = (role: string) => users.filter(u => u.role === role).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border text-[13px] shadow-lg transition-all",
          toast.ok
            ? "bg-emerald-950 border-emerald-500/30 text-emerald-300"
            : "bg-red-950    border-red-500/30    text-red-300"
        )}>
          {toast.ok
            ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> ADMINISTRATION
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
            <p className="text-[14px] text-muted-foreground mt-1">
              Manage access roles · You are logged in as <RoleBadge role={myRole} />
            </p>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-2 text-[12px] font-mono rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-zinc-600 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_ROLES.map(role => (
          <div key={role} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xl font-bold font-mono text-foreground">{roleCount(role)}</p>
            <RoleBadge role={role} />
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 px-3 py-2 text-[13px] rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground outline-none focus:border-zinc-500 transition-colors"
        />
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 text-[13px] rounded-lg border border-border bg-card text-foreground outline-none focus:border-zinc-500 transition-colors"
        >
          <option value="all">All roles</option>
          {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-foreground">
            Users ({filtered.length}{filtered.length !== users.length ? ` of ${users.length}` : ""})
          </h3>
          {!canManage && (
            <span className="text-[11px] text-amber-400 font-mono">
              ⚠ Read-only — requires admin or super_admin to edit roles
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="text-[14px] font-medium text-foreground mb-1">No users found</p>
            <p className="text-[12px] text-muted-foreground">
              {users.length === 0 ? "Users appear here when they sign in via Clerk." : "Try adjusting your filter."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(user => {
              const isMe          = user.clerkId === me?.clerkId
              const isSuperAdmin  = user.role === "super_admin"
              const canEditThis   = canManage && !isMe
              const canDeleteThis = canManage && !isMe && !(myRole === "admin" && isSuperAdmin)

              return (
                <div
                  key={user.id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-900/40 transition-colors",
                    isMe && "bg-amber-500/5"
                  )}
                >
                  <Avatar user={user} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {user.name || "—"}
                      </p>
                      {isMe && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          you
                        </span>
                      )}
                      {isSuperAdmin && (
                        <Crown className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground truncate">{user.email}</p>
                  </div>

                  {/* Joined date */}
                  <p className="text-[11px] text-muted-foreground hidden md:block flex-shrink-0">
                    {new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>

                  {/* Role control */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {updating === user.id || deleting === user.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : canEditThis ? (
                      <div className="relative">
                        <select
                          value={user.role}
                          onChange={e => changeRole(user, e.target.value)}
                          className={cn(
                            "appearance-none pl-2.5 pr-7 py-1.5 rounded-md text-[11px] font-mono border cursor-pointer outline-none transition-colors",
                            ROLE_META[user.role]?.color ?? ROLE_META.user.color
                          )}
                        >
                          {availableRoles.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                      </div>
                    ) : (
                      <RoleBadge role={user.role} />
                    )}

                    {canDeleteThis ? (
                      <button
                        onClick={() => deleteUser(user)}
                        title="Remove user"
                        className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <div className="w-7" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Role permission matrix */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-[13px] font-semibold text-foreground">Role Permission Matrix</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-mono text-muted-foreground">Role</th>
                <th className="text-center py-2 px-2 font-mono text-muted-foreground">Dashboard</th>
                <th className="text-center py-2 px-2 font-mono text-muted-foreground">Read data</th>
                <th className="text-center py-2 px-2 font-mono text-muted-foreground">Write data</th>
                <th className="text-center py-2 px-2 font-mono text-muted-foreground">AI agent</th>
                <th className="text-center py-2 px-2 font-mono text-muted-foreground">Manage users</th>
                <th className="text-center py-2 px-2 font-mono text-muted-foreground">Settings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[
                { role: "super_admin", perms: [true,  true,  true,  true,  true,  true ] },
                { role: "admin",       perms: [true,  true,  true,  true,  true,  true ] },
                { role: "developer",   perms: [true,  true,  true,  true,  false, false] },
                { role: "user",        perms: [false, true,  false, false, false, false] },
              ].map(({ role, perms }) => (
                <tr key={role} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="py-2.5 pr-4">
                    <RoleBadge role={role} />
                  </td>
                  {perms.map((p, i) => (
                    <td key={i} className="text-center py-2.5 px-2">
                      {p ? (
                        <span className="text-emerald-400 text-[14px]">✓</span>
                      ) : (
                        <span className="text-zinc-600 text-[14px]">✗</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 font-mono">
          super_admin is identified by SUPER_ADMIN_EMAIL env var and is always promoted to super_admin in DB on login.
        </p>
      </div>
    </div>
  )
}

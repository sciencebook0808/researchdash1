"use client"
import { Skeleton } from "@/components/ui/skeleton"

import { useState, useEffect } from "react"
import Link from "next/link"
import { StickyNote, Plus, Pin, Tag, Edit3, Trash2, Save, X } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import { DocContent } from "@/components/docs/doc-content"

interface Note {
  id: string; title: string; content: string; tags: string[]
  pinned: boolean; createdAt: string; updatedAt: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ title: "", content: "", tags: "" })
  const [editForm, setEditForm] = useState({ title: "", content: "", tags: "" })

  useEffect(() => {
    fetch("/api/notes")
      .then(r => r.json())
      .then(d => { setNotes(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => { setNotes([]); setLoading(false) })
  }, [])

  const handleCreate = async () => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, tags: form.tags.split(",").map(t => t.trim()).filter(Boolean) })
    })
    if (res.ok) {
      const note = await res.json()
      setNotes(prev => [note, ...prev])
      setShowForm(false)
      setForm({ title: "", content: "", tags: "" })
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/notes/${id}`, { method: "DELETE" })
    setNotes(prev => prev.filter(n => n.id !== id))
    if (preview === id) setPreview(null)
  }

  const handlePin = async (note: Note) => {
    const res = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !note.pinned })
    })
    if (res.ok) {
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n))
    }
  }

  const startEdit = (note: Note) => {
    setEditing(note.id)
    setEditForm({ title: note.title, content: note.content, tags: note.tags.join(", ") })
  }

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, tags: editForm.tags.split(",").map(t => t.trim()).filter(Boolean) })
    })
    if (res.ok) {
      const updated = await res.json()
      setNotes(prev => prev.map(n => n.id === id ? updated : n))
      setEditing(null)
    }
  }

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const previewNote = notes.find(n => n.id === preview)

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground font-mono mb-2">
          <span className="text-amber-500">▸</span> RESEARCH NOTES
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Notes</h1>
            <p className="text-[14px] text-muted-foreground mt-1">{notes.length} research notes · supports Markdown</p>
          </div>
          <Link href="/notes/create" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500 text-black text-[13px] font-semibold hover:bg-amber-400 transition-colors">
            <Plus className="w-4 h-4" />
            New Note
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Note list */}
        <div className="space-y-2">
          {sortedNotes.map(note => (
            <div
              key={note.id}
              onClick={() => setPreview(note.id)}
              className={cn(
                "rounded-xl border p-4 cursor-pointer card-hover transition-all",
                preview === note.id ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"
              )}
            >
              {editing === note.id ? (
                <div onClick={e => e.stopPropagation()} className="space-y-2">
                  <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
                    className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-[13px] outline-none" />
                  <textarea value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))}
                    rows={4}
                    className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-[12px] font-mono outline-none resize-none" />
                  <input value={editForm.tags} onChange={e => setEditForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="Tags" className="w-full px-2 py-1 rounded bg-input border border-border text-foreground text-[12px] outline-none" />
                  <div className="flex gap-1">
                    <button onClick={() => saveEdit(note.id)} className="p-1 text-emerald-400 hover:text-emerald-300">
                      <Save className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditing(null)} className="p-1 text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-[13px] font-semibold text-foreground leading-tight">{note.title}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); handlePin(note) }}
                        className={cn("p-1 transition-colors", note.pinned ? "text-amber-400" : "text-muted-foreground hover:text-foreground")}>
                        <Pin className="w-3 h-3" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); startEdit(note) }}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(note.id) }}
                        className="p-1 text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[12px] text-muted-foreground line-clamp-2 mb-2">{note.content.substring(0, 120)}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {note.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                          <Tag className="w-2 h-2" />{tag}
                        </span>
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">{formatDate(note.updatedAt)}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          {previewNote ? (
            <div className="rounded-xl border border-border bg-card p-6 sticky top-4">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div>
                  <h2 className="text-[16px] font-semibold text-foreground">{previewNote.title}</h2>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Updated {formatDate(previewNote.updatedAt)}
                    {previewNote.pinned && <span className="ml-2 text-amber-400">· Pinned</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {previewNote.tags.map(tag => (
                    <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground flex items-center gap-1">
                      <Tag className="w-2.5 h-2.5" />{tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                <DocContent content={previewNote.content} />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/30 h-48 flex items-center justify-center">
              <div className="text-center">
                <StickyNote className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-[13px] text-muted-foreground">Select a note to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
